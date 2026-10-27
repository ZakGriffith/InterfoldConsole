"use client";

import { type Address } from "viem";
import { REWARDS_SITE, useOwnerFoldRewards } from "~~/hooks/interfold/useFoldRewards";
import { fmtTokens } from "~~/utils/interfold/format";

const fmtDay = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtPct = (p: number) => `${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

/**
 * One line under the owner strip: what this owner has earned from the IPP-001 ciphernode rewards
 * program (12M FOLD over six biweekly epochs), what it is accruing in the running epoch, and what
 * the rest of the program would pay at that share. Numbers come from the Foundation's tracker;
 * the settlement sheets it links are authoritative. Hidden for owners the tracker has never seen.
 */
export const FoldRewardsStrip = ({ owner }: { owner: Address }) => {
  const { rewards: r, isError } = useOwnerFoldRewards(owner);
  if (!r || r.empty || isError) return null;

  const cur = r.current;
  const ep = r.currentEpoch;
  const title =
    `IPP-001: each epoch's pool is split by ticket-blocks, the sum over the epoch's blocks of this owner's tickets ` +
    `capped at ${r.cap} per bond owner (not per node). Payouts arrive VE-locked for 30 days once the epoch's ` +
    `settlement sheet clears its 48h dispute window. Estimates from rewards.theinterfold.com.`;

  return (
    <div className="if-unlock" title={title}>
      <div className="if-unlock__row">
        <span className="if-eyebrow">FOLD rewards</span>
        <span className="if-unlock__main">
          <span className="if-mono">{fmtTokens(r.settled)}</span> FOLD settled
          {r.settledEpochs > 0 && (
            <span className="if-unlock__pct if-mono">
              {r.settledEpochs} epoch{r.settledEpochs === 1 ? "" : "s"}
            </span>
          )}
        </span>
        {cur ? (
          <span className="if-unlock__held">
            <span className="if-mono">{fmtTokens(cur.payout)}</span> accruing in epoch {cur.index} ·{" "}
            <span className="if-mono">{fmtPct(cur.sharePct)}</span> share · {r.credited} of {r.cap} credited ticket
            {r.credited === 1 ? "" : "s"}
          </span>
        ) : ep ? (
          <span className="if-unlock__held">
            nothing accruing in epoch {ep.index} · {r.credited} of {r.cap} credited ticket{r.credited === 1 ? "" : "s"}
          </span>
        ) : null}
        <span className="if-unlock__side">
          {ep && (
            <>
              epoch {ep.index} ends {fmtDay(ep.endTs)} ·{" "}
            </>
          )}
          {r.projected > 0n && (
            <>
              ≈<span className="if-mono">{fmtTokens(r.projected)}</span> more{" "}
              {r.projectedEpochs === 1 ? `in epoch ${r.lastEpoch}` : `over the last ${r.projectedEpochs} epochs`} at
              this share ·{" "}
            </>
          )}
          <a href={REWARDS_SITE} target="_blank" rel="noreferrer">
            tracker →
          </a>
        </span>
      </div>
    </div>
  );
};
