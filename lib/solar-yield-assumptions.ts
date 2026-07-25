export type ProvinceSolarYieldAssumption = {
  province: string;
  referenceSite: string;
  latitude: number;
  longitude: number;
  annualKwhPerKwp: number;
  annualYieldStdDevKwhPerKwp: number;
  annualIrradiationKwhPerSquareMetre: number;
  tiltDegrees: number;
  azimuthDegrees: number;
};

/**
 * PVGIS 5.3 reference outputs for a 1 kWp, free-standing crystalline-silicon
 * array at a representative provincial site. Inputs use PVGIS-SARAH3,
 * north-facing azimuth 180°, tilt near local latitude, horizon enabled, and a
 * 14% system-loss input. These are pre-engineering planning assumptions only;
 * the engineering-approved proposal must use the actual site coordinates,
 * roof/ground geometry, shading, equipment, and interval-load profile.
 *
 * Source/API documentation:
 * https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en
 * Retrieved 2026-07-09 from https://re.jrc.ec.europa.eu/api/v5_3/PVcalc.
 */
export const PROVINCE_SOLAR_YIELD_ASSUMPTIONS: readonly ProvinceSolarYieldAssumption[] = [
  {
    province: "Eastern Cape",
    referenceSite: "Gqeberha",
    latitude: -33.9608,
    longitude: 25.6022,
    annualKwhPerKwp: 1630.2,
    annualYieldStdDevKwhPerKwp: 39.49,
    annualIrradiationKwhPerSquareMetre: 2032.97,
    tiltDegrees: 34,
    azimuthDegrees: 180,
  },
  {
    province: "Free State",
    referenceSite: "Bloemfontein",
    latitude: -29.0852,
    longitude: 26.1596,
    annualKwhPerKwp: 1802.77,
    annualYieldStdDevKwhPerKwp: 44.93,
    annualIrradiationKwhPerSquareMetre: 2339.06,
    tiltDegrees: 29,
    azimuthDegrees: 180,
  },
  {
    province: "Gauteng",
    referenceSite: "Johannesburg",
    latitude: -26.2041,
    longitude: 28.0473,
    annualKwhPerKwp: 1732.88,
    annualYieldStdDevKwhPerKwp: 41.8,
    annualIrradiationKwhPerSquareMetre: 2234.17,
    tiltDegrees: 26,
    azimuthDegrees: 180,
  },
  {
    province: "KwaZulu-Natal",
    referenceSite: "Pietermaritzburg",
    latitude: -29.6006,
    longitude: 30.3794,
    annualKwhPerKwp: 1445.97,
    annualYieldStdDevKwhPerKwp: 40.54,
    annualIrradiationKwhPerSquareMetre: 1880.71,
    tiltDegrees: 30,
    azimuthDegrees: 180,
  },
  {
    province: "Limpopo",
    referenceSite: "Polokwane",
    latitude: -23.9045,
    longitude: 29.4689,
    annualKwhPerKwp: 1710,
    annualYieldStdDevKwhPerKwp: 37.87,
    annualIrradiationKwhPerSquareMetre: 2225.35,
    tiltDegrees: 24,
    azimuthDegrees: 180,
  },
  {
    province: "Mpumalanga",
    referenceSite: "Mbombela",
    latitude: -25.4753,
    longitude: 30.9694,
    annualKwhPerKwp: 1541.72,
    annualYieldStdDevKwhPerKwp: 38.8,
    annualIrradiationKwhPerSquareMetre: 2033.64,
    tiltDegrees: 25,
    azimuthDegrees: 180,
  },
  {
    province: "Northern Cape",
    referenceSite: "Kimberley",
    latitude: -28.7282,
    longitude: 24.7499,
    annualKwhPerKwp: 1818.86,
    annualYieldStdDevKwhPerKwp: 40.28,
    annualIrradiationKwhPerSquareMetre: 2386.96,
    tiltDegrees: 29,
    azimuthDegrees: 180,
  },
  {
    province: "North West",
    referenceSite: "Mahikeng",
    latitude: -25.8652,
    longitude: 25.6442,
    annualKwhPerKwp: 1811.72,
    annualYieldStdDevKwhPerKwp: 47.11,
    annualIrradiationKwhPerSquareMetre: 2360.74,
    tiltDegrees: 26,
    azimuthDegrees: 180,
  },
  {
    province: "Western Cape",
    referenceSite: "Cape Town",
    latitude: -33.9249,
    longitude: 18.4241,
    annualKwhPerKwp: 1724.34,
    annualYieldStdDevKwhPerKwp: 36.58,
    annualIrradiationKwhPerSquareMetre: 2168.74,
    tiltDegrees: 34,
    azimuthDegrees: 180,
  },
] as const;

function normalizedProvince(value: string | null | undefined) {
  return value?.trim().toLowerCase().replace(/[^a-z]/g, "") ?? "";
}

export function provinceSolarYieldAssumption(
  province: string | null | undefined,
): ProvinceSolarYieldAssumption | null {
  const normalized = normalizedProvince(province);
  if (!normalized) return null;
  return PROVINCE_SOLAR_YIELD_ASSUMPTIONS.find(
    (assumption) => normalizedProvince(assumption.province) === normalized,
  ) ?? null;
}

export function buildPreEngineeringSolarYield(input: {
  province?: string | null;
  siteCity?: string | null;
  pvKwp: number;
}) {
  const assumption = provinceSolarYieldAssumption(input.province);
  if (!assumption || !Number.isFinite(input.pvKwp) || input.pvKwp <= 0) return null;

  const annualGenerationKwh = assumption.annualKwhPerKwp * input.pvKwp;
  return {
    status: "pre-engineering" as const,
    province: assumption.province,
    siteCity: input.siteCity?.trim() || null,
    referenceSite: assumption.referenceSite,
    latitude: assumption.latitude,
    longitude: assumption.longitude,
    annualKwhPerKwp: assumption.annualKwhPerKwp,
    annualYieldStdDevKwhPerKwp: assumption.annualYieldStdDevKwhPerKwp,
    annualGenerationKwh,
    averageMonthlyGenerationKwh: annualGenerationKwh / 12,
    systemLossInputPercentage: 14,
    tiltDegrees: assumption.tiltDegrees,
    azimuthDegrees: assumption.azimuthDegrees,
    radiationDatabase: "PVGIS-SARAH3",
    source: "European Commission Joint Research Centre PVGIS 5.3",
    sourceUrl:
      "https://joint-research-centre.ec.europa.eu/photovoltaic-geographical-information-system-pvgis/getting-started-pvgis/api-non-interactive-service_en",
    retrievedAt: "2026-07-09",
    limitation:
      `Representative ${assumption.referenceSite} reference only. Engineering must recalculate at the actual site coordinates with confirmed orientation, shading, equipment and interval load before approval.`,
  };
}
