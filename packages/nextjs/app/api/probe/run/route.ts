import { NextResponse } from "next/server";

/**
 * Kicks off the "Probe ciphernodes" GitHub workflow on demand, so a node operator who just fixed
 * something does not wait for the 10-minute cron.
 *
 * Optional: needs PROBE_DISPATCH_TOKEN, a fine-grained GitHub token with Actions: read and write on
 * the repo (PROBE_REPO, default ZakGriffith/InterfoldConsole). Without it GET answers
 * { enabled: false } and the console hides the button. Anyone who can load the page can press it;
 * a run costs one GitHub Actions minute and GitHub rate-limits dispatches, so that is acceptable.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const REPO = process.env.PROBE_REPO ?? "ZakGriffith/InterfoldConsole";
const WORKFLOW = process.env.PROBE_WORKFLOW ?? "probe.yaml";
const token = () => process.env.PROBE_DISPATCH_TOKEN;

export async function GET() {
  return NextResponse.json({ enabled: !!token() });
}

export async function POST() {
  const t = token();
  if (!t)
    return NextResponse.json({ error: "Manual probe runs are not configured on this deployment" }, { status: 501 });
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${t}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ ref: process.env.PROBE_REF ?? "main" }),
  });
  if (r.status === 204) return NextResponse.json({ ok: true });
  const detail = await r.text().catch(() => "");
  return NextResponse.json(
    { error: `GitHub answered ${r.status}${detail ? `: ${detail.slice(0, 200)}` : ""}` },
    { status: 502 },
  );
}
