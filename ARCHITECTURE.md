# Architecture: Foundation-1 Pilot Command Centre

## Domain Model

The system is built around a **single shared pipeline** with **three role-based views**. All roles interact with the same underlying deal and stage system.

### Core Entities

**User** - All actors in the system with role-based access (SUPER_ADMIN, ADMINISTRATOR, SALES_REPRESENTATIVE, BUSINESS_USER).

**Lead** - Pre-registration record created by Sales Representatives. Contains business contact info and invite tracking. Converts to a Business upon registration.

**Business** - The central entity. Has permanent source attribution to the originating Sales Representative, assigned Administrator, qualification status, and current pipeline stage.

**DealPipeline** - One-to-one with Business. Tracks the active deal state including current stage, stall status, health indicators, and action ownership.

**PipelineStageDefinition** - Configurable stage model with 30 stages across 11 groups. Each stage has an owner role, target duration, terminal flag, and customer visibility flag.

**PipelineStageHistory** - Immutable record of every stage transition with duration tracking and actor attribution.

**DocumentSubmission** - Versioned document uploads tied to document type definitions. Supports review workflow, partner forwarding, and return tracking.

**Task** - Auto-generated and manually created work items with priority, assignment, and due date tracking.

**ActivityLog** - Immutable audit trail for every significant action in the system.

## Pipeline Flow

```
LEAD_SOURCED → REGISTRATION_LINK_SENT → BUSINESS_REGISTERED → APPLICATION_COMPLETED
→ FOUNDATION_ONE_CONTRACT_SIGNED → EOI_REQUESTED → EOI_UPLOADED → EOI_SENT_TO_PARTNER
→ EOI_APPROVED → UTILITY_BILL_REQUESTED → UTILITY_BILL_UPLOADED → UTILITY_BILL_SENT_TO_PARTNER
→ PROPOSAL_RECEIVED → PROPOSAL_DELIVERED → PROPOSAL_SIGNED → PROPOSAL_SENT_TO_PARTNER
→ TERM_SHEET_RECEIVED → TERM_SHEET_DELIVERED → TERM_SHEET_SIGNED → TERM_SHEET_SENT_TO_PARTNER
→ KYC_REQUESTED → KYC_UPLOADED → KYC_SENT_TO_PARTNER → NEDBANK_APPROVED
→ SITE_INSPECTION → INSTALLATION → COMMISSIONED → ACTIVE_SUPPORT
                                                    ↗ DISQUALIFIED (terminal)
                                                    ↗ LOST (terminal)
```

## Permission Model

- **Sales Representatives**: Create leads, view attributed businesses, cannot access downstream workflow or KYC documents.
- **Business Users**: Upload documents, view own progress, cannot see internal notes or other businesses.
- **Administrators**: Full pipeline control, document review, stage advancement, stall management.
- **Super Admins**: All admin permissions plus user management and system configuration.

## Stage Transition Rules

1. Stages must progress sequentially (admins can skip forward).
2. Terminal stages (DISQUALIFIED, LOST) cannot be exited.
3. Only admins can disqualify or mark as lost.
4. Sales reps can only advance early lead stages.
5. Business users can only trigger stages through eligible actions (uploads/signatures).
6. Every transition creates an immutable history record with duration tracking.

## Stall Detection

Deals are marked as stalled with structured reason codes (20 predefined reasons across 7 categories). Health status is computed from stage age vs target duration:
- HEALTHY: within target
- AT_RISK: over target
- OVERDUE: >1.5x target
- STALLED: explicitly marked

## Document Workflow

1. Business or Admin uploads document → version tracked
2. If requires review → PENDING_REVIEW → Admin approves/rejects
3. Admin can forward to partner → timestamp tracked
4. Partner returns → status recorded
5. KYC documents restricted from Sales Representative visibility

## Qualification Logic

A business becomes QUALIFIED only after: application completed, Foundation-1 contract signed, Expression of Interest uploaded, utility bill uploaded, and utility bill passes validation.

## Design Decisions

- **Single pipeline, three views**: Avoids data duplication and ensures consistency.
- **Structured stall reasons**: Prevents free-text ambiguity in operational data.
- **Immutable history**: Every stage transition and document action creates an audit record.
- **Permanent attribution**: Source Sales Representative is never lost, even on business reassignment.
- **Server Actions**: All mutations go through validated server actions with role checks.
- **Dark monochrome theme**: Black primary, white text/accents/borders for operational clarity.
