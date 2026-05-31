/**
 * Settings.tsx — Atlas Settings & Configuration
 * Sections:
 * 1. How Atlas Works — architecture guide, Manus customization info
 * 2. Lead Source Matrix — live/possible/needs_attom/blocked per county
 * 3. API Keys — ScraperAPI, Bright Data, Skip Trace, ATTOM
 * 4. Email Delivery — SMTP + recipient list
 */

import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, AlertCircle, Clock,
  ChevronDown, ChevronRight, Save, Eye, EyeOff,
  Mail, Key, Database, BookOpen, RefreshCw
} from "lucide-react";

interface Settings {
  smtp_host: string;
  smtp_port: string;
  smtp_user: string;
  smtp_pass: string;
  smtp_from: string;
  email_recipients: string;
  scraper_api_key: string;
  skip_trace_key: string;
  auto_skip_trace: string;
  bright_data_user: string;
  bright_data_pass: string;
  attom_api_key: string;
  smtp_configured: boolean;
  scraper_api_configured: boolean;
  skip_trace_configured: boolean;
  bright_data_configured: boolean;
  attom_configured: boolean;
}

type LeadStatus = "live" | "possible" | "needs_attom" | "blocked" | "na";

interface LeadSource {
  type: string;
  status: LeadStatus;
  source: string;
  notes: string;
}

interface CountyMatrix {
  county: string;
  state: string;
  sources: LeadSource[];
}

const LEAD_MATRIX: CountyMatrix[] = [
  {
    county: "Jackson", state: "MO",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "MO Western District PACER RSS", notes: "PACER RSS feed, no auth required" },
      { type: "Tax Delinquent", status: "live", source: "Jackson County ArcGIS Parcels", notes: "ArcGIS FeatureServer, DELINQUENT field" },
      { type: "Sheriff Sales", status: "live", source: "jacksongov.org civil-process", notes: "County sheriff civil process page" },
      { type: "Code Violations", status: "live", source: "KC 311 Open Data (d4px-6rwg)", notes: "Socrata API, no auth required, 500 records/day" },
      { type: "Fire Damage", status: "live", source: "KC 311 Open Data (fire type)", notes: "Same dataset, filtered by type" },
      { type: "Water Shutoff", status: "live", source: "KC 311 Open Data (water type)", notes: "Same dataset, filtered by type" },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", notes: "ecf.mowb.uscourts.gov, no auth required" },
      { type: "Probate", status: "live", source: "MO PACER + Jackson County ArcGIS", notes: "Cross-referenced with parcel data" },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", notes: "craigslist.org/search/reo, filtered keywords" },
      { type: "Obituaries", status: "live", source: "KC Star / legacy.com", notes: "Estate lead proxy" },
    ]
  },
  {
    county: "Clay", state: "MO",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "MO Western District PACER RSS", notes: "Same feed as Jackson" },
      { type: "Tax Delinquent", status: "possible", source: "Clay County Collector", notes: "claycountymo.gov — HTML scrape, may need updates" },
      { type: "Sheriff Sales", status: "possible", source: "Clay County Sheriff", notes: "claycountysheriff.net — scrape" },
      { type: "Code Violations", status: "live", source: "KC 311 Open Data", notes: "Liberty/Kearney addresses auto-assigned to Clay" },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", notes: "Same feed as Jackson" },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", notes: "Same feed as Jackson" },
    ]
  },
  {
    county: "Cass", state: "MO",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "MO Western District PACER RSS", notes: "Same feed as Jackson" },
      { type: "Tax Delinquent", status: "possible", source: "Cass County Collector", notes: "casscounty.com — HTML scrape" },
      { type: "Sheriff Sales", status: "possible", source: "Cass County Sheriff", notes: "casscountysheriff.net" },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", notes: "Same feed" },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", notes: "Same feed" },
    ]
  },
  {
    county: "Jefferson", state: "AL",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "AlaCourt public case search", notes: "v2.alacourt.com, caseType=CV, foreclosure filter" },
      { type: "Tax Delinquent", status: "live", source: "JCCAL ArcGIS (Bright Data proxy)", notes: "gis.jccal.org — requires Bright Data residential proxy to bypass Imperva WAF" },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin + jeffcosheriff.net", notes: "rubinlublin.com covers all AL counties; county fallback for Jefferson" },
      { type: "Code Violations", status: "live", source: "jeffcointouch.com code enforcement", notes: "Jefferson County code enforcement portal" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov, covers Jefferson/Madison/Morgan/Shelby" },
      { type: "Probate", status: "live", source: "AlaCourt + JCCAL enrichment", notes: "AlaCourt caseType=PR, enriched via JCCAL ArcGIS" },
      { type: "FSBO", status: "live", source: "Craigslist Birmingham", notes: "birmingham.craigslist.org" },
      { type: "Obituaries", status: "live", source: "al.com obituaries", notes: "Estate lead proxy" },
    ]
  },
  {
    county: "Madison", state: "AL",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "AlaCourt public case search", notes: "Same feed as Jefferson" },
      { type: "Tax Delinquent", status: "live", source: "madisonproperty.countygovservices.com", notes: "Accessible without proxy — POST search" },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin + madisoncountyal.gov", notes: "Rubin Lublin primary, county fallback" },
      { type: "Code Violations", status: "live", source: "Huntsville Open Data (data.huntsvilleal.gov)", notes: "Socrata API, no auth required" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov" },
      { type: "Probate", status: "live", source: "AlaCourt caseType=PR", notes: "AlaCourt public search" },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", notes: "huntsville.craigslist.org" },
    ]
  },
  {
    county: "Morgan", state: "AL",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "AlaCourt public case search", notes: "Same feed" },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", notes: "gis.revenue.alabama.gov blocks ALL IPs. ATTOM Data API unlocks full enrichment (~$150/mo)" },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", notes: "Statewide coverage" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov" },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", notes: "Same feed as Madison" },
    ]
  },
  {
    county: "Montgomery", state: "AL",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "AlaCourt public case search", notes: "Same feed" },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", notes: "gis.revenue.alabama.gov blocks ALL IPs. ATTOM Data API unlocks full enrichment (~$150/mo)" },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", notes: "Statewide coverage" },
      { type: "Bankruptcy", status: "live", source: "PACER Southern District AL RSS", notes: "ecf.alsb.uscourts.gov, covers Montgomery/Autauga/Elmore" },
      { type: "FSBO", status: "live", source: "Craigslist Montgomery", notes: "montgomery.craigslist.org" },
    ]
  },
  {
    county: "Shelby", state: "AL",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "AlaCourt public case search", notes: "Same feed" },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", notes: "gis.revenue.alabama.gov blocks ALL IPs. ATTOM Data API unlocks full enrichment (~$150/mo)" },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", notes: "Statewide coverage" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov" },
      { type: "FSBO", status: "live", source: "Craigslist Birmingham", notes: "Same feed as Jefferson" },
    ]
  },
  {
    county: "Hamilton", state: "OH",
    sources: [
      { type: "Pre-Foreclosure", status: "live", source: "Hamilton County Clerk of Courts", notes: "courtclerk.org case search, caseType=F" },
      { type: "Tax Delinquent", status: "live", source: "wedge1.hcauditor.org", notes: "CONFIRMED WORKING: /search/re/delinquent/{year}/1" },
      { type: "Sheriff Sales", status: "live", source: "Hamilton County RealAuction", notes: "hamilton.sheriffsaleauction.ohio.gov" },
      { type: "Code Violations", status: "live", source: "Cincinnati Open Data (dxyd-3h4p)", notes: "Socrata API, no auth required" },
      { type: "Fire Damage", status: "live", source: "Cincinnati Open Data (rvmt-pkmq)", notes: "Fire incidents filtered by structure fire type" },
      { type: "Bankruptcy", status: "live", source: "PACER Southern + Northern District OH", notes: "ecf.ohsb.uscourts.gov + ecf.ohnb.uscourts.gov" },
      { type: "Probate", status: "live", source: "Hamilton County Probate Court", notes: "probatect.org case search, estate type" },
      { type: "FSBO", status: "live", source: "Craigslist Cincinnati", notes: "cincinnati.craigslist.org" },
    ]
  },
];

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; icon: React.ReactNode }> = {
  live:        { label: "Live",         color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30", icon: <CheckCircle className="w-3 h-3" /> },
  possible:    { label: "Possible",     color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",   icon: <AlertCircle className="w-3 h-3" /> },
  needs_attom: { label: "Needs ATTOM",  color: "bg-orange-500/20 text-orange-300 border-orange-500/30",   icon: <Key className="w-3 h-3" /> },
  blocked:     { label: "Blocked",      color: "bg-red-500/20 text-red-300 border-red-500/30",             icon: <XCircle className="w-3 h-3" /> },
  na:          { label: "N/A",          color: "bg-slate-500/20 text-slate-400 border-slate-500/30",       icon: <Clock className="w-3 h-3" /> },
};

function StatusBadge({ status }: { status: LeadStatus }) {
  const cfg = STATUS_CONFIG[status];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${cfg.color}`}>
      {cfg.icon}
      {cfg.label}
    </span>
  );
}

function Section({ title, icon, children, defaultOpen = true }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-slate-700/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-blue-400">{icon}</span>
          <span className="font-semibold text-white">{title}</span>
        </div>
        {open ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
      </button>
      {open && <div className="px-6 pb-6 pt-2">{children}</div>}
    </div>
  );
}

function InputField({ label, value, onChange, placeholder, hint, masked }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  masked?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label className="block text-sm font-medium text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={masked && !show ? "password" : "text"}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          className="w-full bg-slate-900/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500/60 focus:ring-1 focus:ring-blue-500/30 transition-colors"
        />
        {masked && (
          <button type="button" onClick={() => setShow(!show)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-200">
            {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        )}
      </div>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [testingEmail, setTestingEmail] = useState(false);
  const [expandedCounty, setExpandedCounty] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/settings")
      .then(r => r.json())
      .then((data: Settings) => {
        setSettings(data);
        setForm({
          smtp_host: data.smtp_host || "",
          smtp_port: data.smtp_port || "587",
          smtp_user: data.smtp_user || "",
          smtp_from: data.smtp_from || "",
          email_recipients: data.email_recipients || "",
          auto_skip_trace: data.auto_skip_trace || "false",
          bright_data_user: data.bright_data_user || "",
        });
      })
      .catch(() => toast.error("Failed to load settings"));
  }, []);

  const set = (key: string) => (value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    try {
      const MASK = "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022";
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== undefined && v !== MASK) payload[k] = v;
      }
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error("Save failed");
      toast.success("Settings saved successfully");
      const updated = await fetch("/api/settings").then(r => r.json());
      setSettings(updated);
    } catch {
      toast.error("Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    try {
      const res = await fetch("/api/settings/test-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email_recipients?.split(",")[0]?.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Test failed");
      toast.success("Test email sent successfully");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to send test email");
    } finally {
      setTestingEmail(false);
    }
  };

  if (!settings) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
      </div>
    );
  }

  const allSources = LEAD_MATRIX.flatMap(c => c.sources);
  const liveSources = allSources.filter(s => s.status === "live").length;
  const needsAttom = allSources.filter(s => s.status === "needs_attom").length;
  const possibleSources = allSources.filter(s => s.status === "possible").length;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Atlas Settings</h1>
        <p className="text-slate-400 mt-1">Configure your lead sources, API keys, and daily delivery</p>
      </div>

      {/* Status Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: "Live Sources", value: liveSources, color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
          { label: "Possible Sources", value: possibleSources, color: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
          { label: "Needs ATTOM", value: needsAttom, color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
          { label: "Counties Active", value: LEAD_MATRIX.length, color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
        ].map(item => (
          <div key={item.label} className={`rounded-xl border p-4 ${item.bg}`}>
            <div className={`text-2xl font-bold ${item.color}`}>{item.value}</div>
            <div className="text-xs text-slate-400 mt-0.5">{item.label}</div>
          </div>
        ))}
      </div>

      {/* HOW ATLAS WORKS */}
      <Section title="How Atlas Works" icon={<BookOpen className="w-5 h-5" />} defaultOpen={false}>
        <div className="space-y-5 text-sm text-slate-300 leading-relaxed">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4">
            <p className="text-blue-300 font-semibold mb-2">Daily Automated Flow</p>
            <ol className="space-y-2 list-decimal list-inside text-slate-300">
              <li><strong>Every day at 11:00 AM ET</strong>, Atlas automatically runs all scrapers for your configured counties.</li>
              <li>Each scraper pulls from its source (court records, county portals, open data APIs, PACER RSS feeds).</li>
              <li>New leads are cross-referenced against the <strong>assessor database</strong> to enrich with property address and owner info.</li>
              <li>Duplicate leads (same property + lead type within 30 days) are automatically filtered out.</li>
              <li>New leads are saved to your permanent database and a <strong>CSV is emailed</strong> to your configured recipients.</li>
            </ol>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <p className="font-semibold text-white mb-2">Data Sources</p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li><span className="text-emerald-400">●</span> <strong>PACER RSS</strong> — Federal bankruptcy &amp; foreclosure filings (free, no auth)</li>
                <li><span className="text-emerald-400">●</span> <strong>County Portals</strong> — Sheriff sales, probate courts, tax delinquent lists</li>
                <li><span className="text-emerald-400">●</span> <strong>Open Data APIs</strong> — KC 311, Cincinnati, Huntsville (Socrata, free)</li>
                <li><span className="text-emerald-400">●</span> <strong>ArcGIS FeatureServer</strong> — Jackson County MO parcels (free, public)</li>
                <li><span className="text-yellow-400">●</span> <strong>Bright Data Proxy</strong> — Required for JCCAL (Jefferson AL)</li>
                <li><span className="text-orange-400">●</span> <strong>ATTOM Data API</strong> — Optional, unlocks AL Revenue GIS counties</li>
              </ul>
            </div>
            <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
              <p className="font-semibold text-white mb-2">Enrichment Pipeline</p>
              <ul className="space-y-1.5 text-xs text-slate-400">
                <li><span className="text-blue-400">1.</span> Lead found (name or case number only)</li>
                <li><span className="text-blue-400">2.</span> Assessor lookup by owner name → property address</li>
                <li><span className="text-blue-400">3.</span> Dedup check — skip if same lead seen recently</li>
                <li><span className="text-blue-400">4.</span> Save to database with full record</li>
                <li><span className="text-blue-400">5.</span> Optional: auto skip-trace via your API key</li>
                <li><span className="text-blue-400">6.</span> Email CSV to recipients at end of run</li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
            <p className="font-semibold text-white mb-2">Having Manus Update Your Atlas</p>
            <p className="text-slate-400 text-xs mb-3">
              Atlas runs on your own Railway server and is fully customizable. Your Manus agent has access to the full codebase and can make changes on your behalf:
            </p>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              {[
                { label: "Add new counties", example: '"Add Cuyahoga County Ohio to my Atlas"' },
                { label: "Add new lead types", example: '"Add divorce filings from AlaCourt for Jefferson County"' },
                { label: "Fix a broken scraper", example: '"The Jackson County sheriff sales aren\'t pulling — fix it"' },
                { label: "Change delivery schedule", example: '"Send my daily CSV at 7 AM instead of 11 AM"' },
                { label: "Add CRM integration", example: '"Push new leads to my RESimpli account automatically"' },
                { label: "Custom filtering", example: '"Only pull leads where assessed value is under $200k"' },
              ].map(item => (
                <div key={item.label}>
                  <p className="text-slate-300 font-medium mb-0.5">{item.label}:</p>
                  <p className="text-slate-500 italic">{item.example}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <p className="text-orange-300 font-semibold mb-1">What Requires Paid Subscriptions</p>
            <ul className="space-y-1.5 text-xs text-slate-300">
              <li><strong>Bright Data (~$15-50/mo)</strong> — Required for Jefferson County AL tax delinquent (JCCAL ArcGIS is behind Imperva WAF). Enter credentials below.</li>
              <li><strong>ATTOM Data API (~$150/mo)</strong> — Unlocks full address enrichment for Morgan, Montgomery, Limestone, Shelby, Autauga, Elmore counties in AL. Without ATTOM, these counties get owner names only.</li>
              <li><strong>ScraperAPI (~$29/mo)</strong> — Used as fallback proxy for JS-rendered pages. Many sources work without it.</li>
              <li><strong>Skip Trace API</strong> — Optional. BatchSkipTracing, PropStream, or similar. Appends phone/email to leads.</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* LEAD SOURCE MATRIX */}
      <Section title="Lead Source Matrix" icon={<Database className="w-5 h-5" />}>
        <div className="space-y-3">
          <div className="flex flex-wrap gap-3 mb-4 text-xs">
            {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][])
              .filter(([k]) => k !== "na")
              .map(([key, cfg]) => (
                <span key={key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${cfg.color}`}>
                  {cfg.icon} {cfg.label}
                </span>
              ))}
          </div>

          {LEAD_MATRIX.map(county => {
            const ckey = `${county.county}-${county.state}`;
            const isOpen = expandedCounty === ckey;
            return (
              <div key={ckey} className="border border-slate-700/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCounty(isOpen ? null : ckey)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/40 hover:bg-slate-700/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{county.county} County, {county.state}</span>
                    <span className="text-xs text-slate-500">
                      {county.sources.filter(s => s.status === "live").length} live
                      {county.sources.filter(s => s.status === "needs_attom").length > 0 &&
                        ` · ${county.sources.filter(s => s.status === "needs_attom").length} needs ATTOM`}
                    </span>
                  </div>
                  {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
                </button>
                {isOpen && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50 bg-slate-900/20">
                          <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Lead Type</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Status</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Source</th>
                          <th className="text-left px-4 py-2 text-xs font-medium text-slate-400">Notes</th>
                        </tr>
                      </thead>
                      <tbody>
                        {county.sources.map((src, i) => (
                          <tr key={i} className="border-b border-slate-700/30 last:border-0 hover:bg-slate-700/10">
                            <td className="px-4 py-2.5 text-white font-medium">{src.type}</td>
                            <td className="px-4 py-2.5"><StatusBadge status={src.status} /></td>
                            <td className="px-4 py-2.5 text-slate-300 text-xs">{src.source}</td>
                            <td className="px-4 py-2.5 text-slate-500 text-xs">{src.notes}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Section>

      {/* API KEYS */}
      <Section title="API Keys & Integrations" icon={<Key className="w-5 h-5" />}>
        <div className="space-y-6">

          {/* ScraperAPI */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">ScraperAPI</h3>
                <p className="text-xs text-slate-500 mt-0.5">Used as fallback proxy for JS-rendered pages. Many sources work without it.</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.scraper_api_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/50 text-slate-400 border-slate-600/30"}`}>
                {settings.scraper_api_configured ? "Configured" : "Not set"}
              </span>
            </div>
            <InputField
              label="ScraperAPI Key"
              value={form.scraper_api_key || ""}
              onChange={set("scraper_api_key")}
              placeholder="Enter your ScraperAPI key"
              hint="Get a key at scraperapi.com — free tier includes 1,000 requests/mo"
              masked
            />
          </div>

          <hr className="border-slate-700/50" />

          {/* Bright Data */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">Bright Data Residential Proxy</h3>
                <p className="text-xs text-slate-500 mt-0.5">Required for Jefferson County AL (JCCAL ArcGIS is behind Imperva WAF)</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.bright_data_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-orange-500/20 text-orange-300 border-orange-500/30"}`}>
                {settings.bright_data_configured ? "Configured" : "Needed for Jefferson AL"}
              </span>
            </div>
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-3 text-xs text-orange-200">
              <strong>Why this is needed:</strong> Jefferson County AL's GIS portal (gis.jccal.org) uses Imperva WAF which blocks all datacenter and VPN IPs. A residential proxy is required. Without this, Jefferson County tax delinquent enrichment returns empty results.
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <InputField
                label="Bright Data Username"
                value={form.bright_data_user || ""}
                onChange={set("bright_data_user")}
                placeholder="brd-customer-hl_xxxxx-zone-residential_proxy1"
                hint="Found in your Bright Data dashboard under Zone credentials"
              />
              <InputField
                label="Bright Data Password"
                value={form.bright_data_pass || ""}
                onChange={set("bright_data_pass")}
                placeholder="Enter your zone password"
                hint="Zone password from your Bright Data residential proxy zone"
                masked
              />
            </div>
          </div>

          <hr className="border-slate-700/50" />

          {/* ATTOM */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">
                  ATTOM Data API
                  <span className="text-xs text-slate-500 font-normal ml-2">(Optional)</span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Unlocks full address enrichment for AL Revenue GIS counties (Morgan, Montgomery, Limestone, Shelby, Autauga, Elmore)</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.attom_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/50 text-slate-400 border-slate-600/30"}`}>
                {settings.attom_configured ? "Configured" : "Optional"}
              </span>
            </div>
            <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 text-xs text-slate-400">
              <strong className="text-slate-300">Without ATTOM:</strong> These 6 AL counties return owner names from the AL DOR transcript, but no property addresses (AL Revenue GIS blocks all IPs including residential proxies).<br />
              <strong className="text-slate-300">With ATTOM (~$150/mo):</strong> Full property address + owner enrichment for all 6 counties. Ask Manus to wire up the ATTOM integration once you have a key.
            </div>
            <InputField
              label="ATTOM API Key"
              value={form.attom_api_key || ""}
              onChange={set("attom_api_key")}
              placeholder="Enter your ATTOM Data API key"
              hint="Get a key at attomdata.com — property data API for address enrichment"
              masked
            />
          </div>

          <hr className="border-slate-700/50" />

          {/* Skip Trace */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">Skip Trace API</h3>
                <p className="text-xs text-slate-500 mt-0.5">Appends phone numbers and emails to your leads automatically</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.skip_trace_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/50 text-slate-400 border-slate-600/30"}`}>
                {settings.skip_trace_configured ? "Configured" : "Not set"}
              </span>
            </div>
            <InputField
              label="Skip Trace API Key"
              value={form.skip_trace_key || ""}
              onChange={set("skip_trace_key")}
              placeholder="BatchSkipTracing, PropStream, or similar"
              hint="Compatible with BatchSkipTracing API. Ask Manus to add support for other providers."
              masked
            />
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={form.auto_skip_trace === "true"}
                onChange={e => set("auto_skip_trace")(e.target.checked ? "true" : "false")}
                className="w-4 h-4 rounded border-slate-600 bg-slate-900 text-blue-500 focus:ring-blue-500/30"
              />
              <span className="text-sm text-slate-300">Auto skip-trace new leads on import</span>
            </label>
          </div>
        </div>
      </Section>

      {/* EMAIL DELIVERY */}
      <Section title="Email Delivery" icon={<Mail className="w-5 h-5" />}>
        <div className="space-y-4">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm text-slate-400">Daily CSV reports are emailed after each scrape run</p>
            <span className={`text-xs px-2 py-1 rounded-full border ${settings.smtp_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/50 text-slate-400 border-slate-600/30"}`}>
              {settings.smtp_configured ? "SMTP Configured" : "Not configured"}
            </span>
          </div>
          <InputField
            label="Recipient Email(s)"
            value={form.email_recipients || ""}
            onChange={set("email_recipients")}
            placeholder="tina@example.com, team@example.com"
            hint="Comma-separated list of email addresses to receive daily lead reports"
          />
          <div className="grid md:grid-cols-2 gap-3">
            <InputField label="SMTP Host" value={form.smtp_host || ""} onChange={set("smtp_host")} placeholder="smtp.gmail.com" />
            <InputField label="SMTP Port" value={form.smtp_port || ""} onChange={set("smtp_port")} placeholder="587" />
          </div>
          <div className="grid md:grid-cols-2 gap-3">
            <InputField label="SMTP Username" value={form.smtp_user || ""} onChange={set("smtp_user")} placeholder="your@gmail.com" />
            <InputField label="SMTP Password" value={form.smtp_pass || ""} onChange={set("smtp_pass")} placeholder="App password" masked />
          </div>
          <InputField label="From Address" value={form.smtp_from || ""} onChange={set("smtp_from")} placeholder="Atlas <atlas@yourdomain.com>" />
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleTestEmail}
              disabled={testingEmail || !settings.smtp_configured}
              className="px-4 py-2 text-sm bg-slate-700 hover:bg-slate-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg transition-colors flex items-center gap-2"
            >
              {testingEmail ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
              Send Test Email
            </button>
            {!settings.smtp_configured && (
              <p className="text-xs text-slate-500 self-center">Configure SMTP above to enable test emails</p>
            )}
          </div>
        </div>
      </Section>

      {/* SAVE */}
      <div className="flex justify-end pt-2">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-lg transition-colors flex items-center gap-2 shadow-lg shadow-blue-500/20"
        >
          {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? "Saving..." : "Save All Settings"}
        </button>
      </div>
    </div>
  );
}
