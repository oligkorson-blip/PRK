import {
  index,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid
} from "drizzle-orm/pg-core";

export const contractStateEnum = pgEnum("contract_state", [
  "ready_to_review",
  "summary_viewed",
  "agreement_viewed",
  "investor_signed",
  "counter_signature_pending",
  "effective",
  "signed_documents_available",
  "superseded",
  "withdrawn"
]);

export const contractSignerRoleEnum = pgEnum("contract_signer_role", [
  "investor",
  "legal_signer"
]);

export const contractSignatureStatusEnum = pgEnum("contract_signature_status", [
  "pending",
  "signed",
  "declined",
  "expired"
]);

export const contractActorTypeEnum = pgEnum("contract_actor_type", [
  "investor",
  "legal_signer",
  "staff",
  "provider",
  "system"
]);

export const contracts = pgTable(
  "contracts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id").notNull(),
    /** Optional link to the confirmed interest that originated this agreement. */
    interestId: uuid("interest_id"),
    version: text("version").notNull(),
    state: contractStateEnum("state").notNull().default("ready_to_review"),
    summaryDocumentId: uuid("summary_document_id"),
    agreementDocumentId: uuid("agreement_document_id"),
    signedDocumentId: uuid("signed_document_id"),
    createdByActorId: text("created_by_actor_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("contracts_investor_version_uidx").on(t.investorId, t.version),
    uniqueIndex("contracts_interest_id_uidx").on(t.interestId),
    index("contracts_investor_state_idx").on(t.investorId, t.state)
  ]
);

export const contractSigners = pgTable(
  "contract_signers",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractId: uuid("contract_id").notNull(),
    role: contractSignerRoleEnum("role").notNull(),
    displayName: text("display_name").notNull(),
    email: text("email").notNull(),
    status: contractSignatureStatusEnum("status").notNull().default("pending"),
    providerSignerId: text("provider_signer_id"),
    signedAt: timestamp("signed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("contract_signers_contract_role_uidx").on(t.contractId, t.role),
    index("contract_signers_contract_id_idx").on(t.contractId)
  ]
);

export const contractSignatureEvents = pgTable(
  "contract_signature_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractId: uuid("contract_id").notNull(),
    contractVersion: text("contract_version").notNull(),
    provider: text("provider").notNull(),
    providerEventId: text("provider_event_id").notNull(),
    providerSignerId: text("provider_signer_id"),
    signerRole: contractSignerRoleEnum("signer_role").notNull(),
    status: contractSignatureStatusEnum("status").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({})
  },
  (t) => [
    uniqueIndex("contract_signature_events_provider_key_uidx").on(
      t.provider,
      t.providerEventId,
      t.contractId,
      t.contractVersion
    ),
    index("contract_signature_events_contract_id_idx").on(t.contractId, t.occurredAt.desc())
  ]
);

/** Immutable, queryable audit trail for every contract state transition. */
export const contractTransitions = pgTable(
  "contract_transitions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    contractId: uuid("contract_id").notNull(),
    contractVersion: text("contract_version").notNull(),
    fromState: contractStateEnum("from_state"),
    toState: contractStateEnum("to_state").notNull(),
    actorId: text("actor_id").notNull(),
    actorType: contractActorTypeEnum("actor_type").notNull(),
    source: text("source").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({})
  },
  (t) => [index("contract_transitions_contract_id_idx").on(t.contractId, t.occurredAt.desc())]
);

export type ContractActorType = (typeof contractActorTypeEnum.enumValues)[number];
