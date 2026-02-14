const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1nNsB3nbwwgF7bPuYNoqMnc3JXng7DK0Y1Djd0SSq8zM/gviz/tq?tqx=out:csv&sheet=BetterMe_Log";

const CHART_HEIGHT = 260;
const FETCH_TIMEOUT_MS = 15000;

function stripOuterQuotes(value) {
  const text = String(value ?? "").trim();
  if (text.length >= 2 && text.startsWith('"') && text.endsWith('"')) {
    return text.slice(1, -1);
  }
  return text;
}

function splitCSVLine(line) {
  const result = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];

    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      result.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  result.push(current);
  return result;
}

function parseCSV(text) {
  const lines = String(text || "")
    .trim()
    .split(/\r?\n/)
    .filter(Boolean);

  if (!lines.length) return { headers: [], rows: [] };

  const headers = splitCSVLine(lines[0]).map(h => stripOuterQuotes(h));
  const rows = lines.slice(1).map(line => {
    const cols = splitCSVLine(line).map(c => stripOuterQuotes(c));
    const row = {};

    headers.forEach((header, index) => {
      row[header] = String(cols[index] ?? "").trim();
    });

    return row;
  });

  return { headers, rows };
}

function asNum(value) {
  const n = Number(stripOuterQuotes(value));
  return Number.isFinite(n) ? n : 0;
}

function toISODate(value) {
  const raw = stripOuterQuotes(value);
  if (!raw) return "";

  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);

  const datePart = raw.split(" ")[0];
  const match = datePart.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return "";

  const mm = match[1].padStart(2, "0");
  const dd = match[2].padStart(2, "0");
  const yyyy = match[3];
  return `${yyyy}-${mm}-${dd}`;
}

function sleepPts(x) {
  if (x >= 7 && x <= 8.5) return 8;
  if (x >= 6 && x < 7) return 6;
  if (x >= 5 && x < 6) return 3;
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

function computeScores(row) {
  const sleep = asNum(row.SleepHours);
  const steps = asNum(row.Steps);
  const kidsMin = asNum(row.KidsMinutes);
  const deepMin = asNum(row.DeepWorkMinutes);

  const health =
    sleepPts(sleep) +
    stepsPts(steps) +
    asNum(row.StrengthYN) * 4 +
    asNum(row.ProteinYN) * 3 +
    asNum(row.CaloriesYN) * 4;

  const family =
    kidsPts(kidsMin) +
    asNum(row.ProactiveYN) * 5 +
    asNum(row.FollowThroughYN) * 5 +
    asNum(row.NoEscalationYN) * 5;

  const wealth =
    asNum(row.NoImpulseYN) * 8 +
    asNum(row.TrackedSpendingYN) * 5 +
    asNum(row.InvestYN) * 7 +
    asNum(row.Skill20YN) * 5;

  const creation =
    deepPts(deepMin) +
    asNum(row.ShippedYN) * 7 +
    asNum(row.BuildArtifactYN) * 5 +
    asNum(row.TomorrowOneSentenceYN) * 3;

  const total = health + family + wealth + creation;

  return {
    health,
    family,
    wealth,
    creation,
    total,
    flags: {
      lowSleep: sleep < 6 ? 1 : 0,
      lowDeep: deepMin < 30 ? 1 : 0,
      escalation: asNum(row.NoEscalationYN) === 0 ? 1 : 0,
      impulse: asNum(row.NoImpulseYN) === 0 ? 1 : 0,
    },
  };
}

function rollingAvg(values, windowSize) {
  return values.map((_, index) => {
    const start = Math.max(0, index - windowSize + 1);
    const slice = values.slice(start, index + 1);
    const avg = slice.reduce((sum, n) => sum + n, 0) / slice.length;
    return Math.round(avg * 10) / 10;
  });
}

function isConsecutiveDates(previous, current) {
  const a = new Date(previous);
  const b = new Date(current);
  return (b - a) / (1000 * 60 * 60 * 24) === 1;
}

function calcStreak(dates) {
  if (!dates.length) return 0;

  let streak = 1;
  for (let i = dates.length - 1; i > 0; i -= 1) {
    if (isConsecutiveDates(dates[i - 1], dates[i])) {
      streak += 1;
    } else {
      break;
    }
  }

  return streak;
}

function renderTable7(rows) {
  const columns = [
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

  const head = columns.map(col => `<th>${col}</th>`).join("");
  const body = rows
    .map(row => `<tr>${columns.map(col => `<td>${row[col] ?? ""}</td>`).join("")}</tr>`)
    .join("");

  return `<table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

async function fetchWithTimeout(url, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { cache: "no-store", signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function getEl(id) {
  return document.getElementById(id);
}

function setText(id, text) {
  const el = getEl(id);
  if (el) el.textContent = text;
}

function setHTML(id, html) {
  const el = getEl(id);
  if (el) el.innerHTML = html;
}

function lockCanvasSize(id, height = CHART_HEIGHT) {
  const canvas = getEl(id);
  if (!canvas) return null;

  const parent = canvas.parentElement;
  const parentWidth = Math.floor((parent && parent.clientWidth) || 800);

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

function renderCharts({ dates, totals, last14, warn }) {
  const scoreCanvas = lockCanvasSize("scoreChart");
  const pillarsCanvas = lockCanvasSize("pillarsChart");
  const flagsCanvas = lockCanvasSize("flagsChart");

  if (scoreCanvas) {
    new Chart(scoreCanvas, {
      type: "line",
      data: { labels: dates, datasets: [{ label: "Score", data: totals }] },
      options: chartOptions(),
    });
  }

  if (pillarsCanvas) {
    new Chart(pillarsCanvas, {
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
      options: chartOptions(),
    });
  }

  if (flagsCanvas) {
    new Chart(flagsCanvas, {
      type: "bar",
      data: {
        labels: ["Low sleep", "Low deep work", "Escalations", "Impulse"],
        datasets: [{ label: "Count (14d)", data: [warn.lowSleep, warn.lowDeep, warn.escalation, warn.impulse] }],
      },
      options: chartOptions(),
    });
  }
}

function normalizeRows(rawRows) {
  return rawRows
    .map(row => {
      const dateValue = row.Date || row.Timestamp || row.timestamp || "";
      return { ...row, Date: toISODate(dateValue) };
    })
    .filter(row => row.Date)
    .sort((a, b) => new Date(a.Date) - new Date(b.Date));
}

function buildComputedRows(rows) {
  return rows.map(row => {
    const scored = computeScores(row);
    return {
      ...row,
      total: scored.total,
      health: scored.health,
      family: scored.family,
      wealth: scored.wealth,
      creation: scored.creation,
      lowSleep: scored.flags.lowSleep,
      lowDeep: scored.flags.lowDeep,
      escalation: scored.flags.escalation,
      impulse: scored.flags.impulse,
    };
  });
}

async function main() {
  const status = getEl("status");
  if (!status) return;

  try {
    status.textContent = "Loading data from Google Sheet…";

    const res = await fetchWithTimeout(CSV_URL);
    if (!res.ok) throw new Error(`CSV fetch failed: ${res.status}`);

    const text = await res.text();
    const { rows: rawRows } = parseCSV(text);
    const rows = normalizeRows(rawRows);

    if (!rows.length) {
      status.textContent = "No usable rows after parsing. Confirm your sheet has Date or Timestamp values.";
      return;
    }

    const computed = buildComputedRows(rows);
    const totals = computed.map(row => row.total);
    const avg7 = rollingAvg(totals, 7);
    const today = computed[computed.length - 1];
    const last14 = computed.slice(-14);

    const warn = {
      lowSleep: last14.reduce((sum, row) => sum + row.lowSleep, 0),
      lowDeep: last14.reduce((sum, row) => sum + row.lowDeep, 0),
      escalation: last14.reduce((sum, row) => sum + row.escalation, 0),
      impulse: last14.reduce((sum, row) => sum + row.impulse, 0),
    };

    setText("todayScore", String(today.total));
    setText("avg7", String(avg7[avg7.length - 1] ?? "–"));
    setText("streak", String(calcStreak(computed.map(row => row.Date))));

    setHTML(
      "pillarsToday",
      `Health ${today.health}/25<br>Family ${today.family}/25<br>Wealth ${today.wealth}/25<br>Creation ${today.creation}/25`
    );

    setHTML(
      "warnings14",
      `Low sleep: ${warn.lowSleep}<br>Low deep work: ${warn.lowDeep}<br>Escalations: ${warn.escalation}<br>Impulse spends: ${warn.impulse}`
    );

    setHTML("table7", renderTable7(computed.slice(-7).reverse()));

    renderCharts({
      dates: computed.map(row => row.Date),
      totals,
      last14,
      warn,
    });

    status.textContent = `Loaded ${computed.length} rows. Last entry: ${today.Date}`;
  } catch (error) {
    const message = error && error.name === "AbortError"
      ? `Error: Sheet request timed out after ${Math.round(FETCH_TIMEOUT_MS / 1000)}s.`
      : `Error: ${error.message}`;

    status.textContent = message;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  main();
});
