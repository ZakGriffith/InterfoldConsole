// Keeps the probe on a real 10-minute cadence. GitHub has been running the workflow's cron hours
// late since 2026-10-01, so an Upstash QStash schedule POSTs the console's /api/probe/run endpoint
// (which dispatches the workflow) every 10 minutes instead. QStash runs this on Upstash's side;
// nothing here needs to stay running.
//
//   QSTASH_TOKEN=... node schedule.mjs            create or replace the schedule
//   QSTASH_TOKEN=... node schedule.mjs status     show it, with the last and next fire times
//   QSTASH_TOKEN=... node schedule.mjs remove     delete it
//
// Env: QSTASH_TOKEN (Upstash console -> QStash -> Request Builder / Details), optional
// CONSOLE_URL (default https://interfold-console.vercel.app), PROBE_CRON, QSTASH_URL (QStash accounts live
// in one region, US or EU; without it the script tries both regional endpoints and uses the one that knows the token).

const token = process.env.QSTASH_TOKEN;
const REGIONS = ["https://qstash-us-east-1.upstash.io", "https://qstash-eu-central-1.upstash.io"];
let base = process.env.QSTASH_URL?.replace(/[/]+$/, "");
const consoleUrl = (process.env.CONSOLE_URL ?? "https://interfold-console.vercel.app").replace(/[/]+$/, "");
const destination = `${consoleUrl}/api/probe/run`;
const cron = process.env.PROBE_CRON ?? "*/10 * * * *";
const scheduleId = "interfold-probe";
const mode = process.argv[2] ?? "create";

if (!token) {
  console.error("Set QSTASH_TOKEN (Upstash console -> QStash).");
  process.exit(2);
}

const api = async (method, path, headers = {}) => {
  const r = await fetch(`${base}${path}`, { method, headers: { Authorization: `Bearer ${token}`, ...headers } });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path} -> ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : null;
};

if (!base) {
  for (const candidate of REGIONS) {
    const r = await fetch(`${candidate}/v2/schedules`, { headers: { Authorization: `Bearer ${token}` } });
    if (r.ok) {
      base = candidate;
      break;
    }
  }
  if (!base) {
    console.error("QSTASH_TOKEN was not accepted by the US or EU QStash endpoint.");
    process.exit(1);
  }
}

const when = ms => (ms ? new Date(ms).toISOString() : "never");

const existing = async () => {
  const all = await api("GET", "/v2/schedules");
  return all.filter(s => s.scheduleId === scheduleId || s.destination === destination);
};

if (mode === "status") {
  const list = await existing();
  if (list.length === 0) console.log(`No schedule for ${destination}`);
  for (const s of list) {
    console.log(`${s.scheduleId}  ${s.cron}  ${s.method} ${s.destination}${s.isPaused ? "  (paused)" : ""}`);
    console.log(`  last ${when(s.lastScheduleTime)}  next ${when(s.nextScheduleTime)}`);
    if (s.lastScheduleStates) console.log(`  last states ${JSON.stringify(s.lastScheduleStates)}`);
  }
} else if (mode === "remove") {
  for (const s of await existing()) {
    await api("DELETE", `/v2/schedules/${s.scheduleId}`);
    console.log(`Removed ${s.scheduleId}`);
  }
} else if (mode === "create") {
  for (const s of await existing()) {
    await api("DELETE", `/v2/schedules/${s.scheduleId}`);
    console.log(`Replaced ${s.scheduleId}`);
  }
  const probe = await fetch(destination);
  const status = await probe.json().catch(() => ({}));
  if (!status.enabled) {
    console.error(`${destination} says manual runs are not enabled: set PROBE_DISPATCH_TOKEN on the deployment first.`);
    process.exit(1);
  }
  const r = await api("POST", `/v2/schedules/${destination}`, {
    "Upstash-Cron": cron,
    "Upstash-Schedule-Id": scheduleId,
    "Upstash-Method": "POST",
    "Upstash-Retries": "2",
    "Upstash-Timeout": "20s",
  });
  console.log(`Created ${r.scheduleId}: ${cron} POST ${destination}`);
} else {
  console.error("Usage: node schedule.mjs [create|status|remove]");
  process.exit(2);
}
