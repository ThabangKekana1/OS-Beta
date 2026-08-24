import { jsPDF } from "jspdf";
import { ANALEMMA_PATH, ANALEMMA_SUN } from "@/lib/analemma";

// =============================================================================
// Foundation-1 document kit: the shared print design system for every
// platform PDF (jsPDF, A4 portrait, millimetres).
//
// Visual source of truth: the house presentation style of
// presentations/src/decks/f1-sponsor.tsx and primo-site1-bill-audit.tsx, as
// already ported to print in the indicative migration report. Light paper,
// fine fading grid texture, the analemma lockup, amber mono eyebrows with
// wide letter spacing, two-tone display titles, white panels with hairline
// borders, mono uppercase labels with interpunct separators, four-cell stat
// strips, small-print source notes, and a footer band on every page:
// FOUNDATION-1 · <DOCUMENT> · <CONTEXT> left, page number right.
//
// House rules enforced here for every string that reaches a page:
//   - No em dashes anywhere. Commas, colons, periods, or the interpunct.
//   - No abbreviations in visible copy: Expression of Interest is spelled
//     out and verification replaces the three-letter compliance gate.
//   - All ink tints are pre-blended against their background so the printed
//     artefact contains no transparency.
// =============================================================================

export type Rgb = readonly [number, number, number];

const PT = 25.4 / 72; // one PostScript point in millimetres

export const KIT_PAGE = {
  width: 210,
  height: 297,
  margin: 18,
  contentWidth: 210 - 18 * 2,
  /** Baseline of the footer hairline; body content must stay above it. */
  footerRuleY: 280.8,
  /** Last usable baseline before the footer band. */
  bodyLimitY: 272,
} as const;

// Foundation-1 light presentation palette (theme.css light stage).
export const KIT_COLORS = {
  paper: [246, 246, 244] as Rgb,
  panel: [255, 255, 255] as Rgb,
  ink: [12, 12, 13] as Rgb,
  amber: [180, 83, 9] as Rgb,
  cyan: [14, 116, 144] as Rgb,
  violet: [109, 40, 217] as Rgb,
  green: [21, 128, 61] as Rgb,
  red: [179, 50, 39] as Rgb,
  sunHalo: [103, 232, 249] as Rgb,
  sunCore: [8, 145, 178] as Rgb,
  eyebrowOnInk: [251, 191, 36] as Rgb,
} as const;

// Ink opacities lifted from the light deck stage variables.
export const KIT_INK = {
  line: 0.14,
  softLine: 0.08,
  body: 0.62,
  dim: 0.5,
  faint: 0.38,
  ghost: 0.3,
} as const;

/** Pre-blend `color` at `alpha` over `base` (paper unless stated). */
export function blend(color: Rgb, alpha: number, base: Rgb = KIT_COLORS.paper): Rgb {
  const mix = (channel: number, ground: number) => Math.round(ground + (channel - ground) * alpha);
  return [mix(color[0], base[0]), mix(color[1], base[1]), mix(color[2], base[2])];
}

/** Ink pre-blended at `alpha` over `base`. */
export function inkTint(alpha: number, base: Rgb = KIT_COLORS.paper): Rgb {
  return blend(KIT_COLORS.ink, alpha, base);
}

let partnerNeutral = true;

/**
 * Client-facing documents never name funders or partners. Internal documents
 * (the funder report) opt out with `setPartnerNeutralCopy(false)` at the top
 * of their build and set it back to neutral before returning.
 */
export function setPartnerNeutralCopy(enabled: boolean) {
  partnerNeutral = enabled;
}

/**
 * House copy pass for every string that reaches a page: spell out
 * abbreviations arriving from data, remove em and en dashes, neutralise
 * partner names in client-facing mode, and normalise exotic spaces the
 * standard fonts cannot encode.
 */
export function houseCopy(text: string): string {
  let clean = text
    .replace(/Foundation-1 EOI/g, "Foundation-1 Expression of Interest")
    .replace(/\bEOI\b/g, "Expression of Interest")
    .replace(/\bKYC readiness\b/g, "verification readiness")
    .replace(/\bKYC\b/g, "verification")
    .replace(/\bPCS\b/g, "power conversion")
    .replace(/\s*\u2014\s*/g, ", ")
    .replace(/(\d)\s*\u2013\s*(\d)/g, "$1 to $2")
    .replace(/\u2013/g, "-")
    .replace(/[\u00A0\u2007\u2009\u202F]/g, " ");
  if (partnerNeutral) {
    clean = clean
      .replace(/\bUFMS\b/g, "funded system")
      .replace(/\bthe observed Nedbank\/Eqstra\b/g, "the observed funder")
      .replace(/\bNedbank\/Eqstra('s)?\b/g, "the funder$1")
      .replace(/\bNedbank('s)?\b/g, "the funder$1")
      .replace(/\bEqstra('s)?\b/g, "the funder$1")
      .replace(/\bGreen Share('s)?\b/g, "the wheeled-energy provider$1");
  }
  return clean;
}

export function kitLongDate(iso: string): string {
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return iso.slice(0, 10);
  return parsed.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
}

// ------------------------------------------------------------- text engine

export type KitFont = "helvetica" | "courier" | "times";
export type KitFontWeight = "normal" | "bold" | "italic" | "bolditalic";

export type KitTextStyle = {
  font?: KitFont;
  weight?: KitFontWeight;
  /** Font size in points, as everywhere else in the design system. */
  size: number;
  color?: Rgb;
  /** Extra advance between characters, in em (multiplied by the size). */
  trackingEm?: number;
};

function applyStyle(pdf: jsPDF, style: KitTextStyle) {
  pdf.setFont(style.font ?? "helvetica", style.weight ?? "normal");
  pdf.setFontSize(style.size);
  const color = style.color ?? KIT_COLORS.ink;
  pdf.setTextColor(color[0], color[1], color[2]);
}

function trackingMm(style: KitTextStyle): number {
  return (style.trackingEm ?? 0) * style.size * PT;
}

export function textWidth(pdf: jsPDF, text: string, style: KitTextStyle): number {
  const clean = houseCopy(text);
  applyStyle(pdf, style);
  return pdf.getTextWidth(clean) + trackingMm(style) * Math.max(0, clean.length - 1);
}

export type KitAlign = "left" | "center" | "right";

/** Draw one line of styled text. Returns the drawn width in millimetres. */
export function drawText(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  style: KitTextStyle,
  options: { align?: KitAlign } = {},
): number {
  const clean = houseCopy(text);
  applyStyle(pdf, style);
  const width = textWidth(pdf, clean, style);
  let startX = x;
  if (options.align === "right") startX = x - width;
  if (options.align === "center") startX = x - width / 2;
  const tracking = trackingMm(style);
  if (!tracking) {
    pdf.text(clean, startX, y);
    return width;
  }
  let cursor = startX;
  for (const character of clean) {
    pdf.text(character, cursor, y);
    cursor += pdf.getTextWidth(character) + tracking;
  }
  return width;
}

export function wrapText(pdf: jsPDF, text: string, style: KitTextStyle, maxWidth: number): string[] {
  const clean = houseCopy(text).replace(/\s+/g, " ").trim();
  if (!clean) return [];
  applyStyle(pdf, style);
  if (!trackingMm(style)) return pdf.splitTextToSize(clean, maxWidth) as string[];
  const words = clean.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (textWidth(pdf, candidate, style) <= maxWidth) {
      line = candidate;
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Draw a wrapped paragraph. Returns the y baseline below the last line. */
export function paragraph(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  style: KitTextStyle,
  maxWidth: number,
  options: { lineHeight?: number; align?: KitAlign; maxLines?: number } = {},
): number {
  const lineHeight = options.lineHeight ?? style.size * PT * 1.5;
  let lines = wrapText(pdf, text, style, maxWidth);
  if (options.maxLines) lines = lines.slice(0, options.maxLines);
  lines.forEach((line, index) => {
    const anchorX = options.align === "center" ? x + maxWidth / 2 : options.align === "right" ? x + maxWidth : x;
    drawText(pdf, line, anchorX, y + index * lineHeight, style, { align: options.align ?? "left" });
  });
  return y + Math.max(1, lines.length) * lineHeight;
}

// ----------------------------------------------------------------- strokes

export function hairline(
  pdf: jsPDF,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  options: { alpha?: number; base?: Rgb; color?: Rgb } = {},
) {
  const tint = options.color ?? inkTint(options.alpha ?? KIT_INK.line, options.base ?? KIT_COLORS.paper);
  pdf.setDrawColor(tint[0], tint[1], tint[2]);
  pdf.setLineWidth(0.25);
  pdf.line(x1, y1, x2, y2);
}

// ------------------------------------------------------------------ chrome

/** Full-bleed paper ground. Call first on every page. */
export function paintPaper(pdf: jsPDF) {
  pdf.setFillColor(KIT_COLORS.paper[0], KIT_COLORS.paper[1], KIT_COLORS.paper[2]);
  pdf.rect(0, 0, KIT_PAGE.width, KIT_PAGE.height, "F");
}

/** The fine grid texture that fades down the cover page. */
export function coverGridTexture(pdf: jsPDF, options: { fadeBottomY?: number } = {}) {
  const step = 12;
  const fadeBottomY = options.fadeBottomY ?? 145;
  const bands = Math.ceil(fadeBottomY / step);
  pdf.setLineWidth(0.18);
  for (let band = 0; band < bands; band += 1) {
    const yTop = band * step;
    const alpha = 0.05 * (1 - band / bands);
    if (alpha <= 0.005) continue;
    const tint = inkTint(alpha);
    pdf.setDrawColor(tint[0], tint[1], tint[2]);
    pdf.line(0, yTop, KIT_PAGE.width, yTop);
    const yBottom = Math.min(fadeBottomY, yTop + step);
    for (let x = step; x < KIT_PAGE.width; x += step) {
      pdf.line(x, yTop, x, yBottom);
    }
  }
}

// The analemma path, parsed once into relative cubic segments for jsPDF.
type AnalemmaGeometry = { startX: number; startY: number; segments: number[][] };

function parseAnalemma(): AnalemmaGeometry {
  const numbers = ANALEMMA_PATH.replace(/[MCZ]/g, " ").trim().split(/\s+/).map(Number);
  const startX = numbers[0];
  const startY = numbers[1];
  const segments: number[][] = [];
  let currentX = startX;
  let currentY = startY;
  for (let index = 2; index + 5 < numbers.length; index += 6) {
    const [c1x, c1y, c2x, c2y, endX, endY] = numbers.slice(index, index + 6);
    segments.push([c1x - currentX, c1y - currentY, c2x - currentX, c2y - currentY, endX - currentX, endY - currentY]);
    currentX = endX;
    currentY = endY;
  }
  return { startX, startY, segments };
}

const ANALEMMA = parseAnalemma();

/**
 * The analemma alone, scalable: the certificate and any large-mark treatment
 * draw through this. `x`/`yTop` locate the top-left of the 420x120 viewbox.
 */
export function analemmaMark(
  pdf: jsPDF,
  x: number,
  yTop: number,
  options: { scale?: number; strokeAlpha?: number; lineWidth?: number; sunHaloAlpha?: number } = {},
) {
  const scale = options.scale ?? 0.0667;
  const stroke = inkTint(options.strokeAlpha ?? 0.94);
  pdf.setDrawColor(stroke[0], stroke[1], stroke[2]);
  pdf.setLineWidth(options.lineWidth ?? 0.28);
  pdf.lines(
    ANALEMMA.segments,
    x + ANALEMMA.startX * scale,
    yTop + ANALEMMA.startY * scale,
    [scale, scale],
    "S",
    true,
  );
  const sunX = x + ANALEMMA_SUN.x * scale;
  const sunY = yTop + ANALEMMA_SUN.y * scale;
  const halo = blend(KIT_COLORS.sunHalo, options.sunHaloAlpha ?? 0.4);
  pdf.setFillColor(halo[0], halo[1], halo[2]);
  pdf.circle(sunX, sunY, 18 * scale, "F");
  pdf.setFillColor(KIT_COLORS.sunCore[0], KIT_COLORS.sunCore[1], KIT_COLORS.sunCore[2]);
  pdf.circle(sunX, sunY, 7 * scale, "F");
}

/**
 * The Foundation-1 lockup: analemma with the sun at the winter-solstice tip
 * and the wordmark. `x`/`yTop` locate the top-left of the analemma viewbox.
 */
export function brandLockup(pdf: jsPDF, x: number, yTop: number, options: { scale?: number } = {}) {
  const scale = options.scale ?? 0.0667; // viewbox 420x120 -> 28mm wide
  analemmaMark(pdf, x, yTop, { scale });
  drawText(pdf, "Foundation-1", x + 420 * scale + 3.2, yTop + 60 * scale + 1.45, {
    weight: "bold",
    size: 12,
  });
}

/** Mono uppercase eyebrow with wide letter spacing. */
export function eyebrow(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  options: { color?: Rgb; alpha?: number; align?: KitAlign; size?: number } = {},
) {
  const color = blend(options.color ?? KIT_COLORS.amber, options.alpha ?? 0.78);
  drawText(pdf, text.toUpperCase(), x, y, { font: "courier", size: options.size ?? 7, color, trackingEm: 0.2 }, { align: options.align });
}

/** Small mono uppercase tracked label (section markers, table headers). */
export function monoLabel(
  pdf: jsPDF,
  text: string,
  x: number,
  y: number,
  options: { size?: number; alpha?: number; color?: Rgb; trackingEm?: number; align?: KitAlign; base?: Rgb } = {},
) {
  const color = options.color ?? inkTint(options.alpha ?? KIT_INK.ghost, options.base ?? KIT_COLORS.paper);
  drawText(
    pdf,
    text.toUpperCase(),
    x,
    y,
    { font: "courier", size: options.size ?? 6.4, color, trackingEm: options.trackingEm ?? 0.16 },
    { align: options.align },
  );
}

/** White panel with the house hairline border. */
export function panel(
  pdf: jsPDF,
  x: number,
  y: number,
  width: number,
  height: number,
  options: { fill?: Rgb | null; borderAlpha?: number } = {},
) {
  const border = inkTint(options.borderAlpha ?? KIT_INK.line);
  pdf.setDrawColor(border[0], border[1], border[2]);
  pdf.setLineWidth(0.25);
  const fill = options.fill === undefined ? KIT_COLORS.panel : options.fill;
  if (fill) {
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.rect(x, y, width, height, "FD");
  } else {
    pdf.rect(x, y, width, height, "D");
  }
}

/** The 2.6pt accent bar on the left edge of a panel row. */
export function accentBar(pdf: jsPDF, x: number, y: number, height: number, color: Rgb, alpha = 0.9) {
  const tint = blend(color, alpha, KIT_COLORS.panel);
  pdf.setFillColor(tint[0], tint[1], tint[2]);
  pdf.rect(x, y, 0.92, height, "F");
}

export type KitStatCell = { value: string; label: string; accent?: Rgb };

/** Four-cell (or n-cell) stat strip: white panel, hairline dividers. */
export function statStrip(
  pdf: jsPDF,
  yTop: number,
  height: number,
  cells: KitStatCell[],
  options: { valueSize?: number; x?: number; width?: number } = {},
): number {
  const x = options.x ?? KIT_PAGE.margin;
  const width = options.width ?? KIT_PAGE.contentWidth;
  panel(pdf, x, yTop, width, height);
  const cellWidth = width / cells.length;
  const valueSize = options.valueSize ?? 13;
  cells.forEach((cell, index) => {
    const cellX = x + index * cellWidth;
    if (index > 0) hairline(pdf, cellX, yTop, cellX, yTop + height, { base: KIT_COLORS.panel });
    drawText(pdf, cell.value, cellX + 4.6, yTop + height * 0.37, {
      weight: "bold",
      size: valueSize,
      color: cell.accent ? blend(cell.accent, 1, KIT_COLORS.panel) : KIT_COLORS.ink,
    });
    const labelStyle: KitTextStyle = {
      font: "courier",
      size: 5.6,
      color: inkTint(KIT_INK.ghost, KIT_COLORS.panel),
      trackingEm: 0.1,
    };
    wrapText(pdf, cell.label.toUpperCase(), labelStyle, cellWidth - 9.2)
      .slice(0, 2)
      .forEach((line, lineIndex) => {
        drawText(pdf, line, cellX + 4.6, yTop + height * 0.58 + lineIndex * 3, labelStyle);
      });
  });
  return yTop + height;
}

export type KitChip = { text: string; tone: "cyan" | "amber" | "neutral" };

/** Mono chip row, centred by default. */
export function chipRow(
  pdf: jsPDF,
  y: number,
  chips: KitChip[],
  options: { align?: "center" | "left"; x?: number } = {},
) {
  const chipStyle: KitTextStyle = { font: "courier", size: 6, trackingEm: 0.13 };
  const paddingX = 3.2;
  const gap = 2.8;
  const height = 6;
  const widths = chips.map((chip) => textWidth(pdf, chip.text.toUpperCase(), chipStyle) + paddingX * 2);
  const total = widths.reduce((sum, width) => sum + width, 0) + gap * (chips.length - 1);
  let x = options.align === "left" ? (options.x ?? KIT_PAGE.margin) : (KIT_PAGE.width - total) / 2;
  chips.forEach((chip, index) => {
    const tone = chip.tone === "cyan" ? KIT_COLORS.cyan : chip.tone === "amber" ? KIT_COLORS.amber : KIT_COLORS.ink;
    const isNeutral = chip.tone === "neutral";
    const fill = blend(tone, isNeutral ? 0.03 : 0.08);
    const border = blend(tone, isNeutral ? 0.17 : 0.3);
    pdf.setFillColor(fill[0], fill[1], fill[2]);
    pdf.setDrawColor(border[0], border[1], border[2]);
    pdf.setLineWidth(0.25);
    pdf.rect(x, y - height + 1.6, widths[index], height, "FD");
    drawText(pdf, chip.text.toUpperCase(), x + paddingX, y - 1.2, {
      ...chipStyle,
      color: isNeutral ? inkTint(KIT_INK.body) : blend(tone, 0.9),
    });
    x += widths[index] + gap;
  });
}

/** Small-print source note. Returns the y below the note. */
export function sourceNote(pdf: jsPDF, text: string, y: number, options: { x?: number; width?: number } = {}): number {
  return paragraph(
    pdf,
    text,
    options.x ?? KIT_PAGE.margin,
    y,
    { size: 6.8, color: inkTint(KIT_INK.faint) },
    options.width ?? KIT_PAGE.contentWidth,
    { lineHeight: 3.5 },
  );
}

// -------------------------------------------------------------- page frame

/** Body page header: eyebrow, right-aligned mono context, display title. */
export function pageHeader(
  pdf: jsPDF,
  options: { eyebrow: string; title: string; context?: string; tone?: Rgb },
): number {
  eyebrow(pdf, options.eyebrow, KIT_PAGE.margin, 21.2, { color: options.tone ?? KIT_COLORS.amber });
  if (options.context) {
    monoLabel(pdf, options.context, KIT_PAGE.width - KIT_PAGE.margin, 21.2, {
      size: 6.2,
      alpha: KIT_INK.ghost,
      trackingEm: 0.14,
      align: "right",
    });
  }
  drawText(pdf, options.title, KIT_PAGE.margin, 32.4, { weight: "bold", size: 22 });
  return 41;
}

/** Add a fresh paper page, optionally with a body header. Returns start y. */
export function addKitPage(
  pdf: jsPDF,
  options?: { eyebrow: string; title: string; context?: string; tone?: Rgb },
): number {
  pdf.addPage();
  paintPaper(pdf);
  if (options) return pageHeader(pdf, options);
  return 24;
}

/**
 * Footer band on every page: hairline, then
 * FOUNDATION-1 · <DOCUMENT> · <CONTEXT> left and NN / NN right.
 */
export function footerBand(pdf: jsPDF, docName: string, context?: string) {
  const pages = pdf.getNumberOfPages();
  const style: KitTextStyle = { font: "courier", size: 6.2, color: inkTint(KIT_INK.faint), trackingEm: 0.14 };
  const label = ["FOUNDATION-1", docName.toUpperCase(), context?.toUpperCase()].filter(Boolean).join(" · ");
  const pad = (value: number) => String(value).padStart(2, "0");
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    hairline(pdf, KIT_PAGE.margin, KIT_PAGE.footerRuleY, KIT_PAGE.width - KIT_PAGE.margin, KIT_PAGE.footerRuleY);
    drawText(pdf, label, KIT_PAGE.margin, KIT_PAGE.footerRuleY + 4.6, style);
    drawText(pdf, `${pad(page)} / ${pad(pages)}`, KIT_PAGE.width - KIT_PAGE.margin, KIT_PAGE.footerRuleY + 4.6, style, { align: "right" });
  }
}

// -------------------------------------------------------------- cover page

export type KitCoverOptions = {
  /** Right-aligned mono context at the very top, e.g. date line. */
  contextRight?: string;
  /** Centred amber mono eyebrow above the display title. */
  eyebrow: string;
  /** Two-tone display title: line one full ink, line two faint. */
  titleLine1: string;
  titleLine2?: string;
  /** Centred lead paragraph under the title. */
  lead?: string;
  /** Subject line (usually the client name) and its mono detail line. */
  subject?: string;
  subjectDetail?: string;
  chips?: KitChip[];
  /** Primary stat strip cells (up to four). */
  stats?: KitStatCell[];
  /** Optional secondary strip (smaller values) under the primary strip. */
  statsSecondary?: KitStatCell[];
  sourceNote?: string;
};

/** The standard document cover. Assumes the first page is already active. */
export function coverPage(pdf: jsPDF, options: KitCoverOptions) {
  paintPaper(pdf);
  coverGridTexture(pdf);
  brandLockup(pdf, KIT_PAGE.margin, 10.2);
  if (options.contextRight) {
    monoLabel(pdf, options.contextRight, KIT_PAGE.width - KIT_PAGE.margin, 14.8, {
      size: 6.2,
      alpha: KIT_INK.faint,
      trackingEm: 0.14,
      align: "right",
    });
  }
  eyebrow(pdf, options.eyebrow, KIT_PAGE.width / 2, 71, { align: "center" });
  drawText(pdf, options.titleLine1, KIT_PAGE.width / 2, 88, { weight: "bold", size: 30 }, { align: "center" });
  if (options.titleLine2) {
    drawText(pdf, options.titleLine2, KIT_PAGE.width / 2, 100, { weight: "bold", size: 30, color: inkTint(KIT_INK.faint) }, { align: "center" });
  }
  if (options.lead) {
    paragraph(pdf, options.lead, (KIT_PAGE.width - 152) / 2, 113, { size: 9.5, color: inkTint(KIT_INK.body) }, 152, {
      lineHeight: 5.3,
      align: "center",
    });
  }
  if (options.subject) {
    drawText(pdf, options.subject, KIT_PAGE.width / 2, 144.5, { weight: "bold", size: 13 }, { align: "center" });
  }
  if (options.subjectDetail) {
    monoLabel(pdf, options.subjectDetail, KIT_PAGE.width / 2, 151, {
      size: 6.2,
      alpha: KIT_INK.dim,
      trackingEm: 0.13,
      align: "center",
    });
  }
  if (options.chips?.length) chipRow(pdf, 163.7, options.chips);
  if (options.stats?.length) {
    if (options.statsSecondary?.length) {
      statStrip(pdf, 200, 22, options.stats);
      statStrip(pdf, 226, 20, options.statsSecondary, { valueSize: 9.5 });
    } else {
      statStrip(pdf, 214.5, 23.3, options.stats);
    }
  }
  if (options.sourceNote) sourceNote(pdf, options.sourceNote, 254);
}

// ------------------------------------------------------------- body blocks

export type KitKeyValueRow = { label: string; value: string; note?: string; strong?: boolean };

/** Hairline key-value rows: label left, figure right-aligned. */
export function keyValueRows(
  pdf: jsPDF,
  y: number,
  rows: KitKeyValueRow[],
  options: { x?: number; width?: number } = {},
): number {
  const x = options.x ?? KIT_PAGE.margin;
  const width = options.width ?? KIT_PAGE.contentWidth;
  for (const row of rows) {
    const height = row.note ? 10.2 : 7;
    drawText(pdf, row.label, x, y + 4.6, {
      size: 8,
      weight: row.strong ? "bold" : "normal",
      color: row.strong ? KIT_COLORS.ink : inkTint(KIT_INK.dim),
    });
    drawText(pdf, row.value, x + width, y + 4.6, { weight: "bold", size: 8.6 }, { align: "right" });
    if (row.note) {
      drawText(pdf, row.note, x, y + 8.2, { size: 6.6, color: inkTint(KIT_INK.faint) });
    }
    hairline(pdf, x, y + height, x + width, y + height, { alpha: KIT_INK.softLine });
    y += height;
  }
  return y;
}

export type KitTableColumn<Row> = {
  label: string;
  width: number;
  align?: "left" | "right";
  strong?: boolean;
  value: (row: Row) => string;
};

/**
 * Data table: mono uppercase header, hairline separators, right-aligned
 * figures. `onOverflow` must open a fresh page and return the new start y.
 */
export function dataTable<Row>(
  pdf: jsPDF,
  y: number,
  rows: readonly Row[],
  columns: readonly KitTableColumn<Row>[],
  options: { x?: number; width?: number; fontSize?: number; rowPadding?: number; onOverflow?: () => number } = {},
): number {
  const x = options.x ?? KIT_PAGE.margin;
  const width = options.width ?? KIT_PAGE.contentWidth;
  const fontSize = options.fontSize ?? 8;
  const rowPadding = options.rowPadding ?? 2.1;
  const lineHeight = fontSize * PT * 1.25;
  const columnX = (index: number) => x + columns.slice(0, index).reduce((sum, column) => sum + column.width, 0);
  const drawHeader = (atY: number) => {
    columns.forEach((column, index) => {
      const anchor = column.align === "right" ? columnX(index) + column.width : columnX(index) + (index === 0 ? 0 : 2.4);
      monoLabel(pdf, column.label, anchor, atY, { size: 6, alpha: KIT_INK.ghost, trackingEm: 0.1, align: column.align === "right" ? "right" : "left" });
    });
    hairline(pdf, x, atY + 2.4, x + width, atY + 2.4);
    return atY + 2.4 + rowPadding + fontSize * PT;
  };
  y = drawHeader(y + 2.2);
  for (const row of rows) {
    const cells = columns.map((column, index) =>
      wrapText(pdf, column.value(row), { size: fontSize }, column.width - (index === 0 ? 0 : 2.4)),
    );
    const maxLines = Math.max(1, ...cells.map((lines) => lines.length));
    const rowHeight = maxLines * lineHeight + rowPadding;
    if (y + rowHeight > KIT_PAGE.bodyLimitY && options.onOverflow) {
      y = drawHeader(options.onOverflow() + 2.2);
    }
    columns.forEach((column, index) => {
      const style: KitTextStyle = column.strong
        ? { weight: "bold", size: fontSize }
        : { size: fontSize, color: inkTint(KIT_INK.body) };
      const anchor = column.align === "right" ? columnX(index) + column.width : columnX(index) + (index === 0 ? 0 : 2.4);
      cells[index].forEach((line, lineIndex) => {
        drawText(pdf, line, anchor, y + lineIndex * lineHeight, style, { align: column.align === "right" ? "right" : "left" });
      });
    });
    y += rowHeight - rowPadding + 1.2;
    hairline(pdf, x, y, x + width, y, { alpha: KIT_INK.softLine });
    y += rowPadding + fontSize * PT;
  }
  return y - fontSize * PT + 1;
}

/** Ink callout panel (the NEXT STEP treatment). Returns the y below it. */
export function darkCallout(
  pdf: jsPDF,
  yTop: number,
  height: number,
  content: { eyebrow: string; title: string; body?: string },
): number {
  pdf.setFillColor(KIT_COLORS.ink[0], KIT_COLORS.ink[1], KIT_COLORS.ink[2]);
  pdf.rect(KIT_PAGE.margin, yTop, KIT_PAGE.contentWidth, height, "F");
  drawText(pdf, content.eyebrow.toUpperCase(), KIT_PAGE.margin + 5.6, yTop + 6.4, {
    font: "courier",
    size: 6.4,
    color: blend(KIT_COLORS.eyebrowOnInk, 0.9, KIT_COLORS.ink),
    trackingEm: 0.18,
  });
  drawText(pdf, content.title, KIT_PAGE.margin + 5.6, yTop + 12.2, { weight: "bold", size: 12, color: KIT_COLORS.panel });
  if (content.body) {
    paragraph(
      pdf,
      content.body,
      KIT_PAGE.margin + 5.6,
      yTop + 17.4,
      { size: 7.4, color: blend(KIT_COLORS.panel, 0.66, KIT_COLORS.ink) },
      KIT_PAGE.contentWidth - 11.2,
      { lineHeight: 3.7 },
    );
  }
  return yTop + height;
}

// -------------------------------------------------------- the stage journey

/**
 * THE canonical Foundation-1 stage sequence. Every journey rendered in any
 * document derives from this list, in this order.
 */
export const KIT_STAGE_SEQUENCE = [
  "Screen",
  "Evidence",
  "Foundation-1 Migration Report",
  "Non-binding Expression of Interest",
  "Formal proposals",
  "Verification",
  "Term sheet",
  "Migration",
  "Savings from day one",
] as const;

export type KitJourneyStep = {
  title: string;
  detail?: string;
  state?: "done" | "current" | "ahead" | "final";
};

/** Numbered stage rail in the house style. Returns the y below the rail. */
export function stageJourney(pdf: jsPDF, y: number, steps: KitJourneyStep[]): number {
  const railX = KIT_PAGE.margin + 2.5;
  const railTop = y - 1.4;
  // Measure first so the faint rail can be painted underneath the numerals.
  const detailStyle: KitTextStyle = { size: 8.2 };
  let measuredBottom = y;
  for (const step of steps) {
    const detailLines = step.detail ? wrapText(pdf, step.detail, detailStyle, KIT_PAGE.contentWidth - 12.7).length : 0;
    measuredBottom += detailLines > 0 ? 9.2 + detailLines * 4.05 + 0.8 + 3.8 : 9.2 + 3.8;
  }
  hairline(pdf, railX, railTop, railX, measuredBottom - 6, { alpha: 0.1 });
  steps.forEach((step, index) => {
    const number = String(index + 1).padStart(2, "0");
    const isFinal = step.state === "final";
    const dimmed = step.state === "done";
    drawText(pdf, number, KIT_PAGE.margin, y + 4.2, {
      font: "courier",
      size: 8.5,
      color: blend(KIT_COLORS.amber, dimmed ? 0.42 : 0.9),
      trackingEm: 0.08,
    });
    drawText(pdf, step.title, KIT_PAGE.margin + 12.7, y + 4.2, {
      weight: "bold",
      size: 10.5,
      color: isFinal ? blend(KIT_COLORS.amber, 0.95) : inkTint(dimmed ? KIT_INK.dim : 1),
    });
    if (step.state === "current") {
      monoLabel(pdf, "YOU ARE HERE", KIT_PAGE.width - KIT_PAGE.margin, y + 4.2, {
        size: 6,
        color: blend(KIT_COLORS.cyan, 0.9),
        trackingEm: 0.16,
        align: "right",
      });
    }
    let nextY = y + 9.2;
    if (step.detail) {
      nextY = paragraph(
        pdf,
        step.detail,
        KIT_PAGE.margin + 12.7,
        y + 9.2,
        { size: 8.2, color: inkTint(dimmed ? KIT_INK.faint : KIT_INK.dim) },
        KIT_PAGE.contentWidth - 12.7,
        { lineHeight: 4.05 },
      ) + 0.8;
    }
    y = nextY + 3.8;
  });
  return y;
}
