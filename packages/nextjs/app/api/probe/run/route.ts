import { NextResponse } from "next/server";

/**
 * Kicks off the "Probe ciphernodes" GitHub workflow on demand, so a node operator who just fixed
 * something does not wait for the 10-minute cron.
 *
 * Optional: needs PROBE_DISPATCH_TOKEN, a fine-grained GitHub token with Actions: read and write on
 * the repo (PROBE_REPO, default ZakGriffith/InterfoldConsole). Without it GET answers
 * { enabled: false } and the console hides the button. Anyone who can load the page can press it,
 * so before dispatching the route looks at the workflow's recent runs and refuses while one is
 * queued or running, or for COOLDOWN_S after the last one finished. That caps the endpoint at one
 * run per cooldown however many people click; a run costs one GitHub Actions minute and dials every
 * registered node over libp2p.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.PROBE_REPO ?? "ZakGriffith/InterfoldConsole";
const WORKFLOW = process.env.PROBE_WORKFLOW ?? "probe.yaml";
/** Seconds after a run finishes before the next manual dispatch is accepted. */
const COOLDOWN_S = Number(process.env.PROBE_COOLDOWN_S ?? 180);
const token = () => process.env.PROBE_DISPATCH_TOKEN;

const gh = (path: string, init?: RequestInit) =>
  fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token()}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

type Run = { status: string; updated_at: string };

/** Why a dispatch should wait, if it should; undefined when the runs list cannot be read. */
const blocker = async (): Promise<{ reason: string; retryAfter: number } | null | undefined> => {
  const r = await gh("runs?per_page=5");
  if (!r.ok) return undefined;
  const runs = ((await r.json()) as { workflow_runs?: Run[] }).workflow_runs ?? [];
  if (runs.some(x => x.status === "queued" || x.status === "in_progress" || x.status === "waiting"))
    return { reason: "A probe is already running; the Software column updates within about a minute.", retryAfter: 60 };
  const last = runs.find(x => x.status === "completed");
  if (!last) return null;
  const ago = Math.round((Date.now() - new Date(last.updated_at).getTime()) / 1000);
  if (ago < COOLDOWN_S) {
    const wait = COOLDOWN_S - ago;
    return {
      reason: `The probe ran ${ago < 90 ? `${ago} s` : `${Math.round(ago / 60)} min`} ago; try again in ${wait < 90 ? `${wait} s` : `${Math.round(wait / 60)} min`}.`,
      retryAfter: wait,
    };
  }
  return null;
};

export async function GET() {
  return NextResponse.json({ enabled: !!token() });
}

export async function POST() {
  if (!token())
    return NextResponse.json({ error: "Manual probe runs are not configured on this deployment" }, { status: 501 });
  const wait = await blocker();
  if (wait)
    return NextResponse.json(
      { error: wait.reason, retryAfter: wait.retryAfter },
      { status: 429, headers: { "Retry-After": String(wait.retryAfter) } },
    );
  const r = await gh("dispatches", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ref: process.env.PROBE_REF ?? "main" }),
  });
  if (r.status === 204) return NextResponse.json({ ok: true });
  const detail = await r.text().catch(() => "");
  return NextResponse.json(
    { error: `GitHub answered ${r.status}${detail ? `: ${detail.slice(0, 200)}` : ""}` },
    { status: 502 },
  );
}
