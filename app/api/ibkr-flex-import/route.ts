import React, { useEffect, useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, LineChart, Line, CartesianGrid, PieChart as RePieChart, Pie, Cell, Legend } from "recharts";
import { Download, Upload, LogIn, LogOut, RefreshCw, ShieldCheck, Database, AlertTriangle } from "lucide-react";

const SUPABASE_URL = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL || "" : "";
const SUPABASE_ANON_KEY = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "" : "";
const CACHE_KEY = "wheel_dashboard_cloud_cache_v1";
const CONFIG_KEY = "wheel_dashboard_supabase_config_v1";
const PIE_COLORS = ["#2563eb", "#10b981", "#f59e0b", "#8b5cf6", "#ef4444", "#06b6d4"];

type Trade = {
  id: string;
  user_id?: string;
  date: string;
  expiry_date: string;
  ticker: string;
  cycle_id: string;
  trade_type: string;
  strike: number;
  underlying_price: number;
  premium: number;
  capital_used: number;
  result: number;
  days_held: number;
  status: string;
  shares_assigned: number;
  shares_held: number;
  avg_share_cost: number;
  notes: string;
  created_at?: string;
  updated_at?: string;
};

type SupabaseConfig = {
  url: string;
  anonKey: string;
};

const blankForm: Omit<Trade, "id"> = {
  date: "",
  expiry_date: "",
  ticker: "",
  cycle_id: "",
  trade_type: "Cash-Secured Put",
  strike: 0,
  underlying_price: 0,
  premium: 0,
  capital_used: 0,
  result: 0,
  days_held: 0,
  status: "Open",
  shares_assigned: 0,
  shares_held: 0,
  avg_share_cost: 0,
  notes: "",
};

const demoTrades: Trade[] = [
  {
    id: "demo-1",
    date: "2026-03-01",
    expiry_date: "2026-03-14",
    ticker: "IBIT",
    cycle_id: "IBIT-1",
    trade_type: "Cash-Secured Put",
    strike: 48,
    underlying_price: 49.2,
    premium: 145,
    capital_used: 4800,
    result: 145,
    days_held: 13,
    status: "Expired",
    shares_assigned: 0,
    shares_held: 0,
    avg_share_cost: 0,
    notes: "Premium capture, no assignment.",
  },
  {
    id: "demo-2",
    date: "2026-03-14",
    expiry_date: "2026-03-28",
    ticker: "ASTS",
    cycle_id: "ASTS-1",
    trade_type: "Cash-Secured Put",
    strike: 30,
    underlying_price: 31.4,
    premium: 120,
    capital_used: 3000,
    result: -210,
    days_held: 14,
    status: "Assigned",
    shares_assigned: 100,
    shares_held: 100,
    avg_share_cost: 28.8,
    notes: "Accepted assignment.",
  },
  {
    id: "demo-3",
    date: "2026-03-20",
    expiry_date: "2026-03-27",
    ticker: "ASTS",
    cycle_id: "ASTS-1",
    trade_type: "Covered Call",
    strike: 34,
    underlying_price: 29.7,
    premium: 88,
    capital_used: 3000,
    result: 88,
    days_held: 7,
    status: "Open",
    shares_assigned: 0,
    shares_held: 100,
    avg_share_cost: 28.8,
    notes: "Recovery call.",
  },
];

function makeId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function currency(v: number) {
  return `$${new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v || 0)}`;
}

function number(v: number) {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v || 0);
}

function percent(v: number) {
  return `${number(v)}%`;
}

function daysBetween(start?: string, end?: string) {
  if (!start || !end) return 0;
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function calcApr(trade: Trade) {
  const held = Number(trade.days_held || 0) || daysBetween(trade.date, trade.expiry_date);
  if (!held || !trade.capital_used) return 0;
  return (trade.result / trade.capital_used) * (365 / held) * 100;
}

function readStoredConfig(): SupabaseConfig {
  if (typeof window === "undefined") return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return {
      url: SUPABASE_URL || parsed.url || "",
      anonKey: SUPABASE_ANON_KEY || parsed.anonKey || "",
    };
  } catch {
    return { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
  }
}

function saveStoredConfig(config: SupabaseConfig) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
}

function readCache(): Trade[] {
  if (typeof window === "undefined") return demoTrades;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? JSON.parse(raw) : demoTrades;
  } catch {
    return demoTrades;
  }
}

function saveCache(trades: Trade[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CACHE_KEY, JSON.stringify(trades));
}

function computeMetrics(trades: Trade[]) {
  const totalPremium = trades.reduce((s, t) => s + Number(t.premium || 0), 0);
  const totalPnL = trades.reduce((s, t) => s + Number(t.result || 0), 0);
  const totalCapital = trades.reduce((s, t) => s + Number(t.capital_used || 0), 0);
  const closed = trades.filter((t) => t.status !== "Open");
  const wins = closed.filter((t) => t.result > 0).length;
  const losses = closed.filter((t) => t.result < 0).length;
  const aprs = trades.map(calcApr);
  return {
    totalPremium,
    totalPnL,
    totalCapital,
    wins,
    losses,
    openTrades: trades.filter((t) => t.status === "Open").length,
    assignments: trades.filter((t) => t.status === "Assigned").length,
    winRate: closed.length ? (wins / closed.length) * 100 : 0,
    avgApr: aprs.length ? aprs.reduce((a, b) => a + b, 0) / aprs.length : 0,
  };
}

export default function WheelStrategyDashboardCloud() {
  const [config, setConfig] = useState<SupabaseConfig>(readStoredConfig());
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [client, setClient] = useState<any>(null);
  const [session, setSession] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [message, setMessage] = useState("");
  const [flexQueryId, setFlexQueryId] = useState("");
  const [flexToken, setFlexToken] = useState("");
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [importStatus, setImportStatus] = useState("");
  const [error, setError] = useState("");
  const [trades, setTrades] = useState<Trade[]>(readCache());
  const [form, setForm] = useState<Omit<Trade, "id">>(blankForm);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    saveCache(trades);
  }, [trades]);

  useEffect(() => {
    if (!config.url || !config.anonKey) {
      setSupabaseReady(false);
      setClient(null);
      return;
    }
    try {
      const nextClient = createClient(config.url, config.anonKey);
      setClient(nextClient);
      setSupabaseReady(true);
    } catch {
      setSupabaseReady(false);
      setClient(null);
      setError("Supabase config looks invalid.");
    }
  }, [config]);

  useEffect(() => {
    if (!client) return;
    let mounted = true;
    client.auth.getSession().then(({ data }: any) => {
      if (mounted) setSession(data.session || null);
    });
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event: string, newSession: any) => {
      setSession(newSession || null);
    });
    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [client]);

  useEffect(() => {
    if (session?.user && client) {
      void loadTrades();
      void loadFlexConfig();
    }
  }, [session, client]);

  async function loadTrades() {
    if (!client || !session?.user) return;
    setSyncing(true);
    setError("");
    const { data, error } = await client
      .from("trades")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });
    setSyncing(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTrades((data || []) as Trade[]);
    setMessage("Synced from Supabase.");
  }

  async function handleAuth() {
    if (!client) return;
    setLoading(true);
    setError("");
    setMessage("");
    const fn = authMode === "signin" ? client.auth.signInWithPassword : client.auth.signUp;
    const { error } = await fn({ email, password });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setMessage(authMode === "signup" ? "Account created. Check email if confirmation is enabled." : "Signed in.");
  }

  async function handleSignOut() {
    if (!client) return;
    await client.auth.signOut();
    setMessage("Signed out.");
  }

  async function saveFlexConfig() {
    if (!client || !session?.user) {
      setError("Sign in first.");
      return;
    }
    if (!flexQueryId || !flexToken) {
      setError("Flex Query ID and token are required.");
      return;
    }
    setLoading(true);
    const { error } = await client.from("ibkr_flex_configs").upsert({
      user_id: session.user.id,
      flex_query_id: flexQueryId,
      token: flexToken,
      updated_at: new Date().toISOString(),
    });
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setImportStatus("IBKR Flex config saved.");
  }

  async function loadFlexConfig() {
    if (!client || !session?.user) return;
    const { data, error } = await client.from("ibkr_flex_configs").select("flex_query_id, token").maybeSingle();
    if (error) {
      setError(error.message);
      return;
    }
    if (data) {
      setFlexQueryId(data.flex_query_id || "");
      setFlexToken(data.token || "");
    }
  }

  async function runIbkrImport() {
    if (!session?.user) {
      setError("Sign in first.");
      return;
    }
    if (!flexQueryId || !flexToken) {
      setError("Save your Flex Query ID and token first.");
      return;
    }
    setLoading(true);
    setError("");
    setImportStatus("");
    try {
      const response = await fetch("/api/ibkr-flex-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supabaseUrl: config.url,
          supabaseAnonKey: config.anonKey,
          accessToken: session.access_token,
          flexQueryId,
          flexToken,
          importMode,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Import failed.");
      }
      setImportStatus(`Imported ${payload.importedCount || 0} trades from IBKR Flex.`);
      await loadTrades();
    } catch (err: any) {
      setError(err?.message || "Import failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveTrade() {
    if (!session?.user || !client) {
      setError("Sign in first.");
      return;
    }
    if (!form.date || !form.ticker || !form.capital_used) {
      setError("Date, ticker, and capital used are required.");
      return;
    }
    setLoading(true);
    setError("");
    const payload = {
      id: editingId || makeId(),
      user_id: session.user.id,
      ...form,
      ticker: form.ticker.toUpperCase(),
      cycle_id: form.cycle_id.toUpperCase(),
      days_held: Number(form.days_held || 0) || daysBetween(form.date, form.expiry_date),
    };
    const { error } = await client.from("trades").upsert(payload);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setForm(blankForm);
    setEditingId(null);
    setMessage(editingId ? "Trade updated." : "Trade saved.");
    await loadTrades();
  }

  async function deleteTrade(id: string) {
    if (!client || !session?.user) return;
    setLoading(true);
    const { error } = await client.from("trades").delete().eq("id", id);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setTrades((prev) => prev.filter((t) => t.id !== id));
    if (editingId === id) {
      setEditingId(null);
      setForm(blankForm);
    }
  }

  function startEdit(trade: Trade) {
    setEditingId(trade.id);
    setForm({
      date: trade.date,
      expiry_date: trade.expiry_date,
      ticker: trade.ticker,
      cycle_id: trade.cycle_id,
      trade_type: trade.trade_type,
      strike: trade.strike,
      underlying_price: trade.underlying_price,
      premium: trade.premium,
      capital_used: trade.capital_used,
      result: trade.result,
      days_held: trade.days_held,
      status: trade.status,
      shares_assigned: trade.shares_assigned,
      shares_held: trade.shares_held,
      avg_share_cost: trade.avg_share_cost,
      notes: trade.notes,
    });
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(trades, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wheel-trades.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportCsv() {
    const headers = [
      "date",
      "expiry_date",
      "ticker",
      "cycle_id",
      "trade_type",
      "strike",
      "underlying_price",
      "premium",
      "capital_used",
      "result",
      "days_held",
      "status",
      "shares_assigned",
      "shares_held",
      "avg_share_cost",
      "notes",
    ];
    const rows = trades.map((t) => headers.map((h) => `"${String((t as any)[h] ?? "").replaceAll('"', '""')}"`).join(","));
    const blob = new Blob([[headers.join(","), ...rows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "wheel-trades.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function importJson(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const parsed = JSON.parse(String(e.target?.result || "[]"));
        if (Array.isArray(parsed)) {
          setTrades(parsed);
          saveCache(parsed);
          setMessage("JSON imported into local cache. Sign in and sync by saving records to Supabase.");
        }
      } catch {
        setError("Could not import JSON.");
      }
    };
    reader.readAsText(file);
  }

  const metrics = useMemo(() => computeMetrics(trades), [trades]);

  const monthlyData = useMemo(() => {
    const grouped: Record<string, { month: string; pnl: number }> = {};
    [...trades].sort((a, b) => a.date.localeCompare(b.date)).forEach((t) => {
      const month = (t.date || "").slice(0, 7);
      if (!grouped[month]) grouped[month] = { month, pnl: 0 };
      grouped[month].pnl += Number(t.result || 0);
    });
    return Object.values(grouped);
  }, [trades]);

  const cumulativeData = useMemo(() => {
    let running = 0;
    return [...trades].sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
      running += Number(t.result || 0);
      return { date: t.date, cumulative: running };
    });
  }, [trades]);

  const statusData = useMemo(() => {
    const map: Record<string, number> = {};
    trades.forEach((t) => {
      map[t.status] = (map[t.status] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [trades]);

  const setupSql = `create table if not exists public.trades (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  expiry_date date,
  ticker text not null,
  cycle_id text,
  trade_type text not null,
  strike numeric default 0,
  underlying_price numeric default 0,
  premium numeric default 0,
  capital_used numeric default 0,
  result numeric default 0,
  days_held integer default 0,
  status text default 'Open',
  shares_assigned integer default 0,
  shares_held integer default 0,
  avg_share_cost numeric default 0,
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.ibkr_flex_configs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  flex_query_id text not null,
  token text not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.trades enable row level security;
alter table public.ibkr_flex_configs enable row level security;

drop policy if exists "Users can view own trades" on public.trades;
drop policy if exists "Users can insert own trades" on public.trades;
drop policy if exists "Users can update own trades" on public.trades;
drop policy if exists "Users can delete own trades" on public.trades;
create policy "Users can view own trades" on public.trades for select using (auth.uid() = user_id);
create policy "Users can insert own trades" on public.trades for insert with check (auth.uid() = user_id);
create policy "Users can update own trades" on public.trades for update using (auth.uid() = user_id);
create policy "Users can delete own trades" on public.trades for delete using (auth.uid() = user_id);

drop policy if exists "Users can view own flex config" on public.ibkr_flex_configs;
drop policy if exists "Users can insert own flex config" on public.ibkr_flex_configs;
drop policy if exists "Users can update own flex config" on public.ibkr_flex_configs;
drop policy if exists "Users can delete own flex config" on public.ibkr_flex_configs;
create policy "Users can view own flex config" on public.ibkr_flex_configs for select using (auth.uid() = user_id);
create policy "Users can insert own flex config" on public.ibkr_flex_configs for insert with check (auth.uid() = user_id);
create policy "Users can update own flex config" on public.ibkr_flex_configs for update using (auth.uid() = user_id);
create policy "Users can delete own flex config" on public.ibkr_flex_configs for delete using (auth.uid() = user_id);`;

  return (
    <div className="min-h-screen bg-slate-50 p-6 md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Wheel Dashboard Cloud</h1>
            <p className="mt-1 text-sm text-slate-600">Supabase login, per-user trade storage, and sync across devices.</p>
          </div>
          <Badge className="rounded-full px-4 py-1 text-sm">React + Supabase</Badge>
        </div>

        {!supabaseReady && (
          <Alert className="border-amber-200 bg-amber-50 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Supabase not configured yet</AlertTitle>
            <AlertDescription>
              Add your Supabase URL and anon key below, or set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in Vercel.
            </AlertDescription>
          </Alert>
        )}

        {message && (
          <Alert className="border-emerald-200 bg-emerald-50 text-emerald-900">
            <ShieldCheck className="h-4 w-4" />
            <AlertTitle>Status</AlertTitle>
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert className="border-red-200 bg-red-50 text-red-900">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <MetricCard title="Total P&L" value={currency(metrics.totalPnL)} />
          <MetricCard title="Premium Collected" value={currency(metrics.totalPremium)} />
          <MetricCard title="Win Rate" value={percent(metrics.winRate)} />
          <MetricCard title="Open Trades" value={String(metrics.openTrades)} />
          <MetricCard title="Avg APR" value={percent(metrics.avgApr)} />
        </div>

        <Tabs defaultValue="auth" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 rounded-2xl bg-white p-1 shadow-sm md:grid-cols-6">
            <TabsTrigger value="auth">Auth</TabsTrigger>
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="ibkr">IBKR Import</TabsTrigger>
            <TabsTrigger value="backup">Backup</TabsTrigger>
            <TabsTrigger value="setup">Setup</TabsTrigger>
          </TabsList>

          <TabsContent value="auth" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>Supabase connection</CardTitle>
                  <CardDescription>Stored locally for this browser unless you use Vercel env vars.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Supabase URL">
                    <Input value={config.url} onChange={(e) => setConfig({ ...config, url: e.target.value })} placeholder="https://your-project.supabase.co" />
                  </Field>
                  <Field label="Supabase anon key">
                    <Input value={config.anonKey} onChange={(e) => setConfig({ ...config, anonKey: e.target.value })} placeholder="eyJ..." />
                  </Field>
                  <div className="flex gap-2">
                    <Button onClick={() => { saveStoredConfig(config); setMessage("Supabase config saved locally."); setError(""); }}>
                      <Database className="mr-2 h-4 w-4" />Save config
                    </Button>
                    <Button variant="outline" onClick={() => setConfig({ url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY })}>Use env vars</Button>
                  </div>
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>{session?.user ? "Logged in" : authMode === "signin" ? "Sign in" : "Create account"}</CardTitle>
                  <CardDescription>{session?.user ? session.user.email : "Email/password auth through Supabase."}</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {!session?.user ? (
                    <>
                      <div className="flex gap-2">
                        <Button variant={authMode === "signin" ? "default" : "outline"} onClick={() => setAuthMode("signin")}>Sign in</Button>
                        <Button variant={authMode === "signup" ? "default" : "outline"} onClick={() => setAuthMode("signup")}>Sign up</Button>
                      </div>
                      <Field label="Email">
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </Field>
                      <Field label="Password">
                        <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
                      </Field>
                      <Button disabled={!supabaseReady || loading} onClick={handleAuth}>
                        <LogIn className="mr-2 h-4 w-4" />
                        {loading ? "Working..." : authMode === "signin" ? "Sign in" : "Create account"}
                      </Button>
                    </>
                  ) : (
                    <div className="space-y-3">
                      <div className="rounded-xl bg-slate-100 p-3 text-sm">Signed in as <strong>{session.user.email}</strong></div>
                      <div className="flex gap-2">
                        <Button onClick={loadTrades} disabled={syncing}><RefreshCw className="mr-2 h-4 w-4" />{syncing ? "Syncing..." : "Sync now"}</Button>
                        <Button variant="outline" onClick={handleSignOut}><LogOut className="mr-2 h-4 w-4" />Sign out</Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="dashboard" className="space-y-6">
            <div className="grid gap-6 xl:grid-cols-2">
              <ChartCard title="Monthly P&L">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={monthlyData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="pnl" name="P&L" radius={[8, 8, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </ChartCard>
              <ChartCard title="Trade Status Mix">
                <ResponsiveContainer width="100%" height={300}>
                  <RePieChart>
                    <Pie data={statusData} dataKey="value" nameKey="name" outerRadius={100} label>
                      {statusData.map((_, idx) => <Cell key={idx} fill={PIE_COLORS[idx % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip />
                  </RePieChart>
                </ResponsiveContainer>
              </ChartCard>
            </div>
            <ChartCard title="Cumulative Equity Curve">
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={cumulativeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Line type="monotone" dataKey="cumulative" stroke="#2563eb" strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </TabsContent>

          <TabsContent value="trades" className="space-y-6">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>{editingId ? "Edit trade" : "Add trade"}</CardTitle>
                <CardDescription>These records save to Supabase for the logged-in user.</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <Field label="Date"><Input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></Field>
                  <Field label="Expiry date"><Input type="date" value={form.expiry_date} onChange={(e) => setForm({ ...form, expiry_date: e.target.value })} /></Field>
                  <Field label="Ticker"><Input value={form.ticker} onChange={(e) => setForm({ ...form, ticker: e.target.value })} /></Field>
                  <Field label="Cycle ID"><Input value={form.cycle_id} onChange={(e) => setForm({ ...form, cycle_id: e.target.value })} /></Field>
                  <Field label="Trade type">
                    <Select value={form.trade_type} onValueChange={(value) => setForm({ ...form, trade_type: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Cash-Secured Put">Cash-Secured Put</SelectItem>
                        <SelectItem value="Covered Call">Covered Call</SelectItem>
                        <SelectItem value="Share Sale">Share Sale</SelectItem>
                        <SelectItem value="Share Buy">Share Buy</SelectItem>
                        <SelectItem value="Roll">Roll</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Strike"><Input type="number" value={form.strike} onChange={(e) => setForm({ ...form, strike: Number(e.target.value) })} /></Field>
                  <Field label="Underlying price"><Input type="number" value={form.underlying_price} onChange={(e) => setForm({ ...form, underlying_price: Number(e.target.value) })} /></Field>
                  <Field label="Premium"><Input type="number" value={form.premium} onChange={(e) => setForm({ ...form, premium: Number(e.target.value) })} /></Field>
                  <Field label="Capital used"><Input type="number" value={form.capital_used} onChange={(e) => setForm({ ...form, capital_used: Number(e.target.value) })} /></Field>
                  <Field label="Result P&L"><Input type="number" value={form.result} onChange={(e) => setForm({ ...form, result: Number(e.target.value) })} /></Field>
                  <Field label="Days held"><Input type="number" value={form.days_held} onChange={(e) => setForm({ ...form, days_held: Number(e.target.value) })} /></Field>
                  <Field label="Status">
                    <Select value={form.status} onValueChange={(value) => setForm({ ...form, status: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Open">Open</SelectItem>
                        <SelectItem value="Closed">Closed</SelectItem>
                        <SelectItem value="Expired">Expired</SelectItem>
                        <SelectItem value="Assigned">Assigned</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="Shares assigned"><Input type="number" value={form.shares_assigned} onChange={(e) => setForm({ ...form, shares_assigned: Number(e.target.value) })} /></Field>
                  <Field label="Shares held"><Input type="number" value={form.shares_held} onChange={(e) => setForm({ ...form, shares_held: Number(e.target.value) })} /></Field>
                  <Field label="Average share cost"><Input type="number" value={form.avg_share_cost} onChange={(e) => setForm({ ...form, avg_share_cost: Number(e.target.value) })} /></Field>
                </div>
                <div className="mt-4">
                  <Field label="Notes"><Textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
                </div>
                <div className="mt-5 flex flex-wrap justify-end gap-2">
                  <Button variant="outline" onClick={() => { setForm(blankForm); setEditingId(null); }}>Clear</Button>
                  <Button onClick={saveTrade} disabled={loading || !session?.user}>{editingId ? "Update trade" : "Save trade"}</Button>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Trade log</CardTitle>
                <CardDescription>{session?.user ? "Cloud-synced records for the current user." : "Showing cached demo or imported data until you sign in."}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date</TableHead>
                        <TableHead>Ticker</TableHead>
                        <TableHead>Cycle</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Premium</TableHead>
                        <TableHead>P&L</TableHead>
                        <TableHead>APR</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Action</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {trades.map((trade) => (
                        <TableRow key={trade.id}>
                          <TableCell>{trade.date}</TableCell>
                          <TableCell className="font-medium">{trade.ticker}</TableCell>
                          <TableCell>{trade.cycle_id || "-"}</TableCell>
                          <TableCell>{trade.trade_type}</TableCell>
                          <TableCell>{currency(trade.premium)}</TableCell>
                          <TableCell className={trade.result >= 0 ? "text-emerald-600" : "text-red-600"}>{currency(trade.result)}</TableCell>
                          <TableCell>{percent(calcApr(trade))}</TableCell>
                          <TableCell><Badge variant="secondary">{trade.status}</Badge></TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => startEdit(trade)}>Edit</Button>
                              <Button size="sm" variant="ghost" onClick={() => deleteTrade(trade.id)}>Delete</Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="ibkr" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>IBKR Flex import</CardTitle>
                  <CardDescription>Secure Vercel API route flow. The token stays on your backend route, not in browser calls to IBKR.</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <Field label="Flex Query ID">
                    <Input value={flexQueryId} onChange={(e) => setFlexQueryId(e.target.value)} placeholder="Activity Flex Query ID" />
                  </Field>
                  <Field label="Flex Web Service token">
                    <Input value={flexToken} onChange={(e) => setFlexToken(e.target.value)} placeholder="Read-only IBKR Flex token" />
                  </Field>
                  <Field label="Import mode">
                    <Select value={importMode} onValueChange={(value: any) => setImportMode(value)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="merge">Merge with existing trades</SelectItem>
                        <SelectItem value="replace">Replace all my trades</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={saveFlexConfig} disabled={!session?.user || loading}>Save Flex config</Button>
                    <Button onClick={runIbkrImport} disabled={!session?.user || loading}>Import from IBKR</Button>
                  </div>
                  {importStatus && <div className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-700">{importStatus}</div>}
                </CardContent>
              </Card>

              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader>
                  <CardTitle>How this import works</CardTitle>
                  <CardDescription>Vercel-ready architecture</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-sm text-slate-700">
                  <p>1. Browser signs into Supabase.</p>
                  <p>2. Browser calls <code>/api/ibkr-flex-import</code> on your Vercel app.</p>
                  <p>3. Vercel route requests the IBKR Flex XML report.</p>
                  <p>4. Vercel parses trades and upserts them into Supabase for the signed-in user.</p>
                  <p>5. Browser refreshes from Supabase.</p>
                  <div className="rounded-xl bg-slate-100 p-3 text-xs text-slate-600">
                    This is safer than calling IBKR Flex directly from the client because the import flow can live on your serverless route.
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="backup" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader><CardTitle>Export</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Button onClick={exportJson}><Download className="mr-2 h-4 w-4" />Export JSON</Button>
                  <Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export CSV</Button>
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader><CardTitle>Import</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Label htmlFor="import-json" className="inline-flex cursor-pointer items-center rounded-xl border px-4 py-2 text-sm font-medium"> <Upload className="mr-2 h-4 w-4" />Import JSON </Label>
                  <input id="import-json" type="file" accept="application/json" className="hidden" onChange={importJson} />
                </CardContent>
              </Card>
              <Card className="rounded-2xl border-0 shadow-sm">
                <CardHeader><CardTitle>Cache</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Button variant="outline" onClick={() => { setTrades(readCache()); setMessage("Loaded local cache."); }}>Load cache</Button>
                  <Button variant="outline" onClick={() => { saveCache(trades); setMessage("Saved current trades to cache."); }}>Save cache</Button>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="setup" className="space-y-6">
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Supabase setup SQL</CardTitle>
                <CardDescription>Run this in the Supabase SQL editor before using the app.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{setupSql}</pre>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Vercel env vars</CardTitle>
                <CardDescription>Use these so users do not need to paste Supabase keys in the UI.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm text-slate-700">
                <div><code>NEXT_PUBLIC_SUPABASE_URL</code></div>
                <div><code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code></div>
                <p className="pt-2">After setting them in Vercel, redeploy the project.</p>
              </CardContent>
            </Card>
            <Card className="rounded-2xl border-0 shadow-sm">
              <CardHeader>
                <CardTitle>Vercel API route for IBKR Flex</CardTitle>
                <CardDescription>Create <code>app/api/ibkr-flex-import/route.ts</code> or <code>pages/api/ibkr-flex-import.ts</code>.</CardDescription>
              </CardHeader>
              <CardContent>
                <pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs text-slate-100">{`import { createClient } from '@supabase/supabase-js';
import { XMLParser } from 'fast-xml-parser';

export async function POST(req: Request) {
  const { supabaseUrl, supabaseAnonKey, accessToken, flexQueryId, flexToken, importMode } = await req.json();

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: 'Bearer ' + accessToken } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const ua = 'Vercel-IBKR-Flex-Importer/1.0';
  const sendUrl = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/SendRequest?t=' + encodeURIComponent(flexToken) + '&q=' + encodeURIComponent(flexQueryId) + '&v=3';
  const sendRes = await fetch(sendUrl, { headers: { 'User-Agent': ua } });
  const sendXml = await sendRes.text();

  const parser = new XMLParser({ ignoreAttributes: false });
  const sendObj = parser.parse(sendXml);
  const refCode = sendObj?.FlexStatementResponse?.ReferenceCode;
  if (!refCode) {
    return Response.json({ error: 'Could not get IBKR reference code', raw: sendXml }, { status: 400 });
  }

  const getUrl = 'https://ndcdyn.interactivebrokers.com/AccountManagement/FlexWebService/GetStatement?t=' + encodeURIComponent(flexToken) + '&q=' + encodeURIComponent(refCode) + '&v=3';

  let statementXml = '';
  for (let i = 0; i < 10; i++) {
    const res = await fetch(getUrl, { headers: { 'User-Agent': ua } });
    statementXml = await res.text();
    if (!statementXml.includes('Statement generation in progress')) break;
    await new Promise(r => setTimeout(r, 1500));
  }

  const statementObj = parser.parse(statementXml);
  const rawTrades = statementObj?.FlexQueryResponse?.FlexStatements?.FlexStatement?.Trades?.Trade || [];
  const rows = Array.isArray(rawTrades) ? rawTrades : [rawTrades];

  const mapped = rows.filter(Boolean).map((row) => ({
    id: String(row.transactionID || row.tradeID || crypto.randomUUID()),
    user_id: userData.user.id,
    date: String(row.tradeDate || '').slice(0, 10),
    expiry_date: String(row.expiry || '').slice(0, 10),
    ticker: String(row.symbol || row.underlyingSymbol || '').toUpperCase(),
    cycle_id: String(row.symbol || row.underlyingSymbol || '').toUpperCase(),
    trade_type: String(row.buySell || '').toLowerCase().includes('sell') ? 'Option Sell' : 'Option Buy',
    strike: Number(row.strike || 0),
    underlying_price: 0,
    premium: Math.abs(Number(row.proceeds || row.tradeMoney || 0)),
    capital_used: 0,
    result: 0,
    days_held: 0,
    status: 'Imported',
    shares_assigned: 0,
    shares_held: 0,
    avg_share_cost: 0,
    notes: 'Imported from IBKR Flex',
  }));

  if (importMode === 'replace') {
    await supabase.from('trades').delete().eq('user_id', userData.user.id);
  }

  const { error: upsertError } = await supabase.from('trades').upsert(mapped);
  if (upsertError) {
    return Response.json({ error: upsertError.message }, { status: 400 });
  }

  return Response.json({ importedCount: mapped.length });
}`}</pre>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardContent className="p-6">
        <p className="text-sm text-slate-500">{title}</p>
        <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="rounded-2xl border-0 shadow-sm">
      <CardHeader><CardTitle>{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
