"use client";

import { E3_FAILED, e3Outcome, useE3Activity } from "~~/hooks/interfold/useE3Activity";
import { useNetworkPulse } from "~~/hooks/interfold/useNetworkPulse";
import { fmtCompact, fmtDate, fmtTokens } from "~~/utils/interfold/format";

const Tile = ({ value, label, title }: { value: string; label: string; title?: string }) => (
  <div className="if-pulse__tile" title={title}>
    <div className="if-pulse__value">{value}</div>
    <div className="if-pulse__label">{label}</div>
  </div>
);

/** Network-wide headline numbers, as on the dashboard's "Interfold network" strip. Safe to show publicly. */
export const NetworkPulse = () => {
  const { data: n } = useNetworkPulse();
  const e3 = useE3Activity();
  const e3s = e3.data?.e3s;
  const latest = e3s?.[0];
  const e3Title = latest
    ? `Latest: E3 #${latest.num}, ${e3Outcome(latest)}${latest.requestedAt ? `, requested ${fmtDate(latest.requestedAt)}` : ""}. ${e3s!.filter(e => e.stage === E3_FAILED).length} of ${e3s!.length} failed.`
    : "No E3 requested on mainnet yet";
  return (
    <section className="if-pulse" aria-label="Network activity">
      <div className="if-pulse__head">
        <span className="if-dot-live" aria-hidden="true" />
        <span className="if-pulse__title">Interfold network</span>
        <span className="if-pulse__net">Ethereum mainnet</span>
      </div>
      <div className="if-pulse__grid">
        <Tile value={n ? n.registered.toLocaleString() : "-"} label="ciphernodes registered" />
        <Tile
          value={n ? n.active.toLocaleString() : "-"}
          label="active now"
          title="Registered, fully bonded, ticketed and eligible for sortition"
        />
        <Tile
          value={n ? fmtCompact(n.bonded) : "-"}
          label="FOLD bonded"
          title={n ? fmtTokens(n.bonded, "FOLD") : undefined}
        />
        <Tile
          value={n ? n.tickets.toLocaleString() : "-"}
          label="tickets outstanding"
          title={n ? `${fmtTokens(n.ticketBalance, "sUSDS")} of ticket balance (tFOLD supply)` : undefined}
        />
        {e3s && (
          <Tile
            value={e3s.length.toLocaleString()}
            label={e3.paused ? "E3s requested · paused" : "E3s requested"}
            title={e3.paused ? `${e3Title} New requests are paused by the Interfold team.` : e3Title}
          />
        )}
      </div>
    </section>
  );
};
