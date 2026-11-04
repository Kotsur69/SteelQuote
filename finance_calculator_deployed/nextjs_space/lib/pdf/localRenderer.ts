// Renders offer HTML in our own headless Chromium, so no offer data leaves the server.
import type { Browser } from 'puppeteer-core';
import { PdfRenderError } from './errors';
import { PDF_MARGIN } from './pageOptions';

const MAX_CONCURRENT_RENDERS = 3;
const MAX_QUEUED_RENDERS = 30;
const RENDER_TIMEOUT_MS = 30_000;
// A 60-item offer is well under 1 MB including the embedded fonts, so this only stops abuse.
const MAX_HTML_BYTES = 8 * 1024 * 1024;
// Chromium does not get the server's secrets (DATABASE_URL, JWT_SECRET...), only what it needs to
// run: paths and temp dirs on Linux and Windows, plus font configuration.
const CHROME_ENV_KEYS = [
  'PATH', 'HOME', 'LANG', 'LC_ALL', 'TMPDIR', 'FONTCONFIG_PATH', 'XDG_CONFIG_HOME', 'XDG_CACHE_HOME',
  'SystemRoot', 'windir', 'TEMP', 'TMP', 'USERPROFILE', 'LOCALAPPDATA', 'APPDATA', 'ProgramFiles', 'ProgramFiles(x86)',
] as const;

function chromeEnv(): Record<string, string> {
  return Object.fromEntries(
    CHROME_ENV_KEYS.flatMap((key) => {
      const value = process.env[key];
      return value === undefined ? [] : [[key, value]];
    }),
  );
}

interface RendererState {
  browser: Promise<Browser> | null;
  active: number;
  waiting: ReadonlyArray<() => void>;
}

// Kept on globalThis so dev hot reloads reuse one browser instead of leaking a new one each time.
const holder = globalThis as typeof globalThis & { __pdfLocalRenderer?: RendererState };
const state: RendererState = (holder.__pdfLocalRenderer ??= { browser: null, active: 0, waiting: [] });

async function launchBrowser(): Promise<Browser> {
  const executablePath = process.env.PDF_CHROME_PATH;
  if (!executablePath) {
    console.error('PDF_RENDERER=local needs PDF_CHROME_PATH (path to a Chrome/Chromium binary)');
    throw new PdfRenderError('PDF renderer is not configured');
  }
  const { default: puppeteer } = await import('puppeteer-core');
  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    // Talk over a pipe: no debugging port that other local processes could attach to.
    pipe: true,
    env: chromeEnv(),
    // Containers often have a tiny /dev/shm, which crashes Chromium on larger documents.
    args: ['--disable-dev-shm-usage'],
  });
  return browser;
}

function getBrowser(): Promise<Browser> {
  if (state.browser) return state.browser;
  const launching: Promise<Browser> = launchBrowser().then(
    (browser) => {
      // Only clear our own entry: a late event from an old browser must not drop a newer one.
      browser.once('disconnected', () => {
        if (state.browser === launching) state.browser = null;
      });
      return browser;
    },
    (error: unknown) => {
      if (state.browser === launching) state.browser = null;
      throw error;
    },
  );
  state.browser = launching;
  return launching;
}

async function acquireSlot(): Promise<void> {
  if (state.active < MAX_CONCURRENT_RENDERS) {
    state.active += 1;
    return;
  }
  if (state.waiting.length >= MAX_QUEUED_RENDERS) {
    throw new PdfRenderError('PDF renderer is busy, please try again');
  }
  await new Promise<void>((resolve) => {
    state.waiting = [...state.waiting, resolve];
  });
}

function releaseSlot(): void {
  const [next, ...rest] = state.waiting;
  if (next) {
    // The finished render's slot passes straight to the next one, so `active` stays the same.
    state.waiting = rest;
    next();
    return;
  }
  state.active -= 1;
}

export async function renderWithLocalChromium(html: string): Promise<Buffer> {
  if (Buffer.byteLength(html) > MAX_HTML_BYTES) {
    throw new PdfRenderError('Offer is too large to generate a PDF');
  }
  await acquireSlot();
  try {
    const browser = await getBrowser();
    const page = await browser.newPage();
    try {
      // Offer text is user input. Even if something slips past escapeHtml, it cannot run a script
      // or call out from the server. All template assets are embedded as data: URIs.
      await page.setJavaScriptEnabled(false);
      await page.setRequestInterception(true);
      page.on('request', (request) => {
        const handled = request.url().startsWith('data:') ? request.continue() : request.abort();
        handled.catch((error: unknown) => console.error('PDF request interception failed:', error));
      });
      await page.setContent(html, { waitUntil: 'load', timeout: RENDER_TIMEOUT_MS });
      const pdf = await page.pdf({
        format: 'A4',
        landscape: false,
        printBackground: true,
        margin: PDF_MARGIN,
        timeout: RENDER_TIMEOUT_MS,
      });
      return Buffer.from(pdf);
    } finally {
      await page.close().catch((error: unknown) => console.error('PDF page close failed:', error));
    }
  } catch (error) {
    if (error instanceof PdfRenderError) throw error;
    console.error('Local PDF render failed:', error);
    throw new PdfRenderError('PDF generation failed');
  } finally {
    releaseSlot();
  }
}

/** Stops the shared browser (tests and scripts; the server keeps it running). */
export async function closeLocalBrowser(): Promise<void> {
  const current = state.browser;
  state.browser = null;
  if (current) await (await current).close();
}
