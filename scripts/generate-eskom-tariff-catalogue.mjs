import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { strFromU8, unzipSync } from "fflate";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = join(root, "lib/tariffs/eskom-2026-27.xlsm");
const historicalSourcePath = join(root, "lib/tariffs/eskom-2025-26.xlsm");
const outputPath = join(root, "lib/tariffs/eskom-2026-27.json");
const sourceUrl = "https://www.eskom.co.za/distribution/wp-content/uploads/2026/03/Eskom-tariffs-1-April-2026-Public.xlsm";
const historicalSourceUrl = "https://www.eskom.co.za/distribution/wp-content/uploads/2025/04/Eskom-tariffs-1-April-2025-ver-2.xlsm";
const sourceBytes = readFileSync(sourcePath);
const historicalSourceBytes = readFileSync(historicalSourcePath);

function decodeXml(value) {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)))
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&amp;", "&");
}

function attributes(value) {
  return Object.fromEntries(
    [...value.matchAll(/([\w:]+)="([^"]*)"/g)].map((match) => [match[1], decodeXml(match[2])]),
  );
}

function columnNumber(reference) {
  return [...reference].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

function parseWorkbook(bytes) {
  const zip = unzipSync(bytes);
  const xml = (path) => {
    const entry = zip[path];
    if (!entry) throw new Error(`Missing workbook entry: ${path}`);
    return strFromU8(entry);
  };
  const sharedStringsXml = zip["xl/sharedStrings.xml"] ? xml("xl/sharedStrings.xml") : "";
  const sharedStrings = [...sharedStringsXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((item) =>
    [...item[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
      .map((part) => decodeXml(part[1]))
      .join(""),
  );
  const relationships = new Map(
    [...xml("xl/_rels/workbook.xml.rels").matchAll(/<Relationship\b([^>]*)\/?\s*>/g)].map((item) => {
      const attrs = attributes(item[1]);
      const target = attrs.Target.startsWith("/") ? attrs.Target.slice(1) : `xl/${attrs.Target.replace(/^\.\.\//, "")}`;
      return [attrs.Id, target];
    }),
  );
  const sheets = new Map();
  for (const item of xml("xl/workbook.xml").matchAll(/<sheet\b([^>]*)\/?\s*>/g)) {
    const attrs = attributes(item[1]);
    const target = relationships.get(attrs["r:id"]);
    if (!target) continue;
    const sheetRows = [];
    for (const rowMatch of xml(target).matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)) {
      const rowAttrs = attributes(rowMatch[1]);
      const row = [];
      for (const cellMatch of rowMatch[2].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const cellAttrs = attributes(cellMatch[1]);
        const column = columnNumber(cellAttrs.r.match(/[A-Z]+/)?.[0] ?? "A") - 1;
        const cellBody = cellMatch[2] ?? "";
        const rawValue = cellBody.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? null;
        const inlineText = [...cellBody.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)]
          .map((part) => decodeXml(part[1]))
          .join("");
        let value = null;
        if (cellAttrs.t === "s" && rawValue !== null) value = sharedStrings[Number(rawValue)] ?? null;
        else if (cellAttrs.t === "inlineStr") value = inlineText;
        else if (rawValue !== null) value = Number.isFinite(Number(rawValue)) ? Number(rawValue) : decodeXml(rawValue);
        row[column] = value;
      }
      const rowNumber = Number(rowAttrs.r);
      sheetRows[Number.isFinite(rowNumber) && rowNumber > 0 ? rowNumber - 1 : sheetRows.length] = row;
    }
    sheets.set(attrs.name, sheetRows);
  }
  return sheets;
}

const workbook = parseWorkbook(sourceBytes);
const historicalWorkbook = parseWorkbook(historicalSourceBytes);

function rows(targetWorkbook, sheetName) {
  const sheet = targetWorkbook.get(sheetName);
  if (!sheet) throw new Error(`Missing worksheet: ${sheetName}`);
  return sheet;
}

function number(value) {
  return Number.isFinite(value) ? value : null;
}

function text(value) {
  return typeof value === "string" ? value.replace(/\r?\n/g, " ").replace(/\s+/g, " ").trim() : null;
}

function flatTariffs(targetWorkbook, sheetName, firstRow, lastRow, family) {
  return rows(targetWorkbook, sheetName).slice(firstRow - 1, lastRow).map((row) => ({
    family,
    tariff: text(row[0]) || (text(row[7])?.startsWith("Landlight") ? "Landlight" : null),
    tariffCode: text(row[1]),
    billCode: text(row[4]),
    description: text(row[7]),
    transmissionZone: number(row[2]),
    voltageCode: number(row[3]),
    ratesExVat: {
      energyCentsPerKwh: number(row[9]),
      ancillaryCentsPerKwh: number(row[11]),
      networkDemandCentsPerKwh: number(row[13]),
      networkCapacityRandPerPodDay: number(row[15]),
      serviceAndAdministrationRandPerPodDay: number(row[17]),
      electrificationRuralSubsidyCentsPerKwh: family === "businessrate" ? number(row[19]) : null,
      generationCapacityRandPerPodDay: number(row[family === "businessrate" ? 21 : 19]),
    },
  })).filter((entry) => entry.billCode && entry.description);
}

function touTariffs(targetWorkbook, sheetName, family) {
  const sheetRows = rows(targetWorkbook, sheetName);
  let zoneLabel = null;
  return sheetRows.slice(7, 21).map((row) => {
    if (text(row[7])) zoneLabel = text(row[7]);
    if (!text(row[4]) || !Number.isFinite(row[2]) || !Number.isFinite(row[3])) return null;
    const isRuraflex = family === "ruraflex";
    return {
      family,
      tariff: text(row[0]),
      tariffCode: text(row[1]),
      billCode: text(row[4]),
      transmissionZone: number(row[2]),
      transmissionZoneDescription: zoneLabel,
      voltageCode: number(row[3]),
      voltageDescription: text(row[8]),
      ratesExVat: isRuraflex ? {
        highSeasonCentsPerKwh: {
          peak: number(row[9]), standard: number(row[11]), offPeak: number(row[13]),
        },
        lowSeasonCentsPerKwh: {
          peak: number(row[15]), standard: number(row[17]), offPeak: number(row[19]),
        },
        legacyCentsPerKwh: number(row[21]),
        generationCapacityRandPerKvaMonth: number(row[23]),
        networkCapacityRandPerKvaMonth: number(row[25]),
      } : {
        activeEnergyCentsPerKwh: {
          highSeason: number(row[9]), lowSeason: number(row[11]),
        },
        energyDemandRandPerKvaMonth: {
          highSeason: number(row[13]), lowSeason: number(row[15]),
        },
        networkCapacityRandPerKvaMonth: number(row[17]),
        legacyCentsPerKwh: number(row[19]),
        generationCapacityRandPerKvaMonth: number(row[21]),
      },
    };
  }).filter(Boolean);
}

function ruralSharedCharges(targetWorkbook, sheetName) {
  const sheetRows = rows(targetWorkbook, sheetName);
  const categories = sheetRows.slice(28, 33).map((row) => ({
    category: text(row[7]),
    serviceRandPerPodDay: number(row[9]),
    administrationRandPerPodDay: number(row[11]),
  })).filter((entry) => entry.category);
  const lowVoltage = sheetName === "Ruraflex NLA" ? sheetRows[27] : sheetRows[31];
  const mediumVoltage = sheetName === "Ruraflex NLA" ? sheetRows[28] : sheetRows[32];
  return {
    customerCategoryChargesExVat: categories,
    ancillaryCentsPerKwh: number(lowVoltage[16]),
    networkDemandCentsPerKwhByVoltage: {
      below500V: number(lowVoltage[18]),
      atLeast500VTo22kV: number(mediumVoltage[18]),
    },
    reactiveEnergyCentsPerKvarh: sheetName === "Ruraflex NLA" ? {
      highSeason: number(sheetRows[33][14]), lowSeason: number(sheetRows[33][16]),
    } : null,
  };
}

const catalogue = {
  schemaVersion: 2,
  title: "Eskom direct-customer standard tariffs 2026/27",
  effectiveFrom: "2026-04-01",
  effectiveTo: "2027-03-31",
  vatRate: 0.15,
  source: {
    publisher: "Eskom",
    url: sourceUrl,
    workbook: "eskom-2026-27.xlsm",
    sha256: createHash("sha256").update(sourceBytes).digest("hex"),
    scope: "Non-local-authority customers directly supplied by Eskom",
  },
  caveats: [
    "All stored rates exclude VAT.",
    "A bill code, transmission zone, voltage, customer category, season and billed determinants must be matched before a tariff is repriced.",
    "Municipal customers require the municipality's approved tariff schedule and are not priced from this catalogue.",
  ],
  flatTariffs: [
    ...flatTariffs(workbook, "Businessrate NLA", 8, 11, "businessrate"),
    ...flatTariffs(workbook, "Landrate NLA", 6, 13, "landrate"),
  ],
  ruraflex: {
    variants: touTariffs(workbook, "Ruraflex NLA", "ruraflex"),
    sharedCharges: ruralSharedCharges(workbook, "Ruraflex NLA"),
  },
  nightsaveRural: {
    variants: touTariffs(workbook, "Nightsave Rural NLA", "nightsave-rural"),
    sharedCharges: ruralSharedCharges(workbook, "Nightsave Rural NLA"),
  },
  historicalReference: {
    effectiveFrom: "2025-04-01",
    effectiveTo: "2026-03-31",
    source: {
      publisher: "Eskom",
      url: historicalSourceUrl,
      workbook: "eskom-2025-26.xlsm",
      sha256: createHash("sha256").update(historicalSourceBytes).digest("hex"),
    },
    flatTariffs: [
      ...flatTariffs(historicalWorkbook, "Businessrate NLA", 8, 11, "businessrate"),
      ...flatTariffs(historicalWorkbook, "Landrate NLA", 6, 13, "landrate"),
    ],
    ruraflex: {
      variants: touTariffs(historicalWorkbook, "Ruraflex NLA", "ruraflex"),
      sharedCharges: ruralSharedCharges(historicalWorkbook, "Ruraflex NLA"),
    },
    nightsaveRural: {
      variants: touTariffs(historicalWorkbook, "Nightsave Rural NLA", "nightsave-rural"),
      sharedCharges: ruralSharedCharges(historicalWorkbook, "Nightsave Rural NLA"),
    },
  },
};

writeFileSync(outputPath, `${JSON.stringify(catalogue, null, 2)}\n`);
console.log(`Wrote ${outputPath}`);
