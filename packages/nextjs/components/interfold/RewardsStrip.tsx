"use client";

import { ActionButtons } from "./ActionButtons";
import { AddressLink } from "./ui";
import { type Address } from "viem";
import { tokenSymbol, useE3Rewards } from "~~/hooks/interfold/useE3Rewards";
import { REFUND_MANAGER } from "~~/utils/interfold/contracts";
import { fmtTokens } from "~~/utils/interfold/format";

type Props = {
  owner: Address;
  /** Only the connection's own owner gets the claim buttons. */
  primary: boolean;
};

/**
 * One line under the owner strip: what this owner's nodes have earned from completed E3s, how much
 * of it is still sitting in the refund manager, and a claim per E3 that still has something to pay.
 * Hidden until the owner has earned anything.
 */
export const RewardsStrip = ({ owner, primary }: Props) => {
  const r = useE3Rewards(owner);
  if (r.byE3.length === 0) return null;
  const sym = tokenSymbol(r.byE3[0].token);
  const open = r.byE3.filter(e => e.claimable !== undefined && e.claimable > 0n);

  return (
    <div
      className="if-unlock"
      title="E3RefundManager: each committee member's share of a completed E3's payment, held for its bond owner until the owner claims it"
    >
      <div className="if-unlock__row">
        <span className="if-eyebrow">E3 earnings</span>
        <span className="if-unlock__main">
          <span className="if-mono">{fmtTokens(r.earned)}</span> {sym} earned
        </span>
        <span className="if-unlock__held">
          <span className="if-mono">{fmtTokens(r.claimed)}</span> claimed ·{" "}
          <span className="if-mono">{fmtTokens(r.claimable)}</span> claimable
        </span>
        <span className="if-unlock__side">Paid to the bond owner, one claim per E3.</span>
      </div>
      {open.map(e => (
        <div key={e.e3Id.toString()} className="if-unlock__row">
          <span className="if-unlock__held if-actions" style={{ gap: 6, flexWrap: "wrap" }}>
            E3 #{e.num}: <span className="if-mono">{fmtTokens(e.claimable, sym)}</span> earned by{" "}
            {e.operators.map(op => (
              <AddressLink key={op} address={op} />
            ))}
          </span>
          {primary && (
            <ActionButtons
              label={`Claim ${fmtTokens(e.claimable, sym)}`}
              variant="ghost"
              params={{
                address: REFUND_MANAGER.address,
                abi: REFUND_MANAGER.abi,
                functionName: "claimHeldSuccessReward",
                args: [e.e3Id],
                simulateAs: owner,
                summary: `Claim the E3 #${e.num} reward (${fmtTokens(e.claimable, sym)}) to ${owner}`,
              }}
            />
          )}
        </div>
      ))}
    </div>
  );
};
