import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  timestamp,
  date,
  integer,
  numeric,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  boolean,
  check,
  type AnyPgColumn
} from "drizzle-orm/pg-core";
import type { IncomeMixEntry } from "@/lib/assets/income-streams";
import type { CommercialTermId } from "@/lib/assets/commercial-terms";
import type { InvestmentOption } from "@/lib/assets/investment-options";
import type { OperatorDisplay } from "@/lib/assets/operator-display";
import type { MetricProvenance } from "@/lib/assets/metric-provenance";

export const onboardingStatusEnum = pgEnum("onboarding_status", ["started", "completed"]);
export const accountStatusEnum = pgEnum("account_status", [
  "pending_access",
  "active",
  "suspended"
]);
export const kycStatusEnum = pgEnum("kyc_status", [
  "not_started",
  "submitted",
  "under_review",
  "approved",
  "rejected"
]);
export const kycCheckResultEnum = pgEnum("kyc_check_result", [
  "clear",
  "review",
  "rejected"
]);
export const applicationAccountTypeEnum = pgEnum("application_account_type", [
  "individual",
  "company"
]);
export const applicationStatusEnum = pgEnum("application_status", [
  "submitted",
  "contacted",
  "approved",
  "rejected"
]);
export const assetStatusEnum = pgEnum("asset_status", ["draft", "published", "closed"]);
export const interestStatusEnum = pgEnum("interest_status", [
  "pending",
  "confirmed",
  "declined",
  "withdrawn"
]);
export const holdingStatusEnum = pgEnum("holding_status", ["active", "closed"]);
export const staffRoleEnum = pgEnum("staff_role", ["super_admin", "ib", "agent"]);
export const communitySpaceTypeEnum = pgEnum("community_space_type", [
  "residential",
  "ev_station",
  "garage",
  "private_lot"
]);
export const communitySpaceStatusEnum = pgEnum("community_space_status", [
  "draft",
  "published",
  "paused"
]);
export const leadStatusEnum = pgEnum("lead_status", [
  "new",
  "contacted",
  "qualified",
  "unqualified",
  "duplicate",
  "converted"
]);
export const leadAssignmentActionEnum = pgEnum("lead_assignment_action", [
  "assign_ib",
  "assign_agent",
  "reassign_ib",
  "reassign_agent",
  "remove_agent",
  "remove_all",
  "return_to_ib_queue"
]);
export const leadCallOutcomeEnum = pgEnum("lead_call_outcome", [
  "no_answer",
  "reached",
  "interested",
  "not_interested",
  "callback",
  "wrong_number",
  "other"
]);

export const staffProfiles = pgTable("staff_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: text("auth_user_id").notNull().unique(),
  email: text("email").notNull(),
  role: staffRoleEnum("role").notNull(),
  /** Parent IB for agents (every agent belongs to exactly one IB). Null for super_admin/ib. */
  ibId: uuid("ib_id").references((): AnyPgColumn => staffProfiles.id),
  /** Soft-delete: deactivated staff keep their row so assignment history stays intact. */
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("staff_profiles_ib_id_idx").on(t.ibId)]);

export const investors = pgTable("investors", {
  id: uuid("id").defaultRandom().primaryKey(),
  authUserId: text("auth_user_id").unique(),
  email: text("email").notNull(),
  fullName: text("full_name").notNull().default(""),
  country: text("country").notNull().default(""),
  phone: text("phone"),
  onboardingStatus: onboardingStatusEnum("onboarding_status").notNull().default("started"),
  accountStatus: accountStatusEnum("account_status").notNull().default("active"),
  /** Super-admin-controlled access to the location-pool investment lane. */
  poolInvestmentsEnabled: boolean("pool_investments_enabled").notNull().default(false),
  kycStatus: kycStatusEnum("kyc_status").notNull().default("not_started"),
  kycRejectReason: text("kyc_reject_reason"),
  /** CDD fields collected at onboarding; null for investors who completed before CDD existed. */
  dateOfBirth: date("date_of_birth", { mode: "string" }),
  address: text("address"),
  nationality: text("nationality"),
  /** Entity CDD fields collected at onboarding for accountType "company". */
  companyLegalName: text("company_legal_name"),
  countryOfIncorporation: text("country_of_incorporation"),
  companyNumber: text("company_number"),
  /** Self-declared politically-exposed-person status; null until declared. */
  pepDeclaration: boolean("pep_declaration"),
  accountType: applicationAccountTypeEnum("account_type").default("individual"),
  eligibilityAnswers: jsonb("eligibility_answers").$type<Record<string, unknown>>().notNull().default({}),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }),
  riskAcceptedAt: timestamp("risk_accepted_at", { withTimezone: true }),
  assignedAgentId: uuid("assigned_agent_id").references(() => staffProfiles.id),
  /** Current parent IB (synced from the owning lead). */
  ibId: uuid("ib_id").references(() => staffProfiles.id),
  /** First referring agent/IB — set once for attribution, never overwritten. */
  originalAgentId: uuid("original_agent_id").references(() => staffProfiles.id),
  originalIbId: uuid("original_ib_id").references(() => staffProfiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  uniqueIndex("investors_email_lower_uidx").on(sql`lower(${t.email})`),
  index("investors_assigned_agent_id_idx").on(t.assignedAgentId),
  index("investors_ib_id_idx").on(t.ibId)
]);

export const investorApplications = pgTable("investor_applications", {
  id: uuid("id").defaultRandom().primaryKey(),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => investors.id),
  accountType: applicationAccountTypeEnum("account_type").notNull(),
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").notNull(),
  countryOfResidence: text("country_of_residence").notNull(),
  companyLegalName: text("company_legal_name"),
  countryOfIncorporation: text("country_of_incorporation"),
  investmentProfile: jsonb("investment_profile").$type<Record<string, unknown>>().notNull().default({}),
  termsAcceptedAt: timestamp("terms_accepted_at", { withTimezone: true }).notNull(),
  riskAcceptedAt: timestamp("risk_accepted_at", { withTimezone: true }).notNull(),
  status: applicationStatusEnum("status").notNull().default("submitted"),
  opsNote: text("ops_note"),
  leadId: uuid("lead_id").references(() => leads.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [index("investor_applications_investor_id_idx").on(t.investorId)]);

/** AML screening records (R6): sanctions/PEP result + source-of-funds note per review. */
export const kycChecks = pgTable(
  "kyc_checks",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),
    result: kycCheckResultEnum("result").notNull(),
    /** Sanctions / PEP screening note (manual check or vendor reference). */
    screeningNote: text("screening_note").notNull(),
    sourceOfFundsNote: text("source_of_funds_note"),
    reviewedByStaffId: uuid("reviewed_by_staff_id")
      .notNull()
      .references(() => staffProfiles.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("kyc_checks_investor_id_reviewed_at_idx").on(t.investorId, t.reviewedAt.desc())]
);

export const inviteTokens = pgTable(
  "invite_tokens",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("invite_tokens_investor_id_idx").on(t.investorId)]
);

export const leadLists = pgTable("lead_lists", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  defaultSource: text("default_source").notNull().default(""),
  createdByStaffId: uuid("created_by_staff_id")
    .notNull()
    .references(() => staffProfiles.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [uniqueIndex("lead_lists_name_uidx").on(t.name)]);

export const leads = pgTable(
  "leads",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    listId: uuid("list_id")
      .notNull()
      .references(() => leadLists.id),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    source: text("source").notNull(),
    sourceDetail: text("source_detail"),
    notes: text("notes"),
    status: leadStatusEnum("status").notNull().default("new"),
    /** Parent IB — separate field from the assigned agent. */
    ibId: uuid("ib_id").references(() => staffProfiles.id),
    assignedAgentId: uuid("assigned_agent_id").references(() => staffProfiles.id),
    assignedByStaffId: uuid("assigned_by_staff_id").references(() => staffProfiles.id),
    assignedAt: timestamp("assigned_at", { withTimezone: true }),
    nextFollowUpAt: timestamp("next_follow_up_at", { withTimezone: true }),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    investorId: uuid("investor_id").references(() => investors.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("leads_investor_id_uidx").on(t.investorId),
    // Backs the CSV upload dedupe in lib/leads/admin-actions.ts: one row per
    // (list, email) so concurrent uploads of the same file can't double-insert.
    uniqueIndex("leads_list_email_lower_uidx").on(t.listId, sql`lower(${t.email})`),
    index("leads_email_lower_idx").on(sql`lower(${t.email})`),
    index("leads_ib_id_idx").on(t.ibId),
    index("leads_assigned_agent_id_idx").on(t.assignedAgentId),
    index("leads_list_id_idx").on(t.listId),
    // A lead must never have an assigned agent without a parent IB.
    check(
      "leads_agent_requires_ib",
      sql`${t.assignedAgentId} IS NULL OR ${t.ibId} IS NOT NULL`
    )
  ]
);

export const leadAssignments = pgTable(
  "lead_assignments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    actorStaffId: uuid("actor_staff_id").references(() => staffProfiles.id),
    action: leadAssignmentActionEnum("action").notNull(),
    fromIbId: uuid("from_ib_id").references(() => staffProfiles.id),
    toIbId: uuid("to_ib_id").references(() => staffProfiles.id),
    fromAgentId: uuid("from_agent_id").references(() => staffProfiles.id),
    toAgentId: uuid("to_agent_id").references(() => staffProfiles.id),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("lead_assignments_lead_id_idx").on(t.leadId, t.createdAt.desc())]
);

export const leadCallAttempts = pgTable(
  "lead_call_attempts",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    leadId: uuid("lead_id")
      .notNull()
      .references(() => leads.id),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => staffProfiles.id),
    calledAt: timestamp("called_at", { withTimezone: true }).notNull().defaultNow(),
    outcome: leadCallOutcomeEnum("outcome").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("lead_call_attempts_lead_id_called_at_idx").on(t.leadId, t.calledAt.desc())]
);

export const enrichmentStatusEnum = pgEnum("enrichment_status", [
  "pending",
  "ok",
  "partial",
  "failed"
]);

export const enrichmentSourceEnum = pgEnum("enrichment_source", [
  "api",
  "local",
  "none"
]);

export const userAccessEvents = pgTable(
  "user_access_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    authUserId: text("auth_user_id").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    uaBrowser: text("ua_browser"),
    uaOs: text("ua_os"),
    uaDevice: text("ua_device"),
    countryCode: text("country_code"),
    countryName: text("country_name"),
    region: text("region"),
    city: text("city"),
    timezone: text("timezone"),
    isp: text("isp"),
    org: text("org"),
    isProxy: boolean("is_proxy"),
    isVpn: boolean("is_vpn"),
    isDatacenter: boolean("is_datacenter"),
    enrichmentStatus: enrichmentStatusEnum("enrichment_status").notNull().default("pending"),
    enrichmentSource: enrichmentSourceEnum("enrichment_source").notNull().default("none"),
    enrichmentRaw: jsonb("enrichment_raw").$type<Record<string, unknown>>(),
    sessionId: text("session_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("user_access_events_user_occurred_idx").on(t.authUserId, t.occurredAt)]
);

export const platformSettings = pgTable("platform_settings", {
  key: text("key").primaryKey(),
  enabled: boolean("enabled").notNull().default(false),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const communitySpaceListings = pgTable(
  "community_space_listings",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    hostLabel: text("host_label").notNull().default("Private host"),
    spaceType: communitySpaceTypeEnum("space_type").notNull(),
    city: text("city").notNull(),
    district: text("district").notNull().default(""),
    country: text("country").notNull(),
    description: text("description").notNull().default(""),
    accessNotes: text("access_notes").notNull().default(""),
    monthlyPriceEur: integer("monthly_price_eur").notNull(),
    features: jsonb("features").$type<string[]>().notNull().default([]),
    status: communitySpaceStatusEnum("status").notNull().default("draft"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    createdBy: text("created_by").notNull(),
    updatedBy: text("updated_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    uniqueIndex("community_space_listings_slug_uidx").on(t.slug),
    index("community_space_listings_status_city_idx").on(t.status, t.city)
  ]
);

export const assets = pgTable(
  "assets",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    operator: text("operator").notNull(),
    city: text("city").notNull(),
    district: text("district").notNull(),
    country: text("country").notNull(),
    targetYieldPct: numeric("target_yield_pct", { precision: 5, scale: 2 }).notNull(),
    tier: text("tier").notNull(),
    minTicketEur: integer("min_ticket_eur").notNull(),
    spaces: integer("spaces").notNull(),
    occupancyPct: numeric("occupancy_pct", { precision: 5, scale: 2 }).notNull(),
    leaseLabel: text("lease_label").notNull(),
    blurb: text("blurb").notNull(),
    /** Place narrative for opportunity detail (nullable = use thin template). */
    placeStory: text("place_story"),
    /** Operator narrative; must use public operator label, not legalName when pattern. */
    operatorStory: text("operator_story"),
    /** Demand-drivers narrative. */
    demandStory: text("demand_story"),
    /** Short honesty line on modelled figures. */
    numbersNote: text("numbers_note"),
    status: assetStatusEnum("status").notNull().default("draft"),
    advisoryCapacityEur: integer("advisory_capacity_eur"),
    artVariant: integer("art_variant").notNull().default(0),
    incomeMix: jsonb("income_mix")
      .$type<IncomeMixEntry[]>()
      .notNull()
      .default([{ id: "vehicle_parking", pct: 100 }]),
    visitorsPerDay: integer("visitors_per_day"),
    visitorsProvenance: text("visitors_provenance").$type<MetricProvenance>().notNull().default("withheld"),
    availableSpaces: integer("available_spaces"),
    annualRevenueEur: integer("annual_revenue_eur"),
    revenueProvenance: text("revenue_provenance").$type<MetricProvenance>().notNull().default("withheld"),
    commercialTermIds: jsonb("commercial_term_ids")
      .$type<CommercialTermId[]>()
      .notNull()
      .default([
        "triple_net",
        "contractual_monthly_rent",
        "indexation_floor",
        "parkwise_protections",
        "flexible_term"
      ]),
    investmentOptions: jsonb("investment_options").$type<InvestmentOption[]>().notNull().default([]),
    operatorDisplay: jsonb("operator_display").$type<OperatorDisplay>(),
    siteType: text("site_type"),
    /** Optional cover image URL for consumer cards and detail gallery */
    coverImageUrl: text("cover_image_url"),
    /** Optional caption for cover / gallery imagery on the public detail page. */
    coverImageCaption: text("cover_image_caption"),
    /** Optional additional gallery image URLs */
    galleryImageUrls: jsonb("gallery_image_urls").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("assets_slug_uidx").on(t.slug)]
);

export const interests = pgTable("interests", {
  id: uuid("id").defaultRandom().primaryKey(),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => investors.id),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  amountEur: integer("amount_eur").notNull(),
  optionId: text("option_id"),
  note: text("note"),
  status: interestStatusEnum("status").notNull().default("pending"),
  adminNote: text("admin_note"),
  decidedBy: text("decided_by"),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  // One pending interest per investor/asset — the 23505 race guard in lib/interests/actions.ts.
  uniqueIndex("interests_one_pending_uidx")
    .on(t.investorId, t.assetId)
    .where(sql`${t.status} = 'pending'`),
  index("interests_investor_id_idx").on(t.investorId),
  check("interests_amount_positive", sql`${t.amountEur} > 0`)
]);

/**
 * Four-eyes control: one pending first approval per interest. Created when a
 * super admin confirms an interest at/above FOUR_EYES_THRESHOLD_EUR; consumed
 * (deleted) by the second, distinct super admin inside the confirm transaction.
 * Rows on interests that leave "pending" are stale and ignored — confirm is
 * gated on status='pending' and a new interest always gets a fresh id.
 * interest_id cascades so seed/retention hard-deletes of interests still work.
 */
export const interestConfirmationApprovals = pgTable(
  "interest_confirmation_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    interestId: uuid("interest_id")
      .notNull()
      .references(() => interests.id, { onDelete: "cascade" }),
    approvedByStaffId: uuid("approved_by_staff_id")
      .notNull()
      .references(() => staffProfiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("interest_confirmation_approvals_interest_uidx").on(t.interestId)]
);

export const holdings = pgTable("holdings", {
  id: uuid("id").defaultRandom().primaryKey(),
  investorId: uuid("investor_id")
    .notNull()
    .references(() => investors.id),
  assetId: uuid("asset_id")
    .notNull()
    .references(() => assets.id),
  interestId: uuid("interest_id")
    .notNull()
    .references(() => interests.id)
    .unique(),
  amountEur: integer("amount_eur").notNull(),
  targetYieldPct: numeric("target_yield_pct", { precision: 5, scale: 2 }).notNull(),
  status: holdingStatusEnum("status").notNull().default("active"),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
}, (t) => [
  index("holdings_investor_id_idx").on(t.investorId),
  check("holdings_amount_positive", sql`${t.amountEur} > 0`)
]);

export const distributionStatusEnum = pgEnum("distribution_status", [
  "scheduled",
  "paid",
  "failed",
  "cancelled"
]);

export const distributionTypeEnum = pgEnum("distribution_type", [
  "income",
  "return_of_capital",
  "other"
]);

/** Recorded investor distributions (ledger). Empty until ops posts payments. */
export const distributions = pgTable(
  "distributions",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),
    holdingId: uuid("holding_id")
      .notNull()
      .references(() => holdings.id),
    amountEur: integer("amount_eur").notNull(),
    type: distributionTypeEnum("type").notNull().default("income"),
    status: distributionStatusEnum("status").notNull().default("scheduled"),
    periodLabel: text("period_label"),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    note: text("note"),
    /** Posting-flow idempotency key, written by recordDistribution (derived from holding/type/status/amount/period). Unique when set (NULLs allowed). */
    idempotencyKey: text("idempotency_key"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("distributions_investor_paid_idx").on(t.investorId, t.paidAt),
    index("distributions_holding_id_idx").on(t.holdingId),
    uniqueIndex("distributions_idempotency_key_uidx").on(t.idempotencyKey),
    check("distributions_amount_positive", sql`${t.amountEur} > 0`)
  ]
);

/**
 * Four-eyes control for distributions: one pending first approval per
 * action+subject. Created when a super admin records or cancels a
 * distribution at/above FOUR_EYES_THRESHOLD_EUR; consumed (deleted) by the
 * second, distinct super admin inside the posting/cancellation transaction.
 * The subject is the derived idempotency key for "record" (no distribution
 * row exists yet) and the distribution id for "cancel". Stale rows (never
 * second-approved) are simply ignored, mirroring interest_confirmation_approvals.
 */
export const distributionApprovals = pgTable(
  "distribution_approvals",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    action: text("action").notNull(),
    subjectKey: text("subject_key").notNull(),
    approvedByStaffId: uuid("approved_by_staff_id")
      .notNull()
      .references(() => staffProfiles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [uniqueIndex("distribution_approvals_action_subject_uidx").on(t.action, t.subjectKey)]
);

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    actorUserId: text("actor_user_id").notNull(),
    action: text("action").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [
    index("audit_events_entity_idx").on(t.entityType, t.entityId),
    index("audit_events_created_at_idx").on(t.createdAt)
  ]
);

/** Staff-authored notes on an investor record; surfaced in the Activity tab timeline. */
export const investorNotes = pgTable(
  "investor_notes",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    investorId: uuid("investor_id")
      .notNull()
      .references(() => investors.id),
    authorStaffId: uuid("author_staff_id")
      .notNull()
      .references(() => staffProfiles.id),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
  },
  (t) => [index("investor_notes_investor_id_idx").on(t.investorId)]
);

export const documentOwnerTypeEnum = pgEnum("document_owner_type", [
  "asset",
  "holding",
  "platform",
  "investor"
]);

export const documents = pgTable("documents", {
  id: uuid("id").defaultRandom().primaryKey(),
  ownerType: documentOwnerTypeEnum("owner_type").notNull(),
  ownerId: uuid("owner_id"),
  title: text("title").notNull(),
  category: text("category").notNull(),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  uploadedBy: text("uploaded_by").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  /** Soft delete: set when staff retract a published document. Storage object stays on disk. */
  retractedAt: timestamp("retracted_at", { withTimezone: true })
}, (t) => [index("documents_owner_idx").on(t.ownerType, t.ownerId)]);

// Better Auth tables (generated via `npx auth@1.6.23 generate` — do not hand-edit shapes)
export * from "./auth-schema";
export * from "../contracts/persistence";
