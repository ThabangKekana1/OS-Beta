import type { Browser } from "@playwright/test";

// =============================================================================
// HTML to PDF through headless Chromium: the same engine that renders the
// website renders the documents, so the design system is byte-identical.
// =============================================================================

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = (async () => {
      const { chromium } = await import("@playwright/test");
      return chromium.launch({
        executablePath: process.env.CHROMIUM_EXECUTABLE_PATH || undefined,
      });
    })();
  }
  return browserPromise;
}

export async function htmlToPdf(
  html: string,
  options: { landscape?: boolean } = {},
): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: "networkidle", timeout: 30000 });
    const bytes = await page.pdf({
      format: "A4",
      landscape: Boolean(options.landscape),
      printBackground: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
      preferCSSPageSize: true,
    });
    return new Uint8Array(bytes);
  } finally {
    await page.close();
  }
}
