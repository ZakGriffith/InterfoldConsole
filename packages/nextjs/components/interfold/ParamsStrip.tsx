"use client";

import { Stat } from "./ui";
import { useRegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { bpsToPct, fmtDuration, fmtTokens } from "~~/utils/interfold/format";

/**
 * Live registry parameters (owner-settable; never hard-coded). Mirrors the dashboard's `opparams` strip.
 * Reads the registry directly so it can render on the public landing, outside the console context.
 */
export const ParamsStrip = () => {
  const { data: p } = useRegistryParams();
  return (
    <div className="if-stats">
      <Stat
        label="Ciphernode bond"
        value={fmtTokens(p?.requiredCiphernodeBond, "FOLD")}
        sub={
          p
            ? `stays active above ${bpsToPct(p.ciphernodeBondActiveBps)} (${fmtTokens(p.activeThreshold, "FOLD")})`
            : undefined
        }
        title={p ? `${p.requiredCiphernodeBond.toString()} wei` : undefined}
      />
      <Stat
        label="Ticket price"
        value={fmtTokens(p?.ticketPrice, "sUSDS")}
        sub="ERC-4626 shares, not dollars"
        title={p ? `${p.ticketPrice.toString()} wei` : undefined}
      />
      <Stat label="Min. tickets" value={p ? p.minTicketBalance.toString() : "—"} sub="to go active" />
      <Stat
        label="Exit delay"
        value={fmtDuration(p?.exitDelay)}
        sub={
          p
            ? `${p.numActiveOperators.toString()} active · ${p.numRegisteredOperators.toString()} registered`
            : undefined
        }
      />
    </div>
  );
};
