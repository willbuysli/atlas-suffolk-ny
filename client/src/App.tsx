// Atlas App — Main routing and auth
// CLIENT_CONFIG is customized per client — update these values for each new build

import { useState, useEffect } from "react";
import { Route, Switch, Redirect, useLocation } from "wouter";
import AppLayout from "./components/AppLayout";
import Login from "./pages/Login";
import CountyScraper from "./pages/CountyScraper";
import PropertyCondition from "./pages/PropertyCondition";
import Settings from "./pages/Settings";


// ─── CLIENT CONFIG (customize per client) ────────────────────────────────────
// companyName: Client's business name shown in the UI
// userEmail:   Client's login email (must match ADMIN_EMAIL env var)
// userPassword: Client's login password (must match ADMIN_PASSWORD env var)
// accentColor: Brand color hex (e.g. "#DC2626" red, "#2563EB" blue)
// counties:    List of counties the client wants leads for
export const CLIENT_CONFIG = {
  companyName: "Will Buys LI",
  userEmail: "will@willbuysli.com",
  userPassword: "Will1074$",
  accentColor: "#2563EB",
  counties: [
    {
      name: "Suffolk",
      state: "NY",
      leadTypes: [
        "Tax Delinquent",
        "Pre-Foreclosure",
        "Sheriff Sale",
        "Probate",
        "Bankruptcy",
        "Code Violation",
        "Vacant/Abandoned",
        "Divorce",
        "FSBO",
        "Obituary",
        "Fire Damage",
        "Water Shut-off",
      ],
    },
  ],
};
// ─────────────────────────────────────────────────────────────────────────────

export default function App() {
  const [isAuth, setIsAuth] = useState(() => !!localStorage.getItem("atlas_auth"));
  const [apiKeys, setApiKeys] = useState<{ googleMaps: string; openAi: string }>(() => {
    try {
      return JSON.parse(localStorage.getItem("atlas_api_keys") || "{}");
    } catch {
      return { googleMaps: "", openAi: "" };
    }
  });
  const [location] = useLocation();

  const handleLogin = () => {
    localStorage.setItem("atlas_auth", "1");
    setIsAuth(true);
  };

  const handleSaveKeys = (keys: { googleMaps: string; openAi: string }) => {
    localStorage.setItem("atlas_api_keys", JSON.stringify(keys));
    setApiKeys(keys);
  };

  if (!isAuth) {
    return (
      <Login
        companyName={CLIENT_CONFIG.companyName}
        userEmail={CLIENT_CONFIG.userEmail}
        userPassword={CLIENT_CONFIG.userPassword}
        accentColor={CLIENT_CONFIG.accentColor}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <AppLayout
      companyName={CLIENT_CONFIG.companyName}
      userEmail={CLIENT_CONFIG.userEmail}
      accentColor={CLIENT_CONFIG.accentColor}
    >
      <Switch>
        <Route path="/">
          <Redirect to="/county-scraper" />
        </Route>
        <Route path="/county-scraper">
          <CountyScraper
            counties={CLIENT_CONFIG.counties}
            accentColor={CLIENT_CONFIG.accentColor}
          />
        </Route>
        <Route path="/property-condition">
          <PropertyCondition
            googleMapsConfigured={!!apiKeys.googleMaps}
            openAiConfigured={!!apiKeys.openAi}
            accentColor={CLIENT_CONFIG.accentColor}
          />
        </Route>
        <Route path="/settings">
          <Settings />
        </Route>
        <Route>
          <Redirect to="/county-scraper" />
        </Route>
      </Switch>
    </AppLayout>
  );
}
