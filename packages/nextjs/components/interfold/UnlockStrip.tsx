"use client";

import { type Address } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useFoldUnlock } from "~~/hooks/interfold/useFoldUnlock";
import { fmtTokens } from "~~/utils/interfold/format";

const pct = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 10_000n) / whole) / 100);
const fmtDay = (unix: number) => new Date(unix * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });

/**
 * One line under the owner strip: how much of the owner's locked FOLD (the airdrop) has unlocked so far,
 * and how much of that is still in the wallet to spend.
 */
export const UnlockStrip = ({ owner }: { owner: Address }) => {
  const { data: u } = useFoldUnlock(owner);
  const { funds } = useConsole();
  if (!u || u.total === 0n) return null;

  const done = u.lockedNow === 0n;
  const next30 = u.unlockedIn30d - u.unlockedNow;
  const p = pct(u.unlockedNow, u.total);

  return (
    <div className="if-unlock" title={`Lock policy: ${u.policies.join(", ")}. Locked FOLD still counts for bonding.`}>
      <div className="if-unlock__row">
        <span className="if-eyebrow">FOLD unlock</span>
        <span className="if-unlock__main">
          <span className="if-mono">{fmtTokens(u.unlockedNow)}</span> of{" "}
          <span className="if-mono">{fmtTokens(u.total)}</span> unlocked
          <span className="if-unlock__pct if-mono">{p.toLocaleString(undefined, { maximumFractionDigits: 1 })}%</span>
        </span>
        {funds && (
          <span className="if-unlock__held" title="Unlocked FOLD still in the wallet (transferableBalanceOf)">
            <span className="if-mono">{fmtTokens(funds.foldTransferable)}</span> still transferable
          </span>
        )}
        {!done && (
          <span className="if-unlock__side">
            {next30 > 0n && (
              <>
                <span className="if-mono">+{fmtTokens(next30)}</span> in the next 30 days ·{" "}
              </>
            )}
            {u.fullyUnlockedAt ? `fully unlocked ${fmtDay(u.fullyUnlockedAt)}` : "no time-based unlock"}
          </span>
        )}
      </div>
      <div className="if-unlock__bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}>
        <div className="if-unlock__fill" style={{ width: `${Math.min(100, Math.max(0.5, p))}%` }} />
      </div>
    </div>
  );
};
