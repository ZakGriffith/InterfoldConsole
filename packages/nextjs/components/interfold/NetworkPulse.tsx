"use client";

import { useNetworkPulse } from "~~/hooks/interfold/useNetworkPulse";
import { fmtCompact, fmtTokens } from "~~/utils/interfold/format";

const Tile = ({ value, label, title }: { value: string; label: string; title?: string }) => (
  <div className="if-pulse__tile" title={title}>
    <div className="if-pulse__value">{value}</div>
    <div className="if-pulse__label">{label}</div>
  </div>
);

/** Network-wide headline numbers, as on the dashboard's "Interfold network" strip. Safe to show publicly. */
export const NetworkPulse = () => {
  const { data: n } = useNetworkPulse();
  return (
    <section className="if-pulse" aria-label="Network activity">
      <div className="if-pulse__head">
        <span className="if-dot-live" aria-hidden="true" />
        <span className="if-pulse__title">Interfold network</span>
        <span className="if-pulse__net">Ethereum mainnet</span>
      </div>
      <div className="if-pulse__grid">
        <Tile value={n ? n.registered.toLocaleString() : "—"} label="ciphernodes registered" />
        <Tile
          value={n ? n.active.toLocaleString() : "—"}
          label="active now"
          title="Registered, fully bonded, ticketed and eligible for sortition"
        />
        <Tile
          value={n ? fmtCompact(n.bonded) : "—"}
          label="FOLD bonded"
          title={n ? fmtTokens(n.bonded, "FOLD") : undefined}
        />
        <Tile
          value={n ? n.tickets.toLocaleString() : "—"}
          label="tickets outstanding"
          title={n ? `${fmtTokens(n.ticketBalance, "sUSDS")} of ticket balance (tFOLD supply)` : undefined}
        />
      </div>
    </section>
  );
};
