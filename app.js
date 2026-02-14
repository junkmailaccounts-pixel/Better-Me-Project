document.getElementById("status").textContent = "app.js loaded. Fetching CSV…";
const CSV_URL = "https://docs.google.com/spreadsheets/d/1nNsB3nbwwgF7bPuYNoqMnc3JXng7DK0Y1Djd0SSq8zM/gviz/tq?tqx=out:csv&sheet=BetterMe_Log";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cols[i] ?? "").trim());
    return obj;
  });
  return rows;
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function sleepPts(x) {
  if (x >= 7.0 && x <= 8.5) return 8;
  if (x >= 6.0 && x <= 6.9) return 6;
  if (x >= 5.0 && x <= 5.9) return 3;
  return 0;
}

function stepsPts(x) {
  if (x >= 10000) return 6;
  if (x >= 7000) return 4;
  if (x >= 4000) return 2;
  return 0;
}

function kidsPts(x) {
  if (x >= 60) return 10;
  if (x >= 30) return 7;
  if (x >= 15) return 4;
  if (x >= 1) return 2;
  return 0;
}

function deepPts(x) {
  if (x >= 120) return 10;
  if (x >= 60) return 7;
  if (x >= 30) return 4;
  if (x >= 1) return 2;
  return 0;
}

function computeScores(r) {
  const sleep = asNum(r.SleepHours);
  const steps = asNum(r.Steps);
  const kidsMin = asNum(r.KidsMinutes);
  const deepMin = asNum(r.DeepWorkMinutes);

  const StrengthYN = asNum(r.StrengthYN);
  const ProteinYN = asNum(r.ProteinYN);
  const CaloriesYN = asNum(r.CaloriesYN);

  const ProactiveYN = asNum(r.ProactiveYN);
  const FollowThroughYN = asNum(r.FollowThroughYN);
  const NoEscalationYN = asNum(r.NoEscalationYN);

  const NoImpulseYN = asNum(r.NoImpulseYN);
  const TrackedSpendingYN = asNum(r.TrackedSpendingYN);
  const InvestYN = asNum(r.InvestYN);
  const Skill20YN = asNum(r.Skill20YN);

  const ShippedYN = asNum(r.ShippedYN);
  const BuildArtifactYN = asNum(r.BuildArtifactYN);
  const TomorrowOneSentenceYN = asNum(r.TomorrowOneSentenceYN);

  const health = sleepPts(sleep) + stepsPts(steps) + (StrengthYN * 4) + (ProteinYN * 3) + (CaloriesYN * 4);
  const family = kidsPts(kidsMin) + (ProactiveYN * 5) + (FollowThroughYN * 5) + (NoEscalationYN * 5);
  const wealth = (NoImpulseYN * 8) + (TrackedSpendingYN * 5) + (InvestYN * 7) + (Skill20YN * 5);
  const creation = deepPts(deepMin) + (ShippedYN * 7) + (BuildArtifactYN * 5) + (TomorrowOneSentenceYN * 3);

  const total = health + family + wealth + creation;

  const flags = {
    lowSleep: sleep < 6 ? 1 : 0,
    lowDeep: deepMin < 30 ? 1 : 0,
    escalation: NoEscalationYN === 0 ? 1 : 0,
    impulse: NoImpulseYN === 0 ? 1 : 0
  };

  return { health, family, wealth, creation, total, flags };
}

function rollingAvg(arr, window) {
  return arr.map((_, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = arr.slice(start, i + 1);
    const avg = slice.reduce((a, b) => a + b, 0) / slice.length;
    return Math.round(avg * 10) / 10;
  });
}

function isConsecutiveDates(d1, d2) {
  const a = new Date(d1);
  const b = new Date(d2);
  const diff = (b - a) / (1000 * 60 * 60 * 24);
  return diff === 1;
}

function calcStreak(dates) {
  let streak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    if (isConsecutiveDates(dates[i - 1], dates[i])) streak += 1;
    else break;
  }
  return dates.length ? streak : 0;
}

function renderTable7(rows) {
  const cols = ["Date", "total", "health", "family", "wealth", "creation"];
  const th = cols.map(c => `<th>${c}</th>`).join("");
  const trs = rows.map(r => {
    const tds = cols.map(c => `<td>${r[c] ?? ""}</td>`).join("");
    return `<tr>${tds}</tr>`;
  }).join("");
  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

async function main() {
  const status = document.getElementById("status");

  try {
    status.textContent = "Loading data from Google Sheet…";

    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
    const text = await res.text();

    let rows = parseCSV(text);

    rows = rows
      .filter(r => r.Date)
      .sort((a, b) => new Date(a.Date) - new Date(b.Date));

    const computed = rows.map(r => {
      const s = computeScores(r);
      return {
        ...r,
        total: s.total,
        health: s.health,
        family: s.family,
        wealth: s.wealth,
        creation: s.creation,
        ...s.flags
      };
    });

    const totals = computed.map(r => r.total);
    const avg7 = rollingAvg(totals, 7);
    const today = computed[computed.length - 1];

    document.getElementById("todayScore").textContent = today?.total ?? "–";
    document.getElementById("avg7").textContent = avg7[avg7.length - 1] ?? "–";

    document.getElementById("pillarsToday").innerHTML =
      `Health ${today.health}/25<br>Family ${today.family}/25<br>Wealth ${today.wealth}/25<br>Creation ${today.creation}/25`;

    const last14 = computed.slice(-1

