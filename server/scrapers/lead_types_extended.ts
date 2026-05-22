/**
 * Extended Lead Type Scrapers
 * New lead types: Fire Damaged, Code Violations, Vacant/Abandoned, Out-of-State Owners,
 * Evictions, IRS/HOA Liens, Divorce Filings, High Equity, Estate/Inherited, Bankruptcy
 *
 * Sources by state:
 * - NY (Suffolk): Suffolk County Open Data, NYSCEF, Suffolk RPTS
 * - WI (Dane/Rock/Door): WCCA (wicourts.gov), county assessor portals
 * - MO (Jackson/Clay/Platte/Cass): Case.net, county recorder/assessor portals
 * - AL (Madison/etc): ALACOURT, county assessor portals
 * - OH (Hamilton): Hamilton County Clerk, county assessor
 * - SC (Horry/Georgetown/Marion): SC Judicial, county assessor/GIS
 * - TX (Nueces/Kleberg/Jim Wells/San Patricio/Bexar): re:SearchTX, CAD portals
 *
 * STATUS: Ready to deploy — not yet pushed to client repos
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry } from "./base.js";

// ─── HELPERS ──────────────────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── FIRE DAMAGED ─────────────────────────────────────────────────────────────
// Sources: County permit records (fire repair permits), assessor damage flags,
// local fire marshal incident reports where public

export async function scrapeFireDamaged(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "TX") {
      // Texas: County appraisal district property search — filter for "fire" in improvement description
      // Nueces CAD has a public search API
      if (county === "Nueces") {
        const url = `https://esearch.nuecescad.net/Property/SearchResults?searchValue=fire&searchType=owner`;
        const res = await fetchWithRetry(url);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table tbody tr, .property-row").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 3) return;
            const propId = $(cells[0]).text().trim();
            const owner = $(cells[1]).text().trim();
            const address = $(cells[2]).text().trim();
            if (!propId) return;
            leads.push({
              id: makeId(county, state, "Fire Damaged", propId),
              county, state,
              lead_type: "Fire Damaged",
              owner_name: owner || null,
              address: address || null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: propId,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Fire Damaged Property — ${county} County TX`,
              source_url: url,
              raw_data: JSON.stringify({ propId, owner, address }),
            });
          });
        }
      }

      // Bexar County: Use Bexar CAD
      if (county === "Bexar") {
        const url = `https://www.bcad.org/clientdb/Property/SearchResults?searchValue=fire+damage&searchType=legal`;
        const res = await fetchWithRetry(url);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table tbody tr").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 3) return;
            const propId = $(cells[0]).text().trim();
            const owner = $(cells[1]).text().trim();
            const address = $(cells[2]).text().trim();
            if (!propId) return;
            leads.push({
              id: makeId(county, state, "Fire Damaged", propId),
              county, state,
              lead_type: "Fire Damaged",
              owner_name: owner || null,
              address: address || null,
              city: "San Antonio", zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: propId,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Fire Damaged Property — Bexar County TX`,
              source_url: url,
              raw_data: JSON.stringify({ propId, owner, address }),
            });
          });
        }
      }
    }

    if (state === "SC") {
      // SC county permit portals for fire repair
      const scPermitUrls: Record<string, string> = {
        "Horry": "https://www.horrycountysc.gov/departments/building-services/permit-search/",
        "Georgetown": "https://www.georgetowncountysc.org/departments/building-inspection/permit-search",
        "Marion": "https://www.marionsc.org/departments/building-permits",
      };
      const url = scPermitUrls[county] || `https://publicindex.sccourts.org/${county}/PublicIndex/PISearch.aspx`;
      const res = await fetchWithRetry(url);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        // Look for fire-related permits
        $("table tr, .permit-row").each((_, row) => {
          const text = $(row).text().toLowerCase();
          if (!text.includes("fire") && !text.includes("damage")) return;
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const permitNum = $(cells[0]).text().trim();
          const address = $(cells[1]).text().trim();
          const desc = $(cells[2])?.text().trim();
          if (!permitNum) return;
          leads.push({
            id: makeId(county, state, "Fire Damaged", permitNum),
            county, state,
            lead_type: "Fire Damaged",
            owner_name: null,
            address: address || null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: permitNum,
            filing_date: formatDate(fromDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: desc || `Fire Damage Permit — ${county} County SC`,
            source_url: url,
            raw_data: JSON.stringify({ permitNum, address, desc }),
          });
        });
      }
    }

    if (state === "WI") {
      // Wisconsin: WCCA fire-related court cases (insurance disputes, condemnation)
      // Also check county building permit portals
      const permitUrls: Record<string, string> = {
        "Dane": "https://accessdane.countyofdane.com/Permits",
        "Rock": "https://www.co.rock.wi.us/departments/planning-development/building-inspection",
        "Door": "https://www.co.door.wi.gov/departments/planning-and-zoning",
      };
      const permitUrl = permitUrls[county];
      if (permitUrl) {
        const res = await fetchWithRetry(permitUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table tr, .permit-row").each((_, row) => {
            const text = $(row).text().toLowerCase();
            if (!text.includes("fire") && !text.includes("damage") && !text.includes("demolish")) return;
            const cells = $(row).find("td");
            if (cells.length < 2) return;
            const permitNum = $(cells[0]).text().trim();
            const address = $(cells[1]).text().trim();
            if (!permitNum) return;
            leads.push({
              id: makeId(county, state, "Fire Damaged", permitNum),
              county, state,
              lead_type: "Fire Damaged",
              owner_name: null,
              address: address || null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: permitNum,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Fire/Damage Permit — ${county} County WI`,
              source_url: permitUrl,
              raw_data: JSON.stringify({ permitNum, address }),
            });
          });
        }
      }
    }

    if (state === "NY" && county === "Suffolk") {
      // Suffolk County: Building permit search for fire repair
      const url = `https://www.suffolkcountyny.gov/Departments/Public-Works/Building-Division`;
      const res = await fetchWithRetry(url);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("a[href*='permit'], a[href*='fire']").each((_, el) => {
          const href = $(el).attr("href");
          const text = $(el).text().trim().toLowerCase();
          if (!href || (!text.includes("fire") && !text.includes("damage"))) return;
          leads.push({
            id: makeId(county, state, "Fire Damaged", href),
            county, state,
            lead_type: "Fire Damaged",
            owner_name: null, address: null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: null,
            filing_date: formatDate(fromDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Fire Damage Record — Suffolk County NY`,
            source_url: href.startsWith("http") ? href : `https://www.suffolkcountyny.gov${href}`,
            raw_data: JSON.stringify({ href, text }),
          });
        });
      }
    }

    if (state === "MO") {
      // Missouri: KC Fire Department incident reports + Jackson County permit search
      const url = `https://data.kcmo.org/resource/4ys2-ixft.json?$where=incident_type_description like '%25FIRE%25'&$limit=100&$order=alarm_date DESC`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data.slice(0, 50)) {
          const address = `${item.address || ""} ${item.city || "Kansas City"}, MO`.trim();
          const date = item.alarm_date?.split("T")[0] || fromDate;
          if (date < fromDate || date > toDate) continue;
          leads.push({
            id: makeId(county, state, "Fire Damaged", item.incident_number || address),
            county, state,
            lead_type: "Fire Damaged",
            owner_name: null,
            address: item.address || null,
            city: item.city || "Kansas City", zip: item.zip_code || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: item.incident_number || null,
            filing_date: formatDate(date),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Fire Incident — ${item.incident_type_description || "Fire"}`,
            source_url: "https://data.kcmo.org/Fire/Fire-Incidents/4ys2-ixft",
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

    if (state === "AL") {
      // Alabama: County building department permit search — all 8 counties
      const alUrls: Record<string, string> = {
        "Madison": "https://www.madisoncountyal.gov/departments/building-inspection",
        "Limestone": "https://www.limestonecountyal.com/departments/building-inspection",
        "Morgan": "https://www.morgancountyal.gov/departments/building-inspection",
        "Montgomery": "https://www.montgomeryal.gov/city-government/departments/building-inspections",
        "Autauga": "https://www.autaugaco.org/departments/building-inspection",
        "Elmore": "https://www.elmoreco.com/departments/building-inspection",
        "Jefferson": "https://www.jccal.org/Default.asp?ID=1044&pg=Building+Inspection",
        "Shelby": "https://www.shelbycountyalabama.com/departments/engineering-and-planning/building-inspections",
      };
      const alUrl = alUrls[county];
      if (alUrl) {
        const res = await fetchWithRetry(alUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("a[href*='fire'], a[href*='damage']").each((_, el) => {
            const href = $(el).attr("href");
            const text = $(el).text().trim();
            if (!href) return;
            leads.push({
              id: makeId(county, state, "Fire Damaged", href),
              county, state,
              lead_type: "Fire Damaged",
              owner_name: null, address: null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: null,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Fire Damage Record — ${county} County AL`,
              source_url: href.startsWith("http") ? href : alUrl,
              raw_data: JSON.stringify({ href, text }),
            });
          });
        }
      }
    }

    if (state === "OH" && county === "Hamilton") {
      // Hamilton County OH: Cincinnati Fire Department open data
      const url = `https://data.cincinnati-oh.gov/resource/vnsz-a3wp.json?$where=incident_type_description like '%25FIRE%25'&$limit=100&$order=incident_date DESC`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data.slice(0, 50)) {
          const date = item.incident_date?.split("T")[0] || fromDate;
          if (date < fromDate || date > toDate) continue;
          leads.push({
            id: makeId(county, state, "Fire Damaged", item.incident_number || item.address),
            county, state,
            lead_type: "Fire Damaged",
            owner_name: null,
            address: item.address || null,
            city: "Cincinnati", zip: item.zip_code || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: item.incident_number || null,
            filing_date: formatDate(date),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Fire Incident — ${item.incident_type_description || "Fire"}`,
            source_url: "https://data.cincinnati-oh.gov/Safety/Fire-Incidents/vnsz-a3wp",
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

  } catch (e) {
    console.error(`[Fire Damaged] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── CODE VIOLATIONS / CONDEMNED ──────────────────────────────────────────────

export async function scrapeCodeViolations(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "MO" && county === "Jackson") {
      // Kansas City Code Enforcement (covers most of Jackson County)
      const url = `https://data.kcmo.org/resource/nhtf-e75a.json?$where=open_date >= '${fromDate}' AND open_date <= '${toDate}'&$limit=200&$order=open_date DESC`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data) {
          leads.push({
            id: makeId(county, state, "Code Violation", item.case_id || item.address),
            county, state,
            lead_type: "Code Violation",
            owner_name: null,
            address: item.address || null,
            city: "Kansas City", zip: item.zip_code || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: item.case_id || null,
            filing_date: formatDate(item.open_date),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: item.violation_description || item.case_type || "Code Violation",
            source_url: "https://data.kcmo.org/Housing/Code-Enforcement-Cases/nhtf-e75a",
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

    if (state === "OH" && county === "Hamilton") {
      // Cincinnati Code Enforcement open data
      const url = `https://data.cincinnati-oh.gov/resource/dvfm-jctg.json?$where=date_opened >= '${fromDate}' AND date_opened <= '${toDate}'&$limit=200&$order=date_opened DESC`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data) {
          leads.push({
            id: makeId(county, state, "Code Violation", item.case_number || item.address),
            county, state,
            lead_type: "Code Violation",
            owner_name: null,
            address: item.address || null,
            city: "Cincinnati", zip: item.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: item.case_number || null,
            filing_date: formatDate(item.date_opened),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: item.violation_type || item.description || "Code Violation",
            source_url: "https://data.cincinnati-oh.gov/Neighborhoods/Code-Enforcement/dvfm-jctg",
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

    if (state === "AL") {
      // Alabama: County code enforcement portals — all 8 counties
      const alCodeUrls: Record<string, string> = {
        "Madison": "https://www.madisoncountyal.gov/departments/code-enforcement",
        "Limestone": "https://www.limestonecountyal.com/departments/code-enforcement",
        "Morgan": "https://www.morgancountyal.gov/departments/code-enforcement",
        "Montgomery": "https://www.montgomeryal.gov/city-government/departments/code-enforcement",
        "Autauga": "https://www.autaugaco.org/departments/code-enforcement",
        "Elmore": "https://www.elmoreco.com/departments/code-enforcement",
        "Jefferson": "https://www.jccal.org/Default.asp?ID=1044&pg=Code+Enforcement",
        "Shelby": "https://www.shelbycountyalabama.com/departments/community-development/code-enforcement",
      };
      const alCodeUrl = alCodeUrls[county];
      if (alCodeUrl) {
        const res = await fetchWithRetry(alCodeUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table tr").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 2) return;
            const caseNum = $(cells[0]).text().trim();
            const address = $(cells[1]).text().trim();
            const desc = $(cells[2])?.text().trim();
            if (!caseNum || caseNum === "Case #") return;
            leads.push({
              id: makeId(county, state, "Code Violation", caseNum),
              county, state,
              lead_type: "Code Violation",
              owner_name: null,
              address: address || null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: desc || `Code Violation — ${county} County AL`,
              source_url: alCodeUrl,
              raw_data: JSON.stringify({ caseNum, address, desc }),
            });
          });
        }
      }
    }

    if (state === "SC") {
      // SC county code enforcement portals
      const scCodeUrls: Record<string, string> = {
        "Horry": "https://www.horrycountysc.gov/departments/code-enforcement/",
        "Georgetown": "https://www.georgetowncountysc.org/departments/code-enforcement",
        "Marion": "https://www.marionsc.org/departments/code-enforcement",
      };
      const url = scCodeUrls[county] || `https://publicindex.sccourts.org/${county}/PublicIndex/PISearch.aspx`;
      const res = await fetchWithRetry(url);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const caseNum = $(cells[0]).text().trim();
          const address = $(cells[1]).text().trim();
          const desc = $(cells[2])?.text().trim();
          const date = $(cells[3])?.text().trim();
          if (!caseNum || caseNum === "Case #") return;
          leads.push({
            id: makeId(county, state, "Code Violation", caseNum),
            county, state,
            lead_type: "Code Violation",
            owner_name: null,
            address: address || null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum,
            filing_date: formatDate(date || fromDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: desc || "Code Violation",
            source_url: url,
            raw_data: JSON.stringify({ caseNum, address, desc }),
          });
        });
      }
    }

    if (state === "TX") {
      // Texas cities: Use open data portals where available
      const txCodeUrls: Record<string, string> = {
        "Nueces": "https://data.corpus-christi.gov/resource/code-violations.json",
        "Bexar": "https://data.sanantonio.gov/resource/code-cases.json",
      };
      const codeUrl = txCodeUrls[county];
      if (codeUrl) {
        const url = `${codeUrl}?$where=open_date >= '${fromDate}'&$limit=200&$order=open_date DESC`;
        const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
        if (res.ok) {
          const data = await res.json() as any[];
          for (const item of data) {
            leads.push({
              id: makeId(county, state, "Code Violation", item.case_id || item.case_number || item.address),
              county, state,
              lead_type: "Code Violation",
              owner_name: null,
              address: item.address || item.street_address || null,
              city: county === "Nueces" ? "Corpus Christi" : "San Antonio", zip: item.zip || null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: item.case_id || item.case_number || null,
              filing_date: formatDate(item.open_date || item.date_opened),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: item.violation_type || item.description || "Code Violation",
              source_url: codeUrl,
              raw_data: JSON.stringify(item),
            });
          }
        }
      }
    }

    if (state === "NY" && county === "Suffolk") {
      // Suffolk County: Use NY state open data for code violations
      const url = `https://data.ny.gov/resource/code-violations.json?county=Suffolk&$where=date_filed >= '${fromDate}'&$limit=200`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data) {
          leads.push({
            id: makeId(county, state, "Code Violation", item.case_number || item.address),
            county, state,
            lead_type: "Code Violation",
            owner_name: item.owner_name || null,
            address: item.address || null,
            city: item.city || null, zip: item.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: item.case_number || null,
            filing_date: formatDate(item.date_filed),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: item.violation_type || "Code Violation",
            source_url: url,
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

  } catch (e) {
    console.error(`[Code Violations] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── VACANT / ABANDONED ───────────────────────────────────────────────────────

export async function scrapeVacantAbandoned(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "MO" && county === "Jackson") {
      // KC Vacant/Abandoned Building Registry
      const url = `https://data.kcmo.org/resource/vacant-buildings.json?$limit=200&$order=registration_date DESC`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data) {
          leads.push({
            id: makeId(county, state, "Vacant/Abandoned", item.property_id || item.address),
            county, state,
            lead_type: "Vacant/Abandoned",
            owner_name: item.owner_name || null,
            address: item.address || null,
            city: "Kansas City", zip: item.zip_code || null,
            mailing_address: item.mailing_address || null,
            mailing_city: item.mailing_city || null,
            mailing_state: item.mailing_state || null,
            mailing_zip: item.mailing_zip || null,
            case_number: item.property_id || null,
            filing_date: formatDate(item.registration_date),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Vacant/Abandoned Building — ${item.building_type || "Residential"}`,
            source_url: "https://data.kcmo.org/Housing/Vacant-and-Abandoned-Buildings/7at3-sxhp",
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

    if (state === "OH" && county === "Hamilton") {
      // Cincinnati Vacant Properties
      const url = `https://data.cincinnati-oh.gov/resource/vacant-properties.json?$limit=200`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data) {
          leads.push({
            id: makeId(county, state, "Vacant/Abandoned", item.parcel_id || item.address),
            county, state,
            lead_type: "Vacant/Abandoned",
            owner_name: item.owner_name || null,
            address: item.address || null,
            city: "Cincinnati", zip: item.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: item.parcel_id || null,
            filing_date: formatDate(fromDate),
            assessed_value: item.assessed_value || null,
            tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Vacant Property — Hamilton County OH`,
            source_url: "https://data.cincinnati-oh.gov/Neighborhoods/Vacant-Properties/",
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

    if (state === "TX") {
      // Texas: Cross-reference CAD records for properties with no homestead exemption + long-term no sale
      const cadUrls: Record<string, string> = {
        "Nueces": "https://esearch.nuecescad.net/Property/SearchResults",
        "Bexar": "https://www.bcad.org/clientdb/Property/SearchResults",
        "San Patricio": "https://www.sanpatcad.org/",
        "Jim Wells": "https://www.jimwellscad.com/",
        "Kleberg": "https://www.klebergcad.org/",
      };
      const cadUrl = cadUrls[county];
      if (cadUrl) {
        // Search for properties with "vacant" or "unimproved" in description
        const searchUrl = `${cadUrl}?searchValue=vacant&searchType=legal`;
        const res = await fetchWithRetry(searchUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table tbody tr").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 3) return;
            const propId = $(cells[0]).text().trim();
            const owner = $(cells[1]).text().trim();
            const address = $(cells[2]).text().trim();
            if (!propId) return;
            leads.push({
              id: makeId(county, state, "Vacant/Abandoned", propId),
              county, state,
              lead_type: "Vacant/Abandoned",
              owner_name: owner || null,
              address: address || null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: propId,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Vacant Property — ${county} County TX`,
              source_url: searchUrl,
              raw_data: JSON.stringify({ propId, owner, address }),
            });
          });
        }
      }
    }

    if (state === "AL") {
      // Alabama: County assessor portals for vacant/abandoned properties — all 8 counties
      const alAssessorUrls: Record<string, string> = {
        "Madison": "https://www.madisoncountyal.gov/departments/revenue/property-search",
        "Limestone": "https://www.limestonecountyal.com/departments/revenue/property-search",
        "Morgan": "https://www.morgancountyal.gov/departments/revenue/property-search",
        "Montgomery": "https://www.montgomeryal.gov/city-government/departments/revenue/property-search",
        "Autauga": "https://www.autaugaco.org/departments/revenue",
        "Elmore": "https://www.elmoreco.com/departments/revenue",
        "Jefferson": "https://www.jccal.org/Default.asp?ID=1044&pg=Property+Tax",
        "Shelby": "https://www.shelbycountyalabama.com/departments/revenue/property-search",
      };
      const alAssessorUrl = alAssessorUrls[county];
      if (alAssessorUrl) {
        const searchUrl = `${alAssessorUrl}?status=vacant`;
        const res = await fetchWithRetry(searchUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table tbody tr").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 2) return;
            const parcelId = $(cells[0]).text().trim();
            const owner = $(cells[1]).text().trim();
            const address = $(cells[2])?.text().trim();
            if (!parcelId) return;
            leads.push({
              id: makeId(county, state, "Vacant/Abandoned", parcelId),
              county, state,
              lead_type: "Vacant/Abandoned",
              owner_name: owner || null,
              address: address || null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: parcelId,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Vacant Property — ${county} County AL`,
              source_url: alAssessorUrl,
              raw_data: JSON.stringify({ parcelId, owner, address }),
            });
          });
        }
      }
    }

    if (state === "SC") {
      // SC county GIS portals for vacant properties
      const scVacantUrls: Record<string, string> = {
        "Horry": `https://gis.horrycountysc.gov/arcgis/rest/services/Property/MapServer/0/query?where=LAND_USE_CODE='V'&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAILING_ADDRESS,MAILING_CITY,MAILING_STATE,MAILING_ZIP&f=json&resultRecordCount=200`,
        "Georgetown": `https://gis.georgetowncountysc.org/arcgis/rest/services/Property/MapServer/0/query?where=LAND_USE_CODE='V'&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAILING_ADDRESS,MAILING_CITY,MAILING_STATE,MAILING_ZIP&f=json&resultRecordCount=200`,
        "Marion": `https://gis.marionsc.org/arcgis/rest/services/Property/MapServer/0/query?where=LAND_USE_CODE='V'&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAILING_ADDRESS,MAILING_CITY,MAILING_STATE,MAILING_ZIP&f=json&resultRecordCount=200`,
      };
      const url = scVacantUrls[county] || scVacantUrls["Horry"];
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any;
        const features = data.features || [];
        for (const feat of features) {
          const attr = feat.attributes || {};
          leads.push({
            id: makeId(county, state, "Vacant/Abandoned", attr.PARCEL_ID || attr.SITUS_ADDRESS),
            county, state,
            lead_type: "Vacant/Abandoned",
            owner_name: attr.OWNER_NAME || null,
            address: attr.SITUS_ADDRESS || null,
            city: null, zip: null,
            mailing_address: attr.MAILING_ADDRESS || null,
            mailing_city: attr.MAILING_CITY || null,
            mailing_state: attr.MAILING_STATE || null,
            mailing_zip: attr.MAILING_ZIP || null,
            case_number: attr.PARCEL_ID || null,
            filing_date: formatDate(fromDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Vacant Land/Property — Horry County SC`,
            source_url: url,
            raw_data: JSON.stringify(attr),
          });
        }
      }
    }

    if (state === "NY" && county === "Suffolk") {
      // Suffolk County Open Data — vacant properties
      const url = `https://opendata.suffolkcountyny.gov/resource/vacant-properties.json?$limit=200`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data) {
          leads.push({
            id: makeId(county, state, "Vacant/Abandoned", item.parcel_id || item.address),
            county, state,
            lead_type: "Vacant/Abandoned",
            owner_name: item.owner_name || null,
            address: item.address || null,
            city: item.city || null, zip: item.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: item.parcel_id || null,
            filing_date: formatDate(fromDate),
            assessed_value: item.assessed_value || null,
            tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Vacant Property — Suffolk County NY`,
            source_url: url,
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

  } catch (e) {
    console.error(`[Vacant/Abandoned] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── OUT-OF-STATE OWNERS ──────────────────────────────────────────────────────
// Pull from county assessor/CAD — where mailing state != property state

export async function scrapeOutOfStateOwners(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "TX") {
      // Texas CAD portals — search for properties where mailing state != TX
      const cadApis: Record<string, string> = {
        "Nueces": "https://esearch.nuecescad.net/Property/SearchResults?searchValue=&searchType=owner&mailingState=NY",
        "Bexar": "https://www.bcad.org/clientdb/Property/SearchResults?searchValue=&searchType=owner",
      };
      // For Nueces: use the public ESRI GIS endpoint
      if (county === "Nueces") {
        const url = `https://gis.nuecescad.net/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'TX' AND MAIL_STATE IS NOT NULL AND MAIL_STATE<>''&outFields=OWNER_NAME,SITUS_ADDR,ACCT_NUM,MAIL_ADDR,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`;
        const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
        if (res.ok) {
          const data = await res.json() as any;
          const features = data.features || [];
          for (const feat of features) {
            const attr = feat.attributes || {};
            leads.push({
              id: makeId(county, state, "Out-of-State Owner", attr.ACCT_NUM || attr.SITUS_ADDR),
              county, state,
              lead_type: "Out-of-State Owner",
              owner_name: attr.OWNER_NAME || null,
              address: attr.SITUS_ADDR || null,
              city: "Corpus Christi", zip: null,
              mailing_address: attr.MAIL_ADDR || null,
              mailing_city: attr.MAIL_CITY || null,
              mailing_state: attr.MAIL_STATE || null,
              mailing_zip: attr.MAIL_ZIP || null,
              case_number: attr.ACCT_NUM || null,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Out-of-State Owner — mailing: ${attr.MAIL_CITY}, ${attr.MAIL_STATE}`,
              source_url: url,
              raw_data: JSON.stringify(attr),
            });
          }
        }
      }

      if (county === "Bexar") {
        const url = `https://gis.bcad.org/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'TX' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PROP_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`;
        const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
        if (res.ok) {
          const data = await res.json() as any;
          const features = data.features || [];
          for (const feat of features) {
            const attr = feat.attributes || {};
            leads.push({
              id: makeId(county, state, "Out-of-State Owner", attr.PROP_ID || attr.SITUS_ADDRESS),
              county, state,
              lead_type: "Out-of-State Owner",
              owner_name: attr.OWNER_NAME || null,
              address: attr.SITUS_ADDRESS || null,
              city: "San Antonio", zip: null,
              mailing_address: attr.MAIL_ADDRESS || null,
              mailing_city: attr.MAIL_CITY || null,
              mailing_state: attr.MAIL_STATE || null,
              mailing_zip: attr.MAIL_ZIP || null,
              case_number: attr.PROP_ID || null,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Out-of-State Owner — mailing: ${attr.MAIL_CITY}, ${attr.MAIL_STATE}`,
              source_url: url,
              raw_data: JSON.stringify(attr),
            });
          }
        }
      }
    }

    if (state === "AL") {
      // Alabama: County assessor GIS portals — mailing state != AL (out-of-state owners)
      const alGisUrls: Record<string, string> = {
        "Madison": `https://gis.madisoncountyal.gov/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Limestone": `https://gis.limestonecountyal.com/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Morgan": `https://gis.morgancountyal.gov/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Montgomery": `https://gis.montgomeryal.gov/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Jefferson": `https://gis.jccal.org/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Shelby": `https://gis.shelbycountyalabama.com/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Autauga": `https://gis.autaugaco.org/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Elmore": `https://gis.elmoreco.com/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'AL' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
      };
      const alGisUrl = alGisUrls[county];
      if (alGisUrl) {
        const res = await fetchWithRetry(alGisUrl, { headers: { "Accept": "application/json" } });
        if (res.ok) {
          const data = await res.json() as any;
          const features = data.features || [];
          for (const feat of features) {
            const attr = feat.attributes || {};
            leads.push({
              id: makeId(county, state, "Out-of-State Owner", attr.PARCEL_ID || attr.SITUS_ADDRESS),
              county, state,
              lead_type: "Out-of-State Owner",
              owner_name: attr.OWNER_NAME || null,
              address: attr.SITUS_ADDRESS || null,
              city: null, zip: null,
              mailing_address: attr.MAIL_ADDRESS || null,
              mailing_city: attr.MAIL_CITY || null,
              mailing_state: attr.MAIL_STATE || null,
              mailing_zip: attr.MAIL_ZIP || null,
              case_number: attr.PARCEL_ID || null,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Out-of-State Owner — mailing: ${attr.MAIL_CITY}, ${attr.MAIL_STATE}`,
              source_url: alGisUrl,
              raw_data: JSON.stringify(attr),
            });
          }
        }
      }
    }

    if (state === "SC") {
      // SC county GIS portals — mailing state != SC (out-of-state owners)
      const scOosUrls: Record<string, string> = {
        "Horry": `https://gis.horrycountysc.gov/arcgis/rest/services/Property/MapServer/0/query?where=MAILING_STATE<>'SC' AND MAILING_STATE IS NOT NULL AND MAILING_STATE<>''&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAILING_ADDRESS,MAILING_CITY,MAILING_STATE,MAILING_ZIP&f=json&resultRecordCount=200`,
        "Georgetown": `https://gis.georgetowncountysc.org/arcgis/rest/services/Property/MapServer/0/query?where=MAILING_STATE<>'SC' AND MAILING_STATE IS NOT NULL AND MAILING_STATE<>''&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAILING_ADDRESS,MAILING_CITY,MAILING_STATE,MAILING_ZIP&f=json&resultRecordCount=200`,
        "Marion": `https://gis.marionsc.org/arcgis/rest/services/Property/MapServer/0/query?where=MAILING_STATE<>'SC' AND MAILING_STATE IS NOT NULL AND MAILING_STATE<>''&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAILING_ADDRESS,MAILING_CITY,MAILING_STATE,MAILING_ZIP&f=json&resultRecordCount=200`,
      };
      const url = scOosUrls[county] || scOosUrls["Horry"];
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any;
        const features = data.features || [];
        for (const feat of features) {
          const attr = feat.attributes || {};
          leads.push({
            id: makeId(county, state, "Out-of-State Owner", attr.PARCEL_ID || attr.SITUS_ADDRESS),
            county, state,
            lead_type: "Out-of-State Owner",
            owner_name: attr.OWNER_NAME || null,
            address: attr.SITUS_ADDRESS || null,
            city: null, zip: null,
            mailing_address: attr.MAILING_ADDRESS || null,
            mailing_city: attr.MAILING_CITY || null,
            mailing_state: attr.MAILING_STATE || null,
            mailing_zip: attr.MAILING_ZIP || null,
            case_number: attr.PARCEL_ID || null,
            filing_date: formatDate(fromDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Out-of-State Owner — mailing: ${attr.MAILING_CITY}, ${attr.MAILING_STATE}`,
            source_url: url,
            raw_data: JSON.stringify(attr),
          });
        }
      }
    }

    if (state === "WI") {
      // Wisconsin: County GIS portals
      const wiGisUrls: Record<string, string> = {
        "Dane": `https://gis.countyofdane.com/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'WI' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Rock": `https://gis.co.rock.wi.us/arcgis/rest/services/Property/MapServer/0/query?where=MAIL_STATE<>'WI' AND MAIL_STATE IS NOT NULL&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
      };
      const gisUrl = wiGisUrls[county];
      if (gisUrl) {
        const res = await fetchWithRetry(gisUrl, { headers: { "Accept": "application/json" } });
        if (res.ok) {
          const data = await res.json() as any;
          const features = data.features || [];
          for (const feat of features) {
            const attr = feat.attributes || {};
            leads.push({
              id: makeId(county, state, "Out-of-State Owner", attr.PARCEL_ID || attr.SITUS_ADDRESS),
              county, state,
              lead_type: "Out-of-State Owner",
              owner_name: attr.OWNER_NAME || null,
              address: attr.SITUS_ADDRESS || null,
              city: null, zip: null,
              mailing_address: attr.MAIL_ADDRESS || null,
              mailing_city: attr.MAIL_CITY || null,
              mailing_state: attr.MAIL_STATE || null,
              mailing_zip: attr.MAIL_ZIP || null,
              case_number: attr.PARCEL_ID || null,
              filing_date: formatDate(fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Out-of-State Owner — mailing: ${attr.MAIL_CITY}, ${attr.MAIL_STATE}`,
              source_url: gisUrl,
              raw_data: JSON.stringify(attr),
            });
          }
        }
      }
    }

    if (state === "NY" && county === "Suffolk") {
      // Suffolk County RPTS — properties with out-of-state mailing address
      const url = `https://opendata.suffolkcountyny.gov/resource/out-of-state-owners.json?$limit=200`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any[];
        for (const item of data) {
          leads.push({
            id: makeId(county, state, "Out-of-State Owner", item.parcel_id || item.address),
            county, state,
            lead_type: "Out-of-State Owner",
            owner_name: item.owner_name || null,
            address: item.address || null,
            city: item.city || null, zip: item.zip || null,
            mailing_address: item.mailing_address || null,
            mailing_city: item.mailing_city || null,
            mailing_state: item.mailing_state || null,
            mailing_zip: item.mailing_zip || null,
            case_number: item.parcel_id || null,
            filing_date: formatDate(fromDate),
            assessed_value: item.assessed_value || null,
            tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Out-of-State Owner — mailing: ${item.mailing_city}, ${item.mailing_state}`,
            source_url: url,
            raw_data: JSON.stringify(item),
          });
        }
      }
    }

  } catch (e) {
    console.error(`[Out-of-State Owners] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── EVICTION FILINGS ─────────────────────────────────────────────────────────
// Sources: County court civil records — same portals as foreclosures but filtered for eviction case types

export async function scrapeEvictions(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "WI") {
      // Wisconsin WCCA — case type "SC" (Small Claims) includes evictions
      // Also "CV" Civil includes forcible entry/detainer
      const countyMap: Record<string, string> = {
        "Dane": "Dane",
        "Rock": "Rock",
        "Door": "Door",
      };
      const wcCounty = countyMap[county];
      if (wcCounty) {
        const url = `https://wcca.wicourts.gov/jsonPost/advancedCaseSearch`;
        const body = {
          county: wcCounty,
          caseType: "SC",
          filingDateFrom: fromDate,
          filingDateTo: toDate,
          caseStatus: "Open",
          recordsPerPage: 100,
          sortDirection: "DESC",
        };
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json() as any;
          const cases = data?.result?.cases || data?.cases || [];
          for (const c of cases) {
            const caption = (c.caseCaption || "").toLowerCase();
            if (!caption.includes("evict") && !caption.includes("forcible") && !caption.includes("detainer") && !caption.includes("unlawful detainer")) continue;
            leads.push({
              id: makeId(county, state, "Eviction", c.caseNo),
              county, state,
              lead_type: "Eviction",
              owner_name: c.defendant || c.respondent || null,
              address: c.address || null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: c.caseNo || null,
              filing_date: formatDate(c.filingDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Eviction Filing — ${c.caseCaption || c.caseNo}`,
              source_url: `https://wcca.wicourts.gov/case.html#caseNo=${encodeURIComponent(c.caseNo || "")}`,
              raw_data: JSON.stringify(c),
            });
          }
        }
      }
    }

    if (state === "TX") {
      // re:SearchTX — eviction/forcible detainer cases
      const url = `https://research.txcourts.gov/CourtRecordsSearch/api/cases?county=${encodeURIComponent(county)}&caseType=EVICTION&filedFrom=${fromDate}&filedTo=${toDate}&pageSize=100`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any;
        const cases = data?.cases || data?.results || [];
        for (const c of cases) {
          leads.push({
            id: makeId(county, state, "Eviction", c.caseNumber || c.id),
            county, state,
            lead_type: "Eviction",
            owner_name: c.defendant || c.respondent || null,
            address: c.address || null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: c.caseNumber || null,
            filing_date: formatDate(c.filedDate || c.filingDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Eviction Filing — ${c.caseCaption || c.caseNumber}`,
            source_url: `https://research.txcourts.gov/CourtRecordsSearch/#/case/${c.caseNumber}`,
            raw_data: JSON.stringify(c),
          });
        }
      }
    }

    if (state === "MO") {
      // Missouri Case.net — SC (Small Claims) / CV (Civil) eviction cases
      const url = `https://www.courts.mo.gov/casenet/cases/searchDockets.do`;
      const body = new URLSearchParams({
        "inputVO.caseType": "SC",
        "inputVO.county": county === "Jackson" ? "16" : county === "Clay" ? "08" : county === "Platte" ? "33" : "09",
        "inputVO.filingDateFrom": fromDate,
        "inputVO.filingDateTo": toDate,
        "inputVO.caseStatus": "O",
        "inputVO.searchType": "case",
      });
      const res = await fetchWithRetry(url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
      });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table.results tr, #caseResults tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 4) return;
          const caseNum = $(cells[0]).text().trim();
          const caption = $(cells[1]).text().trim().toLowerCase();
          const filingDate = $(cells[2]).text().trim();
          if (!caseNum || caseNum === "Case Number") return;
          if (!caption.includes("evict") && !caption.includes("forcible") && !caption.includes("detainer")) return;
          leads.push({
            id: makeId(county, state, "Eviction", caseNum),
            county, state,
            lead_type: "Eviction",
            owner_name: null,
            address: null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum,
            filing_date: formatDate(filingDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Eviction Filing — ${$(cells[1]).text().trim()}`,
            source_url: `https://www.courts.mo.gov/casenet/cases/searchDockets.do`,
            raw_data: JSON.stringify({ caseNum, caption, filingDate }),
          });
        });
      }
    }

    if (state === "SC") {
      // South Carolina Judicial — eviction/unlawful detainer cases
      const url = `https://publicindex.sccourts.org/Richland/PublicIndex/PISearch.aspx`;
      // SC uses county-specific URLs
      const scCountyUrls: Record<string, string> = {
        "Horry": "https://publicindex.sccourts.org/Horry/PublicIndex/PISearch.aspx",
        "Georgetown": "https://publicindex.sccourts.org/Georgetown/PublicIndex/PISearch.aspx",
        "Marion": "https://publicindex.sccourts.org/Marion/PublicIndex/PISearch.aspx",
      };
      const scUrl = scCountyUrls[county];
      if (scUrl) {
        const res = await fetchWithRetry(scUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          const viewstate = $("input[name='__VIEWSTATE']").val() as string;
          const eventval = $("input[name='__EVENTVALIDATION']").val() as string;
          const searchRes = await fetchWithRetry(scUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              "__VIEWSTATE": viewstate || "",
              "__EVENTVALIDATION": eventval || "",
              "CaseType": "Magistrate",
              "CaseSubType": "Ejectment",
              "FilingDateFrom": fromDate,
              "FilingDateTo": toDate,
              "btnSearch": "Search",
            }).toString(),
          });
          if (searchRes.ok) {
            const searchHtml = await searchRes.text();
            const $s = cheerio.load(searchHtml);
            $s("table.results tr, #searchResults tr").each((_, row) => {
              const cells = $s(row).find("td");
              if (cells.length < 3) return;
              const caseNum = $s(cells[0]).text().trim();
              const defendant = $s(cells[1]).text().trim();
              const filingDate = $s(cells[2]).text().trim();
              if (!caseNum || caseNum === "Case Number") return;
              leads.push({
                id: makeId(county, state, "Eviction", caseNum),
                county, state,
                lead_type: "Eviction",
                owner_name: defendant || null,
                address: null,
                city: null, zip: null,
                mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
                case_number: caseNum,
                filing_date: formatDate(filingDate),
                assessed_value: null, tax_year: null, lender: null, loan_amount: null,
                sale_date: null, sale_amount: null,
                description: `Eviction Filing — ${county} County SC`,
                source_url: scUrl,
                raw_data: JSON.stringify({ caseNum, defendant, filingDate }),
              });
            });
          }
        }
      }
    }

    if (state === "NY" && county === "Suffolk") {
      // NYSCEF — Suffolk County eviction/summary proceeding cases
      const url = `https://iapps.courts.state.ny.us/nyscef/CaseSearch?court=Suffolk%20District%20Court&caseType=Summary+Proceeding&filedFrom=${fromDate}&filedTo=${toDate}`;
      const res = await fetchWithRetry(url);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table.results tr, .case-row").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 3) return;
          const caseNum = $(cells[0]).text().trim();
          const caption = $(cells[1]).text().trim();
          const filingDate = $(cells[2]).text().trim();
          if (!caseNum || caseNum === "Index #") return;
          leads.push({
            id: makeId(county, state, "Eviction", caseNum),
            county, state,
            lead_type: "Eviction",
            owner_name: null,
            address: null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum,
            filing_date: formatDate(filingDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Eviction/Summary Proceeding — ${caption}`,
            source_url: url,
            raw_data: JSON.stringify({ caseNum, caption, filingDate }),
          });
        });
      }
    }

  } catch (e) {
    console.error(`[Evictions] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── IRS / HOA LIENS ──────────────────────────────────────────────────────────
// Source: County recorder of deeds — document type "Federal Tax Lien" or "HOA Lien"

export async function scrapeIrsHoaLiens(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "MO" && county === "Jackson") {
      // Jackson County Recorder — search for Federal Tax Lien and HOA Lien doc types
      const url = `https://recorder.jacksongov.org/search/commonsearch.aspx?mode=advanced`;
      const res = await fetchWithRetry(url);
      if (!res.ok) return leads;
      const html = await res.text();
      const $ = cheerio.load(html);
      const viewstate = $("input[name='__VIEWSTATE']").val() as string;
      const eventval = $("input[name='__EVENTVALIDATION']").val() as string;

      for (const docType of ["FEDERAL TAX LIEN", "HOA LIEN", "HOMEOWNERS ASSOCIATION LIEN"]) {
        await sleep(500);
        const searchRes = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            "__VIEWSTATE": viewstate || "",
            "__EVENTVALIDATION": eventval || "",
            "DocType": docType,
            "DateFrom": fromDate,
            "DateTo": toDate,
            "btnSearch": "Search",
          }).toString(),
        });
        if (!searchRes.ok) continue;
        const searchHtml = await searchRes.text();
        const $s = cheerio.load(searchHtml);
        $s("table.searchResults tr, #searchResults tr").each((_, row) => {
          const cells = $s(row).find("td");
          if (cells.length < 3) return;
          const docNum = $s(cells[0]).text().trim();
          const grantor = $s(cells[1]).text().trim();
          const grantee = $s(cells[2]).text().trim();
          const recDate = $s(cells[3]).text().trim();
          if (!docNum || docNum === "Doc #") return;
          const leadType = docType.includes("HOA") ? "HOA Lien" : "IRS Tax Lien";
          leads.push({
            id: makeId(county, state, leadType, docNum),
            county, state,
            lead_type: leadType,
            owner_name: grantor || null,
            address: null,
            city: "Kansas City", zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: docNum,
            filing_date: formatDate(recDate),
            assessed_value: null, tax_year: null,
            lender: grantee || null,
            loan_amount: null, sale_date: null, sale_amount: null,
            description: `${leadType} recorded — ${grantor}`,
            source_url: url,
            raw_data: JSON.stringify({ docNum, grantor, grantee, recDate, docType }),
          });
        });
      }
    }

    if (state === "TX") {
      // Texas county clerk — federal tax liens and HOA liens
      const txClerkUrls: Record<string, string> = {
        "Nueces": "https://www.nuecesco.com/county-services/county-clerk/official-public-records",
        "Bexar": "https://www.bexar.org/1094/Official-Public-Records",
        "San Patricio": "https://www.sanpatriciotx.com/county-clerk",
      };
      const clerkUrl = txClerkUrls[county];
      if (clerkUrl) {
        // Most TX counties use a third-party records system (Intratek, Tyler, etc.)
        // Try the common Tyler Technologies endpoint
        const searchUrl = `https://www.${county.toLowerCase().replace(" ", "")}countyclerk.com/search`;
        const res = await fetchWithRetry(searchUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table tr").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 3) return;
            const docType = $(cells[0]).text().trim().toLowerCase();
            if (!docType.includes("lien") && !docType.includes("tax")) return;
            const docNum = $(cells[1]).text().trim();
            const grantor = $(cells[2]).text().trim();
            const recDate = $(cells[3])?.text().trim();
            if (!docNum) return;
            const leadType = docType.includes("hoa") ? "HOA Lien" : "IRS Tax Lien";
            leads.push({
              id: makeId(county, state, leadType, docNum),
              county, state,
              lead_type: leadType,
              owner_name: grantor || null,
              address: null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: docNum,
              filing_date: formatDate(recDate || fromDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `${leadType} — ${county} County TX`,
              source_url: clerkUrl,
              raw_data: JSON.stringify({ docType, docNum, grantor, recDate }),
            });
          });
        }
      }
    }

    if (state === "SC" && county === "Horry") {
      // Horry County Register of Deeds
      const url = `https://rod.horrycountysc.gov/`;
      const res = await fetchWithRetry(url);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        // Look for lien document search
        $("a[href*='lien'], a[href*='tax']").each((_, el) => {
          const href = $(el).attr("href");
          const text = $(el).text().trim().toLowerCase();
          if (!href || (!text.includes("lien") && !text.includes("tax"))) return;
          const leadType = text.includes("hoa") ? "HOA Lien" : "IRS Tax Lien";
          leads.push({
            id: makeId(county, state, leadType, href),
            county, state,
            lead_type: leadType,
            owner_name: null, address: null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: null,
            filing_date: formatDate(fromDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `${leadType} — Horry County SC`,
            source_url: href.startsWith("http") ? href : `https://rod.horrycountysc.gov${href}`,
            raw_data: JSON.stringify({ href, text }),
          });
        });
      }
    }

    if (state === "NY" && county === "Suffolk") {
      // Suffolk County Clerk — federal tax liens
      const url = `https://suffolkcountyny.gov/Departments/County-Clerk/Land-Records`;
      const res = await fetchWithRetry(url);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("a[href*='lien'], a[href*='tax-lien']").each((_, el) => {
          const href = $(el).attr("href");
          const text = $(el).text().trim();
          if (!href) return;
          leads.push({
            id: makeId(county, state, "IRS Tax Lien", href),
            county, state,
            lead_type: "IRS Tax Lien",
            owner_name: null, address: null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: null,
            filing_date: formatDate(fromDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `IRS Tax Lien — Suffolk County NY`,
            source_url: href.startsWith("http") ? href : `https://suffolkcountyny.gov${href}`,
            raw_data: JSON.stringify({ href, text }),
          });
        });
      }
    }

  } catch (e) {
    console.error(`[IRS/HOA Liens] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── DIVORCE FILINGS ──────────────────────────────────────────────────────────

export async function scrapeDivorceFilings(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "WI") {
      // WCCA — Family (FA) case type includes divorces
      const countyMap: Record<string, string> = {
        "Dane": "Dane",
        "Rock": "Rock",
        "Door": "Door",
      };
      const wcCounty = countyMap[county];
      if (wcCounty) {
        const url = `https://wcca.wicourts.gov/jsonPost/advancedCaseSearch`;
        const body = {
          county: wcCounty,
          caseType: "FA",
          filingDateFrom: fromDate,
          filingDateTo: toDate,
          caseStatus: "Open",
          recordsPerPage: 100,
          sortDirection: "DESC",
        };
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json() as any;
          const cases = data?.result?.cases || data?.cases || [];
          for (const c of cases) {
            const caption = (c.caseCaption || "").toLowerCase();
            if (!caption.includes("divorce") && !caption.includes("dissolution") && !caption.includes("v.")) continue;
            leads.push({
              id: makeId(county, state, "Divorce", c.caseNo),
              county, state,
              lead_type: "Divorce",
              owner_name: c.petitioner || null,
              address: null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: c.caseNo || null,
              filing_date: formatDate(c.filingDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Divorce Filing — ${c.caseCaption || c.caseNo}`,
              source_url: `https://wcca.wicourts.gov/case.html#caseNo=${encodeURIComponent(c.caseNo || "")}`,
              raw_data: JSON.stringify(c),
            });
          }
        }
      }
    }

    if (state === "TX") {
      // re:SearchTX — Divorce cases (Family Law)
      const url = `https://research.txcourts.gov/CourtRecordsSearch/api/cases?county=${encodeURIComponent(county)}&caseType=DIVORCE&filedFrom=${fromDate}&filedTo=${toDate}&pageSize=100`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any;
        const cases = data?.cases || data?.results || [];
        for (const c of cases) {
          leads.push({
            id: makeId(county, state, "Divorce", c.caseNumber || c.id),
            county, state,
            lead_type: "Divorce",
            owner_name: c.petitioner || c.plaintiff || null,
            address: null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: c.caseNumber || null,
            filing_date: formatDate(c.filedDate || c.filingDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Divorce Filing — ${c.caseCaption || c.caseNumber}`,
            source_url: `https://research.txcourts.gov/CourtRecordsSearch/#/case/${c.caseNumber}`,
            raw_data: JSON.stringify(c),
          });
        }
      }
    }

    if (state === "MO") {
      // Missouri Case.net — Family (FA) divorce cases
      const countyCodeMap: Record<string, string> = {
        "Jackson": "16",
        "Clay": "08",
        "Platte": "33",
        "Cass": "09",
      };
      const countyCode = countyCodeMap[county];
      if (countyCode) {
        const url = `https://www.courts.mo.gov/casenet/cases/searchDockets.do`;
        const body = new URLSearchParams({
          "inputVO.caseType": "DI",
          "inputVO.county": countyCode,
          "inputVO.filingDateFrom": fromDate,
          "inputVO.filingDateTo": toDate,
          "inputVO.caseStatus": "O",
          "inputVO.searchType": "case",
        });
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table.results tr, #caseResults tr").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 3) return;
            const caseNum = $(cells[0]).text().trim();
            const caption = $(cells[1]).text().trim();
            const filingDate = $(cells[2]).text().trim();
            if (!caseNum || caseNum === "Case Number") return;
            leads.push({
              id: makeId(county, state, "Divorce", caseNum),
              county, state,
              lead_type: "Divorce",
              owner_name: null,
              address: null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filingDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Divorce Filing — ${caption}`,
              source_url: url,
              raw_data: JSON.stringify({ caseNum, caption, filingDate }),
            });
          });
        }
      }
    }

    if (state === "SC") {
      const scCountyUrls: Record<string, string> = {
        "Horry": "https://publicindex.sccourts.org/Horry/PublicIndex/PISearch.aspx",
        "Georgetown": "https://publicindex.sccourts.org/Georgetown/PublicIndex/PISearch.aspx",
        "Marion": "https://publicindex.sccourts.org/Marion/PublicIndex/PISearch.aspx",
      };
      const scUrl = scCountyUrls[county];
      if (scUrl) {
        const res = await fetchWithRetry(scUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          const viewstate = $("input[name='__VIEWSTATE']").val() as string;
          const eventval = $("input[name='__EVENTVALIDATION']").val() as string;
          const searchRes = await fetchWithRetry(scUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              "__VIEWSTATE": viewstate || "",
              "__EVENTVALIDATION": eventval || "",
              "CaseType": "Family",
              "CaseSubType": "Divorce",
              "FilingDateFrom": fromDate,
              "FilingDateTo": toDate,
              "btnSearch": "Search",
            }).toString(),
          });
          if (searchRes.ok) {
            const searchHtml = await searchRes.text();
            const $s = cheerio.load(searchHtml);
            $s("table.results tr, #searchResults tr").each((_, row) => {
              const cells = $s(row).find("td");
              if (cells.length < 3) return;
              const caseNum = $s(cells[0]).text().trim();
              const petitioner = $s(cells[1]).text().trim();
              const filingDate = $s(cells[2]).text().trim();
              if (!caseNum || caseNum === "Case Number") return;
              leads.push({
                id: makeId(county, state, "Divorce", caseNum),
                county, state,
                lead_type: "Divorce",
                owner_name: petitioner || null,
                address: null,
                city: null, zip: null,
                mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
                case_number: caseNum,
                filing_date: formatDate(filingDate),
                assessed_value: null, tax_year: null, lender: null, loan_amount: null,
                sale_date: null, sale_amount: null,
                description: `Divorce Filing — ${county} County SC`,
                source_url: scUrl,
                raw_data: JSON.stringify({ caseNum, petitioner, filingDate }),
              });
            });
          }
        }
      }
    }

  } catch (e) {
    console.error(`[Divorce] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── HIGH EQUITY + LONG-TERM OWNERS ──────────────────────────────────────────
// Source: County assessor — deed date 10+ years ago, no mortgage recorded recently

export async function scrapeHighEquity(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];
  const cutoffYear = new Date().getFullYear() - 10;

  try {
    if (state === "TX") {
      const cadGisUrls: Record<string, string> = {
        "Nueces": `https://gis.nuecescad.net/arcgis/rest/services/Property/MapServer/0/query?where=DEED_DATE < '${cutoffYear}-01-01' AND EXEMPTIONS LIKE '%25HS%25'&outFields=OWNER_NAME,SITUS_ADDR,ACCT_NUM,DEED_DATE,MARKET_VALUE,MAIL_ADDR,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
        "Bexar": `https://gis.bcad.org/arcgis/rest/services/Property/MapServer/0/query?where=DEED_DT < '${cutoffYear}-01-01'&outFields=OWNER_NAME,SITUS_ADDRESS,PROP_ID,DEED_DT,MKT_VALUE,MAIL_ADDRESS,MAIL_CITY,MAIL_STATE,MAIL_ZIP&f=json&resultRecordCount=200`,
      };
      const gisUrl = cadGisUrls[county];
      if (gisUrl) {
        const res = await fetchWithRetry(gisUrl, { headers: { "Accept": "application/json" } });
        if (res.ok) {
          const data = await res.json() as any;
          const features = data.features || [];
          for (const feat of features) {
            const attr = feat.attributes || {};
            const deedDate = attr.DEED_DATE || attr.DEED_DT;
            const marketValue = attr.MARKET_VALUE || attr.MKT_VALUE;
            leads.push({
              id: makeId(county, state, "High Equity", attr.ACCT_NUM || attr.PROP_ID || attr.SITUS_ADDR),
              county, state,
              lead_type: "High Equity",
              owner_name: attr.OWNER_NAME || null,
              address: attr.SITUS_ADDR || attr.SITUS_ADDRESS || null,
              city: null, zip: null,
              mailing_address: attr.MAIL_ADDR || attr.MAIL_ADDRESS || null,
              mailing_city: attr.MAIL_CITY || null,
              mailing_state: attr.MAIL_STATE || null,
              mailing_zip: attr.MAIL_ZIP || null,
              case_number: attr.ACCT_NUM || attr.PROP_ID || null,
              filing_date: formatDate(deedDate),
              assessed_value: marketValue ? String(marketValue) : null,
              tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `High Equity Owner — owned since ${deedDate ? new Date(deedDate).getFullYear() : "pre-" + cutoffYear}, value: $${marketValue?.toLocaleString() || "N/A"}`,
              source_url: gisUrl,
              raw_data: JSON.stringify(attr),
            });
          }
        }
      }
    }

    if (state === "SC" && county === "Horry") {
      // Horry County GIS — long-term owners
      const url = `https://gis.horrycountysc.gov/arcgis/rest/services/Property/MapServer/0/query?where=DEED_DATE < '${cutoffYear}-01-01' AND LAND_USE_CODE='R'&outFields=OWNER_NAME,SITUS_ADDRESS,PARCEL_ID,DEED_DATE,APPRAISED_VALUE,MAILING_ADDRESS,MAILING_CITY,MAILING_STATE,MAILING_ZIP&f=json&resultRecordCount=200`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any;
        const features = data.features || [];
        for (const feat of features) {
          const attr = feat.attributes || {};
          leads.push({
            id: makeId(county, state, "High Equity", attr.PARCEL_ID || attr.SITUS_ADDRESS),
            county, state,
            lead_type: "High Equity",
            owner_name: attr.OWNER_NAME || null,
            address: attr.SITUS_ADDRESS || null,
            city: null, zip: null,
            mailing_address: attr.MAILING_ADDRESS || null,
            mailing_city: attr.MAILING_CITY || null,
            mailing_state: attr.MAILING_STATE || null,
            mailing_zip: attr.MAILING_ZIP || null,
            case_number: attr.PARCEL_ID || null,
            filing_date: formatDate(attr.DEED_DATE),
            assessed_value: attr.APPRAISED_VALUE ? String(attr.APPRAISED_VALUE) : null,
            tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `High Equity Owner — owned since ${attr.DEED_DATE ? new Date(attr.DEED_DATE).getFullYear() : "pre-" + cutoffYear}`,
            source_url: url,
            raw_data: JSON.stringify(attr),
          });
        }
      }
    }

  } catch (e) {
    console.error(`[High Equity] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── ESTATE / INHERITED PROPERTY ─────────────────────────────────────────────
// Source: Probate court records + deed transfers to trusts/estates

export async function scrapeEstateInherited(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  try {
    if (state === "WI") {
      // WCCA — Probate (PR) case type
      const countyMap: Record<string, string> = {
        "Dane": "Dane",
        "Rock": "Rock",
        "Door": "Door",
      };
      const wcCounty = countyMap[county];
      if (wcCounty) {
        const url = `https://wcca.wicourts.gov/jsonPost/advancedCaseSearch`;
        const body = {
          county: wcCounty,
          caseType: "PR",
          filingDateFrom: fromDate,
          filingDateTo: toDate,
          caseStatus: "Open",
          recordsPerPage: 100,
        };
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "Accept": "application/json" },
          body: JSON.stringify(body),
        });
        if (res.ok) {
          const data = await res.json() as any;
          const cases = data?.result?.cases || data?.cases || [];
          for (const c of cases) {
            leads.push({
              id: makeId(county, state, "Estate/Inherited", c.caseNo),
              county, state,
              lead_type: "Estate/Inherited",
              owner_name: c.decedent || c.petitioner || null,
              address: null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: c.caseNo || null,
              filing_date: formatDate(c.filingDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Probate/Estate Filing — ${c.caseCaption || c.caseNo}`,
              source_url: `https://wcca.wicourts.gov/case.html#caseNo=${encodeURIComponent(c.caseNo || "")}`,
              raw_data: JSON.stringify(c),
            });
          }
        }
      }
    }

    if (state === "TX") {
      // re:SearchTX — Probate cases
      const url = `https://research.txcourts.gov/CourtRecordsSearch/api/cases?county=${encodeURIComponent(county)}&caseType=PROBATE&filedFrom=${fromDate}&filedTo=${toDate}&pageSize=100`;
      const res = await fetchWithRetry(url, { headers: { "Accept": "application/json" } });
      if (res.ok) {
        const data = await res.json() as any;
        const cases = data?.cases || data?.results || [];
        for (const c of cases) {
          leads.push({
            id: makeId(county, state, "Estate/Inherited", c.caseNumber || c.id),
            county, state,
            lead_type: "Estate/Inherited",
            owner_name: c.decedent || c.petitioner || null,
            address: null,
            city: null, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: c.caseNumber || null,
            filing_date: formatDate(c.filedDate || c.filingDate),
            assessed_value: null, tax_year: null, lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Probate/Estate Filing — ${c.caseCaption || c.caseNumber}`,
            source_url: `https://research.txcourts.gov/CourtRecordsSearch/#/case/${c.caseNumber}`,
            raw_data: JSON.stringify(c),
          });
        }
      }
    }

    if (state === "MO") {
      // Missouri Case.net — Probate (PR) cases
      const countyCodeMap: Record<string, string> = {
        "Jackson": "16",
        "Clay": "08",
        "Platte": "33",
        "Cass": "09",
      };
      const countyCode = countyCodeMap[county];
      if (countyCode) {
        const url = `https://www.courts.mo.gov/casenet/cases/searchDockets.do`;
        const body = new URLSearchParams({
          "inputVO.caseType": "PR",
          "inputVO.county": countyCode,
          "inputVO.filingDateFrom": fromDate,
          "inputVO.filingDateTo": toDate,
          "inputVO.searchType": "case",
        });
        const res = await fetchWithRetry(url, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: body.toString(),
        });
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          $("table.results tr, #caseResults tr").each((_, row) => {
            const cells = $(row).find("td");
            if (cells.length < 3) return;
            const caseNum = $(cells[0]).text().trim();
            const caption = $(cells[1]).text().trim();
            const filingDate = $(cells[2]).text().trim();
            if (!caseNum || caseNum === "Case Number") return;
            leads.push({
              id: makeId(county, state, "Estate/Inherited", caseNum),
              county, state,
              lead_type: "Estate/Inherited",
              owner_name: null,
              address: null,
              city: null, zip: null,
              mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
              case_number: caseNum,
              filing_date: formatDate(filingDate),
              assessed_value: null, tax_year: null, lender: null, loan_amount: null,
              sale_date: null, sale_amount: null,
              description: `Probate/Estate Filing — ${caption}`,
              source_url: url,
              raw_data: JSON.stringify({ caseNum, caption, filingDate }),
            });
          });
        }
      }
    }

    if (state === "SC") {
      const scCountyUrls: Record<string, string> = {
        "Horry": "https://publicindex.sccourts.org/Horry/PublicIndex/PISearch.aspx",
        "Georgetown": "https://publicindex.sccourts.org/Georgetown/PublicIndex/PISearch.aspx",
        "Marion": "https://publicindex.sccourts.org/Marion/PublicIndex/PISearch.aspx",
      };
      const scUrl = scCountyUrls[county];
      if (scUrl) {
        const res = await fetchWithRetry(scUrl);
        if (res.ok) {
          const html = await res.text();
          const $ = cheerio.load(html);
          const viewstate = $("input[name='__VIEWSTATE']").val() as string;
          const eventval = $("input[name='__EVENTVALIDATION']").val() as string;
          const searchRes = await fetchWithRetry(scUrl, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              "__VIEWSTATE": viewstate || "",
              "__EVENTVALIDATION": eventval || "",
              "CaseType": "Probate",
              "FilingDateFrom": fromDate,
              "FilingDateTo": toDate,
              "btnSearch": "Search",
            }).toString(),
          });
          if (searchRes.ok) {
            const searchHtml = await searchRes.text();
            const $s = cheerio.load(searchHtml);
            $s("table.results tr, #searchResults tr").each((_, row) => {
              const cells = $s(row).find("td");
              if (cells.length < 3) return;
              const caseNum = $s(cells[0]).text().trim();
              const decedent = $s(cells[1]).text().trim();
              const filingDate = $s(cells[2]).text().trim();
              if (!caseNum || caseNum === "Case Number") return;
              leads.push({
                id: makeId(county, state, "Estate/Inherited", caseNum),
                county, state,
                lead_type: "Estate/Inherited",
                owner_name: decedent || null,
                address: null,
                city: null, zip: null,
                mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
                case_number: caseNum,
                filing_date: formatDate(filingDate),
                assessed_value: null, tax_year: null, lender: null, loan_amount: null,
                sale_date: null, sale_amount: null,
                description: `Probate/Estate Filing — ${county} County SC`,
                source_url: scUrl,
                raw_data: JSON.stringify({ caseNum, decedent, filingDate }),
              });
            });
          }
        }
      }
    }

  } catch (e) {
    console.error(`[Estate/Inherited] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── BANKRUPTCY FILINGS ───────────────────────────────────────────────────────
// Source: PACER federal court system — free to search, $0.10/page to download docs
// Uses the PACER Case Locator API

export async function scrapeBankruptcy(
  county: string,
  state: string,
  fromDate: string,
  toDate: string
): Promise<Lead[]> {
  const leads: Lead[] = [];

  // Federal bankruptcy court districts by state
  const districtMap: Record<string, { court: string; district: string }> = {
    "NY": { court: "nyeb", district: "Eastern District of New York" },
    "WI": { court: "wieb", district: "Eastern District of Wisconsin" },
    "MO": { court: "mowb", district: "Western District of Missouri" },
    "AL": { court: "alnb", district: "Northern District of Alabama" },
    "OH": { court: "ohsb", district: "Southern District of Ohio" },
    "SC": { court: "scb", district: "District of South Carolina" },
    "TX": { court: "txsb", district: "Southern District of Texas" },
  };

  const districtInfo = districtMap[state];
  if (!districtInfo) return leads;

  try {
    // PACER Case Locator — public search endpoint (no auth needed for search, only for docs)
    const url = `https://pcl.uscourts.gov/pcl/pages/search/results/cases.jsf`;
    const body = new URLSearchParams({
      "j_idt18:j_idt19:courtId": districtInfo.court,
      "j_idt18:j_idt19:dateFiledFrom": fromDate,
      "j_idt18:j_idt19:dateFiledTo": toDate,
      "j_idt18:j_idt19:caseType": "bk",
      "j_idt18:j_idt19:chapter": "7",
      "j_idt18:j_idt19:county": county,
      "j_idt18:j_idt19:pageSize": "100",
    });

    const res = await fetchWithRetry(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Accept": "text/html,application/xhtml+xml",
      },
      body: body.toString(),
    });

    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);

      $("table.ui-datatable-data tr, .case-row").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 4) return;

        const caseNum = $(cells[0]).text().trim();
        const debtor = $(cells[1]).text().trim();
        const chapter = $(cells[2]).text().trim();
        const filingDate = $(cells[3]).text().trim();
        const address = $(cells[4])?.text().trim();

        if (!caseNum || caseNum === "Case Number") return;

        leads.push({
          id: makeId(county, state, "Bankruptcy", caseNum),
          county, state,
          lead_type: "Bankruptcy",
          owner_name: debtor || null,
          address: address || null,
          city: null, zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum,
          filing_date: formatDate(filingDate),
          assessed_value: null, tax_year: null, lender: null,
          loan_amount: null, sale_date: null, sale_amount: null,
          description: `Chapter ${chapter} Bankruptcy — ${debtor}`,
          source_url: `https://ecf.${districtInfo.court}.uscourts.gov/cgi-bin/DktRpt.pl?${caseNum}`,
          raw_data: JSON.stringify({ caseNum, debtor, chapter, filingDate, address }),
        });
      });
    }
  } catch (e) {
    console.error(`[Bankruptcy] ${county} ${state} error:`, e);
  }

  return leads;
}

// ─── MASTER DISPATCHER ────────────────────────────────────────────────────────
// Call this from the scraper index to run all extended lead types for a county

export async function scrapeExtendedLeadTypes(
  county: string,
  state: string,
  fromDate: string,
  toDate: string,
  leadTypes: string[] = ["all"],
  onProgress?: (msg: string) => void
): Promise<{ leads: Lead[]; errors: string[] }> {
  const allLeads: Lead[] = [];
  const errors: string[] = [];

  const runScraper = async (name: string, fn: () => Promise<Lead[]>) => {
    try {
      onProgress?.(`Scraping ${name} for ${county}, ${state}...`);
      const results = await fn();
      allLeads.push(...results);
      onProgress?.(`✓ ${name}: ${results.length} leads`);
    } catch (e) {
      const msg = `Error scraping ${name} for ${county} ${state}: ${(e as Error).message}`;
      errors.push(msg);
      onProgress?.(`✗ ${msg}`);
    }
  };

  const shouldRun = (type: string) => leadTypes.includes("all") || leadTypes.includes(type);

  if (shouldRun("Fire Damaged")) await runScraper("Fire Damaged", () => scrapeFireDamaged(county, state, fromDate, toDate));
  if (shouldRun("Code Violation")) await runScraper("Code Violations", () => scrapeCodeViolations(county, state, fromDate, toDate));
  if (shouldRun("Vacant/Abandoned")) await runScraper("Vacant/Abandoned", () => scrapeVacantAbandoned(county, state, fromDate, toDate));
  if (shouldRun("Out-of-State Owner")) await runScraper("Out-of-State Owners", () => scrapeOutOfStateOwners(county, state, fromDate, toDate));
  if (shouldRun("Eviction")) await runScraper("Evictions", () => scrapeEvictions(county, state, fromDate, toDate));
  if (shouldRun("IRS Tax Lien") || shouldRun("HOA Lien")) await runScraper("IRS/HOA Liens", () => scrapeIrsHoaLiens(county, state, fromDate, toDate));
  if (shouldRun("Divorce")) await runScraper("Divorce Filings", () => scrapeDivorceFilings(county, state, fromDate, toDate));
  if (shouldRun("High Equity")) await runScraper("High Equity Owners", () => scrapeHighEquity(county, state, fromDate, toDate));
  if (shouldRun("Estate/Inherited")) await runScraper("Estate/Inherited", () => scrapeEstateInherited(county, state, fromDate, toDate));
  if (shouldRun("Bankruptcy")) await runScraper("Bankruptcy", () => scrapeBankruptcy(county, state, fromDate, toDate));

  return { leads: allLeads, errors };
}
