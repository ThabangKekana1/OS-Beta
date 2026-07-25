export type ProposalGateReadiness = {
  signedEoi: boolean;
  recognisedBillingPeriods: number;
  requiredBillingPeriods: number;
};

export function proposalGateProgressIndex(
  readiness: ProposalGateReadiness | null | undefined,
) {
  if (!readiness || readiness.recognisedBillingPeriods < readiness.requiredBillingPeriods) return 1;
  if (!readiness.signedEoi) return 3;
  return 4;
}

export function proposalReportProgressIndex({
  accepted,
  mandateSigned,
}: {
  accepted: boolean;
  mandateSigned: boolean;
}) {
  if (mandateSigned) return 5;
  if (accepted) return 4;
  return 3;
}