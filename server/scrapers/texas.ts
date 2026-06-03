/**
 * Texas County Scrapers — Nueces, Kleberg, Jim Wells, San Patricio, Bexar
 *
 * Data Sources (verified):
 * - Tax Delinquent:    County Appraisal District ArcGIS APIs + LGBS tax sale portal
 * - Pre-Foreclosure:   publicsearch.us county clerk portals (WebSocket) + bexar.org
 * - Sheriff Sales:     sanpatricio.texas.sheriffsaleauctions.com + bexar.org
 * - Probate:           publicsearch.us district court filings (WebSocket)
 * - Bankruptcy:        PACER RSS — TX Southern (Corpus Christi) + TX Western (San Antonio)
 * - Code Violations:   Corpus Christi open data + San Antonio open data
 * - Divorce:           publicsearch.us district court filings (WebSocket)
 * - FSBO:              Craigslist corpuschristi + sanantonio
 * - Obituaries:        Legacy.com
 * - Fire Damage:       TX State Fire Marshal open data
 * - Water Shut-offs:   City utility portals
 */

import * as cheerio from "cheerio";
import { Lead, CountyConfig, makeId, formatDate, fetchWithRetry } from "./base.js";
import { lookupOwnerProperties, lookupByAddress } from "./assessor.js";
import { scrapePublicSearch, extractAddressFromDoc } from "./publicsearch.js";

const ENRICH_CONCURRENCY = 5;

const TX_COUNTIES = ["Nueces", "Kleberg", "Jim Wells", "San Patricio", "Bexar"] as const;
type TxCounty = (typeof TX_COUNTIES)[number];

const COUNTY_SEATS: Record<TxCounty, string> = {
  Nueces: "Corpus Christi",
  Kleberg: "Kingsville",
  "Jim Wells": "Alice",
  "San Patricio": "Sinton",
  Bexar: "San Antonio",
};

const CRAIGSLIST_CITIES: Record<TxCounty, string> = {
  Nueces: "corpuschristi",
  Kleberg: "corpuschristi",
  "Jim Wells": "corpuschristi",
  "San Patricio": "corpuschristi",
  Bexar: "sanantonio",
};

// ─── 1. Tax Delinquent ───────────────────────────────────────────────────────

async function scrapeBexarTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Bexar";
  try {
    const url = "https://maps.bexar.org/arcgis/rest/services/Parcels/MapServer/0/query";
    const params = new URLSearchParams({
      where: "DELINQUENT_TAX = 'Y' OR DELINQUENT_AMT > 0",
      outFields: "PROP_ID,OWNER_NM,SITUS_ADDR,SITUS_CITY,SITUS_ZIP,TAX_YEAR,DELINQUENT_AMT",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "500",
    });
    const res = await fetchWithRetry(`${url}?${params}`);
    if (res.ok) {
      const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
      for (const f of (data.features || [])) {
        const a = f.attributes;
        if (!a.PROP_ID) continue;
        leads.push({
          id: makeId(COUNTY, "TX", "Tax Delinquent", a.PROP_ID),
          county: COUNTY, state: "TX",
          lead_type: "Tax Delinquent",
          owner_name: a.OWNER_NM || null,
          address: a.SITUS_ADDR || null,
          city: a.SITUS_CITY || COUNTY_SEATS[COUNTY],
          zip: a.SITUS_ZIP || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: a.PROP_ID,
          filing_date: null,
          assessed_value: null,
          tax_year: a.TAX_YEAR || null,
          lender: null, loan_amount: null,
          sale_date: null,
          sale_amount: a.DELINQUENT_AMT ? `$${a.DELINQUENT_AMT}` : null,
          description: `Delinquent taxes owed: $${a.DELINQUENT_AMT || "unknown"}`,
          source_url: "https://www.bexar.org/1515/Tax-Assessor-Collector",
          raw_data: JSON.stringify(a),
        });
      }
    }
  } catch (e) {
    console.error(`[Bexar TX] Tax Delinquent error:`, e);
  }
  return leads;
}

async function scrapeNueceTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Nueces";
  try {
    const url = "https://gis.bisclient.com/nuecescad/rest/services/Parcels/FeatureServer/0/query";
    const params = new URLSearchParams({
      where: "DELINQUENT = 'Y' OR DELINQUENT_AMT > 0",
      outFields: "PARCEL_ID,OWNER_NAME,SITUS_ADDR,SITUS_CITY,SITUS_ZIP,TAX_YEAR,DELINQUENT_AMT",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "500",
    });
    const res = await fetchWithRetry(`${url}?${params}`);
    if (res.ok) {
      const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
      for (const f of (data.features || [])) {
        const a = f.attributes;
        if (!a.PARCEL_ID) continue;
        leads.push({
          id: makeId(COUNTY, "TX", "Tax Delinquent", a.PARCEL_ID),
          county: COUNTY, state: "TX",
          lead_type: "Tax Delinquent",
          owner_name: a.OWNER_NAME || null,
          address: a.SITUS_ADDR || null,
          city: a.SITUS_CITY || COUNTY_SEATS[COUNTY],
          zip: a.SITUS_ZIP || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: a.PARCEL_ID,
          filing_date: null,
          assessed_value: null,
          tax_year: a.TAX_YEAR || null,
          lender: null, loan_amount: null,
          sale_date: null,
          sale_amount: a.DELINQUENT_AMT ? `$${a.DELINQUENT_AMT}` : null,
          description: `Delinquent taxes — Nueces County`,
          source_url: "https://nuecescad.net/",
          raw_data: JSON.stringify(a),
        });
      }
    }
  } catch (e) {
    console.error(`[Nueces TX] Tax Delinquent error:`, e);
  }
  return leads;
}

async function scrapeSanPatricioTaxDelinquent(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "San Patricio";
  try {
    const url = "https://gis.bisclient.com/sanpatriciocad/rest/services/Parcels/FeatureServer/0/query";
    const params = new URLSearchParams({
      where: "DELINQUENT = 'Y' OR DELINQUENT_AMT > 0",
      outFields: "PARCEL_ID,OWNER_NAME,SITUS_ADDR,SITUS_CITY,SITUS_ZIP,TAX_YEAR,DELINQUENT_AMT",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "300",
    });
    const res = await fetchWithRetry(`${url}?${params}`);
    if (res.ok) {
      const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
      for (const f of (data.features || [])) {
        const a = f.attributes;
        if (!a.PARCEL_ID) continue;
        leads.push({
          id: makeId(COUNTY, "TX", "Tax Delinquent", a.PARCEL_ID),
          county: COUNTY, state: "TX",
          lead_type: "Tax Delinquent",
          owner_name: a.OWNER_NAME || null,
          address: a.SITUS_ADDR || null,
          city: a.SITUS_CITY || COUNTY_SEATS[COUNTY],
          zip: a.SITUS_ZIP || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: a.PARCEL_ID,
          filing_date: null,
          assessed_value: null,
          tax_year: a.TAX_YEAR || null,
          lender: null, loan_amount: null,
          sale_date: null,
          sale_amount: a.DELINQUENT_AMT ? `$${a.DELINQUENT_AMT}` : null,
          description: `Delinquent taxes — San Patricio County`,
          source_url: "https://sanpatcad.org/",
          raw_data: JSON.stringify(a),
        });
      }
    }
  } catch (e) {
    console.error(`[San Patricio TX] Tax Delinquent error:`, e);
  }
  return leads;
}

async function scrapeLGBSTaxSales(county: TxCounty, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  try {
    const url = `https://taxsales.lgbs.com/api/properties?county=${encodeURIComponent(county)}&state=TX&page=1&pageSize=200`;
    const res = await fetchWithRetry(url, {
      headers: { "Accept": "application/json", "Referer": "https://taxsales.lgbs.com/" },
    });
    if (res.ok) {
      const data = await res.json() as { properties?: any[] };
      for (const p of (data.properties || [])) {
        leads.push({
          id: makeId(county, "TX", "Tax Delinquent", p.propertyId || p.accountNumber || String(Math.random())),
          county, state: "TX",
          lead_type: "Tax Delinquent",
          owner_name: p.ownerName || null,
          address: p.propertyAddress || null,
          city: p.city || COUNTY_SEATS[county],
          zip: p.zip || null,
          mailing_address: p.mailingAddress || null,
          mailing_city: p.mailingCity || null,
          mailing_state: p.mailingState || null,
          mailing_zip: p.mailingZip || null,
          case_number: p.accountNumber || p.propertyId || null,
          filing_date: null,
          assessed_value: p.assessedValue ? `$${p.assessedValue}` : null,
          tax_year: p.taxYear || null,
          lender: null, loan_amount: null,
          sale_date: p.saleDate || null,
          sale_amount: p.amountDue ? `$${p.amountDue}` : null,
          description: `Tax delinquent — ${county} County, TX`,
          source_url: "https://taxsales.lgbs.com/",
          raw_data: JSON.stringify(p),
        });
      }
    }
  } catch (e) {
    console.error(`[${county} TX] LGBS Tax Sales error:`, e);
  }
  return leads;
}

// ─── 2. Pre-Foreclosure / Lis Pendens ────────────────────────────────────────

async function scrapePublicSearchPreForeclosure(county: TxCounty, fromDate: string, toDate: string): Promise<Lead[]> {
  const portals: Partial<Record<TxCounty, string>> = {
    Nueces: "nueces",
    "Jim Wells": "jimwells",
    "San Patricio": "sanpatricio",
  };
  const slug = portals[county];
  if (!slug) return [];

  const [lisResults, nodResults] = await Promise.all([
    scrapePublicSearch(slug, "tx", "LIS PENDENS", fromDate, toDate),
    scrapePublicSearch(slug, "tx", "NOTICE OF DEFAULT", fromDate, toDate),
  ]);
  const rawDocs = [...lisResults, ...nodResults];

  type RawDoc = { id: string; ownerName: string | null; address: string | null; caseNumber: string | null; filingDate: string | null; lender: string | null; docType: string; raw: string };
  const docs: RawDoc[] = rawDocs.map(doc => ({
    id: doc.instrumentNumber || String(doc.docId),
    ownerName: doc.grantor[0] || null,
    address: extractAddressFromDoc(doc),
    caseNumber: doc.instrumentNumber || null,
    filingDate: doc.recordedDate || null,
    lender: doc.grantee[0] || null,
    docType: doc.docType || "Lis Pendens",
    raw: JSON.stringify(doc),
  }));

  const leads: Lead[] = [];
  const sourceUrl = `https://${slug}.tx.publicsearch.us/`;

  // Enrich docs missing address by owner name lookup
  const needNameEnrich = docs.filter(d => !d.address && d.ownerName);
  for (let i = 0; i < needNameEnrich.length; i += ENRICH_CONCURRENCY) {
    const batch = needNameEnrich.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(batch.map(d => lookupOwnerProperties(d.ownerName!, county, "TX")));
    for (let j = 0; j < batch.length; j++) {
      const doc = batch[j];
      const props = results[j];
      if (props.length === 0) continue;
      const prop = props[0];
      leads.push({
        id: makeId(county, "TX", "Pre-Foreclosure", `${doc.id}-${prop.address}`),
        county, state: "TX",
        lead_type: "Pre-Foreclosure",
        owner_name: doc.ownerName,
        address: prop.address, city: prop.city || COUNTY_SEATS[county], zip: prop.zip || null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: doc.caseNumber,
        filing_date: formatDate(doc.filingDate),
        assessed_value: null, tax_year: null,
        lender: doc.lender, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `${doc.docType} — ${county} County`,
        source_url: sourceUrl,
        raw_data: doc.raw,
      });
    }
  }

  // Docs that already have address
  for (const doc of docs.filter(d => d.address)) {
    leads.push({
      id: makeId(county, "TX", "Pre-Foreclosure", doc.id),
      county, state: "TX",
      lead_type: "Pre-Foreclosure",
      owner_name: doc.ownerName,
      address: doc.address, city: COUNTY_SEATS[county], zip: null,
      mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
      case_number: doc.caseNumber,
      filing_date: formatDate(doc.filingDate),
      assessed_value: null, tax_year: null,
      lender: doc.lender, loan_amount: null,
      sale_date: null, sale_amount: null,
      description: `${doc.docType} — ${county} County`,
      source_url: sourceUrl,
      raw_data: doc.raw,
    });
  }

  return leads;
}

async function scrapeBexarPreForeclosure(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Bexar";
  try {
    const url = "https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures";
    const res = await fetchWithRetry(url);
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const name = $(cells[0]).text().trim();
        const address = $(cells[1]).text().trim();
        const caseNum = $(cells[2])?.text().trim() || "";
        const date = $(cells[3])?.text().trim() || "";
        if (!name || name.toLowerCase() === "name") return;
        leads.push({
          id: makeId(COUNTY, "TX", "Pre-Foreclosure", caseNum || name + address),
          county: COUNTY, state: "TX",
          lead_type: "Pre-Foreclosure",
          owner_name: name || null,
          address: address || null,
          city: "San Antonio",
          zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: caseNum || null,
          filing_date: formatDate(date),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: "Bexar County Clerk foreclosure notice",
          source_url: url,
          raw_data: JSON.stringify({ name, address, caseNum, date }),
        });
      });
    }
  } catch (e) {
    console.error(`[Bexar TX] Pre-Foreclosure error:`, e);
  }
  return leads;
}

// ─── 3. Sheriff Sales ────────────────────────────────────────────────────────

async function scrapeSanPatricioSheriffSale(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "San Patricio";
  try {
    const url = "https://sanpatricio.texas.sheriffsaleauctions.com/";
    const res = await fetchWithRetry(url);
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      $("table tr").each((_, el) => {
        const cells = $(el).find("td");
        if (cells.length >= 2) {
          const address = $(cells[0]).text().trim();
          const saleDate = $(cells[1]).text().trim();
          const caseNum = $(cells[2])?.text().trim() || "";
          if (!address || address.toLowerCase() === "address") return;
          leads.push({
            id: makeId(COUNTY, "TX", "Sheriff Sale", caseNum || address),
            county: COUNTY, state: "TX",
            lead_type: "Sheriff Sale",
            owner_name: null,
            address: address || null,
            city: COUNTY_SEATS[COUNTY],
            zip: null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: caseNum || null,
            filing_date: null,
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null,
            sale_date: formatDate(saleDate),
            sale_amount: null,
            description: "San Patricio County Sheriff Sale",
            source_url: url,
            raw_data: JSON.stringify({ address, saleDate, caseNum }),
          });
        }
      });
    }
  } catch (e) {
    console.error(`[San Patricio TX] Sheriff Sale error:`, e);
  }
  return leads;
}

async function scrapeBexarSheriffSale(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const COUNTY = "Bexar";
  try {
    const url = "https://www.bexar.org/DocumentCenter/View/505/Current-County-Clerk-Foreclosures";
    const res = await fetchWithRetry(url);
    if (res.ok) {
      const html = await res.text();
      const $ = cheerio.load(html);
      $("table tr").each((_, row) => {
        const cells = $(row).find("td");
        if (cells.length < 2) return;
        const name = $(cells[0]).text().trim();
        const address = $(cells[1]).text().trim();
        const saleDate = $(cells[2])?.text().trim() || "";
        const amount = $(cells[3])?.text().trim() || "";
        if (!name || name.toLowerCase() === "name") return;
        leads.push({
          id: makeId(COUNTY, "TX", "Sheriff Sale", name + address),
          county: COUNTY, state: "TX",
          lead_type: "Sheriff Sale",
          owner_name: name || null,
          address: address || null,
          city: "San Antonio",
          zip: null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: null,
          filing_date: null,
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: formatDate(saleDate),
          sale_amount: amount || null,
          description: "Bexar County foreclosure sale",
          source_url: url,
          raw_data: JSON.stringify({ name, address, saleDate, amount }),
        });
      });
    }
  } catch (e) {
    console.error(`[Bexar TX] Sheriff Sale error:`, e);
  }
  return leads;
}

// ─── 4. Probate ──────────────────────────────────────────────────────────────

async function scrapePublicSearchProbate(county: TxCounty, fromDate: string, toDate: string): Promise<Lead[]> {
  const portals: Partial<Record<TxCounty, string>> = {
    Nueces: "nueces",
    "Jim Wells": "jimwells",
    "San Patricio": "sanpatricio",
  };
  const slug = portals[county];
  if (!slug) return [];

  const [probateResults, lettersResults, adminResults] = await Promise.all([
    scrapePublicSearch(slug, "tx", "PROBATE", fromDate, toDate),
    scrapePublicSearch(slug, "tx", "LETTERS TESTAMENTARY", fromDate, toDate),
    scrapePublicSearch(slug, "tx", "LETTERS OF ADMINISTRATION", fromDate, toDate),
  ]);
  const allRaw = [...probateResults, ...lettersResults, ...adminResults];

  type RawDoc = { id: string; ownerName: string | null; address: string | null; caseNumber: string | null; filingDate: string | null; raw: string; sourceUrl: string };
  const rawDocs: RawDoc[] = allRaw.map(doc => ({
    id: doc.instrumentNumber || String(doc.docId),
    ownerName: doc.grantor[0] || null,
    address: extractAddressFromDoc(doc),
    caseNumber: doc.instrumentNumber || null,
    filingDate: doc.recordedDate || null,
    raw: JSON.stringify(doc),
    sourceUrl: `https://${slug}.tx.publicsearch.us/`,
  }));

  const leads: Lead[] = [];

  // For docs with address but no owner name: enrich by address
  const needAddrEnrich = rawDocs.filter(d => d.address && !d.ownerName);
  for (let i = 0; i < needAddrEnrich.length; i += ENRICH_CONCURRENCY) {
    const batch = needAddrEnrich.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(batch.map(d => lookupByAddress(d.address!, county, "TX")));
    for (let j = 0; j < batch.length; j++) {
      const doc = batch[j];
      const prop = results[j];
      if (prop) doc.ownerName = prop.ownerName || doc.ownerName;
    }
  }

  // For docs with owner name but no address: enrich by name (only keep if property found)
  const needNameEnrich = rawDocs.filter(d => !d.address && d.ownerName);
  for (let i = 0; i < needNameEnrich.length; i += ENRICH_CONCURRENCY) {
    const batch = needNameEnrich.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(batch.map(d => lookupOwnerProperties(d.ownerName!, county, "TX")));
    for (let j = 0; j < batch.length; j++) {
      const doc = batch[j];
      const props = results[j];
      if (props.length === 0) continue;
      const prop = props[0];
      leads.push({
        id: makeId(county, "TX", "Probate", `${doc.id}-${prop.address}`),
        county, state: "TX",
        lead_type: "Probate",
        owner_name: doc.ownerName,
        address: prop.address, city: prop.city || COUNTY_SEATS[county], zip: prop.zip || null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: doc.caseNumber,
        filing_date: formatDate(doc.filingDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Probate filing — ${county} County`,
        source_url: doc.sourceUrl,
        raw_data: doc.raw,
      });
    }
  }

  // Docs that already have address
  for (const doc of rawDocs.filter(d => d.address)) {
    leads.push({
      id: makeId(county, "TX", "Probate", doc.id),
      county, state: "TX",
      lead_type: "Probate",
      owner_name: doc.ownerName,
      address: doc.address, city: COUNTY_SEATS[county], zip: null,
      mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
      case_number: doc.caseNumber,
      filing_date: formatDate(doc.filingDate),
      assessed_value: null, tax_year: null,
      lender: null, loan_amount: null,
      sale_date: null, sale_amount: null,
      description: `Probate filing — ${county} County`,
      source_url: doc.sourceUrl,
      raw_data: doc.raw,
    });
  }

  return leads;
}

// ─── 5. Bankruptcy ───────────────────────────────────────────────────────────

export async function scrapeBankruptcy(fromDate: string, toDate: string): Promise<Lead[]> {
  // TX Southern District covers Corpus Christi (Nueces, Kleberg, Jim Wells, San Patricio)
  type BkItem = { title: string; link: string; pubDate: string; caseNum: string | null; ownerName: string; county: string };
  const rawItems: BkItem[] = [];
  const rssUrls = [
    "https://ecf.txsb.uscourts.gov/cgi-bin/rss_outside.pl?division=CC",
    "https://ecf.txsb.uscourts.gov/cgi-bin/rss_outside.pl",
  ];
  for (const rssUrl of rssUrls) {
    try {
      const res = await fetchWithRetry(rssUrl);
      if (!res.ok) continue;
      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      $('item').each((_, item) => {
        const title = $(item).find('title').text().trim();
        const link = $(item).find('link').text().trim();
        const pubDate = $(item).find('pubDate').text().trim();
        if (!title) return;
        const ownerMatch = title.match(/^\d{2}-\d{4,6}(?:-[a-z0-9]+)?\s+(.+)$/i);
        const ownerName = ownerMatch ? ownerMatch[1].trim() : title;
        const caseNumMatch = title.match(/^(\d{2}-\d{4,6}(?:-[a-z0-9]+)?)/i);
        const caseNum = caseNumMatch ? caseNumMatch[1] : null;
        if (ownerName.length < 3) return;
        rawItems.push({ title, link, pubDate, caseNum, ownerName, county: "Nueces" });
      });
      if (rawItems.length > 0) break;
    } catch (e) {
      console.error(`[TX Southern] Bankruptcy RSS error:`, e);
    }
  }
  // Also fetch TX Western for Bexar
  const bkItemsBexar: BkItem[] = [];
  try {
    const res = await fetchWithRetry("https://ecf.txwb.uscourts.gov/cgi-bin/rss_outside.pl");
    if (res.ok) {
      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });
      $('item').each((_, item) => {
        const title = $(item).find('title').text().trim();
        const link = $(item).find('link').text().trim();
        const pubDate = $(item).find('pubDate').text().trim();
        if (!title) return;
        const ownerMatch = title.match(/^\d{2}-\d{4,6}(?:-[a-z0-9]+)?\s+(.+)$/i);
        const ownerName = ownerMatch ? ownerMatch[1].trim() : title;
        const caseNumMatch = title.match(/^(\d{2}-\d{4,6}(?:-[a-z0-9]+)?)/i);
        const caseNum = caseNumMatch ? caseNumMatch[1] : null;
        if (ownerName.length < 3) return;
        bkItemsBexar.push({ title, link, pubDate, caseNum, ownerName, county: "Bexar" });
      });
    }
  } catch (e) {
    console.error(`[TX Western] Bankruptcy RSS error:`, e);
  }

  const txSouthCounties = ["Nueces", "Kleberg", "Jim Wells", "San Patricio"];
  const leads: Lead[] = [];

  // Enrich TX Southern items
  for (let i = 0; i < rawItems.length; i += ENRICH_CONCURRENCY) {
    const batch = rawItems.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(
      batch.map(b => (async () => {
        for (const county of txSouthCounties) {
          const props = await lookupOwnerProperties(b.ownerName, county, "TX");
          if (props.length > 0) return { county, props };
        }
        return null;
      })())
    );
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const found = results[j];
      if (!found) continue;
      for (const prop of found.props) {
        leads.push({
          id: makeId(found.county, "TX", "Bankruptcy", `${item.caseNum}-${prop.address}`),
          county: found.county, state: "TX",
          lead_type: "Bankruptcy",
          owner_name: item.ownerName,
          address: prop.address, city: prop.city || COUNTY_SEATS[found.county as TxCounty] || "Corpus Christi", zip: prop.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: item.caseNum,
          filing_date: formatDate(item.pubDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `Bankruptcy — TX Southern District — ${item.ownerName}`,
          source_url: item.link || "https://ecf.txsb.uscourts.gov/cgi-bin/rss_outside.pl",
          raw_data: JSON.stringify({ title: item.title, caseNum: item.caseNum, pubDate: item.pubDate, parcelId: prop.parcelId }),
        });
      }
    }
  }

  // Enrich TX Western (Bexar) items
  for (let i = 0; i < bkItemsBexar.length; i += ENRICH_CONCURRENCY) {
    const batch = bkItemsBexar.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(batch.map(b => lookupOwnerProperties(b.ownerName, "Bexar", "TX")));
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const props = results[j];
      if (props.length === 0) continue;
      for (const prop of props) {
        leads.push({
          id: makeId("Bexar", "TX", "Bankruptcy", `${item.caseNum}-${prop.address}`),
          county: "Bexar", state: "TX",
          lead_type: "Bankruptcy",
          owner_name: item.ownerName,
          address: prop.address, city: prop.city || "San Antonio", zip: prop.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: item.caseNum,
          filing_date: formatDate(item.pubDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `Bankruptcy — TX Western District (San Antonio) — ${item.ownerName}`,
          source_url: item.link || "https://ecf.txwb.uscourts.gov/cgi-bin/rss_outside.pl",
          raw_data: JSON.stringify({ title: item.title, caseNum: item.caseNum, pubDate: item.pubDate, parcelId: prop.parcelId }),
        });
      }
    }
  }

  return leads;
}

// ─── 6. Code Violations ──────────────────────────────────────────────────────

export async function scrapeCodeViolations(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];

  // Corpus Christi (Nueces)
  try {
    const apiUrl = "https://data.corpus-christi.opendata.arcgis.com/api/explore/v2.1/catalog/datasets/code-enforcement-cases/records";
    const params = new URLSearchParams({
      where: `date_opened >= '${fromDate}'`,
      limit: "200",
      order_by: "date_opened desc",
    });
    const res = await fetchWithRetry(`${apiUrl}?${params}`);
    if (res.ok) {
      const data = await res.json() as { results?: any[] };
      for (const r of (data.results || [])) {
        leads.push({
          id: makeId("Nueces", "TX", "Code Violation", r.case_number || r.id),
          county: "Nueces", state: "TX",
          lead_type: "Code Violation",
          owner_name: r.owner_name || null,
          address: r.address || r.location || null,
          city: "Corpus Christi",
          zip: r.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: r.case_number || null,
          filing_date: formatDate(r.date_opened || r.filed_date),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: r.violation_type || r.description || "Code violation",
          source_url: "https://aca-prod.accela.com/TOS/Cap/CapHome.aspx?module=Enforcement",
          raw_data: JSON.stringify(r),
        });
      }
    }
  } catch (e) {
    console.error(`[Nueces TX] Code Violations error:`, e);
  }

  // San Antonio (Bexar) — with enrichment
  type RawViolation = { address: string | null; case_number: string | null; filing_date: string | null; description: string; raw: string };
  const rawSA: RawViolation[] = [];
  try {
    const apiUrl = "https://data.sanantonio.gov/resource/yxkh-6q8f.json";
    const params = new URLSearchParams({
      "$where": `opened >= '${fromDate}T00:00:00'`,
      "$limit": "200",
      "$order": "opened DESC",
    });
    const res = await fetchWithRetry(`${apiUrl}?${params}`);
    if (res.ok) {
      const data = await res.json() as any[];
      for (const r of (Array.isArray(data) ? data : [])) {
        rawSA.push({
          address: r.address || r.street_address || null,
          case_number: r.case_number || r.service_request_id || null,
          filing_date: r.opened || r.created_date || null,
          description: r.description || r.type || "Code complaint",
          raw: JSON.stringify(r),
        });
      }
    }
  } catch (e) {
    console.error(`[Bexar TX] Code Violations error:`, e);
  }

  const withAddr = rawSA.filter(r => r.address);
  for (let i = 0; i < withAddr.length; i += ENRICH_CONCURRENCY) {
    const batch = withAddr.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(batch.map(r => lookupByAddress(r.address!, "Bexar", "TX")));
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const prop = results[j];
      leads.push({
        id: makeId("Bexar", "TX", "Code Violation", item.case_number || item.address || String(j)),
        county: "Bexar", state: "TX",
        lead_type: "Code Violation",
        owner_name: prop?.ownerName || null,
        address: item.address,
        city: "San Antonio",
        zip: prop?.zip || null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: item.case_number,
        filing_date: formatDate(item.filing_date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: item.description,
        source_url: "https://webapp1.sanantonio.gov/CodeComplaintStatus/",
        raw_data: item.raw,
      });
    }
  }
  for (const item of rawSA.filter(r => !r.address)) {
    leads.push({
      id: makeId("Bexar", "TX", "Code Violation", item.case_number || String(Math.random())),
      county: "Bexar", state: "TX",
      lead_type: "Code Violation",
      owner_name: null,
      address: null, city: "San Antonio", zip: null,
      mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
      case_number: item.case_number,
      filing_date: formatDate(item.filing_date),
      assessed_value: null, tax_year: null,
      lender: null, loan_amount: null,
      sale_date: null, sale_amount: null,
      description: item.description,
      source_url: "https://webapp1.sanantonio.gov/CodeComplaintStatus/",
      raw_data: item.raw,
    });
  }

  return leads;
}

// ─── 7. Divorce ──────────────────────────────────────────────────────────────

export async function scrapeDivorce(fromDate: string, toDate: string): Promise<Lead[]> {
  const portals: Partial<Record<TxCounty, string>> = {
    Nueces: "nueces",
    "Jim Wells": "jimwells",
    "San Patricio": "sanpatricio",
  };

  const leads: Lead[] = [];

  for (const [county, slug] of Object.entries(portals) as [TxCounty, string][]) {
    const [divorceResults, petitionResults, decreeResults] = await Promise.all([
      scrapePublicSearch(slug, "tx", "DIVORCE", fromDate, toDate),
      scrapePublicSearch(slug, "tx", "PETITION FOR DIVORCE", fromDate, toDate),
      scrapePublicSearch(slug, "tx", "DIVORCE DECREE", fromDate, toDate),
    ]);
    const allRaw = [...divorceResults, ...petitionResults, ...decreeResults];

    type RawDoc = { id: string; ownerName: string | null; address: string | null; caseNumber: string | null; filingDate: string | null; raw: string };
    const rawDocs: RawDoc[] = allRaw.map(doc => ({
      id: doc.instrumentNumber || String(doc.docId),
      ownerName: doc.grantor[0] || null,
      address: extractAddressFromDoc(doc),
      caseNumber: doc.instrumentNumber || null,
      filingDate: doc.recordedDate || null,
      raw: JSON.stringify(doc),
    }));

    const sourceUrl = `https://${slug}.tx.publicsearch.us/`;

    // Enrich by name for docs missing property address — only keep if property found
    const needNameEnrich = rawDocs.filter(d => !d.address && d.ownerName);
    for (let i = 0; i < needNameEnrich.length; i += ENRICH_CONCURRENCY) {
      const batch = needNameEnrich.slice(i, i + ENRICH_CONCURRENCY);
      const results = await Promise.all(batch.map(d => lookupOwnerProperties(d.ownerName!, county, "TX")));
      for (let j = 0; j < batch.length; j++) {
        const doc = batch[j];
        const props = results[j];
        if (props.length === 0) continue;
        const prop = props[0];
        leads.push({
          id: makeId(county, "TX", "Divorce", `${doc.id}-${prop.address}`),
          county, state: "TX",
          lead_type: "Divorce",
          owner_name: doc.ownerName,
          address: prop.address, city: prop.city || COUNTY_SEATS[county], zip: prop.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: doc.caseNumber,
          filing_date: formatDate(doc.filingDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `Divorce filing — ${county} County — only saved when respondent owns property`,
          source_url: sourceUrl,
          raw_data: doc.raw,
        });
      }
    }

    // Docs that already have address
    for (const doc of rawDocs.filter(d => d.address)) {
      leads.push({
        id: makeId(county, "TX", "Divorce", doc.id),
        county, state: "TX",
        lead_type: "Divorce",
        owner_name: doc.ownerName,
        address: doc.address, city: COUNTY_SEATS[county], zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: doc.caseNumber,
        filing_date: formatDate(doc.filingDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: `Divorce filing — ${county} County`,
        source_url: sourceUrl,
        raw_data: doc.raw,
      });
    }
  }

  return leads;
}

// ─── 8. FSBO (Craigslist) ────────────────────────────────────────────────────

async function scrapeCraigslistFSBO(county: TxCounty, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  const city = CRAIGSLIST_CITIES[county];
  try {
    const url = `https://${city}.craigslist.org/search/rea?format=rss&hasPic=0&search_distance=50&postal=78401&availabilityMode=0&sale_date=all+dates`;
    const res = await fetchWithRetry(url);
    if (!res.ok) return leads;
    const xml = await res.text();
    const $ = cheerio.load(xml, { xmlMode: true });
    $("item").each((_, item) => {
      const title = $(item).find("title").text().trim();
      const link = $(item).find("link").text().trim();
      const pubDate = $(item).find("pubDate").text().trim();
      const description = $(item).find("description").text().trim();
      if (!title || title.toLowerCase().includes("craigslist")) return;
      const priceMatch = title.match(/\$[\d,]+/);
      const price = priceMatch ? priceMatch[0] : null;
      leads.push({
        id: makeId(county, "TX", "FSBO", link || title),
        county, state: "TX",
        lead_type: "FSBO",
        owner_name: null,
        address: null,
        city: COUNTY_SEATS[county],
        zip: null,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: null,
        filing_date: formatDate(pubDate),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null,
        sale_amount: price,
        description: title,
        source_url: link || url,
        raw_data: JSON.stringify({ title, pubDate, description }),
      });
    });
  } catch (e) {
    console.error(`[${county} TX] FSBO Craigslist error:`, e);
  }
  return leads;
}

// ─── 9. Obituaries ───────────────────────────────────────────────────────────

export async function scrapeObituaries(fromDate: string, toDate: string): Promise<Lead[]> {
  const cityMap: Partial<Record<TxCounty, string>> = {
    Nueces: "corpus-christi-tx",
    Bexar: "san-antonio-tx",
    Kleberg: "kingsville-tx",
    "Jim Wells": "alice-tx",
    "San Patricio": "sinton-tx",
  };

  const leads: Lead[] = [];

  for (const [county, citySlug] of Object.entries(cityMap) as [TxCounty, string][]) {
    type ObitItem = { name: string; date: string; city: string; url: string };
    const rawItems: ObitItem[] = [];
    try {
      const url = `https://www.legacy.com/obituaries/name/${citySlug}/`;
      const res = await fetchWithRetry(url);
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $(".obituary-listing, .obit-item, article.obit").each((_, el) => {
        const name = $(el).find(".name, h2, h3").first().text().trim();
        const date = $(el).find(".date, time").first().text().trim();
        const city = $(el).find(".city, .location").first().text().trim();
        if (!name || name.length < 3) return;
        rawItems.push({ name, date, city, url });
      });
    } catch (e) {
      console.error(`[${county} TX] Obituaries error:`, e);
    }
    // Enrich: only keep where decedent owns property in this county
    for (let i = 0; i < rawItems.length; i += ENRICH_CONCURRENCY) {
      const batch = rawItems.slice(i, i + ENRICH_CONCURRENCY);
      const results = await Promise.all(batch.map(b => lookupOwnerProperties(b.name, county, "TX")));
      for (let j = 0; j < batch.length; j++) {
        const item = batch[j];
        const props = results[j];
        if (props.length === 0) continue;
        for (const prop of props) {
          leads.push({
            id: makeId(county, "TX", "Obituary", `${item.name}-${prop.address}`),
            county, state: "TX",
            lead_type: "Obituary",
            owner_name: item.name,
            address: prop.address, city: prop.city || COUNTY_SEATS[county], zip: prop.zip || null,
            mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
            case_number: null,
            filing_date: formatDate(item.date),
            assessed_value: null, tax_year: null,
            lender: null, loan_amount: null,
            sale_date: null, sale_amount: null,
            description: `Obituary / Estate — ${item.name}`,
            source_url: item.url,
            raw_data: JSON.stringify({ name: item.name, date: item.date, city: item.city, parcelId: prop.parcelId }),
          });
        }
      }
    }
  }

  return leads;
}

// ─── 10. Fire Damage ─────────────────────────────────────────────────────────

async function scrapeFireDamage(county: TxCounty, fromDate: string, toDate: string): Promise<Lead[]> {
  type RawFire = { address: string | null; city: string; zip: string | null; case_number: string | null; filing_date: string | null; description: string; raw: string };
  const rawItems: RawFire[] = [];
  try {
    const url = "https://data.texas.gov/resource/4yk8-hnbj.json";
    const params = new URLSearchParams({
      "$where": `incident_date >= '${fromDate}' AND county = '${county.toUpperCase()}'`,
      "$limit": "100",
      "$order": "incident_date DESC",
    });
    const res = await fetchWithRetry(`${url}?${params}`);
    if (res.ok) {
      const data = await res.json() as any[];
      for (const r of (Array.isArray(data) ? data : [])) {
        rawItems.push({
          address: r.address || r.location_address || null,
          city: r.city || COUNTY_SEATS[county],
          zip: r.zip || null,
          case_number: r.incident_number || null,
          filing_date: r.incident_date || null,
          description: r.incident_type || "Fire incident",
          raw: JSON.stringify(r),
        });
      }
    }
  } catch (e) {
    console.error(`[${county} TX] Fire Damage error:`, e);
  }
  const leads: Lead[] = [];
  const withAddr = rawItems.filter(r => r.address);
  for (let i = 0; i < withAddr.length; i += ENRICH_CONCURRENCY) {
    const batch = withAddr.slice(i, i + ENRICH_CONCURRENCY);
    const results = await Promise.all(batch.map(r => lookupByAddress(r.address!, county, "TX")));
    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const prop = results[j];
      leads.push({
        id: makeId(county, "TX", "Fire Damage", item.case_number || item.address || String(j)),
        county, state: "TX",
        lead_type: "Fire Damage",
        owner_name: prop?.ownerName || null,
        address: item.address,
        city: item.city,
        zip: prop?.zip || item.zip,
        mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
        case_number: item.case_number,
        filing_date: formatDate(item.filing_date),
        assessed_value: null, tax_year: null,
        lender: null, loan_amount: null,
        sale_date: null, sale_amount: null,
        description: item.description,
        source_url: "https://data.texas.gov/",
        raw_data: item.raw,
      });
    }
  }
  for (const item of rawItems.filter(r => !r.address)) {
    leads.push({
      id: makeId(county, "TX", "Fire Damage", item.case_number || String(Math.random())),
      county, state: "TX",
      lead_type: "Fire Damage",
      owner_name: null,
      address: null, city: item.city, zip: item.zip,
      mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
      case_number: item.case_number,
      filing_date: formatDate(item.filing_date),
      assessed_value: null, tax_year: null,
      lender: null, loan_amount: null,
      sale_date: null, sale_amount: null,
      description: item.description,
      source_url: "https://data.texas.gov/",
      raw_data: item.raw,
    });
  }
  return leads;
}

// ─── 11. Water Shut-offs ─────────────────────────────────────────────────────

async function scrapeWaterShutoffs(county: TxCounty, fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  if (county !== "Nueces" && county !== "Bexar") return leads;
  try {
    const city = county === "Nueces" ? "Corpus Christi" : "San Antonio";
    const apiUrl = county === "Bexar"
      ? "https://data.sanantonio.gov/resource/water-shutoffs.json"
      : "https://data.corpus-christi.opendata.arcgis.com/api/explore/v2.1/catalog/datasets/water-shutoffs/records";
    const params = new URLSearchParams({
      "$where": `shutoff_date >= '${fromDate}'`,
      "$limit": "100",
    });
    const res = await fetchWithRetry(`${apiUrl}?${params}`);
    if (res.ok) {
      const data = await res.json() as any;
      const items = Array.isArray(data) ? data : (data.results || []);
      for (const r of items) {
        leads.push({
          id: makeId(county, "TX", "Water Shut-off", r.account_number || r.address || String(Math.random())),
          county, state: "TX",
          lead_type: "Water Shut-off",
          owner_name: r.owner_name || null,
          address: r.address || r.service_address || null,
          city,
          zip: r.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: r.account_number || null,
          filing_date: formatDate(r.shutoff_date || r.date || fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `Water shut-off — ${city}`,
          source_url: apiUrl,
          raw_data: JSON.stringify(r),
        });
      }
    }
  } catch (e) {
    console.error(`[${county} TX] Water Shut-offs error:`, e);
  }
  return leads;
}

// ─── 12. Out-of-State Owners ─────────────────────────────────────────────────

export async function scrapeOutOfStateOwners(fromDate: string, toDate: string): Promise<Lead[]> {
  // Use Nueces CAD ArcGIS to find parcels where mailing address is out of state
  const leads: Lead[] = [];
  try {
    const url = "https://gis.bisclient.com/nuecescad/rest/services/Parcels/FeatureServer/0/query";
    const params = new URLSearchParams({
      where: "MAIL_STATE <> 'TX' AND MAIL_STATE IS NOT NULL AND MAIL_STATE <> ''",
      outFields: "PARCEL_ID,OWNER_NAME,SITUS_ADDR,SITUS_CITY,SITUS_ZIP,MAIL_ADDR,MAIL_CITY,MAIL_STATE,MAIL_ZIP",
      returnGeometry: "false",
      f: "json",
      resultRecordCount: "200",
    });
    const res = await fetchWithRetry(`${url}?${params}`);
    if (res.ok) {
      const data = await res.json() as { features?: { attributes: Record<string, string> }[] };
      for (const f of (data.features || [])) {
        const a = f.attributes;
        if (!a.PARCEL_ID) continue;
        leads.push({
          id: makeId("Nueces", "TX", "Out-of-State Owner", a.PARCEL_ID),
          county: "Nueces", state: "TX",
          lead_type: "Out-of-State Owner",
          owner_name: a.OWNER_NAME || null,
          address: a.SITUS_ADDR || null,
          city: a.SITUS_CITY || "Corpus Christi",
          zip: a.SITUS_ZIP || null,
          mailing_address: a.MAIL_ADDR || null,
          mailing_city: a.MAIL_CITY || null,
          mailing_state: a.MAIL_STATE || null,
          mailing_zip: a.MAIL_ZIP || null,
          case_number: a.PARCEL_ID,
          filing_date: null,
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: `Out-of-state owner — mailing: ${a.MAIL_CITY}, ${a.MAIL_STATE}`,
          source_url: "https://nuecescad.net/",
          raw_data: JSON.stringify(a),
        });
      }
    }
  } catch (e) {
    console.error(`[Nueces TX] Out-of-State Owners error:`, e);
  }
  return leads;
}

// ─── 13. Vacant / Abandoned ──────────────────────────────────────────────────

export async function scrapeVacantAbandoned(fromDate: string, toDate: string): Promise<Lead[]> {
  const leads: Lead[] = [];
  // Corpus Christi vacant/abandoned properties
  try {
    const apiUrl = "https://data.corpus-christi.opendata.arcgis.com/api/explore/v2.1/catalog/datasets/vacant-abandoned-properties/records";
    const params = new URLSearchParams({ limit: "200" });
    const res = await fetchWithRetry(`${apiUrl}?${params}`);
    if (res.ok) {
      const data = await res.json() as { results?: any[] };
      for (const r of (data.results || [])) {
        leads.push({
          id: makeId("Nueces", "TX", "Vacant/Abandoned", r.id || r.address || String(Math.random())),
          county: "Nueces", state: "TX",
          lead_type: "Vacant/Abandoned",
          owner_name: r.owner_name || null,
          address: r.address || null,
          city: "Corpus Christi",
          zip: r.zip || null,
          mailing_address: null, mailing_city: null, mailing_state: null, mailing_zip: null,
          case_number: r.case_number || null,
          filing_date: formatDate(r.date_added || fromDate),
          assessed_value: null, tax_year: null,
          lender: null, loan_amount: null,
          sale_date: null, sale_amount: null,
          description: r.status || "Vacant/Abandoned property",
          source_url: "https://data.corpus-christi.opendata.arcgis.com/",
          raw_data: JSON.stringify(r),
        });
      }
    }
  } catch (e) {
    console.error(`[Nueces TX] Vacant/Abandoned error:`, e);
  }
  return leads;
}

// ─── Main scrapeAll export ───────────────────────────────────────────────────

export async function scrapeAll(
  fromDate: string,
  toDate: string,
  counties?: CountyConfig[],
  onProgress?: (msg: string) => void
): Promise<Lead[]> {
  const targetCounties = counties
    ? counties.map(c => c.name as TxCounty).filter(c => TX_COUNTIES.includes(c))
    : [...TX_COUNTIES];

  const allLeads: Lead[] = [];
  const tasks: Promise<Lead[]>[] = [];

  for (const county of targetCounties) {
    onProgress?.(`Starting ${county} County, TX...`);

    if (county === "Bexar") tasks.push(scrapeBexarTaxDelinquent(fromDate, toDate));
    else if (county === "Nueces") tasks.push(scrapeNueceTaxDelinquent(fromDate, toDate));
    else if (county === "San Patricio") tasks.push(scrapeSanPatricioTaxDelinquent(fromDate, toDate));
    else tasks.push(scrapeLGBSTaxSales(county, fromDate, toDate));

    if (county === "Bexar") tasks.push(scrapeBexarPreForeclosure(fromDate, toDate));
    else tasks.push(scrapePublicSearchPreForeclosure(county, fromDate, toDate));

    if (county === "San Patricio") tasks.push(scrapeSanPatricioSheriffSale(fromDate, toDate));
    else if (county === "Bexar") tasks.push(scrapeBexarSheriffSale(fromDate, toDate));

    tasks.push(scrapePublicSearchProbate(county, fromDate, toDate));

    tasks.push(scrapeCraigslistFSBO(county, fromDate, toDate));
    tasks.push(scrapeFireDamage(county, fromDate, toDate));
    tasks.push(scrapeWaterShutoffs(county, fromDate, toDate));
  }

  // State-wide functions
  tasks.push(scrapeBankruptcy(fromDate, toDate));
  tasks.push(scrapeCodeViolations(fromDate, toDate));
  tasks.push(scrapeDivorce(fromDate, toDate));
  tasks.push(scrapeObituaries(fromDate, toDate));
  tasks.push(scrapeOutOfStateOwners(fromDate, toDate));
  tasks.push(scrapeVacantAbandoned(fromDate, toDate));

  const results = await Promise.allSettled(tasks);
  for (const r of results) {
    if (r.status === "fulfilled") allLeads.push(...r.value);
  }

  onProgress?.(`TX total: ${allLeads.length} leads across ${targetCounties.length} counties`);
  return allLeads;
}

// Legacy per-county entrypoint (used by Tina's index.ts)
export async function scrapeTX(county: string, fromDate: string, toDate: string): Promise<Lead[]> {
  const c = county as TxCounty;
  if (!TX_COUNTIES.includes(c)) {
    console.warn(`[TX] No scraper for county: ${county}`);
    return [];
  }
  return scrapeAll(fromDate, toDate, [{ name: c, state: "TX", leadTypes: [] }]);
}
