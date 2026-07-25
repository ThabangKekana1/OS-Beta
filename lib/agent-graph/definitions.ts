import type {
  GraphCapability,
  GraphDefinition,
  GraphNodeDefinition,
  GraphNodeKind,
} from "@/lib/agent-graph/contracts";
import { validateGraphDefinition } from "@/lib/agent-graph/runtime";

const limits = {
  maxNodes: 10,
  maxParallelNodes: 4,
  maxAttemptsPerNode: 2,
  maxRounds: 1,
} as const;

function node(
  key: string,
  label: string,
  kind: GraphNodeKind,
  dependsOn: string[],
  capabilities: GraphCapability[],
  artifactKey: string,
  options: Pick<
    GraphNodeDefinition,
    "parallelGroup" | "verifierKey" | "maxAttempts"
  > = {},
): GraphNodeDefinition {
  return {
    key,
    label,
    kind,
    dependsOn,
    capabilities,
    artifactKey,
    ...options,
  };
}

const ACCOUNT_RESEARCH_GRAPH: GraphDefinition = {
  key: "account_research",
  version: "2026-07-23.1",
  label: "Account Research",
  purpose:
    "Produce one evidence-backed account brief from independent research lenses.",
  inputContract: ["target_name", "known_identifiers", "research_question"],
  outputArtifactKey: "account_brief",
  limits,
  nodes: [
    node(
      "company_research",
      "Company research",
      "agent",
      [],
      ["read:account", "research:public_sources", "draft:brief"],
      "company_findings",
      { parallelGroup: "account_lenses" },
    ),
    node(
      "decision_maker_research",
      "Decision-maker research",
      "agent",
      [],
      ["read:account", "research:public_sources", "draft:brief"],
      "decision_maker_findings",
      { parallelGroup: "account_lenses" },
    ),
    node(
      "energy_context_research",
      "Energy-use context research",
      "agent",
      [],
      ["read:account", "research:public_sources", "draft:brief"],
      "energy_context_findings",
      { parallelGroup: "account_lenses" },
    ),
    node(
      "relationship_research",
      "Association and cooperative relationship research",
      "agent",
      [],
      ["read:account", "research:public_sources", "draft:brief"],
      "relationship_findings",
      { parallelGroup: "account_lenses" },
    ),
    node(
      "account_evidence_verifier",
      "Account evidence skeptic",
      "verifier",
      [
        "company_research",
        "decision_maker_research",
        "energy_context_research",
        "relationship_research",
      ],
      ["check:evidence", "check:claims"],
      "verified_account_findings",
    ),
    node(
      "merge_account_brief",
      "Merge one account brief",
      "merge",
      [
        "company_research",
        "decision_maker_research",
        "energy_context_research",
        "relationship_research",
        "account_evidence_verifier",
      ],
      ["merge:artifact", "draft:brief"],
      "account_brief",
      { verifierKey: "account_evidence_verifier", maxAttempts: 1 },
    ),
  ],
};

const OUTREACH_PREPARATION_GRAPH: GraphDefinition = {
  key: "outreach_preparation",
  version: "2026-07-23.1",
  label: "Outreach Preparation",
  purpose:
    "Prepare one reviewed outreach pack without sending any communication.",
  inputContract: ["approved_account_brief", "campaign_objective"],
  outputArtifactKey: "outreach_pack",
  limits,
  nodes: [
    node(
      "email_angle",
      "Email angle",
      "agent",
      [],
      ["read:account", "draft:outreach"],
      "email_draft",
      { parallelGroup: "outreach_drafts" },
    ),
    node(
      "call_angle",
      "Call opening angle",
      "agent",
      [],
      ["read:account", "draft:outreach"],
      "call_draft",
      { parallelGroup: "outreach_drafts" },
    ),
    node(
      "association_angle",
      "Association introduction angle",
      "agent",
      [],
      ["read:account", "draft:outreach"],
      "association_draft",
      { parallelGroup: "outreach_drafts" },
    ),
    node(
      "outreach_claims_verifier",
      "Outreach claims verifier",
      "verifier",
      ["email_angle", "call_angle", "association_angle"],
      ["check:evidence", "check:claims"],
      "verified_outreach_drafts",
    ),
    node(
      "merge_outreach_pack",
      "Merge one outreach pack",
      "merge",
      [
        "email_angle",
        "call_angle",
        "association_angle",
        "outreach_claims_verifier",
      ],
      ["merge:artifact", "draft:outreach"],
      "outreach_pack",
      { verifierKey: "outreach_claims_verifier", maxAttempts: 1 },
    ),
  ],
};

const MIGRATION_ANALYSIS_GRAPH: GraphDefinition = {
  key: "migration_analysis_explanation",
  version: "2026-07-23.1",
  label: "Migration Analysis Explanation",
  purpose:
    "Compare deterministic pathway results and produce one evidence-backed recommendation brief.",
  inputContract: [
    "validated_bill_facts",
    "deterministic_eden_result",
    "deterministic_awaken_result",
    "deterministic_blended_result",
  ],
  outputArtifactKey: "migration_recommendation_brief",
  limits,
  nodes: [
    node(
      "eden_pathway_explanation",
      "Explain Eden",
      "agent",
      [],
      ["read:validated_bill_facts", "draft:brief"],
      "eden_explanation",
      { parallelGroup: "pathway_explanations" },
    ),
    node(
      "awaken_pathway_explanation",
      "Explain Awaken",
      "agent",
      [],
      ["read:validated_bill_facts", "draft:brief"],
      "awaken_explanation",
      { parallelGroup: "pathway_explanations" },
    ),
    node(
      "blended_pathway_explanation",
      "Explain blended pathway",
      "agent",
      [],
      ["read:validated_bill_facts", "draft:brief"],
      "blended_explanation",
      { parallelGroup: "pathway_explanations" },
    ),
    node(
      "pathway_claims_verifier",
      "Pathway claims verifier",
      "verifier",
      [
        "eden_pathway_explanation",
        "awaken_pathway_explanation",
        "blended_pathway_explanation",
      ],
      ["read:validated_bill_facts", "check:evidence", "check:claims"],
      "verified_pathway_explanations",
    ),
    node(
      "merge_migration_recommendation",
      "Merge one migration recommendation",
      "merge",
      [
        "eden_pathway_explanation",
        "awaken_pathway_explanation",
        "blended_pathway_explanation",
        "pathway_claims_verifier",
      ],
      ["merge:artifact", "draft:brief"],
      "migration_recommendation_brief",
      { verifierKey: "pathway_claims_verifier", maxAttempts: 1 },
    ),
  ],
};

const PROPOSAL_CONTENT_GRAPH: GraphDefinition = {
  key: "proposal_content",
  version: "2026-07-23.1",
  label: "Proposal Content",
  purpose:
    "Draft and verify proposal content while leaving the final proposal document to the existing deterministic writer.",
  inputContract: [
    "approved_migration_recommendation",
    "approved_financial_tables",
    "approved_claims_register",
  ],
  outputArtifactKey: "proposal_content_package",
  limits,
  nodes: [
    node(
      "executive_narrative",
      "Executive narrative",
      "agent",
      [],
      ["read:case_summary", "read:approved_financial_tables", "draft:narrative"],
      "executive_narrative_draft",
      { parallelGroup: "proposal_sections" },
    ),
    node(
      "pathway_narrative",
      "Pathway explanation",
      "agent",
      [],
      ["read:case_summary", "read:approved_financial_tables", "draft:narrative"],
      "pathway_narrative_draft",
      { parallelGroup: "proposal_sections" },
    ),
    node(
      "implementation_narrative",
      "Implementation explanation",
      "agent",
      [],
      ["read:case_summary", "draft:narrative"],
      "implementation_narrative_draft",
      { parallelGroup: "proposal_sections" },
    ),
    node(
      "proposal_content_verifier",
      "Proposal claims and compliance verifier",
      "verifier",
      [
        "executive_narrative",
        "pathway_narrative",
        "implementation_narrative",
      ],
      ["read:approved_financial_tables", "check:evidence", "check:claims"],
      "verified_proposal_content",
    ),
    node(
      "assemble_proposal_content",
      "Assemble one proposal content package",
      "merge",
      [
        "executive_narrative",
        "pathway_narrative",
        "implementation_narrative",
        "proposal_content_verifier",
      ],
      ["merge:artifact", "draft:narrative"],
      "proposal_content_package",
      { verifierKey: "proposal_content_verifier", maxAttempts: 1 },
    ),
  ],
};

const KYC_REVIEW_GRAPH: GraphDefinition = {
  key: "kyc_review_assistance",
  version: "2026-07-23.1",
  label: "KYC Review Assistance",
  purpose:
    "Prepare a human review brief from authorized KYC summaries without approving or submitting anything.",
  inputContract: ["authorized_kyc_summary", "required_document_taxonomy"],
  outputArtifactKey: "kyc_review_brief",
  limits,
  nodes: [
    node(
      "kyc_completeness_review",
      "KYC completeness review",
      "deterministic",
      [],
      ["read:authorized_kyc_summary", "check:consistency"],
      "kyc_completeness_findings",
      { parallelGroup: "kyc_checks" },
    ),
    node(
      "kyc_inconsistency_review",
      "KYC inconsistency review",
      "agent",
      [],
      ["read:authorized_kyc_summary", "check:consistency"],
      "kyc_inconsistency_findings",
      { parallelGroup: "kyc_checks" },
    ),
    node(
      "kyc_findings_verifier",
      "KYC findings verifier",
      "verifier",
      ["kyc_completeness_review", "kyc_inconsistency_review"],
      ["read:authorized_kyc_summary", "check:evidence", "check:consistency"],
      "verified_kyc_findings",
    ),
    node(
      "merge_kyc_review_brief",
      "Merge one KYC review brief",
      "merge",
      [
        "kyc_completeness_review",
        "kyc_inconsistency_review",
        "kyc_findings_verifier",
      ],
      ["merge:artifact", "draft:brief"],
      "kyc_review_brief",
      { verifierKey: "kyc_findings_verifier", maxAttempts: 1 },
    ),
  ],
};

const OPERATIONS_IMPROVEMENT_GRAPH: GraphDefinition = {
  key: "operations_improvement",
  version: "2026-07-23.1",
  label: "Operations Improvement",
  purpose:
    "Turn pseudonymous product metrics and graph quality signals into one human-reviewed operations recommendation.",
  inputContract: [
    "telemetry_aggregates",
    "graph_quality_metrics",
    "current_operating_constraints",
  ],
  outputArtifactKey: "operations_improvement_brief",
  limits,
  nodes: [
    node(
      "funnel_analysis",
      "Funnel analysis",
      "agent",
      [],
      ["read:telemetry_aggregates", "draft:brief"],
      "funnel_findings",
      { parallelGroup: "operations_lenses" },
    ),
    node(
      "friction_analysis",
      "Friction analysis",
      "agent",
      [],
      ["read:telemetry_aggregates", "draft:brief"],
      "friction_findings",
      { parallelGroup: "operations_lenses" },
    ),
    node(
      "graph_quality_analysis",
      "Graph quality analysis",
      "agent",
      [],
      ["read:graph_quality_metrics", "draft:brief"],
      "graph_quality_findings",
      { parallelGroup: "operations_lenses" },
    ),
    node(
      "operations_skeptic",
      "Operations evidence skeptic",
      "verifier",
      ["funnel_analysis", "friction_analysis", "graph_quality_analysis"],
      [
        "read:telemetry_aggregates",
        "read:graph_quality_metrics",
        "check:evidence",
        "check:claims",
      ],
      "verified_operations_findings",
    ),
    node(
      "merge_operations_brief",
      "Merge one operations improvement brief",
      "merge",
      [
        "funnel_analysis",
        "friction_analysis",
        "graph_quality_analysis",
        "operations_skeptic",
      ],
      ["merge:artifact", "draft:brief"],
      "operations_improvement_brief",
      { verifierKey: "operations_skeptic", maxAttempts: 1 },
    ),
  ],
};

export const FOUNDATION1_AGENT_GRAPHS = [
  ACCOUNT_RESEARCH_GRAPH,
  OUTREACH_PREPARATION_GRAPH,
  MIGRATION_ANALYSIS_GRAPH,
  PROPOSAL_CONTENT_GRAPH,
  KYC_REVIEW_GRAPH,
  OPERATIONS_IMPROVEMENT_GRAPH,
].map(validateGraphDefinition);

export type Foundation1GraphKey =
  (typeof FOUNDATION1_AGENT_GRAPHS)[number]["key"];

export function foundation1Graph(key: string) {
  return FOUNDATION1_AGENT_GRAPHS.find((graph) => graph.key === key) ?? null;
}
