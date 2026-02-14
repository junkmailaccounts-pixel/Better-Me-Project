const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1nNsB3nbwwgF7bPuYNoqMnc3JXng7DK0Y1Djd0SSq8zM/gviz/tq?tqx=out:csv&sheet=BetterMe_Log";

function stripOuterQuotes(s) {
  const t = String(s ?? "").trim();
  if (t.length >= 2 && t.startsWith('"') && t.endsWith('"')) return t.slice(1, -1);
  return t;
}

function parseCSV(text) {
  // Good enough for your sheet (no commas embedded inside quoted values expected)
  const lines = text.trim().split(/\r?\n/);

  const rawHeaders = lines[0].split(",").map(h => stripOuterQuotes(h.trim()));
  const rows = lines.slice(1).map(line => {
    const cols = line.split(",").map(c => stripOuterQuotes(c));
    const obj = {};
    rawHeaders.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });

  return { headers: rawHeaders, rows };
}

function asNum(v) {
  const n = Number(stripOuterQuotes(v));
  return Number.isFinite(n) ? n : 0;
}

function toISODate(s) {
  // Accepts:
  // - 2026-02-13
  // - 2/13/2026 9:15:00
  // - 2/13/2026
  // Returns YYYY-MM-DD
  const raw = stripOuterQuotes(s);
  if (!raw) return "";

  if (raw.includes("-") && raw.length >= 10) return raw.slice(0, 10);

  const part = raw.split(" ")[0];
  const m = part.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const mm = m[1].padStart(2, "0");
    const dd = m[2].padStart(2, "0");
    const yyyy = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }

  return part;
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

  const health =
    sleepPts(sleep) +
    stepsPts(steps) +
    StrengthYN * 4 +
    ProteinYN * 3 +
    CaloriesYN * 4;

  const family =
    kidsPts(kidsMin) +
    ProactiveYN * 5 +
    FollowThroughYN * 5 +
    NoEscalationYN * 5;

  const wealth =
    NoImpulseYN * 8 +
    TrackedSpendingYN * 5 +
    InvestYN * 7 +
    Skill20YN * 5;

  const creation =
    deepPts(deepMin) +
    ShippedYN * 7 +
    BuildArtifactYN * 5 +
    TomorrowOneSentenceYN * 3;

  const total = health + family + wealth + creation;

  const flags = {
    lowSleep: sleep < 6 ? 1 : 0,
    lowDeep: deepMin < 30 ? 1 : 0,
    escalation: NoEscalationYN === 0 ? 1 : 0,
    impulse: NoImpulseYN === 0 ? 1 : 0,
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
  if (!dates.length) return 0;
  let streak = 1;
  for (let i = dates.length - 1; i > 0; i--) {
    if (isConsecutiveDates(dates[i - 1], dates[i])) streak += 1;
    else break;
  }
  return streak;
}

function renderTable7(rows) {
  const cols = [
    "Date",
    "total",
    "health",
    "family",
    "wealth",
    "creation",
    "SleepHours",
    "Steps",
    "KidsMinutes",
    "DeepWorkMinutes",
  ];

  const th = cols.map(c => `<th>${c}</th>`).join("");
  const trs = rows
    .map(r => {
      const tds = cols.map(c => `<td>${r[c] ?? ""}</td>`).join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");

  return `<table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table>`;
}

function lockCanvasSize(id, height = 260) {
  const canvas = document.getElementById(id);
  const parent = canvas?.parentElement;
  const parentWidth = Math.floor(parent?.clientWidth || 800);

  canvas.width = Math.max(320, parentWidth - 36);
  canvas.height = height;
  canvas.style.width = "100%";
  canvas.style.height = `${height}px`;

  return canvas;
}

function chartOptions() {
  return {
    responsive: false,
    maintainAspectRatio: false,
    animation: false,
  };
}

async function main() {
  const status = document.getElementById("status");

  try {
    status.textContent = "Loading data from Google Sheet…";

    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);
    const text = await res.text();

    const parsed = parseCSV(text);
    let rows = parsed.rows;

    // Normalize Date: use Date OR Timestamp if present
    rows = rows
      .map(r => {
        const dateVal = r.Date || r.Timestamp || r.timestamp || "";
        return { ...r, Date: toISODate(dateVal) };
      })
      .filter(r => r.Date)
      .sort((a, b) => new Date(a.Date) - new Date(b.Date));

    if (rows.length === 0) {
      status.textContent =
        "No usable rows after parsing. Confirm your sheet has Date or Timestamp values.";
@@ -238,68 +259,68 @@ async function main() {
    const totals = computed.map(r => r.total);
    const avg7 = rollingAvg(totals, 7);
    const today = computed[computed.length - 1];

    document.getElementById("todayScore").textContent = today.total ?? "–";
    document.getElementById("avg7").textContent = avg7[avg7.length - 1] ?? "–";

    document.getElementById("pillarsToday").innerHTML =
      `Health ${today.health}/25<br>Family ${today.family}/25<br>Wealth ${today.wealth}/25<br>Creation ${today.creation}/25`;

    const last14 = computed.slice(-14);
    const warn = {
      lowSleep: last14.reduce((a, r) => a + (r.lowSleep || 0), 0),
      lowDeep: last14.reduce((a, r) => a + (r.lowDeep || 0), 0),
      escalation: last14.reduce((a, r) => a + (r.escalation || 0), 0),
      impulse: last14.reduce((a, r) => a + (r.impulse || 0), 0),
    };

    document.getElementById("warnings14").innerHTML =
      `Low sleep: ${warn.lowSleep}<br>Low deep work: ${warn.lowDeep}<br>Escalations: ${warn.escalation}<br>Impulse spends: ${warn.impulse}`;

    const dates = computed.map(r => r.Date);
    document.getElementById("streak").textContent = calcStreak(dates);

    // Charts
    new Chart(document.getElementById("scoreChart"), {
    new Chart(lockCanvasSize("scoreChart"), {
      type: "line",
      data: { labels: dates, datasets: [{ label: "Score", data: totals }] },
      options: { responsive: true, maintainAspectRatio: false },
      options: chartOptions(),
    });

    new Chart(document.getElementById("pillarsChart"), {
    new Chart(lockCanvasSize("pillarsChart"), {
      type: "line",
      data: {
        labels: last14.map(r => r.Date),
        datasets: [
          { label: "Health", data: last14.map(r => r.health) },
          { label: "Family", data: last14.map(r => r.family) },
          { label: "Wealth", data: last14.map(r => r.wealth) },
          { label: "Creation", data: last14.map(r => r.creation) },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
      options: chartOptions(),
    });

    new Chart(document.getElementById("flagsChart"), {
    new Chart(lockCanvasSize("flagsChart"), {
      type: "bar",
      data: {
        labels: ["Low sleep", "Low deep work", "Escalations", "Impulse"],
        datasets: [
          { label: "Count (14d)", data: [warn.lowSleep, warn.lowDeep, warn.escalation, warn.impulse] },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false },
      options: chartOptions(),
    });

    // Table
    document.getElementById("table7").innerHTML = renderTable7(
      computed.slice(-7).reverse()
    );

    status.textContent = `Loaded ${computed.length} rows. Last entry: ${today.Date}`;
  } catch (e) {
    status.textContent = `Error: ${e.message}`;
  }
}

main();
