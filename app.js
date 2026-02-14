const CSV_URL =
  "https://docs.google.com/spreadsheets/d/1nNsB3nbwwgF7bPuYNoqMnc3JXng7DK0Y1Djd0SSq8zM/gviz/tq?tqx=out:csv&sheet=BetterMe_Log";

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  const headers = lines[0].split(",").map(h => h.trim());
  const rows = lines.slice(1).map(line => {
    const cols = line.split(",");
    const obj = {};
    headers.forEach((h, i) => obj[h] = (cols[i] ?? "").trim());
    return obj;
  });
  return { headers, rows };
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function toISODate(s) {
  if (!s) return "";
  const raw = String(s).trim();
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

async function main() {
  const status = document.getElementById("status");
  status.textContent = "Fetching CSV…";

  try {
    const res = await fetch(CSV_URL, { cache: "no-store" });
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);

    const text = await res.text();
    const { headers, rows } = parseCSV(text);

    if (!rows.length) {
      status.textContent = "CSV loaded but contains zero rows.";
      return;
    }

    // Normalize Date column
    const normalized = rows.map(r => {
      const dateVal = r.Date || r.Timestamp || r.timestamp || "";
      return { ...r, Date: toISODate(dateVal) };
    });

    const withDates = normalized.filter(r => r.Date);

    if (!withDates.length) {
      status.textContent =
        "Rows exist but Date or Timestamp column not detected. Headers found: " +
        headers.join(", ");
      return;
    }

    status.textContent =
      `CSV loaded successfully. Rows: ${withDates.length}. Last Date: ${withDates[withDates.length - 1].Date}`;

  } catch (e) {
    status.textContent = "ERROR: " + e.message;
  }
}

main();
