import { Lead, CountyConfig } from "./base.js";
import * as suffolkNY from "./suffolk_ny.js";

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

  for (const [state, stateCounties] of Array.from(stateGroups)) {
    // Suffolk County, NY — all 12 lead types
    if (state === "NY") {
      try {
        onProgress?.(`Scraping Suffolk County, NY (12 lead types)...`);
        const leads = await suffolkNY.scrapeAll(fromDate, toDate, onProgress);
        allLeads.push(...leads);
        onProgress?.(`✓ NY: ${leads.length} leads found`);
      } catch (e) {
        const msg = `Error scraping NY: ${(e as Error).message}`;
        errors.push(msg);
        onProgress?.(`✗ ${msg}`);
      }
      continue;
    }

    // No scraper registered for this state
    const msg = `No scraper registered for state: ${state}`;
    errors.push(msg);
    onProgress?.(`✗ ${msg}`);
    void stateCounties; // suppress unused variable warning
  }

  return { leads: allLeads, errors };
}

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
