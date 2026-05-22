/**
 * Suffolk County, NY — Full Lead Scraper
 *
 * All government sites that block cloud IPs are routed through ScraperAPI.
 * Direct fetch is used for public APIs (Craigslist, CourtListener) that don't block.
 *
 * Lead types:
 *  1. Pre-Foreclosure / Lis Pendens  — NYSCEF eFiling + Suffolk Clerk recorded docs
 *  2. Tax Delinquent                 — Suffolk County RPTSA + town tax portals
 *  3. Probate                        — NY WebSurrogate surrogate court
 *  4. Sheriff Sales                  — Suffolk County Sheriff civil bureau
 *  5. FSBO                           — Craigslist Long Island
 *  6. Obituaries                     — Legacy.com / Newsday
 *  7. Code Violations                — Suffolk Open Data + town portals
 *  8. Bankruptcy                     — CourtListener RECAP API (EDNY)
 *  9. Divorce                        — NYSCEF Supreme Court matrimonial filings
 */

import * as cheerio from "cheerio";
import { Lead, makeId, formatDate, fetchWithRetry, proxiedFetch } from "./base.js";

const COUNTY = "Suffolk";
const STATE = "NY";

function makeLead(type: string, data: Partial<Lead>): Lead {
  return {
    id: makeId(COUNTY, STATE, type, data.case_number || data.address || data.owner_name || data.description || String(Date.now())),
    county: COUNTY,
    state: STATE,
    lead_type: type,
    owner_name: null,
    address: null,
    city: null,
    zip: null,
    mailing_address: null,
    mailing_city: null,
    mailing_state: null,
    mailing_zip: null,
    case_number: null,
    filing_date: null,
    assessed_value: null,
    tax_year: null,
    lender: null,
    loan_amount: null,
    sale_date: null,
    sale_amount: null,
    description: null,
    source_url: null,
    raw_data: null,
    ...data,
  };
}

// Convert YYYY-MM-DD to MM/DD/YYYY for NYSCEF date params
function toNyscefDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 1. PRE-FORECLOSURE / LIS PENDENS — NYSCEF
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeLisPendens(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const caseTypes = [
    "Foreclosure+%28Residential+Mortgage%29",
    "Mortgage+Foreclosure",
  ];

  for (const caseType of caseTypes) {
    try {
      const url =
        `https://iapps.courts.state.ny.us/nyscef/CaseSearch` +
        `?IndexNumber=&courtType=Supreme+Court&county=Suffolk` +
        `&efiling=Y&casetype=${caseType}` +
        `&dateFrom=${encodeURIComponent(toNyscefDate(fromDate))}` +
        `&dateTo=${encodeURIComponent(toNyscefDate(toDate))}`;

      const res = await proxiedFetch(url, { render: true });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      $("table tr").each((i, row) => {
        if (i === 0) return;
        const cells = $(row).find("td");
        if (cells.length < 3) return;
        const caseNum = $(cells[0]).text().trim();
        const parties = $(cells[1]).text().trim();
        const filedDate = $(cells[2]).text().trim();
        if (!caseNum || caseNum === "Index Number") return;

        const parts = parties.split(/\s+v\.?\s+/i);
        const plaintiff = parts[0]?.trim() || null;
        const defendant = parts[1]?.trim() || null;

        leads.push(makeLead("Pre-Foreclosure", {
          owner_name: defendant,
          lender: plaintiff,
          case_number: caseNum,
          filing_date: formatDate(filedDate),
          description: `Residential Mortgage Foreclosure — ${parties}`,
          source_url: url,
          raw_data: JSON.stringify({ caseNum, parties, filedDate }),
        }));
      });
    } catch (e) {
      console.error(`[Suffolk NY] Pre-Foreclosure (${caseType}) error:`, e);
    }
  }

  // Fallback: Suffolk County Clerk recorded lis pendens via iGovServices
  if (leads.length === 0) {
    try {
      const clerkUrl =
        `https://suffolkcountyny.igovservices.com/Property/SearchResults` +
        `?SearchType=LisPendens&DateFrom=${fromDate}&DateTo=${toDate}`;
      const res = await proxiedFetch(clerkUrl);
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table tr").each((i, row) => {
          if (i === 0) return;
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const ownerName = $(cells[0]).text().trim();
          const address = $(cells[1]).text().trim();
          const date = $(cells[2])?.text().trim() || "";
          if (!ownerName) return;
          leads.push(makeLead("Pre-Foreclosure", {
            owner_name: ownerName,
            address,
            filing_date: formatDate(date),
            source_url: clerkUrl,
          }));
        });
      }
    } catch (e) {
      console.error("[Suffolk NY] Clerk lis pendens fallback error:", e);
    }
  }

  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 2. TAX DELINQUENT — Suffolk County RPTSA + Tyler Portico
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  // Primary: Suffolk County RPTSA tax lien sale page
  const rptUrls = [
    "https://www.suffolkcountyny.gov/Departments/Real-Property-Tax-Service-Agency/Tax-Lien-Sale",
    "https://www.suffolkcountyny.gov/Departments/Real-Property-Tax-Service-Agency",
    "https://www.suffolkcountyny.gov/Departments/Treasurer/Delinquent-Taxes",
  ];

  for (const url of rptUrls) {
    try {
      const res = await proxiedFetch(url);
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);

      // Parse any table rows with delinquent property data
      $("table tr").each((i, row) => {
        if (i === 0) return;
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const col0 = $(cells[0]).text().trim();
        const col1 = $(cells[1]).text().trim();
        const col2 = $(cells[2])?.text().trim() || "";
        const col3 = $(cells[3])?.text().trim() || "";
        if (!col0 || col0.length < 3) return;

        leads.push(makeLead("Tax Delinquent", {
          owner_name: col0,
          address: col1,
          assessed_value: col2 || col3,
          tax_year: new Date().getFullYear().toString(),
          source_url: url,
        }));
      });

      if (leads.length > 0) break;
    } catch (e) {
      console.error(`[Suffolk NY] Tax Delinquent (${url}) error:`, e);
    }
  }

  // Fallback: Tyler Portico tax portal search
  if (leads.length === 0) {
    try {
      const porticoUrl =
        "https://suffolkcountyny.tylerportico.com/css/citizen-selfservice/real-estate/home";
      const res = await proxiedFetch(porticoUrl, { render: true });
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table tr, .property-row").each((i, row) => {
          if (i === 0) return;
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const ownerName = $(cells[0]).text().trim();
          const address = $(cells[1]).text().trim();
          if (!ownerName || ownerName.length < 3) return;
          leads.push(makeLead("Tax Delinquent", {
            owner_name: ownerName,
            address,
            tax_year: new Date().getFullYear().toString(),
            source_url: porticoUrl,
          }));
        });
      }
    } catch (e) {
      console.error("[Suffolk NY] Tyler Portico error:", e);
    }
  }

  // Fallback: Town-level delinquent tax lists
  if (leads.length === 0) {
    const townUrls = [
      { town: "Babylon", url: "https://www.townofbabylon.com/receiver-of-taxes" },
      { town: "Huntington", url: "https://www.huntingtonny.gov/content/1/2/3/4/5/Default.aspx" },
      { town: "Islip", url: "https://www.townofislip-ny.gov/departments/receiver-of-taxes" },
      { town: "Brookhaven", url: "https://www.brookhavenny.gov/Departments/Receiver-of-Taxes" },
    ];
    for (const { town, url } of townUrls) {
      try {
        const res = await proxiedFetch(url);
        if (!res.ok) continue;
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table tr").each((i, row) => {
          if (i === 0) return;
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const ownerName = $(cells[0]).text().trim();
          const address = $(cells[1]).text().trim();
          const amount = $(cells[2])?.text().trim() || "";
          if (!ownerName || ownerName.length < 3) return;
          leads.push(makeLead("Tax Delinquent", {
            owner_name: ownerName,
            address,
            city: town,
            assessed_value: amount,
            tax_year: new Date().getFullYear().toString(),
            source_url: url,
          }));
        });
        if (leads.length > 0) break;
      } catch {}
    }
  }

  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 3. PROBATE — NY WebSurrogate
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeProbate(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    // Step 1: Get CSRF token
    const mainRes = await proxiedFetch("https://websurrogates.nycourts.gov/");
    const mainHtml = mainRes.ok ? await mainRes.text() : "";
    const $ = cheerio.load(mainHtml);
    const token = ($('input[name="__RequestVerificationToken"]').val() as string) || "";

    const caseTypes = ["Probate", "Administration", "Voluntary Administration"];
    for (const caseType of caseTypes) {
      try {
        const formBody = new URLSearchParams({
          __RequestVerificationToken: token,
          County: "Suffolk",
          DateFrom: fromDate,
          DateTo: toDate,
          CaseType: caseType,
          LastName: "",
          FirstName: "",
        }).toString();

        const searchRes = await proxiedFetch("https://websurrogates.nycourts.gov/Case/Search", {
          method: "POST",
          body: formBody,
          contentType: "application/x-www-form-urlencoded",
        });
        if (!searchRes.ok) continue;

        const searchHtml = await searchRes.text();
        const $s = cheerio.load(searchHtml);

        $s("table tr").each((i, row) => {
          if (i === 0) return;
          const cells = $s(row).find("td");
          if (cells.length < 3) return;
          const caseNum = $s(cells[0]).text().trim();
          const decedentName = $s(cells[1]).text().trim();
          const filingDate = $s(cells[2]).text().trim();
          if (!decedentName || decedentName.length < 2) return;

          leads.push(makeLead("Probate", {
            owner_name: decedentName,
            case_number: caseNum,
            filing_date: formatDate(filingDate),
            description: `${caseType} — ${decedentName}`,
            source_url: "https://websurrogates.nycourts.gov/",
            raw_data: JSON.stringify({ caseNum, decedentName, filingDate, caseType }),
          }));
        });
      } catch (e) {
        console.error(`[Suffolk NY] Probate (${caseType}) error:`, e);
      }
    }
  } catch (e) {
    console.error("[Suffolk NY] Probate error:", e);
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 4. SHERIFF SALES — Suffolk County Sheriff
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeSherifffSales(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  const urls = [
    "https://www.suffolkcountysheriff.com/civil-process/real-property-auction/",
    "https://www.suffolkcountysheriff.com/civil/real-property-auction",
    "https://www.suffolkcountysheriff.com/civil-process/",
    "https://www.suffolkcountysheriff.com/",
  ];

  for (const url of urls) {
    try {
      const res = await proxiedFetch(url);
      if (!res.ok) continue;
      const html = await res.text();
      if (html.length < 500) continue;
      const $ = cheerio.load(html);

      // Table-based listings
      $("table tr").each((i, row) => {
        if (i === 0) return;
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const col0 = $(cells[0]).text().trim();
        const col1 = $(cells[1]).text().trim();
        const col2 = $(cells[2])?.text().trim() || "";
        const col3 = $(cells[3])?.text().trim() || "";
        if (!col0 || col0.length < 3) return;
        leads.push(makeLead("Sheriff Sale", {
          owner_name: col0,
          address: col1,
          sale_date: formatDate(col2) || col2,
          sale_amount: col3,
          source_url: url,
        }));
      });

      // Card/article-based listings
      $(".sale-item, .auction-item, .property-listing, article, .wp-block-group").each((_, el) => {
        const text = $(el).text().trim();
        if (!text || text.length < 20) return;
        const addressMatch = text.match(/\d+\s+[\w\s]+(?:St|Ave|Rd|Dr|Ln|Blvd|Way|Ct|Pl|Ter|Pkwy)/i);
        const dateMatch = text.match(/\b\d{1,2}\/\d{1,2}\/\d{2,4}\b/);
        const amountMatch = text.match(/\$[\d,]+/);
        if (!addressMatch && !dateMatch) return;
        leads.push(makeLead("Sheriff Sale", {
          address: addressMatch?.[0] || null,
          sale_date: dateMatch?.[0] || null,
          sale_amount: amountMatch?.[0] || null,
          description: text.slice(0, 200),
          source_url: url,
        }));
      });

      if (leads.length > 0) break;
    } catch (e) {
      console.error(`[Suffolk NY] Sheriff Sales (${url}) error:`, e);
    }
  }

  // Fallback: auction.com Suffolk County listings
  if (leads.length === 0) {
    try {
      const auctionRes = await proxiedFetch(
        "https://www.auction.com/residential/new-york/suffolk-county/"
      );
      if (auctionRes.ok) {
        const html = await auctionRes.text();
        const $ = cheerio.load(html);
        $("[data-testid='property-card'], .property-card, .listing-card").each((_, el) => {
          const address = $(el).find("[data-testid='address'], .address, h3").first().text().trim();
          const price = $(el).find("[data-testid='price'], .price").first().text().trim();
          const date = $(el).find(".auction-date, .sale-date").first().text().trim();
          if (!address) return;
          leads.push(makeLead("Sheriff Sale", {
            address,
            sale_amount: price,
            sale_date: date,
            source_url: "https://www.auction.com/residential/new-york/suffolk-county/",
          }));
        });
      }
    } catch (e) {
      console.error("[Suffolk NY] auction.com fallback error:", e);
    }
  }

  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 5. FSBO — Craigslist Long Island
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeCraigslistFSBO(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const queries = [
    "https://longisland.craigslist.org/jsonsearch/rea/?query=for+sale+by+owner&srchType=A",
    "https://longisland.craigslist.org/jsonsearch/rea/?query=fsbo&srchType=A",
    "https://longisland.craigslist.org/jsonsearch/rea/?query=owner+selling&srchType=A",
  ];

  for (const searchUrl of queries) {
    try {
      const res = await fetchWithRetry(searchUrl);
      if (!res.ok) continue;
      const json = await res.text();
      let items: unknown[] = [];
      try {
        const parsed = JSON.parse(json);
        if (Array.isArray(parsed)) {
          items = Array.isArray(parsed[0]) ? parsed[0] : parsed;
        }
      } catch { continue; }

      for (const item of items) {
        if (typeof item !== "object" || !item) continue;
        const i = item as Record<string, unknown>;

        if (i.NumPosts && i.PostingID) {
          // Cluster — fetch individual listings
          try {
            const clusterRes = await fetchWithRetry(
              `https://longisland.craigslist.org/jsonsearch/rea/?query=fsbo&s=${i.PostingID}`
            );
            if (!clusterRes.ok) continue;
            const clusterData = JSON.parse(await clusterRes.text());
            const clusterItems = Array.isArray(clusterData[0]) ? clusterData[0] : [];
            for (const ci of clusterItems) {
              if (typeof ci !== "object" || !ci) continue;
              const c = ci as Record<string, unknown>;
              if (!c.PostingID) continue;
              leads.push(makeLead("FSBO", {
                address: String(c.PostingTitle || ""),
                city: "Long Island, NY",
                sale_amount: c.Ask ? String(c.Ask) : null,
                description: String(c.PostingTitle || ""),
                source_url: `https://longisland.craigslist.org/rea/${c.PostingID}.html`,
              }));
            }
          } catch {}
        } else if (i.PostingID) {
          leads.push(makeLead("FSBO", {
            address: String(i.PostingTitle || ""),
            city: "Long Island, NY",
            sale_amount: i.Ask ? String(i.Ask) : null,
            description: String(i.PostingTitle || ""),
            source_url: `https://longisland.craigslist.org/rea/${i.PostingID}.html`,
          }));
        }
      }
    } catch (e) {
      console.error(`[Suffolk NY] FSBO (${searchUrl}) error:`, e);
    }
  }

  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 6. OBITUARIES — Legacy.com / Newsday
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  // Legacy.com Newsday obituaries
  for (let page = 1; page <= 4; page++) {
    try {
      const url =
        `https://www.legacy.com/us/obituaries/newsday/browse` +
        `?dateRange=last30Days&countryId=1&regionId=35&page=${page}`;
      const res = await proxiedFetch(url);
      if (!res.ok) break;
      const html = await res.text();

      // Extract __NEXT_DATA__ JSON
      const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
      if (!match) break;

      try {
        const nd = JSON.parse(match[1]);
        const queries = nd?.props?.pageProps?.dehydratedState?.queries || [];
        let found = 0;

        for (const q of queries) {
          const data = q?.state?.data;
          if (!data) continue;
          const obits =
            data?.obituaries || data?.results || data?.items ||
            (Array.isArray(data) ? data : null);
          if (!Array.isArray(obits)) continue;

          for (const obit of obits) {
            const firstName = obit?.firstName || obit?.first_name || "";
            const lastName = obit?.lastName || obit?.last_name || "";
            const name = obit?.name || obit?.fullName || `${firstName} ${lastName}`.trim();
            if (!name || name.length < 3) continue;

            const pubDate = obit?.publishDate || obit?.deathDate || obit?.date || "";
            const location = obit?.cityState || obit?.location || "Suffolk County, NY";
            const obUrl = obit?.url || obit?.obituaryUrl || "";

            leads.push(makeLead("Obituary", {
              owner_name: name,
              city: location,
              filing_date: formatDate(pubDate),
              description: `Obituary — ${name}, ${location}`,
              source_url: obUrl ? `https://www.legacy.com${obUrl}` : url,
              raw_data: JSON.stringify({ name, location, pubDate }),
            }));
            found++;
          }
        }

        if (found === 0) break; // No more pages
      } catch {}

      await new Promise(r => setTimeout(r, 800));
    } catch (e) {
      console.error(`[Suffolk NY] Obituaries (page ${page}) error:`, e);
      break;
    }
  }

  // Fallback: Newsday obituaries page
  if (leads.length === 0) {
    try {
      const res = await proxiedFetch("https://www.newsday.com/obituaries");
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $(".obit-item, .obituary-item, article.obit, [class*='obit']").each((_, el) => {
          const name = $(el).find("h2, h3, .name, [class*='name']").first().text().trim();
          const date = $(el).find(".date, time, [class*='date']").first().text().trim();
          const link = $(el).find("a").first().attr("href") || "";
          if (!name || name.length < 3) return;
          leads.push(makeLead("Obituary", {
            owner_name: name,
            filing_date: formatDate(date),
            city: "Suffolk County, NY",
            source_url: link.startsWith("http") ? link : `https://www.newsday.com${link}`,
          }));
        });
      }
    } catch (e) {
      console.error("[Suffolk NY] Newsday obituaries fallback error:", e);
    }
  }

  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 7. CODE VIOLATIONS — Suffolk Open Data + Town Portals
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  // Suffolk County Open Data portal
  const openDataUrls = [
    `https://data.suffolkcountyny.gov/resource/code-violations.json?$where=violation_date>='${fromDate}'&$limit=500&$order=violation_date+DESC`,
    `https://data.suffolkcountyny.gov/resource/building-violations.json?$where=date_issued>='${fromDate}'&$limit=500`,
  ];

  for (const url of openDataUrls) {
    try {
      const res = await fetchWithRetry(url);
      if (!res.ok) continue;
      const json = await res.text();
      if (!json.startsWith("[")) continue;
      const records = JSON.parse(json);
      for (const r of records) {
        leads.push(makeLead("Code Violation", {
          owner_name: r.owner_name || r.property_owner || null,
          address: r.address || r.location || r.street_address || null,
          city: r.city || r.municipality || null,
          zip: r.zip || r.postal_code || null,
          filing_date: formatDate(r.violation_date || r.date_issued || null),
          case_number: r.case_number || r.violation_number || r.id || null,
          description: r.violation_type || r.description || r.violation_description || null,
          source_url: "https://data.suffolkcountyny.gov/",
          raw_data: JSON.stringify(r),
        }));
      }
      if (leads.length > 0) break;
    } catch (e) {
      console.error(`[Suffolk NY] Code Violations open data error:`, e);
    }
  }

  // Town of Babylon
  if (leads.length < 5) {
    try {
      const res = await proxiedFetch("https://www.townofbabylon.com/code-enforcement");
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table tr").each((i, row) => {
          if (i === 0) return;
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const address = $(cells[0]).text().trim();
          const desc = $(cells[1]).text().trim();
          const date = $(cells[2])?.text().trim() || "";
          if (!address || address.length < 5) return;
          leads.push(makeLead("Code Violation", {
            address,
            city: "Babylon",
            filing_date: formatDate(date),
            description: desc,
            source_url: "https://www.townofbabylon.com/code-enforcement",
          }));
        });
      }
    } catch {}
  }

  // Town of Islip
  if (leads.length < 5) {
    try {
      const res = await proxiedFetch("https://www.townofislip-ny.gov/departments/code-enforcement");
      if (res.ok) {
        const html = await res.text();
        const $ = cheerio.load(html);
        $("table tr").each((i, row) => {
          if (i === 0) return;
          const cells = $(row).find("td");
          if (cells.length < 2) return;
          const address = $(cells[0]).text().trim();
          const desc = $(cells[1]).text().trim();
          if (!address || address.length < 5) return;
          leads.push(makeLead("Code Violation", {
            address,
            city: "Islip",
            description: desc,
            source_url: "https://www.townofislip-ny.gov/departments/code-enforcement",
          }));
        });
      }
    } catch {}
  }

  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 8. BANKRUPTCY — CourtListener RECAP API (EDNY)
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  // CourtListener RECAP API — Eastern District of NY bankruptcy court
  try {
    const url =
      `https://www.courtlistener.com/api/rest/v4/dockets/` +
      `?court=nyeb&date_filed__gte=${fromDate}&date_filed__lte=${toDate}` +
      `&order_by=-date_filed&page_size=100`;

    const res = await fetchWithRetry(url, {
      headers: {
        "User-Agent": "Atlas/1.0 (atlas@easybuttonrealestate.com)",
        Accept: "application/json",
      },
    });

    if (res.ok) {
      const data = await res.json() as { results?: unknown[] };
      const results = data?.results || [];
      for (const r of results as Record<string, unknown>[]) {
        const caseName = String(r.case_name || "");
        const caseNum = String(r.docket_number || "");
        const filedDate = String(r.date_filed || "");
        const chapterMatch = caseNum.match(/\b(7|11|13)\b/);
        const chapter = chapterMatch ? `Chapter ${chapterMatch[1]}` : "Bankruptcy";

        leads.push(makeLead("Bankruptcy", {
          owner_name: caseName,
          case_number: caseNum,
          filing_date: formatDate(filedDate),
          description: `${chapter} — ${caseName}`,
          source_url: r.absolute_url
            ? `https://www.courtlistener.com${r.absolute_url}`
            : "https://www.courtlistener.com/",
          raw_data: JSON.stringify({ caseName, caseNum, filedDate, chapter }),
        }));
      }
    }
  } catch (e) {
    console.error("[Suffolk NY] Bankruptcy (CourtListener) error:", e);
  }

  // Fallback: PACER EDNY RSS feed
  if (leads.length === 0) {
    try {
      const rssRes = await fetchWithRetry(
        "https://ecf.nyeb.uscourts.gov/cgi-bin/rss_outside.pl"
      );
      if (rssRes.ok) {
        const xml = await rssRes.text();
        const $ = cheerio.load(xml, { xmlMode: true });
        $("item").each((_, item) => {
          const title = $(item).find("title").text().trim();
          const link = $(item).find("link").text().trim();
          const pubDate = $(item).find("pubDate").text().trim();
          const desc = $(item).find("description").text().trim();
          if (!title) return;

          // Filter for Suffolk County (Office 8)
          if (!desc.toLowerCase().includes("suffolk") && !desc.includes("8")) return;

          const parts = title.split(/\s+v\.?\s+/i);
          leads.push(makeLead("Bankruptcy", {
            owner_name: parts[0]?.trim() || title,
            filing_date: formatDate(pubDate),
            description: title,
            source_url: link || "https://ecf.nyeb.uscourts.gov/",
          }));
        });
      }
    } catch (e) {
      console.error("[Suffolk NY] Bankruptcy (PACER RSS) error:", e);
    }
  }

  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 9. DIVORCE — NYSCEF Supreme Court matrimonial filings
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url =
      `https://iapps.courts.state.ny.us/nyscef/CaseSearch` +
      `?IndexNumber=&courtType=Supreme+Court&county=Suffolk` +
      `&efiling=Y&casetype=Matrimonial` +
      `&dateFrom=${encodeURIComponent(toNyscefDate(fromDate))}` +
      `&dateTo=${encodeURIComponent(toNyscefDate(toDate))}`;

    const res = await proxiedFetch(url, { render: true });
    if (!res.ok) return leads;
    const html = await res.text();
    const $ = cheerio.load(html);

    $("table tr").each((i, row) => {
      if (i === 0) return;
      const cells = $(row).find("td");
      if (cells.length < 3) return;
      const indexNum = $(cells[0]).text().trim();
      const caseTitle = $(cells[1]).text().trim();
      const filedDate = $(cells[2]).text().trim();
      if (!caseTitle || caseTitle.length < 3) return;

      const parts = caseTitle.split(/\s+v\.?\s+/i);
      const ownerName = parts.join(" & ");

      leads.push(makeLead("Divorce", {
        owner_name: ownerName,
        case_number: indexNum,
        filing_date: formatDate(filedDate),
        description: `Matrimonial / Divorce filing — ${caseTitle}`,
        source_url: `https://iapps.courts.state.ny.us/nyscef/CaseSearch?IndexNumber=${encodeURIComponent(indexNum)}`,
        raw_data: JSON.stringify({ indexNum, caseTitle, filedDate }),
      }));
    });
  } catch (e) {
    console.error("[Suffolk NY] Divorce error:", e);
  }
  return leads;
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN EXPORT
// ═══════════════════════════════════════════════════════════════════════════════
export async function scrapeAll(fromDate: string, toDate: string): Promise<Lead[]> {
  console.log(`[Suffolk NY] Scraping ${fromDate} → ${toDate}`);

  const tasks = [
    { name: "Pre-Foreclosure", fn: () => scrapeLisPendens(fromDate, toDate) },
    { name: "Tax Delinquent",  fn: () => scrapeTaxDelinquent(fromDate, toDate) },
    { name: "Probate",         fn: () => scrapeProbate(fromDate, toDate) },
    { name: "Sheriff Sales",   fn: () => scrapeSherifffSales(fromDate, toDate) },
    { name: "FSBO",            fn: () => scrapeCraigslistFSBO(fromDate, toDate) },
    { name: "Obituaries",      fn: () => scrapeObituaries(fromDate, toDate) },
    { name: "Code Violations", fn: () => scrapeCodeViolations(fromDate, toDate) },
    { name: "Bankruptcy",      fn: () => scrapeBankruptcy(fromDate, toDate) },
    { name: "Divorce",         fn: () => scrapeDivorce(fromDate, toDate) },
  ];

  const allLeads: Lead[] = [];
  const TASK_TIMEOUT_MS = 90_000; // 90s per source

  for (const task of tasks) {
    try {
      console.log(`[Suffolk NY] Starting: ${task.name}`);
      const leads = await Promise.race([
        task.fn(),
        new Promise<Lead[]>((_, reject) =>
          setTimeout(() => reject(new Error(`Timeout after 90s`)), TASK_TIMEOUT_MS)
        ),
      ]);
      console.log(`[Suffolk NY] ${task.name}: ${leads.length} leads`);
      allLeads.push(...leads);
    } catch (e) {
      console.error(`[Suffolk NY] ${task.name} failed:`, (e as Error).message);
    }
  }

  console.log(`[Suffolk NY] Total: ${allLeads.length} leads`);
  return allLeads;
}
