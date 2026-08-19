# Parkwise User Stories and Role Permissions

## Scope

This backlog defines the approved Parkwise role model and the main user journeys for the investment platform.

Staff roles are:

- super_admin
- ib, introducing broker
- agent

Investor, public applicant, and community host are customer journeys. Legal signers and signature providers are supporting contract actors, not primary Park staff roles.

Priority:

- P0: MVP critical
- P1: important
- P2: future enhancement

## Role permissions

| Role | Primary scope |
| --- | --- |
| Public visitor | Browse opportunities, risks, guides, and community spaces |
| Public applicant | Submit an individual or company investment application |
| Community host | Submit a parking-space request for manual review |
| Investor | Complete onboarding, KYC, interests, holdings, payments, documents, and contracts |
| Agent | Manage assigned investors and assigned leads |
| IB | Manage the IB book, including its queue, agents, and team leads |
| Super admin | Manage the whole platform, staff, assets, investors, compliance, documents, and financial operations |

Agents and IBs may perform KYC, AML, interest, distribution, and document actions within their permitted book. High-value actions require two distinct super admin approvals.

## Public visitor and applicant stories

- PUB-001 [P0] As a public visitor, I want to browse published parking opportunities so that I can understand available investments.
- PUB-002 [P0] As a public visitor, I want to review location, minimum ticket, target figures, income model, capacity, and risk information so that I can make an informed decision.
- PUB-003 [P0] As an individual applicant, I want to submit my personal and investment profile so that Park can review me for investor access.
- PUB-004 [P0] As a company applicant, I want to submit company and incorporation details so that Park can review the entity correctly.
- PUB-005 [P0] As an applicant, I want confirmation that my application was received so that I know what happens next.
- PUB-006 [P0] As an applicant, I want account and duplicate responses to be privacy-safe so that private account information is not revealed.
- PUB-007 [P1] As a public visitor, I want to browse verified community parking spaces so that I can discover local parking options.
- PUB-008 [P0] As a public visitor, I want clear risk, fee, and non-guarantee disclosures before applying so that expectations are accurate.

## Community host stories

- HOST-001 [P0] As a community host, I want to submit details about a residential bay, EV space, garage, or private lot so that Park can assess it.
- HOST-002 [P0] As a community host, I want a confirmation after submission so that I know my request reached Park.
- HOST-003 [P0] As a community host, I want my exact address and private information protected until approval so that my privacy is respected.
- HOST-004 [P2] As a community host, I want to see the status of my listing request so that I know whether it is under review, approved, paused, or rejected.

## Investor stories

- INV-001 [P0] As an approved investor, I want a secure, single-use invite so that I can create my password and access the portal.
- INV-002 [P0] As an investor, I want to sign in securely so that I can access only my own account.
- INV-003 [P0] As an investor, I want to complete individual or company onboarding so that Park has the information needed to assess my eligibility.
- INV-004 [P0] As an investor, I want to accept terms and risk disclosures so that my decisions are recorded properly.
- INV-005 [P0] As an investor, I want a guided onboarding timeline so that I always know my next action.
- INV-006 [P0] As an investor, I want to browse and filter available opportunities so that I can compare suitable assets.
- INV-007 [P0] As an investor, I want to express interest with an amount, option, and note so that Park understands what I want to invest in.
- INV-008 [P0] As an investor, I want to withdraw a pending interest so that I can change my decision before confirmation.
- INV-009 [P0] As an investor, I want to see interest statuses and receive decision notifications so that I understand what happened.
- INV-010 [P0] As an investor, I want to upload identity, address, company, and source-of-funds documents so that Park can complete verification.
- INV-011 [P0] As an investor, I want to replace editable KYC documents so that I can correct mistakes before review.
- INV-012 [P0] As an investor, I want to submit my KYC package for review so that Park can make a verification decision.
- INV-013 [P0] As an investor, I want to see KYC approval, review, or rejection information so that I know whether I can proceed.
- INV-014 [P0] As an investor, I want to see total invested, active investments, target income, pending interests, and received income so that I understand my portfolio.
- INV-015 [P0] As an investor, I want to view active and closed holdings so that I can track my complete investment history.
- INV-016 [P0] As an investor, I want to view payment history by holding so that I can distinguish recorded payments from estimates.
- INV-017 [P0] As an investor, I want to download documents I am authorized to access so that I can keep my own records.
- INV-018 [P1] As an investor, I want to review an agreement summary before the full agreement so that I understand the key terms first.
- INV-019 [P1] As an investor, I want to sign an agreement and see its signature status so that I know when it becomes effective.
- INV-020 [P1] As an investor, I want to download the final signed agreement so that I have an official copy.

## Agent stories

- AG-001 [P0] As an agent, I want a dashboard for my investor book so that I can focus on assigned work.
- AG-002 [P0] As an agent, I want to view assigned investor profiles, applications, KYC, interests, holdings, distributions, documents, and activity so that I can support investors.
- AG-003 [P0] As an agent, I want to mark applications contacted, approve and invite applicants, or reject applications with a note so that I can move applications through the pipeline.
- AG-004 [P0] As an agent, I want to review KYC documents and update allowed KYC statuses so that eligible investors can proceed.
- AG-005 [P0] As an agent, I want to record sanctions, PEP, and source-of-funds screening results so that compliance checks are documented.
- AG-006 [P0] As an agent, I want to review, confirm, or decline interests in my book so that requests are processed.
- AG-007 [P1] As an agent, I want to record or cancel distributions for investors in my book so that payment history stays accurate.
- AG-008 [P1] As an agent, I want to upload and download documents within my scope so that investor records remain complete.
- AG-009 [P0] As an agent, I want to see only leads assigned to me so that I can manage my own pipeline.
- AG-010 [P0] As an agent, I want to update lead details, stages, notes, and follow-up dates so that lead records remain current.
- AG-011 [P0] As an agent, I want to log calls with outcomes and notes so that the team has a complete contact history.
- AG-012 [P0] As an agent, I want access to other books, staff management, asset publishing, and lead assignment blocked so that least-privilege access is enforced.

## IB stories

- IB-001 [P0] As an IB, I want a dashboard showing my team pipeline and investor book so that I can manage my business.
- IB-002 [P0] As an IB, I want to see all leads assigned to my IB, including the unassigned queue and every agent's leads, so that no team lead is missed.
- IB-003 [P0] As an IB, I want to assign leads from my queue to agents on my team so that work is distributed correctly.
- IB-004 [P0] As an IB, I want to reassign leads, remove agent assignments, or return leads to my queue so that ownership remains accurate.
- IB-005 [P1] As an IB, I want workload, stale-lead, overdue-follow-up, and agent activity views so that I can manage team performance.
- IB-006 [P0] As an IB, I want scoped access to my team's investor applications, KYC, AML, interests, holdings, distributions, documents, and activity so that I can support agents.
- IB-007 [P0] As an IB, I want assignment history and original attribution preserved so that reassignment does not destroy referral history.
- IB-008 [P0] As an IB, I want other IB books and global administration controls hidden from me so that team boundaries are respected.

## Super admin stories

- SA-001 [P0] As a super admin, I want a global operations dashboard so that I can see applications, unassigned investors, leads, KYC work, interests, and payments.
- SA-002 [P0] As a super admin, I want to promote users to IBs and agents so that staff access can be managed centrally.
- SA-003 [P0] As a super admin, I want every agent linked to one parent IB so that the hierarchy remains consistent.
- SA-004 [P0] As a super admin, I want to deactivate staff with a reassignment strategy so that leads and history are not lost.
- SA-005 [P0] As a super admin, I want to assign investors to agents or return them to the unassigned pool so that ownership is clear.
- SA-006 [P1] As a super admin, I want to enable or disable investor pool access so that investment lanes can be controlled.
- SA-007 [P0] As a super admin, I want to create lead lists and upload CSV files so that inbound leads can be imported efficiently.
- SA-008 [P0] As a super admin, I want to assign leads to an IB queue or directly to an agent under a specific IB so that routing is flexible.
- SA-009 [P1] As a super admin, I want to bulk assign, reassign, or unassign leads so that large workloads can be managed quickly.
- SA-010 [P0] As a super admin, I want to review, approve, invite, contact, or reject applications so that the investor pipeline is controlled.
- SA-011 [P0] As a super admin, I want to review KYC and record AML screening decisions so that investments cannot proceed without required checks.
- SA-012 [P0] As a super admin, I want to confirm or decline interests only when KYC, AML, opportunity status, and capacity checks pass so that holdings are created safely.
- SA-013 [P0] As a super admin, I want high-value interest confirmations to require two distinct super admin approvals so that material decisions have four-eyes control.
- SA-014 [P0] As a super admin, I want to create, edit, publish, close, and update opportunity capacity so that public investment data remains accurate.
- SA-015 [P1] As a super admin, I want to record, cancel, and audit distributions so that the payment ledger is reliable.
- SA-016 [P1] As a super admin, I want high-value distribution actions to require two distinct super admin approvals so that payment corrections are controlled.
- SA-017 [P0] As a super admin, I want to upload asset, holding, platform, and investor documents so that the document library is complete.
- SA-018 [P0] As a super admin, I want to retract documents without deleting their storage history so that published records can be withdrawn while remaining auditable.
- SA-019 [P1] As a super admin, I want to publish final signed contract copies and record manual signatures while provider integration is pending so that agreements can complete operationally.
- SA-020 [P1] As a super admin, I want to manage platform settings and the community-space feature so that optional product areas can be controlled.
- SA-021 [P0] As a super admin, I want to review audit events, staff access history, investor access history, and sensitive account actions so that the platform remains accountable.
- SA-022 [P1] As a super admin, I want to erase or restrict investor records according to privacy procedures so that data requests can be handled correctly.

## Supporting system and contract stories

- SYS-001 [P0] As the Park platform, I want matching applicant, lead, and investor records linked automatically so that the customer journey remains connected.
- SYS-002 [P0] As the Park platform, I want current IB and agent ownership inherited correctly while preserving original attribution so that reassignment does not change referral history.
- SYS-003 [P0] As the Park platform, I want every sensitive mutation to create an audit event so that operational and compliance actions are traceable.
- SYS-004 [P0] As the Park platform, I want application, KYC, interest, holding, assignment, and payment writes to be transactional so that partial updates cannot corrupt workflows.
- SYS-005 [P0] As the Park platform, I want duplicate submissions and retries to be idempotent so that records are not duplicated.
- SYS-006 [P0] As the Park platform, I want failed email delivery not to roll back successful business actions so that operations can recover manually.
- SYS-007 [P0] As the Park platform, I want investor, staff, document, and lead access checks enforced server-side so that UI restrictions cannot be bypassed.
- SYS-008 [P0] As the Park platform, I want unauthorized records to look indistinguishable from missing records where appropriate so that private data cannot be enumerated.
- SYS-009 [P0] As the Park platform, I want documents validated, privately stored, encrypted in production, and downloadable only by authorized users.
- SYS-010 [P0] As the Park platform, I want rate limits, duplicate detection, file limits, accessible forms, and clear error states so that the service remains safe and usable.
- SYS-011 [P0] As the Park platform, I want yield, income, and return displays to include target, illustrative, and capital-at-risk language so that marketing remains honest.
- CONTRACT-001 [P1] As a legal signer, I want to complete my required counter-signature so that an agreement can become effective.
- CONTRACT-002 [P1] As a signature provider, I want versioned, idempotent signature events so that duplicate or stale callbacks cannot corrupt contract status.
- CONTRACT-003 [P1] As the Park platform, I want contract transitions and signature events recorded immutably so that every agreement state change can be audited.

## Acceptance baseline

- Public applications create one application and one linked lead, while duplicate submissions remain safe.
- Super admins can route leads to an IB queue or directly to an agent under a specific IB.
- IBs can assign only to agents in their own team.
- Matching investor signups inherit current ownership while original attribution remains unchanged.
- Incomplete or suspended investors cannot express interest.
- Interest confirmation requires approved KYC, a latest clear AML result, a published opportunity, and available capacity.
- High-value confirmations and distributions require two different super admins.
- Investors can access only their own holdings, documents, contracts, and payment history.
- Agents and IBs can access only their current book.
- Sensitive actions create audit events.
- Email failures do not undo successful business operations.
