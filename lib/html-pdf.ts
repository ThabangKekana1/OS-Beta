import type { Browser } from "playwright-core";

// =============================================================================
// HTML to PDF through headless Chromium: the same engine that renders the
// website renders the documents, so the design system is byte-identical.
//
// Local and self-hosted: CHROMIUM_EXECUTABLE_PATH points at a Chromium binary.
// Serverless (Vercel): @sparticuz/chromium ships the binary with the function.
// =============================================================================

let browserPromise: Promise<Browser> | null = null;

async function launchBrowser(): Promise<Browser> {
  const { chromium } = await import("playwright-core");
  const localPath = process.env.CHROMIUM_EXECUTABLE_PATH;
  if (localPath) {
    return chromium.launch({ executablePath: localPath });
  }
  const sparticuz = await import("@sparticuz/chromium");
  const executablePath = await sparticuz.default.executablePath();
  return chromium.launch({
    executablePath,
    args: sparticuz.default.args,
  });
}

async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise.catch(() => null);
    if (existing && existing.isConnected()) return existing;
    browserPromise = null;
  }
  browserPromise = launchBrowser().catch((error) => {
    browserPromise = null;
    throw error;
  });
  return browserPromise;
}

export async function htmlToPdf(
  html: string,
  options: { landscape?: boolean } = {},
): Promise<Uint8Array> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // The documents are fully self-contained (no network fetches), so "load"
    // is complete and immune to idle-timer hangs on serverless.
    await page.setContent(html, { waitUntil: "load", timeout: 30000 });
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
