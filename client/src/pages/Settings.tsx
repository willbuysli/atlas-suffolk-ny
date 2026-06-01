/**
 * Settings.tsx — Atlas Settings & Configuration
 * Sections:
 * 1. How Atlas Works — architecture guide, Manus customization info
 * 2. Lead Source Matrix — live/possible/needs_attom/blocked per county + lead type
 * 3. API Keys — Bright Data, ATTOM, Skip Trace, ScraperAPI
 * 4. Email Delivery — SMTP + recipient list
 */
import { useState, useEffect } from "react";
import { toast } from "sonner";
import {
  CheckCircle, XCircle, AlertCircle, Clock,
  ChevronDown, ChevronRight, Save, Eye, EyeOff,
  Mail, Key, Database, BookOpen, RefreshCw, Zap, Info
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

type LeadStatus = "live" | "possible" | "needs_attom" | "needs_brightdata" | "blocked" | "na";

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
  // ── MISSOURI ──────────────────────────────────────────────────────────────
  {
    county: "Jackson", state: "MO",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "Jackson County Recorder + Case.net", notes: "recorder.jacksongov.org LP docs + courts.mo.gov Case.net LP cases" },
      { type: "Tax Delinquent", status: "live", source: "Jackson County ArcGIS Parcels", notes: "ArcGIS FeatureServer, DELINQUENT='Y' field — no auth required" },
      { type: "Sheriff Sales", status: "live", source: "jacksongov.org/civil-process", notes: "Jackson County Sheriff civil process page" },
      { type: "Code Violations", status: "live", source: "KC 311 Open Data (d4px-6rwg)", notes: "Socrata API, no auth required — enriched with owner via assessor ArcGIS" },
      { type: "Fire Damage", status: "live", source: "KC 311 Open Data (fire type)", notes: "Same dataset, filtered by fire/dangerous building type" },
      { type: "Water Shutoff", status: "live", source: "KC 311 Open Data (water type)", notes: "Same dataset, filtered by water service type" },
      { type: "Vacant / Abandoned", status: "live", source: "KC 311 Open Data (vacant type)", notes: "Vacant/abandoned property complaints via 311" },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", notes: "ecf.mowb.uscourts.gov — no auth required" },
      { type: "Probate", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type PR — enriched via Jackson County assessor ArcGIS" },
      { type: "Divorce", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type D — only saved when respondent owns property in county" },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", notes: "Estate lead proxy — enriched via assessor property lookup" },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", notes: "craigslist.org/search/reo, filtered keywords" },
    ]
  },
  {
    county: "Clay", state: "MO",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case.net LP cases for Clay County — court code 12" },
      { type: "Tax Delinquent", status: "possible", source: "Clay County Collector", notes: "claycountymo.gov — HTML scrape, may need periodic updates if site changes" },
      { type: "Sheriff Sales", status: "possible", source: "Clay County Sheriff", notes: "claycountysheriff.net — scrape; ask Manus to verify if URL changes" },
      { type: "Code Violations", status: "live", source: "KC 311 Open Data", notes: "Liberty/Kearney/Gladstone addresses auto-assigned to Clay County" },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", notes: "Same feed as Jackson — covers all MO Western District counties" },
      { type: "Probate", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type PR — Clay County court code 12" },
      { type: "Divorce", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type D — Clay County court code 12" },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", notes: "Same KC metro feed — covers Clay County area" },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", notes: "Same feed as Jackson" },
    ]
  },
  {
    county: "Cass", state: "MO",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case.net LP cases for Cass County — court code 7" },
      { type: "Tax Delinquent", status: "live", source: "Cass County Collector ArcGIS", notes: "casscounty.com — confirmed working HTML scrape + ArcGIS fallback" },
      { type: "Sheriff Sales", status: "live", source: "Cass County Sheriff", notes: "casscountysheriff.net — scrape" },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", notes: "Same feed as Jackson" },
      { type: "Probate", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type PR — Cass County court code 7" },
      { type: "Divorce", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type D — Cass County court code 7" },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", notes: "KC metro feed covers Cass County area" },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", notes: "Same feed as Jackson" },
    ]
  },
  {
    county: "Platte", state: "MO",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case.net LP cases for Platte County — court code 25" },
      { type: "Tax Delinquent", status: "possible", source: "Platte County Collector", notes: "plattecountymo.gov — HTML scrape; ask Manus to verify" },
      { type: "Sheriff Sales", status: "live", source: "Platte County Sheriff", notes: "plattecountysheriff.org — civil process page" },
      { type: "Bankruptcy", status: "live", source: "PACER Western District MO RSS", notes: "Same feed as Jackson" },
      { type: "Probate", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type PR — Platte County court code 25" },
      { type: "Divorce", status: "live", source: "MO Case.net (courts.mo.gov)", notes: "Case type D — Platte County court code 25" },
      { type: "Obituaries", status: "live", source: "Legacy.com KC RSS", notes: "KC metro feed covers Platte County area" },
      { type: "FSBO", status: "live", source: "Craigslist Kansas City", notes: "Same feed as Jackson" },
    ]
  },
  // ── OHIO ──────────────────────────────────────────────────────────────────
  {
    county: "Hamilton", state: "OH",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "Hamilton County Clerk of Courts", notes: "courtclerk.org case search, caseType=F — confirmed working" },
      { type: "Tax Delinquent", status: "live", source: "wedge1.hcauditor.org", notes: "CONFIRMED WORKING: /search/re/delinquent/{year}/1 — prior year fallback included" },
      { type: "Sheriff Sales", status: "live", source: "Hamilton County RealAuction", notes: "hamilton.sheriffsaleauction.ohio.gov" },
      { type: "Code Violations", status: "live", source: "Cincinnati Open Data (dxyd-3h4p)", notes: "Socrata API, no auth required — enriched with owner via auditor" },
      { type: "Fire Damage", status: "live", source: "Cincinnati Open Data (rvmt-pkmq)", notes: "Fire incidents dataset, filtered by structure fire type" },
      { type: "Vacant / Abandoned", status: "live", source: "Cincinnati Open Data blight registry", notes: "Cincinnati blight/vacant property registry — enriched with owner" },
      { type: "Bankruptcy", status: "live", source: "PACER Southern + Northern District OH", notes: "ecf.ohsb.uscourts.gov + ecf.ohnb.uscourts.gov" },
      { type: "Probate", status: "live", source: "Hamilton County Probate Court", notes: "probatect.org case search, estate type — enriched via auditor" },
      { type: "Divorce", status: "live", source: "Hamilton County Clerk of Courts", notes: "courtclerk.org, case type D — only saved when respondent owns property" },
      { type: "Obituaries", status: "live", source: "Legacy.com Cincinnati RSS", notes: "Estate lead proxy — enriched via auditor property lookup" },
      { type: "FSBO", status: "live", source: "Craigslist Cincinnati", notes: "cincinnati.craigslist.org" },
    ]
  },
  // ── ALABAMA ───────────────────────────────────────────────────────────────
  {
    county: "Jefferson", state: "AL",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt public case search", notes: "v2.alacourt.com, caseType=CV with foreclosure filter" },
      { type: "Tax Delinquent", status: "needs_brightdata", source: "JCCAL ArcGIS (Bright Data proxy)", notes: "gis.jccal.org — behind Imperva WAF. Add Bright Data credentials below to unlock. Falls back to limited public endpoint without it." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin + jeffcosheriff.net", notes: "rubinlublin.com covers all AL counties; county page as fallback" },
      { type: "Code Violations", status: "live", source: "jeffcointouch.com code enforcement", notes: "Jefferson County code enforcement portal — enriched with owner" },
      { type: "Vacant / Abandoned", status: "live", source: "Birmingham Open Data", notes: "data.birminghamal.gov vacant/blight registry" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov — covers Jefferson/Madison/Morgan/Shelby" },
      { type: "Probate", status: "live", source: "AlaCourt caseType=PR + JCCAL enrichment", notes: "AlaCourt public search, enriched via JCCAL ArcGIS" },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", notes: "AlaCourt public search — only saved when respondent owns property" },
      { type: "Obituaries", status: "live", source: "al.com obituaries + Legacy.com", notes: "Estate lead proxy — enriched via JCCAL assessor lookup" },
      { type: "FSBO", status: "live", source: "Craigslist Birmingham", notes: "birmingham.craigslist.org" },
    ]
  },
  {
    county: "Madison", state: "AL",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt public case search", notes: "Same feed as Jefferson" },
      { type: "Tax Delinquent", status: "live", source: "madisonproperty.countygovservices.com", notes: "Accessible without proxy — POST search, confirmed working" },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin + madisoncountyal.gov", notes: "Rubin Lublin primary, county page fallback" },
      { type: "Code Violations", status: "live", source: "Huntsville Open Data (data.huntsvilleal.gov)", notes: "Socrata API, no auth required" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov" },
      { type: "Probate", status: "live", source: "AlaCourt caseType=PR", notes: "AlaCourt public search" },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", notes: "AlaCourt public search — only saved when respondent owns property" },
      { type: "Obituaries", status: "live", source: "al.com obituaries + Legacy.com", notes: "Estate lead proxy — enriched via Madison County assessor" },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", notes: "huntsville.craigslist.org" },
    ]
  },
  {
    county: "Morgan", state: "AL",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt public case search", notes: "Same feed as Jefferson" },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", notes: "gis.revenue.alabama.gov blocks all IPs — no proxy bypass available. ATTOM Data API (~$150/mo) unlocks full address enrichment." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", notes: "Statewide coverage" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov" },
      { type: "Probate", status: "live", source: "AlaCourt caseType=PR", notes: "AlaCourt public search" },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", notes: "AlaCourt public search" },
      { type: "Obituaries", status: "live", source: "al.com obituaries + Legacy.com", notes: "Estate lead proxy" },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", notes: "Same feed as Madison" },
    ]
  },
  {
    county: "Montgomery", state: "AL",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt public case search", notes: "Same feed as Jefferson" },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", notes: "gis.revenue.alabama.gov blocks all IPs. ATTOM Data API (~$150/mo) unlocks full address enrichment." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", notes: "Statewide coverage" },
      { type: "Bankruptcy", status: "live", source: "PACER Southern District AL RSS", notes: "ecf.alsb.uscourts.gov — covers Montgomery/Autauga/Elmore" },
      { type: "Probate", status: "live", source: "AlaCourt caseType=PR", notes: "AlaCourt public search" },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", notes: "AlaCourt public search" },
      { type: "Obituaries", status: "live", source: "al.com obituaries + Legacy.com", notes: "Estate lead proxy" },
      { type: "FSBO", status: "live", source: "Craigslist Montgomery", notes: "montgomery.craigslist.org" },
    ]
  },
  {
    county: "Shelby", state: "AL",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt public case search", notes: "Same feed as Jefferson" },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", notes: "gis.revenue.alabama.gov blocks all IPs. ATTOM Data API (~$150/mo) unlocks full address enrichment." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", notes: "Statewide coverage" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov" },
      { type: "Probate", status: "live", source: "AlaCourt caseType=PR", notes: "AlaCourt public search" },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", notes: "AlaCourt public search" },
      { type: "Obituaries", status: "live", source: "al.com obituaries + Legacy.com", notes: "Estate lead proxy" },
      { type: "FSBO", status: "live", source: "Craigslist Birmingham", notes: "Same feed as Jefferson" },
    ]
  },
  {
    county: "Limestone", state: "AL",
    sources: [
      { type: "Pre-Foreclosure / Lis Pendens", status: "live", source: "AlaCourt public case search", notes: "Same feed as Jefferson" },
      { type: "Tax Delinquent", status: "needs_attom", source: "AL Revenue GIS (blocked)", notes: "gis.revenue.alabama.gov blocks all IPs. ATTOM Data API (~$150/mo) unlocks full address enrichment." },
      { type: "Sheriff Sales", status: "live", source: "Rubin Lublin", notes: "Statewide coverage" },
      { type: "Bankruptcy", status: "live", source: "PACER Northern District AL RSS", notes: "ecf.alnb.uscourts.gov" },
      { type: "Probate", status: "live", source: "AlaCourt caseType=PR", notes: "AlaCourt public search" },
      { type: "Divorce", status: "live", source: "AlaCourt caseType=DR", notes: "AlaCourt public search" },
      { type: "FSBO", status: "live", source: "Craigslist Huntsville", notes: "Same feed as Madison" },
    ]
  },
];

const STATUS_CONFIG: Record<LeadStatus, { label: string; color: string; icon: React.ReactNode }> = {
  live:             { label: "Live",              color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",  icon: <CheckCircle className="w-3 h-3" /> },
  possible:         { label: "Possible",          color: "bg-yellow-500/20 text-yellow-300 border-yellow-500/30",    icon: <AlertCircle className="w-3 h-3" /> },
  needs_attom:      { label: "Needs ATTOM",       color: "bg-orange-500/20 text-orange-300 border-orange-500/30",    icon: <Key className="w-3 h-3" /> },
  needs_brightdata: { label: "Needs Bright Data", color: "bg-purple-500/20 text-purple-300 border-purple-500/30",    icon: <Zap className="w-3 h-3" /> },
  blocked:          { label: "Blocked",           color: "bg-red-500/20 text-red-300 border-red-500/30",              icon: <XCircle className="w-3 h-3" /> },
  na:               { label: "N/A",               color: "bg-slate-500/20 text-slate-400 border-slate-500/30",        icon: <Clock className="w-3 h-3" /> },
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
      const payload: Record<string, string> = {};
      for (const [k, v] of Object.entries(form)) {
        if (v !== undefined) payload[k] = v;
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
        <RefreshCw className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  const allSources = LEAD_MATRIX.flatMap(c => c.sources);
  const liveCnt = allSources.filter(s => s.status === "live").length;
  const needsActionCnt = allSources.filter(s => ["needs_attom", "needs_brightdata", "possible"].includes(s.status)).length;

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-slate-400 mt-1">Configure Atlas, view your lead sources, and manage API keys</p>
      </div>

      {/* SUMMARY BANNER */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-emerald-300">{liveCnt}</div>
          <div className="text-xs text-emerald-400 mt-1">Lead sources live</div>
        </div>
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-orange-300">{needsActionCnt}</div>
          <div className="text-xs text-orange-400 mt-1">Sources need action</div>
        </div>
        <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
          <div className="text-2xl font-bold text-blue-300">{LEAD_MATRIX.length}</div>
          <div className="text-xs text-blue-400 mt-1">Counties active</div>
        </div>
      </div>

      {/* HOW ATLAS WORKS */}
      <Section title="How Atlas Works" icon={<BookOpen className="w-5 h-5" />} defaultOpen={false}>
        <div className="space-y-6 text-sm text-slate-300">

          {/* Daily Flow */}
          <div>
            <p className="font-semibold text-white text-base mb-3">Daily Automated Flow</p>
            <div className="space-y-2">
              {[
                { step: "1", label: "Scrape", desc: "Every day at 6:00 AM Eastern Time, Atlas automatically pulls new leads from all county sources — court systems, open data portals, PACER RSS, Craigslist, and assessor databases." },
                { step: "2", label: "Enrich", desc: "Each lead is cross-referenced with the county assessor to get the owner's full name and property address. Name-based leads (probate, divorce, obituaries) are only saved if the person actually owns property in that county." },
                { step: "3", label: "Deduplicate", desc: "Every lead gets a stable ID based on county + lead type + case/parcel number. Duplicate records are silently skipped — you'll never see the same lead twice." },
                { step: "4", label: "Deliver", desc: "A CSV report of all new leads from that day's run is emailed to your configured recipients. Configure SMTP in Email Delivery below to enable this." },
              ].map(item => (
                <div key={item.step} className="flex gap-3">
                  <div className="w-6 h-6 rounded-full bg-blue-500/20 border border-blue-500/30 text-blue-300 text-xs font-bold flex items-center justify-center flex-shrink-0 mt-0.5">{item.step}</div>
                  <div>
                    <span className="font-medium text-white">{item.label}: </span>
                    <span className="text-slate-400">{item.desc}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Architecture */}
          <div className="bg-slate-900/50 rounded-lg p-4 border border-slate-700/50">
            <p className="font-semibold text-white mb-3">Architecture Map</p>
            <div className="grid md:grid-cols-2 gap-3 text-xs">
              {[
                { label: "Server", value: "Node.js + Express on Railway (your account)", icon: "🖥️" },
                { label: "Database", value: "SQLite on Railway persistent volume — all leads stored locally", icon: "🗄️" },
                { label: "Scrapers", value: "server/scrapers/ — one file per state (missouri.ts, ohio.ts, alabama.ts)", icon: "🔍" },
                { label: "Assessor Enrichment", value: "server/scrapers/assessor.ts — county ArcGIS + auditor lookups for owner name/address", icon: "🏠" },
                { label: "Cron Scheduler", value: "node-cron in server/index.ts — 6 AM EST daily, restart-safe", icon: "⏰" },
                { label: "Frontend", value: "React + Tailwind in client/src/ — served by the same Express server", icon: "🎨" },
                { label: "GitHub Repo", value: "dealsnh/atlas-national-houses — Railway auto-deploys on every push to main", icon: "📦" },
                { label: "Manus Access", value: "Your Manus agent has full access to the codebase and can make changes on your behalf", icon: "🤖" },
              ].map(item => (
                <div key={item.label} className="flex gap-2">
                  <span className="text-base">{item.icon}</span>
                  <div>
                    <span className="font-medium text-slate-200">{item.label}: </span>
                    <span className="text-slate-400">{item.value}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Adding Counties */}
          <div>
            <p className="font-semibold text-white mb-2">Adding New Counties</p>
            <p className="text-slate-400 mb-3">
              Atlas is designed to be extended. To add a new county, your Manus agent needs to:
            </p>
            <ol className="space-y-1.5 text-slate-400 list-decimal list-inside">
              <li>Identify the county's public data sources (assessor ArcGIS, court system, open data portal)</li>
              <li>Add scraper functions to the appropriate state file (or create a new one for a new state)</li>
              <li>Add the county to the <code className="text-blue-300 bg-slate-900/60 px-1 rounded">CLIENT_COUNTIES</code> env var on Railway</li>
              <li>Add the county to the assessor <code className="text-blue-300 bg-slate-900/60 px-1 rounded">LOOKUP_MAP</code> in assessor.ts for enrichment</li>
              <li>Push to GitHub — Railway auto-deploys within 3–4 minutes</li>
            </ol>
          </div>

          {/* Connecting Your Own Manus */}
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-4 space-y-4">
            <p className="font-semibold text-white text-base flex items-center gap-2">🤖 Connecting Your Own Manus to Atlas</p>
            <p className="text-slate-400 text-sm">Atlas runs on your own Railway server and GitHub repo. To have your own Manus agent update it, you need to give it write access to both. Here's the exact setup — takes about 5 minutes.</p>

            <div className="space-y-4">
              <div>
                <p className="text-blue-300 font-semibold text-sm mb-2">Step 1 — GitHub Personal Access Token (write access to your repo)</p>
                <ol className="space-y-1.5 text-slate-400 text-xs list-decimal list-inside">
                  <li>Go to <span className="text-blue-300 font-medium">github.com → Settings → Developer settings → Personal access tokens → Tokens (classic)</span></li>
                  <li>Click <strong className="text-white">Generate new token (classic)</strong></li>
                  <li>Set a name (e.g. "Manus Atlas") and expiration to <strong className="text-white">No expiration</strong></li>
                  <li>Under Scopes, check <strong className="text-white">repo</strong> (full control of private repositories) — this is the only scope needed</li>
                  <li>Click Generate — copy the token immediately (starts with <code className="text-blue-300">ghp_</code>)</li>
                  <li>Give Manus the token and say: <em className="text-slate-300">"This is my GitHub token for dealsnh/atlas-national-houses with repo scope"</em></li>
                </ol>
              </div>

              <div>
                <p className="text-blue-300 font-semibold text-sm mb-2">Step 2 — Railway API Token (deploy + env var access)</p>
                <ol className="space-y-1.5 text-slate-400 text-xs list-decimal list-inside">
                  <li>Go to <span className="text-blue-300 font-medium">railway.app → Account Settings → Tokens</span></li>
                  <li>Click <strong className="text-white">Create Token</strong> — name it "Manus"</li>
                  <li>Copy the token (it's shown once)</li>
                  <li>Give Manus the token and your Railway project name so it can trigger redeploys and set env vars</li>
                </ol>
              </div>

              <div>
                <p className="text-blue-300 font-semibold text-sm mb-2">Step 3 — How to Start Every Manus Session</p>
                <p className="text-slate-400 text-xs mb-2">Open a new Manus task and paste this at the start:</p>
                <div className="bg-slate-900/70 rounded-lg p-3 text-xs text-slate-300 font-mono border border-slate-700/40">
                  I have an Atlas lead scraper running on Railway (project: [your project name]). The code is at github.com/dealsnh/atlas-national-houses. My GitHub token is [ghp_...] and my Railway token is [your token]. I need you to [describe what you want].
                </div>
              </div>

              <div>
                <p className="text-blue-300 font-semibold text-sm mb-2">Step 4 — Cross-Reference & Spot Check After Changes</p>
                <ol className="space-y-1.5 text-slate-400 text-xs list-decimal list-inside">
                  <li>Ask Manus: <em className="text-slate-300">"Show me exactly what you changed and why before you push"</em> — review the diff</li>
                  <li>After deployment (3–4 min), check the Atlas dashboard — run a scrape and look for the new lead type in the filter</li>
                  <li>If a scraper returns 0 leads, tell Manus: <em className="text-slate-300">"The [lead type] scraper returned 0 results — check the live endpoint and fix the field names"</em></li>
                  <li>Ask Manus to verify changes against the live county portal directly, not just assume the URL is correct</li>
                </ol>
              </div>

              <div>
                <p className="text-blue-300 font-semibold text-sm mb-2">Step 5 — Resolving Common Issues</p>
                <div className="grid md:grid-cols-2 gap-2 text-xs">
                  {[
                    { issue: "Scraper returns 0 leads", fix: '"Check the [county] [lead type] scraper — the endpoint or field names may have changed. Test the URL directly and fix it."' },
                    { issue: "Railway not deploying", fix: '"The latest GitHub push didn\'t trigger a Railway build. Check the Railway webhook and trigger a manual redeploy."' },
                    { issue: "Duplicate leads appearing", fix: '"The dedup logic uses a stable ID in db.ts — check if the ID generation changed for [lead type]."' },
                    { issue: "Enrichment returning null", fix: '"The assessor lookup for [county] is returning null — check the ArcGIS endpoint URL and response field names."' },
                    { issue: "County portal blocked", fix: '"The [county] portal is blocking Railway\'s IP. Add ScraperAPI or Bright Data proxy routing for that scraper."' },
                    { issue: "Wrong data in leads", fix: '"The [lead type] scraper is mapping the wrong fields. Show me a sample raw API response and fix the field mapping."' },
                  ].map(item => (
                    <div key={item.issue} className="bg-slate-900/40 rounded-lg p-2.5 border border-slate-700/30">
                      <p className="text-orange-300 font-medium mb-1">{item.issue}</p>
                      <p className="text-slate-500 italic">{item.fix}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Customization Examples */}
          <div>
            <p className="font-semibold text-white mb-2">What You Can Ask Manus to Do</p>
            <div className="grid md:grid-cols-2 gap-2">
              {[
                { label: "Add a new county", example: '"Add Cuyahoga County Ohio to my Atlas"' },
                { label: "Add a new lead type", example: '"Add divorce filings from AlaCourt for Jefferson County"' },
                { label: "Fix a broken scraper", example: '"The Jackson County sheriff sales aren\'t pulling — fix it"' },
                { label: "Change delivery time", example: '"Send my daily CSV at 7 AM instead of 6 AM"' },
                { label: "Add CRM integration", example: '"Push new leads to my RESimpli account automatically"' },
                { label: "Custom filtering", example: '"Only pull leads where assessed value is under $200k"' },
                { label: "Add a new data source", example: '"Add FSBO leads from Zillow for Hamilton County"' },
                { label: "Change enrichment", example: '"Add phone number lookup via Easy Button Skip Trace on import"' },
              ].map(item => (
                <div key={item.label} className="bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
                  <p className="text-slate-300 font-medium text-xs mb-1">{item.label}</p>
                  <p className="text-slate-500 italic text-xs">{item.example}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Paid Subscriptions */}
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg p-4">
            <p className="text-orange-300 font-semibold mb-3 flex items-center gap-2">
              <Info className="w-4 h-4" /> What Requires Paid Subscriptions
            </p>
            <div className="space-y-3 text-xs">
              <div className="flex gap-3">
                <span className="text-purple-300 font-semibold whitespace-nowrap">Bright Data (~$15–50/mo)</span>
                <span className="text-slate-400">Required for Jefferson County AL tax delinquent. The JCCAL ArcGIS endpoint is behind Imperva WAF — Bright Data residential proxies are the only reliable bypass. Enter credentials in API Keys below.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-orange-300 font-semibold whitespace-nowrap">ATTOM Data (~$150/mo)</span>
                <span className="text-slate-400">Unlocks full address + owner enrichment for Morgan, Montgomery, Shelby, and Limestone AL — counties where gis.revenue.alabama.gov blocks all IPs. Without ATTOM, these counties still get pre-foreclosure, bankruptcy, probate, divorce, and sheriff sales but no tax delinquent data.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-slate-300 font-semibold whitespace-nowrap">ScraperAPI (~$29/mo)</span>
                <span className="text-slate-400">Optional fallback proxy for JS-rendered pages. Most sources work without it. Useful if certain county portals start blocking the Railway server IP.</span>
              </div>
              <div className="flex gap-3">
                <span className="text-slate-300 font-semibold whitespace-nowrap">Easy Button Skip Trace (varies)</span>
                <span className="text-slate-400">Optional. Appends phone numbers and emails to leads automatically on import. Add your Easy Button Skip Trace API key in the API Keys section below.</span>
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* LEAD SOURCE MATRIX */}
      <Section title="Lead Source Matrix" icon={<Database className="w-5 h-5" />}>
        <div className="space-y-3">
          {/* Legend */}
          <div className="flex flex-wrap gap-2 mb-4 text-xs">
            {(Object.entries(STATUS_CONFIG) as [LeadStatus, typeof STATUS_CONFIG[LeadStatus]][])
              .filter(([k]) => k !== "na")
              .map(([key, cfg]) => (
                <span key={key} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${cfg.color}`}>
                  {cfg.icon} {cfg.label}
                </span>
              ))}
          </div>

          {/* Action callouts */}
          {!settings.bright_data_configured && (
            <div className="bg-purple-500/10 border border-purple-500/20 rounded-lg px-4 py-3 text-xs text-purple-300 flex items-start gap-2">
              <Zap className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span><strong>Bright Data not configured:</strong> Jefferson County AL tax delinquent is running on a limited fallback. Add Bright Data credentials in API Keys below to unlock full enrichment.</span>
            </div>
          )}
          {!settings.attom_configured && (
            <div className="bg-orange-500/10 border border-orange-500/20 rounded-lg px-4 py-3 text-xs text-orange-300 flex items-start gap-2">
              <Key className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span><strong>ATTOM not configured:</strong> Morgan, Montgomery, Shelby, and Limestone AL tax delinquent are blocked by gis.revenue.alabama.gov. Add an ATTOM API key below to unlock these counties (~$150/mo).</span>
            </div>
          )}

          {/* County rows */}
          {LEAD_MATRIX.map(county => {
            const ckey = `${county.county}-${county.state}`;
            const isOpen = expandedCounty === ckey;
            const liveCount = county.sources.filter(s => s.status === "live").length;
            const needsCount = county.sources.filter(s => ["needs_attom", "needs_brightdata", "possible"].includes(s.status)).length;
            const blockedCount = county.sources.filter(s => s.status === "blocked").length;

            return (
              <div key={ckey} className="border border-slate-700/50 rounded-lg overflow-hidden">
                <button
                  onClick={() => setExpandedCounty(isOpen ? null : ckey)}
                  className="w-full flex items-center justify-between px-4 py-3 bg-slate-900/40 hover:bg-slate-700/30 transition-colors text-left"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-medium text-white">{county.county} County, {county.state}</span>
                    <div className="flex gap-2 text-xs">
                      <span className="text-emerald-400">{liveCount} live</span>
                      {needsCount > 0 && <span className="text-orange-400">{needsCount} needs action</span>}
                      {blockedCount > 0 && <span className="text-red-400">{blockedCount} blocked</span>}
                    </div>
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
                            <td className="px-4 py-2.5 text-white font-medium whitespace-nowrap">{src.type}</td>
                            <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={src.status} /></td>
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
      <Section title="API Keys" icon={<Key className="w-5 h-5" />}>
        <div className="space-y-6">

          {/* Bright Data */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white flex items-center gap-2">
                  <Zap className="w-4 h-4 text-purple-400" /> Bright Data Proxy
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">Required for Jefferson County AL tax delinquent (JCCAL ArcGIS is behind Imperva WAF)</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.bright_data_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-purple-500/20 text-purple-300 border-purple-500/30"}`}>
                {settings.bright_data_configured ? "Configured" : "Not set"}
              </span>
            </div>
            <div className="grid md:grid-cols-2 gap-3">
              <InputField
                label="Bright Data Username"
                value={form.bright_data_user || ""}
                onChange={set("bright_data_user")}
                placeholder="brd-customer-xxxxxx-zone-xxxxx"
                hint="From Bright Data dashboard → Proxies → Residential → Access parameters"
              />
              <InputField
                label="Bright Data Password"
                value={form.bright_data_pass || ""}
                onChange={set("bright_data_pass")}
                placeholder="Your zone password"
                masked
              />
            </div>
          </div>

          <hr className="border-slate-700/50" />

          {/* ATTOM */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">ATTOM Data API</h3>
                <p className="text-xs text-slate-500 mt-0.5">Unlocks tax delinquent for Morgan, Montgomery, Shelby, Limestone AL (~$150/mo at attomdata.com)</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.attom_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/50 text-slate-400 border-slate-600/30"}`}>
                {settings.attom_configured ? "Configured" : "Not set"}
              </span>
            </div>
            <InputField
              label="ATTOM API Key"
              value={form.attom_api_key || ""}
              onChange={set("attom_api_key")}
              placeholder="Enter your ATTOM Data API key"
              hint="Once added, ask Manus to wire up the ATTOM integration for the blocked AL counties"
              masked
            />
          </div>

          <hr className="border-slate-700/50" />

          {/* ScraperAPI */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">ScraperAPI</h3>
                <p className="text-xs text-slate-500 mt-0.5">Optional fallback proxy for JS-rendered pages (~$29/mo at scraperapi.com)</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.scraper_api_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/50 text-slate-400 border-slate-600/30"}`}>
                {settings.scraper_api_configured ? "Configured" : "Not set — optional"}
              </span>
            </div>
            <InputField
              label="ScraperAPI Key"
              value={form.scraper_api_key || ""}
              onChange={set("scraper_api_key")}
              placeholder="Enter your ScraperAPI key"
              hint="Used as fallback when county portals block the Railway server IP"
              masked
            />
          </div>

          <hr className="border-slate-700/50" />

          {/* Skip Trace */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-white">Easy Button Skip Trace API</h3>
                <p className="text-xs text-slate-500 mt-0.5">Appends phone numbers and emails to your leads automatically via Easy Button Skip Trace</p>
              </div>
              <span className={`text-xs px-2 py-1 rounded-full border ${settings.skip_trace_configured ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-slate-700/50 text-slate-400 border-slate-600/30"}`}>
                {settings.skip_trace_configured ? "Configured" : "Not set — optional"}
              </span>
            </div>
            <InputField
              label="Skip Trace API Key"
              value={form.skip_trace_key || ""}
              onChange={set("skip_trace_key")}
              placeholder="Your Easy Button Skip Trace API key"
              hint="Get your API key at easybuttonskiptrace.com — paste it here to enable auto skip-tracing on new leads."
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
            <p className="text-sm text-slate-400">Daily CSV reports are emailed after each 6 AM scrape run</p>
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
