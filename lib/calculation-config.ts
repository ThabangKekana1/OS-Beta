export const CALCULATION_CONFIG = {
  current_tariff: 2.38,
  wheeling_tariff_min: 0.98,
  wheeling_tariff_max: 1.85,
  solar_solution_tariff: 2.24,
  solar_reference_tariff: 2.46,
  minimum_term_years: 10,
  eskom_proposal_style_ten_year_factor: 15.0057,
  foundation_one_ten_year_factor: 13.1808,
  escalation_cap_percent: 6,
  minimum_monthly_spend: 10000,
} as const;

export const MIGRATION_DISCLAIMER =
  "These figures are indicative estimates only. Final pricing and savings are only confirmed after Foundation-1 receives your six months of utility bills and signed Expression of Interest, submits the file for formal UFMS solar and wheeling assessment, and receives the formal partner proposals. Final outcomes depend on tariff category, consumption history, site suitability, network conditions, credit approval, engineering design, and partner approval.";
