import { ImageResponse } from "next/og";

/**
 * The link-preview card (Open Graph / Twitter), rendered from code in the console's own palette so
 * it needs no design file. Satori's bundled Inter is the only font: it cannot read the site's woff2
 * files, and fetching fonts at request time would make the card flaky.
 */
export const runtime = "edge";
export const alt = "Ciphernode Console: run Interfold ciphernodes from a Safe";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const INK = "#e8edf7";
const INK_2 = "#c3cbdc";
const INK_3 = "#8f9ab4";
const RULE = "#263453";
const PAPER = "#0a0f1c";
const PAPER_2 = "#111a2c";
const PAPER_3 = "#18233a";
const ACCENT = "#4f8cff";

const badge = (label: string, kind: "good" | "working" | "muted") => {
  const c =
    kind === "good"
      ? { bg: "#0f2d24", ink: "#4fe0a3", rule: "#1e5a44" }
      : kind === "working"
        ? { bg: "#142748", ink: "#cfe0ff", rule: "#23407a" }
        : { bg: PAPER_3, ink: INK_3, rule: RULE };
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        padding: "6px 12px",
        borderRadius: 6,
        border: `1px solid ${c.rule}`,
        background: c.bg,
        color: c.ink,
        fontSize: 20,
        fontWeight: 600,
      }}
    >
      <div style={{ width: 8, height: 8, borderRadius: 8, background: c.ink }} />
      {label}
    </div>
  );
};

const row = (
  node: string,
  status: "good" | "muted",
  software: string,
  duty: string,
  dutyKind: "working" | "muted",
  odds: string,
) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      padding: "18px 28px",
      borderTop: `1px solid ${RULE}`,
      gap: 24,
    }}
  >
    <div style={{ width: 170, color: INK, fontSize: 22 }}>{node}</div>
    <div style={{ width: 170, display: "flex", whiteSpace: "nowrap" }}>
      {badge(status === "muted" ? "Needs tickets" : "Eligible", status)}
    </div>
    <div style={{ width: 120, display: "flex" }}>{badge(software, "good")}</div>
    <div style={{ display: "flex", flexGrow: 1 }}>{badge(duty, dutyKind)}</div>
    <div style={{ width: 90, color: INK_2, fontSize: 22, display: "flex", justifyContent: "flex-end" }}>{odds}</div>
  </div>
);

export default function Image() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: `linear-gradient(135deg, ${PAPER} 0%, #0d1526 100%)`,
        color: INK,
        fontFamily: "Inter",
        padding: "56px 64px 0",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, color: ACCENT, fontSize: 22, fontWeight: 600 }}>
        <div style={{ width: 14, height: 14, background: ACCENT, borderRadius: 3 }} />
        BUIDLGUIDL
      </div>
      <div style={{ display: "flex", fontSize: 76, fontWeight: 700, letterSpacing: -2, marginTop: 10 }}>
        Ciphernode Console
      </div>
      <div style={{ display: "flex", fontSize: 28, color: INK_2, marginTop: 14, lineHeight: 1.3 }}>
        Run Interfold ciphernodes from a Safe: bond, register, tickets, E3 duty, draw odds.
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          marginTop: 44,
          background: PAPER_2,
          border: `1px solid ${RULE}`,
          borderBottom: "none",
          borderRadius: "10px 10px 0 0",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            padding: "14px 28px",
            gap: 24,
            color: INK_3,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: 1,
          }}
        >
          <div style={{ width: 170 }}>NODE</div>
          <div style={{ width: 170 }}>STATUS</div>
          <div style={{ width: 120 }}>SOFTWARE</div>
          <div style={{ display: "flex", flexGrow: 1 }}>E3 DUTY</div>
          <div style={{ width: 90, display: "flex", justifyContent: "flex-end" }}>ODDS</div>
        </div>
        {row("0x18dd…97d8", "good", "0.19.0", "in committee · #4", "working", "24%")}
        {row("0x252a…5F1d", "good", "0.19.0", "not selected · #4", "muted", "12%")}
        {row("0xCdc8…0A84", "muted", "0.19.0", "no ticket · #4", "muted", "0%")}
      </div>
    </div>,
    size,
  );
}
