import { and, desc, eq, isNull } from "drizzle-orm";
import { auditEvents, db, documents } from "@/lib/db";
import { buildObjectKey, deleteObject, isStorageConfigured, putObject } from "@/lib/storage/local";
import {
  canMarkEffective,
  type ContractSigner,
  type ContractSignerRole,
  type SignatureStatus
} from "./signing";
import { canTransitionContract, type ContractState } from "./lifecycle";
import {
  contractSignatureEvents,
  contractSigners,
  contractTransitions,
  contracts,
  type ContractActorType
} from "./persistence";

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
type PersistedContractSignerRole = Exclude<ContractSignerRole, "park">;
export const SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE = "application/pdf";
export const SIGNED_CONTRACT_DOCUMENT_MAX_BYTES = 15 * 1024 * 1024;
const SIGNING_CLOSED_STATES = new Set<ContractState>([
  "effective",
  "signed_documents_available",
  "superseded",
  "withdrawn"
]);

export type ContractTransitionInput = {
  contractId: string;
  contractVersion: string;
  toState: ContractState;
  actorId: string;
  actorType: ContractActorType;
  source: string;
  payload?: Record<string, unknown>;
};

export type VerifiedSignatureEventInput = {
  contractId: string;
  contractVersion: string;
  provider: string;
  providerEventId: string;
  signerRole: PersistedContractSignerRole;
  status: SignatureStatus;
  occurredAt: Date;
  providerSignerId?: string | null;
  payload?: Record<string, unknown>;
  /** Provider signature verification must happen before this service is called. */
  verified: boolean;
};

type TransitionResult = {
  contract: typeof contracts.$inferSelect;
  transition: typeof contractTransitions.$inferSelect;
};

function assertSignedDocumentPayload(contentType: string, body: Buffer): void {
  if (contentType !== SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE) {
    throw new Error("SIGNED_DOCUMENT_INVALID_TYPE");
  }
  if (body.length === 0 || body.length > SIGNED_CONTRACT_DOCUMENT_MAX_BYTES) {
    throw new Error("SIGNED_DOCUMENT_INVALID_SIZE");
  }
  if (!body.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
    throw new Error("SIGNED_DOCUMENT_INVALID_CONTENT");
  }
}

function signedDocumentTitle(input: { title?: string; filename: string; contractVersion: string }): string {
  const requested = input.title?.trim();
  if (requested) return requested;

  const filename = input.filename
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.pdf$/i, "")
    .trim();
  return filename || `Signed agreement ${input.contractVersion}`;
}

function toContractSigner(row: typeof contractSigners.$inferSelect): ContractSigner {
  return {
    role: row.role,
    displayName: row.displayName,
    email: row.email,
    status: row.status,
    signedAt: row.signedAt?.toISOString() ?? null
  };
}

async function appendTransition(
  tx: DbTransaction,
  input: ContractTransitionInput & { fromState: ContractState | null }
): Promise<typeof contractTransitions.$inferSelect> {
  const [transition] = await tx
    .insert(contractTransitions)
    .values({
      contractId: input.contractId,
      contractVersion: input.contractVersion,
      fromState: input.fromState,
      toState: input.toState,
      actorId: input.actorId,
      actorType: input.actorType,
      source: input.source,
      payload: input.payload ?? {}
    })
    .returning();

  if (!transition) throw new Error("CONTRACT_TRANSITION_NOT_PERSISTED");

  await tx.insert(auditEvents).values({
    actorUserId: input.actorId,
    action: "contract.transitioned",
    entityType: "contract",
    entityId: input.contractId,
    payload: {
      contractVersion: input.contractVersion,
      fromState: input.fromState,
      toState: input.toState,
      actorType: input.actorType,
      source: input.source,
      ...(input.payload ?? {})
    }
  });

  return transition;
}

async function applyTransition(
  tx: DbTransaction,
  current: typeof contracts.$inferSelect,
  input: ContractTransitionInput
): Promise<TransitionResult> {
  if (current.version !== input.contractVersion) {
    throw new Error("CONTRACT_VERSION_MISMATCH");
  }
  if (!canTransitionContract(current.state, input.toState)) {
    throw new Error("CONTRACT_TRANSITION_NOT_ALLOWED");
  }

  if (input.toState === "investor_signed") {
    const [investorSigner] = await tx
      .select()
      .from(contractSigners)
      .where(
        and(
          eq(contractSigners.contractId, current.id),
          eq(contractSigners.role, "investor")
        )
      )
      .limit(1);
    if (investorSigner?.status !== "signed") {
      throw new Error("CONTRACT_INVESTOR_SIGNATURE_INCOMPLETE");
    }
  }

  if (input.toState === "effective") {
    const signers = await tx
      .select()
      .from(contractSigners)
      .where(eq(contractSigners.contractId, current.id));
    if (
      !canMarkEffective({
        contractId: current.id,
        contractVersion: current.version,
        state: current.state,
        signers: signers.map(toContractSigner)
      })
    ) {
      throw new Error("CONTRACT_SIGNATURES_INCOMPLETE");
    }
  }

  const [updated] = await tx
    .update(contracts)
    .set({ state: input.toState, updatedAt: new Date() })
    .where(
      and(
        eq(contracts.id, current.id),
        eq(contracts.version, input.contractVersion),
        eq(contracts.state, current.state)
      )
    )
    .returning();
  if (!updated) throw new Error("CONTRACT_STATE_CHANGED");

  const transition = await appendTransition(tx, {
    ...input,
    fromState: current.state
  });
  return { contract: updated, transition };
}

export async function createContract(input: {
  investorId: string;
  version: string;
  createdByActorId: string;
  createdByActorType: ContractActorType;
  source: string;
  interestId?: string | null;
  summaryDocumentId?: string | null;
  agreementDocumentId?: string | null;
  signers: Array<{
    role: PersistedContractSignerRole;
    displayName: string;
    email: string;
    providerSignerId?: string | null;
  }>;
}): Promise<typeof contracts.$inferSelect> {
  const roles = new Set(input.signers.map((signer) => signer.role));
  if (
    input.signers.length !== 2 ||
    roles.size !== 2 ||
    !roles.has("investor") ||
    !roles.has("legal_signer")
  ) {
    throw new Error("CONTRACT_SIGNERS_INVALID");
  }

  return db.transaction(async (tx) => {
    const [contract] = await tx
      .insert(contracts)
      .values({
        investorId: input.investorId,
        interestId: input.interestId ?? null,
        version: input.version,
        summaryDocumentId: input.summaryDocumentId ?? null,
        agreementDocumentId: input.agreementDocumentId ?? null,
        createdByActorId: input.createdByActorId
      })
      .returning();
    if (!contract) throw new Error("CONTRACT_NOT_PERSISTED");

    await tx.insert(contractSigners).values(
      input.signers.map((signer) => ({
        contractId: contract.id,
        role: signer.role,
        displayName: signer.displayName,
        email: signer.email,
        providerSignerId: signer.providerSignerId ?? null
      }))
    );

    await appendTransition(tx, {
      contractId: contract.id,
      contractVersion: contract.version,
      fromState: null,
      toState: contract.state,
      actorId: input.createdByActorId,
      actorType: input.createdByActorType,
      source: input.source
    });

    return contract;
  });
}

export async function transitionContract(
  input: ContractTransitionInput
): Promise<typeof contractTransitions.$inferSelect> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .for("update");
    if (!current) throw new Error("CONTRACT_NOT_FOUND");

    return (await applyTransition(tx, current, input)).transition;
  });
}

type SignedDocumentLinkInput = {
  contractId: string;
  contractVersion: string;
  signedDocumentId: string;
  actorId: string;
  actorType: ContractActorType;
  source: string;
};

async function linkSignedDocument(
  tx: DbTransaction,
  current: typeof contracts.$inferSelect,
  input: SignedDocumentLinkInput
): Promise<typeof contractTransitions.$inferSelect> {
  if (current.version !== input.contractVersion) {
    throw new Error("CONTRACT_VERSION_MISMATCH");
  }
  if (current.state !== "effective") throw new Error("CONTRACT_NOT_EFFECTIVE");

  const [document] = await tx
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.id, input.signedDocumentId),
        eq(documents.ownerType, "investor"),
        eq(documents.ownerId, current.investorId),
        eq(documents.category, "contract_signed_agreement"),
        eq(documents.contentType, SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE),
        isNull(documents.retractedAt)
      )
    )
    .limit(1);
  if (!document) throw new Error("SIGNED_DOCUMENT_NOT_FOUND");

  const [linked] = await tx
    .update(contracts)
    .set({ signedDocumentId: document.id, updatedAt: new Date() })
    .where(
      and(
        eq(contracts.id, current.id),
        eq(contracts.version, input.contractVersion),
        eq(contracts.state, "effective"),
        isNull(contracts.signedDocumentId)
      )
    )
    .returning({ id: contracts.id });
  if (!linked) throw new Error("SIGNED_DOCUMENT_ALREADY_ATTACHED");

  await tx.insert(auditEvents).values({
    actorUserId: input.actorId,
    action: "contract.signed_documents_attached",
    entityType: "contract",
    entityId: current.id,
    payload: {
      contractVersion: input.contractVersion,
      signedDocumentId: document.id,
      actorType: input.actorType,
      source: input.source
    }
  });

  return (
    await applyTransition(
      tx,
      { ...current, signedDocumentId: document.id },
      {
        contractId: current.id,
        contractVersion: input.contractVersion,
        toState: "signed_documents_available",
        actorId: input.actorId,
        actorType: input.actorType,
        source: input.source,
        payload: { signedDocumentId: document.id }
      }
    )
  ).transition;
}

export async function markSignedDocumentsAvailable(
  input: SignedDocumentLinkInput
): Promise<typeof contractTransitions.$inferSelect> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .for("update");
    if (!current) throw new Error("CONTRACT_NOT_FOUND");

    return linkSignedDocument(tx, current, input);
  });
}

/**
 * Stores a provider-produced signed PDF in the private investor vault and
 * publishes it to the contract in the same database transaction. Storage is
 * written before the transaction and removed again if the database work fails.
 */
export async function storeAndPublishSignedContractDocument(input: {
  contractId: string;
  contractVersion: string;
  actorId: string;
  actorType: ContractActorType;
  source: string;
  filename: string;
  contentType: string;
  body: Buffer;
  title?: string;
}): Promise<{
  document: typeof documents.$inferSelect;
  transition: typeof contractTransitions.$inferSelect;
}> {
  assertSignedDocumentPayload(input.contentType, input.body);
  if (!isStorageConfigured()) throw new Error("DOCUMENT_STORAGE_NOT_CONFIGURED");

  const [preview] = await db
    .select({
      investorId: contracts.investorId,
      version: contracts.version,
      state: contracts.state,
      signedDocumentId: contracts.signedDocumentId
    })
    .from(contracts)
    .where(eq(contracts.id, input.contractId))
    .limit(1);
  if (!preview) throw new Error("CONTRACT_NOT_FOUND");
  if (preview.version !== input.contractVersion) {
    throw new Error("CONTRACT_VERSION_MISMATCH");
  }
  if (preview.state !== "effective") throw new Error("CONTRACT_NOT_EFFECTIVE");
  if (preview.signedDocumentId) throw new Error("SIGNED_DOCUMENT_ALREADY_ATTACHED");

  const storageKey = buildObjectKey({
    ownerType: "investor",
    ownerId: preview.investorId,
    filename: input.filename
  });
  let stored = false;

  try {
    await putObject(storageKey, input.body, input.contentType);
    stored = true;

    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select()
        .from(contracts)
        .where(eq(contracts.id, input.contractId))
        .for("update");
      if (!current) throw new Error("CONTRACT_NOT_FOUND");

      if (current.version !== input.contractVersion) {
        throw new Error("CONTRACT_VERSION_MISMATCH");
      }
      if (current.state !== "effective") throw new Error("CONTRACT_NOT_EFFECTIVE");
      if (current.signedDocumentId) throw new Error("SIGNED_DOCUMENT_ALREADY_ATTACHED");

      const [document] = await tx
        .insert(documents)
        .values({
          ownerType: "investor",
          ownerId: current.investorId,
          title: signedDocumentTitle(input),
          category: "contract_signed_agreement",
          storageKey,
          contentType: input.contentType,
          uploadedBy: input.actorId
        })
        .returning();
      if (!document) throw new Error("SIGNED_DOCUMENT_NOT_PERSISTED");

      await tx.insert(auditEvents).values({
        actorUserId: input.actorId,
        action: "contract.signed_document_stored",
        entityType: "contract",
        entityId: current.id,
        payload: {
          contractVersion: current.version,
          signedDocumentId: document.id,
          contentType: input.contentType,
          sizeBytes: input.body.length,
          source: input.source
        }
      });

      const transition = await linkSignedDocument(tx, current, {
        contractId: current.id,
        contractVersion: current.version,
        signedDocumentId: document.id,
        actorId: input.actorId,
        actorType: input.actorType,
        source: input.source
      });
      return { document, transition };
    });
  } catch (error) {
    if (stored) {
      await deleteObject(storageKey).catch((cleanupError) => {
        console.error("[contracts:signed-document-cleanup]", cleanupError);
      });
    }
    throw error;
  }
}

export async function recordManualSignature(input: {
  contractId: string;
  contractVersion: string;
  signerRole: PersistedContractSignerRole;
  signedAt: Date;
  actorId: string;
  source: string;
}): Promise<{ transitions: ContractState[] }> {
  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .for("update");
    if (!current) throw new Error("CONTRACT_NOT_FOUND");
    if (current.version !== input.contractVersion) {
      throw new Error("CONTRACT_VERSION_MISMATCH");
    }
    if (SIGNING_CLOSED_STATES.has(current.state)) {
      throw new Error("CONTRACT_SIGNING_CLOSED");
    }

    const [signer] = await tx
      .select()
      .from(contractSigners)
      .where(
        and(
          eq(contractSigners.contractId, input.contractId),
          eq(contractSigners.role, input.signerRole)
        )
      )
      .limit(1);
    if (!signer) throw new Error("CONTRACT_SIGNER_NOT_FOUND");
    if (signer.status === "signed") throw new Error("CONTRACT_SIGNATURE_ALREADY_RECORDED");

    const [updatedSigner] = await tx
      .update(contractSigners)
      .set({
        status: "signed",
        signedAt: input.signedAt,
        updatedAt: new Date()
      })
      .where(eq(contractSigners.id, signer.id))
      .returning({ id: contractSigners.id });
    if (!updatedSigner) throw new Error("CONTRACT_SIGNER_NOT_FOUND");

    await tx.insert(auditEvents).values({
      actorUserId: input.actorId,
      action: "contract.signature_recorded_manual",
      entityType: "contract",
      entityId: input.contractId,
      payload: {
        contractVersion: input.contractVersion,
        signerRole: input.signerRole,
        signedAt: input.signedAt.toISOString(),
        source: input.source
      }
    });

    let latest = current;
    const transitions: ContractState[] = [];
    const reviewStates: ContractState[] = [
      "ready_to_review",
      "summary_viewed",
      "agreement_viewed"
    ];

    if (input.signerRole === "investor" && reviewStates.includes(latest.state)) {
      const result = await applyTransition(tx, latest, {
        contractId: latest.id,
        contractVersion: latest.version,
        toState: "investor_signed",
        actorId: input.actorId,
        actorType: "staff",
        source: input.source,
        payload: { signerRole: input.signerRole, manual: true }
      });
      latest = result.contract;
      transitions.push(result.transition.toState);
    }

    if (latest.state === "investor_signed") {
      const result = await applyTransition(tx, latest, {
        contractId: latest.id,
        contractVersion: latest.version,
        toState: "counter_signature_pending",
        actorId: input.actorId,
        actorType: "staff",
        source: input.source,
        payload: { signerRole: input.signerRole, manual: true }
      });
      latest = result.contract;
      transitions.push(result.transition.toState);
    }

    if (latest.state === "counter_signature_pending") {
      const signers = await tx
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.contractId, latest.id));
      if (
        canMarkEffective({
          contractId: latest.id,
          contractVersion: latest.version,
          state: latest.state,
          signers: signers.map(toContractSigner)
        })
      ) {
        const result = await applyTransition(tx, latest, {
          contractId: latest.id,
          contractVersion: latest.version,
          toState: "effective",
          actorId: input.actorId,
          actorType: "staff",
          source: input.source,
          payload: { signerRole: input.signerRole, manual: true }
        });
        transitions.push(result.transition.toState);
      }
    }

    return { transitions };
  });
}

export async function recordVerifiedSignatureEvent(
  input: VerifiedSignatureEventInput
): Promise<{ duplicate: boolean; eventId?: string; transitions: ContractState[] }> {
  if (input.verified !== true) throw new Error("UNVERIFIED_SIGNATURE_EVENT");

  return db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(contracts)
      .where(eq(contracts.id, input.contractId))
      .for("update");
    if (!current) throw new Error("CONTRACT_NOT_FOUND");
    if (current.version !== input.contractVersion) {
      throw new Error("CONTRACT_VERSION_MISMATCH");
    }

    const [event] = await tx
      .insert(contractSignatureEvents)
      .values({
        contractId: input.contractId,
        contractVersion: input.contractVersion,
        provider: input.provider,
        providerEventId: input.providerEventId,
        providerSignerId: input.providerSignerId ?? null,
        signerRole: input.signerRole,
        status: input.status,
        occurredAt: input.occurredAt,
        payload: input.payload ?? {}
      })
      .onConflictDoNothing({
        target: [
          contractSignatureEvents.provider,
          contractSignatureEvents.providerEventId,
          contractSignatureEvents.contractId,
          contractSignatureEvents.contractVersion
        ]
      })
      .returning();

    if (!event) return { duplicate: true, transitions: [] };

    const [latestEvent] = await tx
      .select({ id: contractSignatureEvents.id })
      .from(contractSignatureEvents)
      .where(
        and(
          eq(contractSignatureEvents.contractId, input.contractId),
          eq(contractSignatureEvents.contractVersion, input.contractVersion),
          eq(contractSignatureEvents.signerRole, input.signerRole)
        )
      )
      .orderBy(
        desc(contractSignatureEvents.occurredAt),
        desc(contractSignatureEvents.receivedAt)
      )
      .limit(1);
    const isLatestEvent = latestEvent?.id === event.id;
    const applyToSigner = isLatestEvent && !SIGNING_CLOSED_STATES.has(current.state);

    if (applyToSigner) {
      const updatedSigner = await tx
        .update(contractSigners)
        .set({
          status: input.status,
          signedAt: input.status === "signed" ? input.occurredAt : null,
          ...(input.providerSignerId
            ? { providerSignerId: input.providerSignerId }
            : {}),
          updatedAt: new Date()
        })
        .where(
          and(
            eq(contractSigners.contractId, input.contractId),
            eq(contractSigners.role, input.signerRole)
          )
        )
        .returning({ id: contractSigners.id });
      if (updatedSigner.length !== 1) throw new Error("CONTRACT_SIGNER_NOT_FOUND");
    }

    await tx.insert(auditEvents).values({
      actorUserId: `provider:${input.provider}`,
      action: "contract.signature_event_received",
      entityType: "contract",
      entityId: input.contractId,
      payload: {
        providerEventId: input.providerEventId,
        contractVersion: input.contractVersion,
        signerRole: input.signerRole,
        providerSignerId: input.providerSignerId ?? null,
        status: input.status,
        verified: true,
        appliedToSigner: applyToSigner
      }
    });

    if (!applyToSigner) {
      return { duplicate: false, eventId: event.id, transitions: [] };
    }

    if (input.status !== "signed") {
      return { duplicate: false, eventId: event.id, transitions: [] };
    }

    let latest = current;
    const transitions: ContractState[] = [];
    const reviewStates: ContractState[] = [
      "ready_to_review",
      "summary_viewed",
      "agreement_viewed"
    ];

    if (input.signerRole === "investor" && reviewStates.includes(latest.state)) {
      const result = await applyTransition(tx, latest, {
        contractId: latest.id,
        contractVersion: latest.version,
        toState: "investor_signed",
        actorId: `provider:${input.provider}`,
        actorType: "provider",
        source: `provider:webhook:${input.provider}`,
        payload: { providerEventId: input.providerEventId }
      });
      latest = result.contract;
      transitions.push(result.transition.toState);
    }

    if (latest.state === "investor_signed") {
      const result = await applyTransition(tx, latest, {
        contractId: latest.id,
        contractVersion: latest.version,
        toState: "counter_signature_pending",
        actorId: `provider:${input.provider}`,
        actorType: "provider",
        source: `provider:webhook:${input.provider}`,
        payload: { providerEventId: input.providerEventId }
      });
      latest = result.contract;
      transitions.push(result.transition.toState);
    }

    if (latest.state === "counter_signature_pending") {
      const signers = await tx
        .select()
        .from(contractSigners)
        .where(eq(contractSigners.contractId, latest.id));
      if (
        canMarkEffective({
          contractId: latest.id,
          contractVersion: latest.version,
          state: latest.state,
          signers: signers.map(toContractSigner)
        })
      ) {
        const result = await applyTransition(tx, latest, {
          contractId: latest.id,
          contractVersion: latest.version,
          toState: "effective",
          actorId: `provider:${input.provider}`,
          actorType: "provider",
          source: `provider:webhook:${input.provider}`,
          payload: { providerEventId: input.providerEventId }
        });
        transitions.push(result.transition.toState);
      }
    }

    return { duplicate: false, eventId: event.id, transitions };
  });
}
