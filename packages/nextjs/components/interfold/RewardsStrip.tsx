"use client";

import { ActionButtons } from "./ActionButtons";
import { AddressLink } from "./ui";
import { type Address } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { tokenSymbol, useE3Rewards } from "~~/hooks/interfold/useE3Rewards";
import { REFUND_MANAGER } from "~~/utils/interfold/contracts";
import { fmtTokens, shortAddr } from "~~/utils/interfold/format";

type Props = {
  owner: Address;
};

/**
 * One line under the owner strip: what this owner's nodes have earned from completed E3s, how much
 * of it is still sitting in the refund manager, and a claim per node share that still has something
 * to pay. The per-operator claim is permissionless and always pays the bond owner, so any connected
 * wallet can send it. Hidden until the owner has earned anything.
 */
export const RewardsStrip = ({ owner }: Props) => {
  const { connected } = useConsole();
  const r = useE3Rewards(owner);
  if (r.byE3.length === 0) return null;
  const sym = tokenSymbol(r.byE3[0].token);
  const open = r.byE3.filter(e => e.claimable !== undefined && e.claimable > 0n);

  return (
    <div
      className="if-unlock"
      title="E3RefundManager: each committee member's share of a completed E3's payment, held for its bond owner until someone claims it"
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
        <span className="if-unlock__side">
          {open.length > 0
            ? "Any wallet can send the claim; it always pays the bond owner."
            : "Paid to the bond owner, one claim per node share."}
        </span>
      </div>
      {open.map(e => (
        <div key={e.e3Id.toString()} className="if-unlock__row">
          <span className="if-unlock__held">
            E3 #{e.num}: <span className="if-mono">{fmtTokens(e.claimable, sym)}</span> earned by{" "}
            {e.operators.map(op => (
              <AddressLink key={op.address} address={op.address} />
            ))}
          </span>
          {e.operators
            .filter(op => op.claimable !== undefined && op.claimable > 0n)
            .map(op => (
              <ActionButtons
                key={op.address}
                label={`Claim ${fmtTokens(op.claimable, sym)}${e.operators.length > 1 ? ` for ${shortAddr(op.address)}` : ""}`}
                variant="ghost"
                requires="any"
                params={{
                  address: REFUND_MANAGER.address,
                  abi: REFUND_MANAGER.abi,
                  functionName: "claimOperatorHeldSuccessReward",
                  args: [e.e3Id, op.address],
                  simulateAs: connected ?? owner,
                  summary: `Claim node ${shortAddr(op.address)}'s E3 #${e.num} reward (${fmtTokens(op.claimable, sym)}) to ${owner}`,
                }}
              />
            ))}
        </div>
      ))}
    </div>
  );
};
