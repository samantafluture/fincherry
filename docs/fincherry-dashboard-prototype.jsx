import { useState } from "react";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, AreaChart, Area,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend
} from "recharts";

// ── FinCherry Design Tokens (Deserve-inspired) ─────────────────────────

const T = {
  deepBlue: "#0B1628",
  surface: "#0F2035",
  surfaceHover: "#142A42",
  cherryPink: "#F472B6",
  cherryPinkMuted: "#F472B640",
  indigoDye: "#0D4F6A",
  sapphire: "#1A7A8A",
  softBlue: "#8B9EE0",
  coral: "#F97352",
  white: "#F0F0EC",
  muted: "#7A8BA8",
  border: "#1A2D45",
  gradientPink: "linear-gradient(135deg, #F472B6, #8B9EE0)",
  gradientSapphire: "linear-gradient(135deg, #1A7A8A, #0D4F6A)",
};

// ── Sample Data ─────────────────────────────────────────────────────────

const monthlyOverview = [
  { month: "Sep", income: 4200, expenses: 3100, savings: 1100 },
  { month: "Oct", income: 4200, expenses: 3450, savings: 750 },
  { month: "Nov", income: 4200, expenses: 2890, savings: 1310 },
  { month: "Dec", income: 4650, expenses: 3900, savings: 750 },
  { month: "Jan", income: 4200, expenses: 3200, savings: 1000 },
  { month: "Feb", income: 4200, expenses: 2750, savings: 1450 },
];

const categorySpending = [
  { name: "Housing", amount: 1150, color: T.sapphire, pct: 41.8 },
  { name: "Food & Drink", amount: 580, color: T.cherryPink, pct: 21.1 },
  { name: "Subscriptions", amount: 285, color: T.softBlue, pct: 10.4 },
  { name: "Shopping", amount: 240, color: T.coral, pct: 8.7 },
  { name: "Transportation", amount: 195, color: "#2DD4A0", pct: 7.1 },
  { name: "Health", amount: 145, color: T.indigoDye, pct: 5.3 },
  { name: "Other", amount: 155, color: T.muted, pct: 5.6 },
];

const categoryTrends = [
  { month: "Sep", food: 620, housing: 1150, subs: 275, transport: 210 },
  { month: "Oct", food: 710, housing: 1150, subs: 290, transport: 185 },
  { month: "Nov", food: 490, housing: 1150, subs: 280, transport: 175 },
  { month: "Dec", food: 850, housing: 1150, subs: 310, transport: 220 },
  { month: "Jan", food: 640, housing: 1150, subs: 285, transport: 200 },
  { month: "Feb", food: 580, housing: 1150, subs: 285, transport: 195 },
];

const goals = [
  {
    name: "Private Health Fund",
    target: 4000, current: 1450, type: "annual", deadline: "Dec 2026",
    monthlyNeeded: 255, monthlyActual: 290,
    history: [
      { month: "Sep", actual: 200, pace: 333 },
      { month: "Oct", actual: 450, pace: 667 },
      { month: "Nov", actual: 700, pace: 1000 },
      { month: "Dec", actual: 950, pace: 1333 },
      { month: "Jan", actual: 1160, pace: 1667 },
      { month: "Feb", actual: 1450, pace: 2000 },
    ],
  },
  {
    name: "Moving / House",
    target: 50000, current: 12800, type: "milestone", deadline: "2028",
    monthlyNeeded: 1550, monthlyActual: 1200,
    history: [
      { month: "Sep", actual: 8200, pace: 8200 },
      { month: "Oct", actual: 9100, pace: 9750 },
      { month: "Nov", actual: 10200, pace: 11300 },
      { month: "Dec", actual: 10800, pace: 12850 },
      { month: "Jan", actual: 11700, pace: 14400 },
      { month: "Feb", actual: 12800, pace: 15950 },
    ],
  },
];

const recentTransactions = [
  { date: "Feb 13", desc: "Metro STM - Monthly Pass", amount: -90.50, cat: "Transportation", currency: "CAD", account: "Desjardins" },
  { date: "Feb 12", desc: "IGA Supermarché", amount: -67.23, cat: "Food & Drink", currency: "CAD", account: "Desjardins" },
  { date: "Feb 12", desc: "Spotify Premium", amount: -11.99, cat: "Subscriptions", currency: "CAD", account: "Desjardins" },
  { date: "Feb 11", desc: "Hostinger VPS", amount: -15.80, cat: "Subscriptions", currency: "EUR", amountCAD: -24.12, account: "N26" },
  { date: "Feb 10", desc: "Nubank - Mercado Livre", amount: -189.90, cat: "Shopping", currency: "BRL", amountCAD: -48.72, account: "Nubank" },
  { date: "Feb 10", desc: "Railway.app", amount: -5.00, cat: "Subscriptions", currency: "USD", amountCAD: -7.15, account: "Desjardins" },
  { date: "Feb 9", desc: "Café Myriade", amount: -6.50, cat: "Food & Drink", currency: "CAD", account: "Desjardins" },
  { date: "Feb 8", desc: "Salary Deposit", amount: 4200.00, cat: "Income", currency: "CAD", account: "Desjardins" },
];

const aiInsights = [
  { type: "positive", icon: "↓", title: "Food spending down 14%", body: "Your food & drink spending dropped from $640 in January to $580 this month. Maintaining this saves an extra $720/year." },
  { type: "warning", icon: "!", title: "House goal is behind pace", body: "Contributing ~$1,200/mo but need $1,550/mo to hit $50K by 2028. Consider redirecting $350 from discretionary spending." },
  { type: "suggestion", icon: "→", title: "Subscription audit opportunity", body: "Your subscriptions total $285/mo ($3,420/yr) — 6.8% of income. Three subscriptions overlap in cloud/hosting. Could you consolidate?" },
];

const accountBreakdown = [
  { name: "Desjardins", currency: "CAD", balance: 8450, flag: "🇨🇦" },
  { name: "N26", currency: "EUR", balance: 2100, balanceCAD: 3213, flag: "🇪🇺" },
  { name: "Nubank", currency: "BRL", balance: 4500, balanceCAD: 1155, flag: "🇧🇷" },
];

// ── Helpers ──────────────────────────────────────────────────────────────

const fmt = (n) => {
  const abs = Math.abs(n);
  const formatted = abs >= 1000
    ? abs.toLocaleString("en-CA", { minimumFractionDigits: 0, maximumFractionDigits: 0 })
    : abs.toFixed(2);
  return (n < 0 ? "-$" : "$") + formatted;
};
const pct = (c, t) => Math.round((c / t) * 100);

// ── Shared Styles ───────────────────────────────────────────────────────

const card = {
  background: T.surface,
  borderRadius: 14,
  padding: 20,
  border: `1px solid ${T.border}`,
};

const mono = { fontFamily: "'JetBrains Mono', monospace" };

const tooltipStyle = {
  contentStyle: { background: T.deepBlue, border: `1px solid ${T.border}`, borderRadius: 10, color: T.white, fontSize: 12 },
};

const dateRanges = ["This month", "3 months", "6 months", "YTD"];

// ── Components ──────────────────────────────────────────────────────────

function DateFilter({ selected, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
      {dateRanges.map((r) => (
        <button key={r} onClick={() => onChange(r)} style={{
          padding: "5px 12px", borderRadius: 8, fontSize: 11, fontWeight: 500,
          background: selected === r ? T.cherryPink : T.surfaceHover,
          color: selected === r ? T.deepBlue : T.muted,
          border: "none", cursor: "pointer", transition: "all 0.15s",
        }}>{r}</button>
      ))}
    </div>
  );
}

function SummaryCards() {
  const cur = monthlyOverview[monthlyOverview.length - 1];
  const prev = monthlyOverview[monthlyOverview.length - 2];
  const rate = Math.round((cur.savings / cur.income) * 100);
  const prevRate = Math.round((prev.savings / prev.income) * 100);

  const cards = [
    { label: "Income", value: cur.income, prev: prev.income, color: "#2DD4A0" },
    { label: "Expenses", value: cur.expenses, prev: prev.expenses, color: T.coral, invert: true },
    { label: "Net Saved", value: cur.savings, prev: prev.savings, color: T.cherryPink },
    { label: "Savings Rate", value: rate, prev: prevRate, color: T.softBlue, isPct: true },
  ];

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 10 }}>
      {cards.map((c) => {
        const delta = c.value - c.prev;
        const good = c.invert ? delta <= 0 : delta >= 0;
        return (
          <div key={c.label} style={{ ...card, padding: "14px 16px" }}>
            <div style={{ fontSize: 11, color: T.muted, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6 }}>{c.label}</div>
            <div style={{ fontSize: 24, fontWeight: 600, color: c.color, ...mono }}>
              {c.isPct ? `${c.value}%` : fmt(c.value)}
            </div>
            <div style={{ fontSize: 11, color: good ? "#2DD4A0" : T.coral, marginTop: 5 }}>
              {good ? "▲" : "▼"} {c.isPct ? `${Math.abs(delta)}pp` : fmt(Math.abs(delta))} vs last mo
            </div>
          </div>
        );
      })}
    </div>
  );
}

function IncomeVsExpenses() {
  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>INCOME vs EXPENSES</h3>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={monthlyOverview} barGap={3}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v / 1000}k`} />
          <Tooltip {...tooltipStyle} formatter={(v) => [`$${v.toLocaleString()}`, undefined]} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: T.muted, paddingTop: 4 }} />
          <Bar dataKey="income" fill="#2DD4A0" radius={[5, 5, 0, 0]} name="Income" />
          <Bar dataKey="expenses" fill={T.coral} radius={[5, 5, 0, 0]} name="Expenses" />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

function CategoryDonut() {
  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 6px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>WHERE YOUR MONEY GOES</h3>
      <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 130px" }}>
          <ResponsiveContainer width={130} height={130}>
            <PieChart>
              <Pie data={categorySpending} dataKey="amount" cx="50%" cy="50%" innerRadius={38} outerRadius={60} strokeWidth={0}>
                {categorySpending.map((c, i) => <Cell key={i} fill={c.color} />)}
              </Pie>
              <Tooltip formatter={(v) => `$${v}`} {...tooltipStyle} />
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, minWidth: 155 }}>
          {categorySpending.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "3px 0", fontSize: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 8, height: 8, borderRadius: 2, background: c.color, flexShrink: 0 }} />
                <span style={{ color: T.white }}>{c.name}</span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <span style={{ color: T.muted, ...mono, fontSize: 11 }}>{c.pct}%</span>
                <span style={{ color: T.white, ...mono, fontSize: 11, minWidth: 46, textAlign: "right" }}>${c.amount}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Accounts() {
  const totalCAD = accountBreakdown.reduce((s, a) => s + (a.balanceCAD || a.balance), 0);
  return (
    <div style={card}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>ACCOUNTS</h3>
        <span style={{ fontSize: 11, color: T.cherryPink, ...mono }}>{fmt(totalCAD)} CAD</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {accountBreakdown.map((a) => (
          <div key={a.name} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 12px", background: T.surfaceHover, borderRadius: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 17 }}>{a.flag}</span>
              <div>
                <div style={{ color: T.white, fontSize: 13, fontWeight: 500 }}>{a.name}</div>
                <div style={{ color: T.muted, fontSize: 10 }}>{a.currency}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ color: T.white, fontSize: 13, ...mono, fontWeight: 600 }}>
                {a.currency === "BRL" ? "R$" : a.currency === "EUR" ? "€" : "$"}{a.balance.toLocaleString()}
              </div>
              {a.balanceCAD && <div style={{ color: T.muted, fontSize: 10, ...mono }}>{fmt(a.balanceCAD)} CAD</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function CategoryTrends() {
  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>CATEGORY TRENDS</h3>
      <ResponsiveContainer width="100%" height={190}>
        <LineChart data={categoryTrends}>
          <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
          <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
          <Tooltip {...tooltipStyle} formatter={(v) => `$${v}`} />
          <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11, color: T.muted }} />
          <Line type="monotone" dataKey="food" stroke={T.cherryPink} strokeWidth={2} dot={{ r: 2.5, fill: T.cherryPink }} name="Food" />
          <Line type="monotone" dataKey="housing" stroke={T.sapphire} strokeWidth={2} dot={{ r: 2.5, fill: T.sapphire }} name="Housing" />
          <Line type="monotone" dataKey="subs" stroke={T.softBlue} strokeWidth={2} dot={{ r: 2.5, fill: T.softBlue }} name="Subs" />
          <Line type="monotone" dataKey="transport" stroke="#2DD4A0" strokeWidth={2} dot={{ r: 2.5, fill: "#2DD4A0" }} name="Transport" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GoalTracker() {
  const [expanded, setExpanded] = useState(null);
  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 16px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>SAVINGS GOALS</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        {goals.map((g, gi) => {
          const p = pct(g.current, g.target);
          const isOpen = expanded === gi;
          const onTrack = g.monthlyActual >= g.monthlyNeeded;
          return (
            <div key={g.name}>
              <div onClick={() => setExpanded(isOpen ? null : gi)} style={{ cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                  <span style={{ color: T.white, fontSize: 14, fontWeight: 500 }}>{g.name}</span>
                  <span style={{ color: T.muted, fontSize: 12, ...mono }}>{fmt(g.current)} / {fmt(g.target)}</span>
                </div>
                <div style={{ background: T.deepBlue, borderRadius: 10, height: 22, overflow: "hidden", position: "relative" }}>
                  <div style={{
                    height: "100%", width: `${p}%`, borderRadius: 10,
                    background: onTrack ? T.gradientPink : `linear-gradient(135deg, ${T.coral}, #F9A352)`,
                    transition: "width 0.6s cubic-bezier(0.4, 0, 0.2, 1)",
                    display: "flex", alignItems: "center", justifyContent: "flex-end", paddingRight: 8,
                  }}>
                    <span style={{ fontSize: 10, fontWeight: 700, color: T.deepBlue }}>{p}%</span>
                  </div>
                </div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11 }}>
                  <span style={{ color: onTrack ? "#2DD4A0" : T.coral }}>
                    {onTrack ? "✓ On track" : "⚠ Behind pace"} — {fmt(g.monthlyActual)}/mo (need {fmt(g.monthlyNeeded)}/mo)
                  </span>
                  <span style={{ color: T.muted, fontSize: 10 }}>{isOpen ? "▲" : "▼"}</span>
                </div>
              </div>
              {isOpen && (
                <div style={{ marginTop: 14, padding: "12px 0 0", borderTop: `1px solid ${T.border}` }}>
                  <ResponsiveContainer width="100%" height={140}>
                    <AreaChart data={g.history}>
                      <CartesianGrid strokeDasharray="3 3" stroke={T.border} />
                      <XAxis dataKey="month" tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: T.muted, fontSize: 9 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${(v / 1000).toFixed(1)}k`} />
                      <Tooltip {...tooltipStyle} formatter={(v) => `$${v.toLocaleString()}`} />
                      <Area type="monotone" dataKey="pace" stroke={T.softBlue} fill={`${T.softBlue}15`} strokeDasharray="5 5" name="Ideal pace" strokeWidth={1.5} />
                      <Area type="monotone" dataKey="actual" stroke={T.cherryPink} fill={`${T.cherryPink}20`} strokeWidth={2} name="Actual" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentTransactions() {
  const currSymbols = { BRL: "R$", EUR: "€", USD: "US$" };
  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 12px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>RECENT TRANSACTIONS</h3>
      {recentTransactions.map((t, i) => (
        <div key={i} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "10px 6px", borderBottom: i < recentTransactions.length - 1 ? `1px solid ${T.border}` : "none",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ color: T.white, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.desc}</div>
            <div style={{ display: "flex", gap: 6, marginTop: 3, fontSize: 10, color: T.muted }}>
              <span>{t.date}</span>
              <span style={{ color: T.border }}>·</span>
              <span>{t.cat}</span>
              <span style={{ color: T.border }}>·</span>
              <span>{t.account}</span>
            </div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, ...mono, color: t.amount > 0 ? "#2DD4A0" : T.white }}>
              {t.amount > 0 ? "+" : ""}{fmt(t.amount)}
            </div>
            {t.currency !== "CAD" && (
              <div style={{ fontSize: 9, color: T.softBlue, ...mono }}>
                {currSymbols[t.currency] || ""}{Math.abs(t.amount).toFixed(2)} {t.currency}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function AIInsights() {
  const typeStyles = {
    positive: { bg: "#0B2420", border: "#1A4A3A", iconBg: "#2DD4A0", iconColor: T.deepBlue },
    warning: { bg: "#1F1508", border: "#3D2A0A", iconBg: T.coral, iconColor: T.deepBlue },
    suggestion: { bg: "#0F1530", border: "#1A2D55", iconBg: T.cherryPink, iconColor: T.deepBlue },
  };

  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>AI INSIGHTS</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        {aiInsights.map((ins, i) => {
          const s = typeStyles[ins.type];
          return (
            <div key={i} style={{ padding: "14px 16px", borderRadius: 10, background: s.bg, border: `1px solid ${s.border}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: 7, background: s.iconBg, color: s.iconColor,
                  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 700, flexShrink: 0,
                }}>{ins.icon}</div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.white }}>{ins.title}</span>
              </div>
              <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6, paddingLeft: 34 }}>{ins.body}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WhatIfScenario() {
  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>WHAT-IF SCENARIO</h3>
      <div style={{ background: T.surfaceHover, borderRadius: 10, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: T.muted, marginBottom: 12 }}>If you reduce Food & Drink by 20%:</div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, textAlign: "center" }}>
          {[
            { value: "$116", label: "saved / month", color: "#2DD4A0" },
            { value: "$1,392", label: "saved / year", color: T.cherryPink },
            { value: "37.2%", label: "new savings rate", color: T.softBlue },
          ].map((m) => (
            <div key={m.label}>
              <div style={{ fontSize: 20, fontWeight: 700, color: m.color, ...mono }}>{m.value}</div>
              <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>{m.label}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.6 }}>
        Redirecting the $116/mo to your House Fund would close the gap — hitting $50K by <strong style={{ color: T.cherryPink }}>April 2028</strong> instead of mid-2029.
      </div>
    </div>
  );
}

function GoalProjections() {
  return (
    <div style={card}>
      <h3 style={{ margin: "0 0 14px", fontSize: 13, color: T.muted, fontWeight: 500, letterSpacing: 0.5 }}>PROJECTIONS</h3>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <div style={{ padding: "12px 14px", background: T.surfaceHover, borderRadius: 10, borderLeft: `3px solid #2DD4A0` }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.white, marginBottom: 4 }}>Health Fund</div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            At $290/mo, you'll hit $4,000 by <strong style={{ color: "#2DD4A0" }}>November 2026</strong> — one month ahead.
          </div>
        </div>
        <div style={{ padding: "12px 14px", background: T.surfaceHover, borderRadius: 10, borderLeft: `3px solid ${T.coral}` }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: T.white, marginBottom: 4 }}>House Fund</div>
          <div style={{ fontSize: 12, color: T.muted, lineHeight: 1.5 }}>
            At $1,200/mo → <strong style={{ color: T.coral }}>mid-2029</strong> (8 months late). Increasing to $1,550/mo closes the gap.
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Tab Nav ──────────────────────────────────────────────────────────────

const tabs = [
  { id: "dashboard", label: "Dashboard", icon: "⬡" },
  { id: "goals", label: "Goals", icon: "◎" },
  { id: "ai", label: "AI", icon: "✦" },
];

// ── Main App ────────────────────────────────────────────────────────────

export default function FinCherryDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [dateRange, setDateRange] = useState("6 months");

  return (
    <div style={{ background: T.deepBlue, minHeight: "100vh", color: T.white, fontFamily: "'DM Sans', system-ui, sans-serif", paddingBottom: 76 }}>
      {/* Header */}
      <div style={{
        padding: "14px 20px 12px",
        borderBottom: `1px solid ${T.border}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        position: "sticky", top: 0, background: `${T.deepBlue}ee`,
        backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600, letterSpacing: -0.3 }}>
            Fin<span style={{ color: T.cherryPink }}>Cherry</span>
          </div>
          <div style={{ fontSize: 10, color: T.muted, marginTop: 2 }}>February 2026 · CAD base</div>
        </div>
        <div style={{ fontSize: 10, color: T.muted, textAlign: "right" }}>
          <div>Last upload: Feb 13</div>
          <div style={{ color: "#2DD4A0" }}>All synced</div>
        </div>
      </div>

      {/* Content */}
      <div style={{ padding: "14px 16px 0", maxWidth: 800, margin: "0 auto" }}>
        {activeTab === "dashboard" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <DateFilter selected={dateRange} onChange={setDateRange} />
            <SummaryCards />
            <IncomeVsExpenses />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
              <CategoryDonut />
              <Accounts />
            </div>
            <CategoryTrends />
            <RecentTransactions />
          </div>
        )}

        {activeTab === "goals" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <GoalTracker />
            <GoalProjections />
          </div>
        )}

        {activeTab === "ai" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <AIInsights />
            <WhatIfScenario />
          </div>
        )}
      </div>

      {/* Bottom Nav */}
      <div style={{
        position: "fixed", bottom: 0, left: 0, right: 0,
        background: `${T.surface}ee`, backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)",
        borderTop: `1px solid ${T.border}`,
        display: "flex", justifyContent: "center", padding: "8px 0 14px", zIndex: 20,
      }}>
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
              background: "none", border: "none", padding: "5px 32px", cursor: "pointer",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 3,
              color: active ? T.cherryPink : T.muted, transition: "color 0.15s",
            }}>
              <span style={{ fontSize: 18, filter: active ? `drop-shadow(0 0 6px ${T.cherryPinkMuted})` : "none" }}>{tab.icon}</span>
              <span style={{ fontSize: 10, fontWeight: active ? 600 : 400, letterSpacing: 0.3 }}>{tab.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
