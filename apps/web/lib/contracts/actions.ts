"use server";

import { revalidatePath } from "next/cache";
import { ensureInvestor } from "@/lib/auth/investor";
import { requireSuperAdmin } from "@/lib/auth/staff";
import { isUuid } from "@/lib/format";
import { getContractForInvestor } from "./queries";
import { sniffMatchesType } from "@/lib/storage/sniff";
import {
  SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE,
  SIGNED_CONTRACT_DOCUMENT_MAX_BYTES,
  recordManualSignature,
  storeAndPublishSignedContractDocument,
  transitionContract
} from "./service";

function publicationError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "CONTRACT_NOT_FOUND":
      return "Agreement not found.";
    case "CONTRACT_VERSION_MISMATCH":
      return "Agreement version does not match the current record.";
    case "CONTRACT_NOT_EFFECTIVE":
      return "The agreement must be effective before signed copies can be published.";
    case "SIGNED_DOCUMENT_ALREADY_ATTACHED":
      return "Signed copies are already attached to this agreement.";
    case "DOCUMENT_STORAGE_NOT_CONFIGURED":
      return "Document storage is not configured.";
    case "SIGNED_DOCUMENT_INVALID_TYPE":
    case "SIGNED_DOCUMENT_INVALID_CONTENT":
      return "Only valid PDF files can be published as signed copies.";
    case "SIGNED_DOCUMENT_INVALID_SIZE":
      return "Signed copy must be 15MB or smaller.";
    default:
      return "Could not publish the signed copy. Please try again.";
  }
}

/**
 * Super-admin-only form action for manually publishing a provider-produced
 * signed agreement. The contract service owns the final vault/audit/state
 * transaction; this action only authenticates and validates the uploaded PDF.
 */
export async function uploadSignedContractDocument(
  formData: FormData
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  let admin: Awaited<ReturnType<typeof requireSuperAdmin>>;
  try {
    admin = await requireSuperAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const contractId = String(formData.get("contractId") ?? "").trim();
  const contractVersion = String(formData.get("contractVersion") ?? "").trim();
  const title = String(formData.get("title") ?? "").trim();
  const file = formData.get("file");

  if (!isUuid(contractId)) return { ok: false, error: "Agreement not found." };
  if (!contractVersion) return { ok: false, error: "Agreement version is required." };
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose the final signed PDF." };
  }
  if (file.size > SIGNED_CONTRACT_DOCUMENT_MAX_BYTES) {
    return { ok: false, error: "Signed copy must be 15MB or smaller." };
  }
  if (file.type !== SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE) {
    return { ok: false, error: "Only PDF files can be published as signed copies." };
  }
  if (!(await sniffMatchesType(file, SIGNED_CONTRACT_DOCUMENT_CONTENT_TYPE))) {
    return { ok: false, error: "File content does not match a PDF." };
  }

  try {
    const result = await storeAndPublishSignedContractDocument({
      contractId,
      contractVersion,
      actorId: admin.user.id,
      actorType: "staff",
      source: "staff:contract-signed-document-upload",
      filename: file.name || `signed-agreement-${contractVersion}.pdf`,
      contentType: file.type,
      body: Buffer.from(await file.arrayBuffer()),
      title: title || undefined
    });

    revalidatePath("/portal/contracts");
    revalidatePath(`/portal/contracts/${contractId}`);
    revalidatePath("/portal/documents");
    revalidatePath("/admin/documents");
    revalidatePath("/admin/contracts");
    revalidatePath(`/admin/contracts/${contractId}`);
    return { ok: true, id: result.document.id };
  } catch (error) {
    console.error("[contracts:publish-signed-document]", error);
    return { ok: false, error: publicationError(error) };
  }
}


function manualSignatureError(error: unknown): string {
  const code = error instanceof Error ? error.message : "";
  switch (code) {
    case "CONTRACT_NOT_FOUND":
      return "Agreement not found.";
    case "CONTRACT_VERSION_MISMATCH":
      return "Agreement version does not match the current record.";
    case "CONTRACT_SIGNER_NOT_FOUND":
      return "Signer is not part of this agreement.";
    case "CONTRACT_SIGNING_CLOSED":
      return "Signatures can no longer be recorded for this agreement.";
    case "CONTRACT_SIGNATURE_ALREADY_RECORDED":
      return "That signer has already been recorded as signed.";
    case "CONTRACT_TRANSITION_NOT_ALLOWED":
      return "This signature cannot advance the agreement from its current state.";
    default:
      return "Could not record the manual signature. Please try again.";
  }
}

/**
 * Super-admin-only manual signing path used until a provider adapter is selected.
 * It records the staff attestation and reuses the shared lifecycle guards.
 */
export async function recordManualContractSignature(
  formData: FormData
): Promise<{ ok: true; transitions: string[] } | { ok: false; error: string }> {
  let admin: Awaited<ReturnType<typeof requireSuperAdmin>>;
  try {
    admin = await requireSuperAdmin();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  const contractId = String(formData.get("contractId") ?? "").trim();
  const contractVersion = String(formData.get("contractVersion") ?? "").trim();
  const signerRole = String(formData.get("signerRole") ?? "").trim();
  const signedAtValue = String(formData.get("signedAt") ?? "").trim();

  if (!isUuid(contractId)) return { ok: false, error: "Agreement not found." };
  if (!contractVersion) return { ok: false, error: "Agreement version is required." };
  if (signerRole !== "investor" && signerRole !== "legal_signer") {
    return { ok: false, error: "Choose a valid signer." };
  }
  const signedAt = new Date(signedAtValue);
  if (!signedAtValue || Number.isNaN(signedAt.getTime())) {
    return { ok: false, error: "Enter a valid signing date and time." };
  }

  try {
    const result = await recordManualSignature({
      contractId,
      contractVersion,
      signerRole,
      signedAt,
      actorId: admin.user.id,
      source: "staff:manual-signature"
    });
    revalidatePath("/admin/contracts");
    revalidatePath(`/admin/contracts/${contractId}`);
    revalidatePath("/portal/contracts");
    revalidatePath(`/portal/contracts/${contractId}`);
    return { ok: true, transitions: result.transitions };
  } catch (error) {
    console.error("[contracts:record-manual-signature]", error);
    return { ok: false, error: manualSignatureError(error) };
  }
}


const CONTRACT_REVIEW_ORDER = [
  "ready_to_review",
  "summary_viewed",
  "agreement_viewed",
  "investor_signed",
  "counter_signature_pending",
  "effective",
  "signed_documents_available"
] as const;

/**
 * Records the investor's review checkpoint for the summary or full agreement.
 * Signing remains a staff-attested workflow until a provider is selected, but
 * the investor now has an audited, portal-owned review action before that step.
 */
export async function recordInvestorContractReview(input: {
  contractId: string;
  contractVersion: string;
  documentType: "summary" | "agreement";
}): Promise<{ ok: true } | { ok: false; error: string }> {
  let investor: Awaited<ReturnType<typeof ensureInvestor>>;
  try {
    investor = await ensureInvestor();
  } catch {
    return { ok: false, error: "Forbidden." };
  }

  if (!isUuid(input.contractId)) {
    return { ok: false, error: "Agreement not found." };
  }
  const contractVersion = input.contractVersion.trim();
  if (!contractVersion) {
    return { ok: false, error: "Agreement version is required." };
  }
  if (input.documentType !== "summary" && input.documentType !== "agreement") {
    return { ok: false, error: "Choose a valid agreement document." };
  }

  const contract = await getContractForInvestor(input.contractId);
  if (!contract) return { ok: false, error: "Agreement not found." };
  if (contract.version !== contractVersion) {
    return { ok: false, error: "Agreement version does not match the current record." };
  }
  if (contract.state === "superseded" || contract.state === "withdrawn") {
    return { ok: false, error: "This agreement is no longer available for review." };
  }

  const reviewDocument =
    input.documentType === "summary"
      ? contract.reviewDocuments.summary
      : contract.reviewDocuments.agreement;
  if (!reviewDocument) {
    return {
      ok: false,
      error: input.documentType === "summary"
        ? "The agreement summary is not available yet."
        : "The full agreement is not available yet."
    };
  }

  const targetState = input.documentType === "summary"
    ? "summary_viewed"
    : "agreement_viewed";
  const currentIndex = CONTRACT_REVIEW_ORDER.indexOf(
    contract.state as (typeof CONTRACT_REVIEW_ORDER)[number]
  );
  const targetIndex = CONTRACT_REVIEW_ORDER.indexOf(targetState);
  const summaryIndex = CONTRACT_REVIEW_ORDER.indexOf("summary_viewed");
  if (
    input.documentType === "agreement" &&
    contract.reviewDocuments.summary &&
    currentIndex < summaryIndex
  ) {
    return { ok: false, error: "Review the agreement summary first." };
  }
  // Treat repeated clicks and a later lifecycle state as idempotent.
  if (currentIndex >= targetIndex) return { ok: true };

  try {
    await transitionContract({
      contractId: contract.id,
      contractVersion,
      toState: targetState,
      actorId: investor.authUserId ?? investor.id,
      actorType: "investor",
      source: `investor:${input.documentType}-reviewed`,
      payload: { documentId: reviewDocument.id }
    });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    if (code === "CONTRACT_STATE_CHANGED" || code === "CONTRACT_TRANSITION_NOT_ALLOWED") {
      return { ok: false, error: "Agreement changed while you were reviewing it. Refresh and try again." };
    }
    if (code === "CONTRACT_VERSION_MISMATCH") {
      return { ok: false, error: "Agreement version does not match the current record." };
    }
    console.error("[contracts:investor-review]", error);
    return { ok: false, error: "Could not save your review confirmation. Please try again." };
  }

  revalidatePath("/portal/contracts");
  revalidatePath(`/portal/contracts/${contract.id}`);
  revalidatePath("/admin/contracts");
  revalidatePath(`/admin/contracts/${contract.id}`);
  return { ok: true };
}
