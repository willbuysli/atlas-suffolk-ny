import { createHash } from "crypto";

export interface Lead {
  id: string;
  county: string;
  state: string;
  lead_type: string;
  owner_name: string | null;
  address: string | null;
  city: string | null;
  zip: string | null;
  mailing_address: string | null;
  mailing_city: string | null;
  mailing_state: string | null;
  mailing_zip: string | null;
  case_number: string | null;
  filing_date: string | null;
  assessed_value: string | null;
  tax_year: string | null;
  lender: string | null;
  loan_amount: string | null;
  sale_date: string | null;
  sale_amount: string | null;
  description: string | null;
  source_url: string | null;
  raw_data: string | null;
}

export function makeId(...parts: (string | null | undefined)[]): string {
  return createHash("sha256").update(parts.filter(Boolean).join("|")).digest("hex").slice(0, 16);
}

export function formatDate(d: string | null | undefined): string | null {
  if (!d) return null;
  // Try to parse and normalize to YYYY-MM-DD
  const parsed = new Date(d);
  if (isNaN(parsed.getTime())) return d;
  return parsed.toISOString().split("T")[0];
}

const FETCH_TIMEOUT_MS = 30_000;

export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3): Promise<Response> {
  const SCRAPER_KEY = process.env.SCRAPER_API_KEY;
  // Route through ScraperAPI when key is set - bypasses government site IP blocks on Railway
  const fetchUrl = SCRAPER_KEY
    ? `https://api.scraperapi.com?api_key=${SCRAPER_KEY}&url=${encodeURIComponent(url)}&render=false`
    : url;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.9",
    ...options.headers,
  };
  for (let i = 0; i < retries; i++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, { ...options, headers, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.ok || res.status === 404) return res;
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 2000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1500 * (i + 1)));
    }
  }
  throw new Error(`Failed after ${retries} retries: ${url}`);
}

// ─── ScraperAPI proxy helper ─────────────────────────────────────────────────
// Routes requests through ScraperAPI residential proxy to bypass IP blocks.
// Falls back to direct fetch if SCRAPER_API_KEY is not set.
export async function proxiedFetch(
  url: string,
  options: { render?: boolean; method?: string; body?: string; contentType?: string; retries?: number } = {}
): Promise<Response> {
  const key = process.env.SCRAPER_API_KEY;
  const { render = false, method = "GET", body, contentType, retries = 3 } = options;

  if (!key) {
    // No key — fall back to direct fetch
    return fetchWithRetry(url, { method, body, headers: contentType ? { "Content-Type": contentType } : {} });
  }

  const params = new URLSearchParams({
    api_key: key,
    url,
    country_code: "us",
    ...(render ? { render: "true" } : {}),
  });
  const proxyUrl = `https://api.scraperapi.com?${params}`;

  for (let i = 0; i < retries; i++) {
    try {
      const fetchOpts: RequestInit = {
        method,
        headers: {
          "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
          ...(contentType ? { "Content-Type": contentType } : {}),
        },
        ...(body ? { body } : {}),
      };
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS * 2); // proxy gets 60s
      let res: Response;
      try {
        res = await fetch(proxyUrl, { ...fetchOpts, signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (res.ok) return res;
      if (res.status === 429 || res.status >= 500) {
        await new Promise(r => setTimeout(r, 3000 * (i + 1)));
        continue;
      }
      return res;
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 2000 * (i + 1)));
    }
  }
  throw new Error(`proxiedFetch failed after ${retries} retries: ${url}`);
}

export interface CountyConfig {
  name: string;
  state: string;
  leadTypes: string[];
}
