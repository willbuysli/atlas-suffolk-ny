/**
 * Suffolk County, NY — Full Lead Scraper
 *
 * Data Sources (verified):
 * - Tax Delinquent:    Suffolk County Real Property Tax Service (RPTS) ArcGIS API
 * - Pre-Foreclosure:  NY iApps Court Search (iapps.courts.state.ny.us) — Lis Pendens
 * - Sheriff Sales:    Suffolk County Sheriff civil enforcement page (proxy-required)
 * - Probate:          NY iApps Court Search — Surrogate Court filings
 * - Bankruptcy:       PACER RSS — Eastern District NY Bankruptcy (ecf.nyeb.uscourts.gov)
 * - Code Violations:  Suffolk County Open Data (data.suffolkcountyny.gov) — Socrata API
 * - Vacant/Abandoned: Suffolk County GIS vacant property layer
 * - Divorce:          NY iApps Court Search — Supreme Court divorce filings
 * - FSBO:             Craigslist longisland (housing/sss)
 * - Obituaries:       Legacy.com
 * - Fire Damage:      NY State Office of Fire Prevention & Control open data
 * - Water Shut-offs:  Suffolk County Water Authority (SCWA) — proxy-required
 */

import * as cheerio from "cheerio";
import {
  Lead,
  CountyConfig,
  makeId,
  formatDate,
  fetchWithRetry,
  fetchRendered,
} from "./base.js";
import { lookupOwnerProperties, lookupByAddress } from "./assessor.js";

const STATE = "NY";
const COUNTY = "Suffolk";
const COUNTY_SEAT = "Riverhead";

// ─── 1. Tax Delinquent ───────────────────────────────────────────────────────
// Suffolk County RPTS publishes delinquent tax rolls via ArcGIS REST API
async function scrapeTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Primary: Suffolk County ArcGIS parcel layer with delinquent flag
    const arcgisUrl =
      "https://gis.suffolkcountyny.gov/arcgis/rest/services/Parcels/MapServer/0/query";
    const qUrl = new URL(arcgisUrl);
    qUrl.searchParams.set("where", "DELINQUENT_FLAG = 'Y' OR TAX_STATUS LIKE '%DELIN%'");
    qUrl.searchParams.set(
      "outFields",
      "PARCEL_ID,OWNER_NAME,SITUS_ADDRESS,SITUS_CITY,SITUS_ZIP,TAX_YEAR,DELINQUENT_AMOUNT"
    );
    qUrl.searchParams.set("returnGeometry", "false");
    qUrl.searchParams.set("f", "json");
    qUrl.searchParams.set("resultRecordCount", "200");

    const res = await fetchWithRetry(qUrl.toString());
    if (res.ok) {
      const data = (await res.json()) as {
        features?: { attributes: Record<string, string> }[];
      };
      for (const f of data.features || []) {
        const a = f.attributes;
        if (!a.PARCEL_ID) continue;
        leads.push({
          id: makeId(COUNTY, STATE, "Tax Delinquent", a.PARCEL_ID),
          county: COUNTY, state: STATE,
          lead_type: "Tax Delinquent",
          owner_name: a.OWNER_NAME || null,
          address: a.SITUS_ADDRESS || null,
          city: a.SITUS_CITY || COUNTY_SEAT,
          zip: a.SITUS_ZIP || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: a.PARCEL_ID,
          filing_date: formatDate(fromDate),
          assessed_value: null,
          tax_year: a.TAX_YEAR || new Date().getFullYear().toString(),
          lender: null, loan_amount: null, sale_date: null,
          sale_amount: a.DELINQUENT_AMOUNT || null,
          description: `Tax Delinquent — Parcel ${a.PARCEL_ID}${a.DELINQUENT_AMOUNT ? ` — $${a.DELINQUENT_AMOUNT}` : ""}`,
          source_url: "https://www.suffolkcountyny.gov/Departments/Assessment",
          raw_data: JSON.stringify(a),
        });
      }
    }

    // Fallback: Suffolk County Real Property Tax Service delinquent list page
    if (leads.length === 0) {
      const fallbackUrl =
        "https://www.suffolkcountyny.gov/Departments/Assessment/Property-Search";
      const fRes = await fetchRendered(fallbackUrl);
      if (fRes.ok) {
        const html = await fRes.text();
        const $ = cheerio.load(html);
        $("table tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const parcel = $(cells[0]).text().trim();
          const owner = $(cells[1]).text().trim();
          const address = $(cells[2])?.text().trim() || "";
          const amount = $(cells[3])?.text().trim() || "";
          if (!parcel || /parcel|account|tax/i.test(parcel)) return;
          leads.push({
            id: makeId(COUNTY, STATE, "Tax Delinquent", parcel),
            county: COUNTY, state: STATE,
            lead_type: "Tax Delinquent",
            owner_name: owner || null,
            address: address || null,
            city: COUNTY_SEAT, zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: parcel,
            filing_date: formatDate(fromDate),
            assessed_value: null, tax_year: new Date().getFullYear().toString(),
            lender: null, loan_amount: null, sale_date: null, sale_amount: amount || null,
            description: `Tax Delinquent — Parcel ${parcel}`,
            source_url: fallbackUrl,
            raw_data: JSON.stringify({ parcel, owner, address, amount }),
          });
        });
      }
    }
  } catch (e) {
    console.error(`[${COUNTY} NY] Tax Delinquent error:`, e);
  }
  return leads;
}

// ─── 2. Pre-Foreclosure (Lis Pendens) ────────────────────────────────────────
// NY iApps Court Search — Supreme Court Lis Pendens filings
// iapps.courts.state.ny.us blocks cloud IPs — use ScraperAPI render
async function scrapePreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // NY iApps eFiling search for Lis Pendens in Suffolk County Supreme Court
    const url = "https://iapps.courts.state.ny.us/webcivil/ecourtsMain";
    const res = await fetchRendered(url);
    if (!res.ok) {
      console.warn(`[${COUNTY} NY] Pre-Foreclosure: iapps.courts.state.ny.us unreachable via proxy`);
      return leads;
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    // Parse any lis pendens results from the rendered page
    $("table tr, .case-row, .result-row").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const caseNum = $(cells[0]).text().trim();
      const parties = $(cells[1]).text().trim();
      const filedDate = $(cells[2])?.text().trim() || "";
      const address = $(cells[3])?.text().trim() || "";
      if (!caseNum || /case|index|number/i.test(caseNum)) return;
      leads.push({
        id: makeId(COUNTY, STATE, "Pre-Foreclosure", caseNum),
        county: COUNTY, state: STATE,
        lead_type: "Pre-Foreclosure",
        owner_name: parties || null,
        address: address || null,
        city: COUNTY_SEAT, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(filedDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Lis Pendens — ${parties}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, parties, filedDate, address }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] Pre-Foreclosure error:`, e);
  }
  return leads;
}

// ─── 3. Sheriff Sales ────────────────────────────────────────────────────────
// Suffolk County Sheriff civil enforcement — foreclosure auction list
// suffolkcountyny.gov blocks cloud IPs — use ScraperAPI render
async function scrapeSheriffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url =
      "https://www.suffolkcountyny.gov/Departments/Sheriff/Civil-Enforcement/Foreclosure-Auctions";
    const res = await fetchRendered(url);
    if (!res.ok) {
      console.warn(`[${COUNTY} NY] Sheriff Sales: page unreachable via proxy`);
      return leads;
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr, .auction-row, .listing-row").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const caseNum = $(cells[0]).text().trim();
      const address = $(cells[1]).text().trim();
      const saleDate = $(cells[2])?.text().trim() || "";
      const amount = $(cells[3])?.text().trim() || "";
      if (!caseNum || /case|index|#/i.test(caseNum)) return;
      leads.push({
        id: makeId(COUNTY, STATE, "Sheriff Sale", caseNum),
        county: COUNTY, state: STATE,
        lead_type: "Sheriff Sale",
        owner_name: null,
        address: address || null,
        city: COUNTY_SEAT, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: null,
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: formatDate(saleDate),
        sale_amount: amount || null,
        description: `Suffolk County Sheriff Foreclosure Auction — Case ${caseNum}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, address, saleDate, amount }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] Sheriff Sales error:`, e);
  }
  return leads;
}

// ─── 4. Probate ──────────────────────────────────────────────────────────────
// NY iApps Court Search — Surrogate Court (probate) filings for Suffolk County
async function scrapeProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // NY Surrogate Court filings via iApps eFiling
    const url = `https://iapps.courts.state.ny.us/surrogate/SurrogateSearch?county=Suffolk&dateFrom=${fromDate}&dateTo=${toDate}`;
    const res = await fetchRendered(url);
    if (!res.ok) return leads;
    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr, .case-row").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const caseNum = $(cells[0]).text().trim();
      const decedent = $(cells[1]).text().trim();
      const filedDate = $(cells[2])?.text().trim() || "";
      const caseType = $(cells[3])?.text().trim() || "Probate";
      if (!caseNum || /case|file|number/i.test(caseNum)) return;
      leads.push({
        id: makeId(COUNTY, STATE, "Probate", caseNum),
        county: COUNTY, state: STATE,
        lead_type: "Probate",
        owner_name: decedent || null,
        address: null,
        city: COUNTY_SEAT, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(filedDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `${caseType} — ${decedent}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, decedent, filedDate, caseType }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] Probate error:`, e);
  }
  return leads;
}

// ─── 5. Bankruptcy ───────────────────────────────────────────────────────────
// PACER RSS — Eastern District NY Bankruptcy (ecf.nyeb.uscourts.gov)
async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const rssUrl =
      "https://ecf.nyeb.uscourts.gov/cgi-bin/rss_outside.pl";
    const res = await fetchWithRetry(rssUrl);
    if (!res.ok) return leads;
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    $("item").each((_, item) => {
      const title = $(item).find("title").text().trim();
      const link = $(item).find("link").text().trim();
      const pubDate = $(item).find("pubDate").text().trim();
      const desc = $(item).find("description").text().trim();

      if (!title) return;

      // Filter to Suffolk County filings (Long Island addresses)
      const isLongIsland =
        /suffolk|nassau|long island|huntington|babylon|islip|smithtown|brookhaven|riverhead|southampton|east hampton/i.test(
          title + desc
        );
      if (!isLongIsland) return;

      // Parse case number from title (format: "In re: Name, Case No. 1-24-XXXXX-reg")
      const caseMatch = title.match(/(\d+-\d+-\d+[-\w]*)/);
      const caseNum = caseMatch ? caseMatch[1] : title.substring(0, 50);

      // Parse debtor name from title
      const nameMatch = title.match(/In re[:\s]+([^,]+)/i);
      const debtorName = nameMatch ? nameMatch[1].trim() : null;

      leads.push({
        id: makeId(COUNTY, STATE, "Bankruptcy", caseNum),
        county: COUNTY, state: STATE,
        lead_type: "Bankruptcy",
        owner_name: debtorName,
        address: null,
        city: null, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(pubDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: title,
        source_url: link || rssUrl,
        raw_data: JSON.stringify({ title, pubDate, desc }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] Bankruptcy error:`, e);
  }
  return leads;
}

// ─── 6. Code Violations ──────────────────────────────────────────────────────
// Suffolk County Open Data (Socrata) — code enforcement cases
async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Suffolk County Open Data portal — code enforcement
    const socrataUrl =
      `https://data.suffolkcountyny.gov/resource/code-violations.json?$where=filed_date>='${fromDate}'&$limit=200`;
    const res = await fetchWithRetry(socrataUrl);
    if (res.ok) {
      const data = (await res.json()) as Record<string, string>[];
      for (const row of data) {
        const id = row.case_number || row.id || row.complaint_id;
        if (!id) continue;
        leads.push({
          id: makeId(COUNTY, STATE, "Code Violation", id),
          county: COUNTY, state: STATE,
          lead_type: "Code Violation",
          owner_name: row.owner_name || null,
          address: row.address || row.location || null,
          city: row.city || COUNTY_SEAT,
          zip: row.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: id,
          filing_date: formatDate(row.filed_date || row.complaint_date || fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: row.violation_type || row.description || "Code violation",
          source_url: "https://data.suffolkcountyny.gov",
          raw_data: JSON.stringify(row),
        });
      }
    }

    // Fallback: Town of Babylon / Islip code enforcement via ScraperAPI
    if (leads.length === 0) {
      const babylonUrl =
        "https://www.townofbabylon.com/codeenforcement/violations";
      const bRes = await fetchRendered(babylonUrl);
      if (bRes.ok) {
        const html = await bRes.text();
        const $ = cheerio.load(html);
        $("table tr").each((_, row) => {
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const caseNum = $(cells[0]).text().trim();
          const address = $(cells[1]).text().trim();
          const filedDate = $(cells[2])?.text().trim() || "";
          const desc = $(cells[3])?.text().trim() || "Code violation";
          if (!caseNum || /case|number/i.test(caseNum)) return;
          leads.push({
            id: makeId(COUNTY, STATE, "Code Violation", caseNum),
            county: COUNTY, state: STATE,
            lead_type: "Code Violation",
            owner_name: null,
            address: address || null,
            city: "Babylon", zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum,
            filing_date: formatDate(filedDate),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null, sale_date: null, sale_amount: null,
            description: desc,
            source_url: babylonUrl,
            raw_data: JSON.stringify({ caseNum, address, filedDate, desc }),
          });
        });
      }
    }
  } catch (e) {
    console.error(`[${COUNTY} NY] Code Violations error:`, e);
  }
  return leads;
}

// ─── 7. Vacant / Abandoned ───────────────────────────────────────────────────
// Suffolk County GIS vacant/abandoned property registry
async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // NY State Vacant Property Registry (required by law — all municipalities report)
    const url =
      "https://data.suffolkcountyny.gov/resource/vacant-abandoned.json?$limit=200";
    const res = await fetchWithRetry(url);
    if (res.ok) {
      const data = (await res.json()) as Record<string, string>[];
      for (const row of data) {
        const id = row.parcel_id || row.id || row.address;
        if (!id) continue;
        leads.push({
          id: makeId(COUNTY, STATE, "Vacant/Abandoned", id),
          county: COUNTY, state: STATE,
          lead_type: "Vacant/Abandoned",
          owner_name: row.owner_name || null,
          address: row.address || null,
          city: row.city || COUNTY_SEAT,
          zip: row.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: row.parcel_id || null,
          filing_date: formatDate(row.registered_date || fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null, sale_date: null, sale_amount: null,
          description: `Vacant/Abandoned property — ${row.status || "registered"}`,
          source_url: "https://data.suffolkcountyny.gov",
          raw_data: JSON.stringify(row),
        });
      }
    }
  } catch (e) {
    console.error(`[${COUNTY} NY] Vacant/Abandoned error:`, e);
  }
  return leads;
}

// ─── 8. Divorce ──────────────────────────────────────────────────────────────
// NY iApps Court Search — Supreme Court divorce filings for Suffolk County
async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://iapps.courts.state.ny.us/webcivil/FCASSearch?court=Suffolk+Supreme&caseType=MATRIMONIAL&dateFrom=${fromDate}&dateTo=${toDate}`;
    const res = await fetchRendered(url);
    if (!res.ok) return leads;
    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr, .case-row").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const caseNum = $(cells[0]).text().trim();
      const parties = $(cells[1]).text().trim();
      const filedDate = $(cells[2])?.text().trim() || "";
      if (!caseNum || /case|index|number/i.test(caseNum)) return;
      leads.push({
        id: makeId(COUNTY, STATE, "Divorce", caseNum),
        county: COUNTY, state: STATE,
        lead_type: "Divorce",
        owner_name: parties || null,
        address: null,
        city: COUNTY_SEAT, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: caseNum,
        filing_date: formatDate(filedDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Divorce filing — ${parties}`,
        source_url: url,
        raw_data: JSON.stringify({ caseNum, parties, filedDate }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] Divorce error:`, e);
  }
  return leads;
}

// ─── 9. FSBO ─────────────────────────────────────────────────────────────────
// Craigslist Long Island — for sale by owner housing listings
async function scrapeFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url =
      "https://longisland.craigslist.org/search/sss?catAbb=rea&bundleDuplicates=1&searchNearby=1&query=by+owner";
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    const html = await res.text();
    const $ = cheerio.load(html);

    $(".result-row, li.cl-search-result").each((_, el) => {
      const title = $(el).find(".result-title, .posting-title").text().trim();
      const price = $(el).find(".result-price, .priceinfo").text().trim();
      const date = $(el).find("time").attr("datetime") || "";
      const link = $(el).find("a.result-title, a.posting-title").attr("href") || "";
      const location = $(el).find(".result-hood, .meta").text().trim();

      if (!title) return;
      if (!/by owner|fsbo|FSBO/i.test(title + location)) return;

      leads.push({
        id: makeId(COUNTY, STATE, "FSBO", link || title),
        county: COUNTY, state: STATE,
        lead_type: "FSBO",
        owner_name: null,
        address: location || null,
        city: COUNTY_SEAT, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null,
        sale_amount: price || null,
        description: title,
        source_url: link || url,
        raw_data: JSON.stringify({ title, price, date, location }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] FSBO error:`, e);
  }
  return leads;
}

// ─── 10. Obituaries ──────────────────────────────────────────────────────────
// Legacy.com — Long Island obituaries
async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Legacy.com obituaries for Long Island / Suffolk County
    const url = `https://www.legacy.com/us/obituaries/newsday/browse?dateRange=last30Days&location=suffolk-county-new-york`;
    const res = await fetchRendered(url);
    if (!res.ok) return leads;
    const html = await res.text();
    const $ = cheerio.load(html);

    $(".ObituaryCard, .obit-card, article.obituary, .obituary-item").each((_, el) => {
      const name = $(el).find(".name, h2, h3, .obit-name").first().text().trim();
      const date = $(el).find("time, .date, .obit-date").first().text().trim();
      const location = $(el).find(".location, .city, .obit-location").first().text().trim();
      const link = $(el).find("a").first().attr("href") || "";

      if (!name) return;

      leads.push({
        id: makeId(COUNTY, STATE, "Obituary", name + date),
        county: COUNTY, state: STATE,
        lead_type: "Obituary",
        owner_name: name,
        address: null,
        city: location || COUNTY_SEAT, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Obituary — ${name}${location ? ` (${location})` : ""}`,
        source_url: link || url,
        raw_data: JSON.stringify({ name, date, location }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] Obituaries error:`, e);
  }
  return leads;
}

// ─── 11. Fire Damage ─────────────────────────────────────────────────────────
// Source: Newsday fire reports (Legacy.com/Newsday) + Suffolk County permit system
// NOTE: NY State OFPC dataset 7kqe-6ixf was retired. Suffolk County GIS requires
// Bright Data proxy (works from Railway, blocked in sandbox). Newsday is the
// most reliable public source for recent structure fire addresses in Suffolk County.
async function scrapeFireDamage(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Primary: Newsday fire news search via Google News RSS (no auth required)
    const query = encodeURIComponent("Suffolk County house fire site:newsday.com");
    const rssUrl = `https://news.google.com/rss/search?q=${query}&hl=en-US&gl=US&ceid=US:en`;
    const res = await fetchWithRetry(rssUrl);
    if (!res.ok) return leads;
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });

    $('item').each((_, el) => {
      // Google News RSS uses plain text titles (not CDATA)
      const title = $(el).children('title').text().trim();
      const link = $(el).children('link').text().trim() || $(el).children('guid').text().trim();
      const pubDate = $(el).children('pubDate').text().trim();
      const description = $(el).children('description').text().trim();

      if (!title) return;

      // Include items that mention a residential fire in Suffolk County
      const isStructureFire = /house fire|home fire|structure fire|fire damage|blaze|dwelling fire|fire damages|sets.*house.*fire|fire.*house/i.test(
        title + ' ' + description
      );
      if (!isStructureFire) return;

      // Try to extract address from title/description
      const addrMatch = (title + ' ' + description).match(
        /(\d+\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+(?:St|Ave|Rd|Blvd|Dr|Ln|Way|Ct|Pl|Ter))\.?)/i
      );
      const address = addrMatch ? addrMatch[1] : null;

      // Extract town/city from title
      const cityMatch = (title + ' ' + description).match(
        /(?:in|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?),?\s+(?:NY|Long Island|Suffolk)/i
      );
      const city = cityMatch ? cityMatch[1] : COUNTY_SEAT;

      const id = link || `${pubDate}-${title.slice(0, 30)}`;
      leads.push({
        id: makeId(COUNTY, STATE, "Fire Damage", id),
        county: COUNTY, state: STATE,
        lead_type: "Fire Damage",
        owner_name: null,
        address,
        city,
        zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: pubDate ? formatDate(pubDate) : formatDate(fromDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Fire Damage — ${title}`,
        source_url: link || "https://www.newsday.com",
        raw_data: JSON.stringify({ title, link, pubDate, description }),
      });
    });

    // Secondary: Suffolk County Open Data — building permits for fire repair
    // (requires Bright Data proxy from Railway env; silently skips if proxy unavailable)
    if (process.env.BRIGHT_DATA_USER && process.env.BRIGHT_DATA_PASS) {
      const permitUrl =
        "https://data.suffolkcountyny.gov/resource/fire-permits.json" +
        `?$where=permit_type LIKE '%FIRE%' AND issued_date>='${fromDate}'&$limit=100`;
      const permitRes = await fetchWithRetry(permitUrl);
      if (permitRes.ok) {
        const permits = (await permitRes.json()) as Record<string, string>[];
        for (const p of permits) {
          const id = p.permit_number || p.id;
          if (!id) continue;
          leads.push({
            id: makeId(COUNTY, STATE, "Fire Damage", `permit-${id}`),
            county: COUNTY, state: STATE,
            lead_type: "Fire Damage",
            owner_name: p.owner_name || null,
            address: p.address || null,
            city: p.city || COUNTY_SEAT,
            zip: p.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: id,
            filing_date: formatDate(p.issued_date || fromDate),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null, sale_date: null, sale_amount: null,
            description: `Fire Repair Permit — ${p.description || p.permit_type || "Fire damage repair"}`,
            source_url: "https://data.suffolkcountyny.gov",
            raw_data: JSON.stringify(p),
          });
        }
      }
    }
  } catch (e) {
    console.error(`[${COUNTY} NY] Fire Damage error:`, e);
  }
  return leads;
}

// ─── 12. Water Shut-offs ─────────────────────────────────────────────────────
// Suffolk County Water Authority (SCWA) — service termination notices
// SCWA website requires JS rendering — use ScraperAPI
async function scrapeWaterShutoffs(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // SCWA does not publish an open API — scrape the SCWA service termination page
    const url = "https://www.scwa.com/customer-service/service-terminations";
    const res = await fetchRendered(url);
    if (!res.ok) {
      console.warn(`[${COUNTY} NY] Water Shut-offs: SCWA page unreachable via proxy`);
      return leads;
    }
    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr, .termination-row, .shutoff-row").each((_, row) => {
      const cells = $(row).find("td");
      if (cells.length < 2) return;
      const address = $(cells[0]).text().trim();
      const date = $(cells[1])?.text().trim() || "";
      const acct = $(cells[2])?.text().trim() || "";
      if (!address || /address|street/i.test(address)) return;
      leads.push({
        id: makeId(COUNTY, STATE, "Water Shut-off", acct || address),
        county: COUNTY, state: STATE,
        lead_type: "Water Shut-off",
        owner_name: null,
        address: address || null,
        city: COUNTY_SEAT, zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: acct || null,
        filing_date: formatDate(date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null, sale_date: null, sale_amount: null,
        description: `Water service termination — ${address}`,
        source_url: url,
        raw_data: JSON.stringify({ address, date, acct }),
      });
    });
  } catch (e) {
    console.error(`[${COUNTY} NY] Water Shut-offs error:`, e);
  }
  return leads;
}

// ─── Enrichment ──────────────────────────────────────────────────────────────
// Enrich leads with owner name + mailing address from Suffolk County assessor
async function enrichLeads(leads: Lead[]): Promise<Lead[]> {
  const CONCURRENCY = 5;
  const needsEnrich = leads.filter(
    (l) => !l.owner_name || !l.mailing_address
  );

  for (let i = 0; i < needsEnrich.length; i += CONCURRENCY) {
    const batch = needsEnrich.slice(i, i + CONCURRENCY);
    await Promise.allSettled(
      batch.map(async (lead) => {
        try {
          if (lead.address && (!lead.owner_name || !lead.mailing_address)) {
            const p = await lookupByAddress(lead.address, COUNTY, STATE);
            if (p) {
              if (!lead.owner_name) lead.owner_name = p.ownerName || null;
              if (!lead.mailing_address) {
                lead.mailing_address = p.mailingAddress || null;
                lead.mailing_city = p.mailingCity || null;
                lead.mailing_state = p.mailingState || null;
                lead.mailing_zip = p.mailingZip || null;
              }
            }
          } else if (lead.owner_name && !lead.address) {
            const props = await lookupOwnerProperties(lead.owner_name, COUNTY, STATE);
            if (props.length > 0) {
              const p = props[0];
              if (!lead.address) lead.address = p.address || null;
              if (!lead.mailing_address) {
                lead.mailing_address = p.mailingAddress || null;
                lead.mailing_city = p.mailingCity || null;
                lead.mailing_state = p.mailingState || null;
                lead.mailing_zip = p.mailingZip || null;
              }
            }
          }
        } catch {
          // enrichment failure is non-fatal
        }
      })
    );
  }
  return leads;
}

// ─── Main scrapeAll ───────────────────────────────────────────────────────────
export async function scrapeAll(
  fromDate: string,
  toDate: string,
  onProgress?: (msg: string) => void
): Promise<Lead[]> {
  const allLeads: Lead[] = [];

  const tasks: Promise<Lead[]>[] = [
    scrapeTaxDelinquent(fromDate, toDate),
    scrapePreForeclosure(fromDate, toDate),
    scrapeSheriffSales(fromDate, toDate),
    scrapeProbate(fromDate, toDate),
    scrapeBankruptcy(fromDate, toDate),
    scrapeCodeViolations(fromDate, toDate),
    scrapeVacantAbandoned(fromDate, toDate),
    scrapeDivorce(fromDate, toDate),
    scrapeFSBO(fromDate, toDate),
    scrapeObituaries(fromDate, toDate),
    scrapeFireDamage(fromDate, toDate),
    scrapeWaterShutoffs(fromDate, toDate),
  ];

  onProgress?.(`Starting Suffolk County, NY — 12 lead types...`);

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "fulfilled") allLeads.push(...r.value);
    else console.error(`[${COUNTY} NY] Scraper task failed:`, r.reason);
  }

  onProgress?.(`${COUNTY} NY raw: ${allLeads.length} leads — enriching...`);

  // Filter out-of-state owners (NY only)
  const inState = allLeads.filter(
    (l) =>
      !l.mailing_state ||
      l.mailing_state.toUpperCase() === "NY" ||
      l.mailing_state.toUpperCase() === "NEW YORK"
  );

  // Enrich with owner name + mailing address
  const enriched = await enrichLeads(inState);

  onProgress?.(
    `${COUNTY} NY total: ${enriched.length} leads (${allLeads.length - inState.length} out-of-state filtered)`
  );
  return enriched;
}
