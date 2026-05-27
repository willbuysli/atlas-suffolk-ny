import { Lead, CountyConfig } from "./base.js";
import * as suffolkNY from "./suffolk_ny.js";
import * as missouri from "./missouri.js";
import * as wisconsin from "./wisconsin.js";
import { scrapeAlabama } from "./alabama.js";
import { scrapeOhio } from "./ohio.js";
import { scrapeSC } from "./south_carolina.js";
import { scrapeTX } from "./texas.js";
import { scrapeExtendedLeadTypes } from "./lead_types_extended.js";

// ─── EXTENDED LEAD TYPES ──────────────────────────────────────────────────────
// Controlled per-client via CLIENT_LEAD_TYPES env var (comma-separated list or "all")
// Example: CLIENT_LEAD_TYPES=Fire Damaged,Code Violation,Eviction,Divorce,Bankruptcy
// Leave unset or set to "" to run only the core scrapers (pre-foreclosure, tax delinquent, probate, sheriff sale)
// Set to "all" to enable every lead type

const EXTENDED_LEAD_TYPES: string[] = (() => {
  const raw = process.env.CLIENT_LEAD_TYPES || "";
  if (!raw.trim()) return [];
  if (raw.trim().toLowerCase() === "all") return ["all"];
  return raw.split(",").map(s => s.trim()).filter(Boolean);
})();

const EXTENDED_ENABLED = EXTENDED_LEAD_TYPES.length > 0;

// ─── CORE SCRAPERS ────────────────────────────────────────────────────────────

// Run all scrapers for the configured counties
export async function runAllScrapers(
  counties: CountyConfig[],
  fromDate: string,
  toDate: string,
  onProgress?: (msg: string) => void
): Promise<{ leads: Lead[]; errors: string[] }> {
  const allLeads: Lead[] = [];
  const errors: string[] = [];

  // Group counties by state
  const stateGroups = new Map<string, CountyConfig[]>();
  for (const county of counties) {
    const key = county.state;
    if (!stateGroups.has(key)) stateGroups.set(key, []);
    stateGroups.get(key)!.push(county);
  }

  for (const [state, stateCounties] of Array.from(stateGroups.entries())) {
    // ── Core scrapers (always run) ──────────────────────────────────────────

    if (state === "MO") {
      try {
        onProgress?.(`[Core] Scraping MO counties: ${stateCounties.map(c => c.name).join(", ")}...`);
        const leads = await missouri.scrapeAll(fromDate, toDate);
        const configuredNames = new Set(stateCounties.map((c: CountyConfig) => c.name));
        const filtered = leads.filter((l: Lead) => configuredNames.has(l.county));
        allLeads.push(...filtered);
        onProgress?.(`✓ MO core: ${filtered.length} leads found`);
      } catch (e) {
        const msg = `Error scraping MO: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
    } else if (state === "WI") {
      try {
        onProgress?.(`[Core] Scraping WI counties: ${stateCounties.map((c: CountyConfig) => c.name).join(", ")}...`);
        const leads = await wisconsin.scrapeAll(fromDate, toDate);
        const configuredNames = new Set(stateCounties.map((c: CountyConfig) => c.name));
        const filtered = leads.filter((l: Lead) => configuredNames.has(l.county));
        allLeads.push(...filtered);
        onProgress?.(`✓ WI core: ${filtered.length} leads found`);
      } catch (e) {
        const msg = `Error scraping WI: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
    } else if (state === "NY") {
      try {
        onProgress?.(`[Core] Scraping NY counties: ${stateCounties.map((c: CountyConfig) => c.name).join(", ")}...`);
        const leads = await suffolkNY.scrapeAll(fromDate, toDate);
        allLeads.push(...leads);
        onProgress?.(`✓ NY core: ${leads.length} leads found`);
      } catch (e) {
        const msg = `Error scraping NY: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
    } else {
      // County-by-county core scrapers
      for (const county of stateCounties) {
        try {
          onProgress?.(`[Core] Scraping ${county.name}, ${county.state}...`);
          let leads: Lead[] = [];

          if (state === "AL") {
            leads = await scrapeAlabama(county.name, fromDate, toDate);
          } else if (state === "OH") {
            leads = await scrapeOhio(county.name, fromDate, toDate);
          } else if (state === "SC") {
            leads = await scrapeSC(county.name, fromDate, toDate);
          } else if (state === "TX") {
            leads = await scrapeTX(county.name, fromDate, toDate);
          } else {
            const msg = `No scraper registered for ${county.name}, ${county.state}`;
            errors.push(msg);
            onProgress?.(`✗ ${msg}`);
            continue;
          }

          allLeads.push(...leads);
          onProgress?.(`✓ ${county.name} ${county.state} core: ${leads.length} leads`);
        } catch (e) {
          const msg = `Error scraping ${county.name} ${county.state}: ${(e as Error).message}`;
          errors.push(msg);
          onProgress?.(`✗ ${msg}`);
        }
      }
    }

    // ── Extended lead types (run if CLIENT_LEAD_TYPES is set) ───────────────
    if (EXTENDED_ENABLED) {
      for (const county of stateCounties) {
        try {
          onProgress?.(`[Extended] Scraping ${county.name}, ${county.state} for: ${EXTENDED_LEAD_TYPES.join(", ")}...`);
          const { leads: extLeads, errors: extErrors } = await scrapeExtendedLeadTypes(
            county.name,
            county.state,
            fromDate,
            toDate,
            EXTENDED_LEAD_TYPES,
            onProgress
          );
          allLeads.push(...extLeads);
          errors.push(...extErrors);
          onProgress?.(`✓ ${county.name} ${county.state} extended: ${extLeads.length} leads`);
        } catch (e) {
          const msg = `Error in extended scrape for ${county.name} ${county.state}: ${(e as Error).message}`;
          errors.push(msg);
          onProgress?.(`✗ ${msg}`);
        }
      }
    }
  }

  return { leads: allLeads, errors };
}

// ─── DATE HELPERS ─────────────────────────────────────────────────────────────

export function getDefaultDateRange(): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().split("T")[0];
  const fromDate = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { fromDate, toDate };
}

export function getDateRange(daysBack: number): { fromDate: string; toDate: string } {
  const toDate = new Date().toISOString().split("T")[0];
  const fromDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
  return { fromDate, toDate };
}

// ─── AVAILABLE LEAD TYPES (for UI display) ────────────────────────────────────

export const CORE_LEAD_TYPES = [
  "Pre-Foreclosure",
  "Tax Delinquent",
  "Probate",
  "Sheriff Sale",
];

export const EXTENDED_LEAD_TYPE_LIST = [
  "Fire Damaged",
  "Code Violation",
  "Vacant/Abandoned",
  "Vacant/Abandoned",
  "Eviction",
  "IRS Tax Lien",
  "HOA Lien",
  "Divorce",
  "High Equity",
  "Estate/Inherited",
  "Bankruptcy",
];

export const ALL_LEAD_TYPES = [...CORE_LEAD_TYPES, ...EXTENDED_LEAD_TYPE_LIST];
