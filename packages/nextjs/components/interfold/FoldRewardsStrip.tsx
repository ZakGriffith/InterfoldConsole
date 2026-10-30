"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButtons } from "./ActionButtons";
import { Disclosure, Note, TxLink } from "./ui";
import { type Abi, type Address } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type LockState, useLockStates } from "~~/hooks/interfold/useFoldLocks";
import { type FoldPayout, ownerFoldPayouts, useFoldPayouts } from "~~/hooks/interfold/useFoldPayouts";
import { REWARDS_SITE, useOwnerFoldRewards } from "~~/hooks/interfold/useFoldRewards";
import { useSafeBatch } from "~~/hooks/interfold/useSafeBatch";
import { type BatchCall, makeCall, txBuilderJson } from "~~/utils/interfold/batch";
import { GOVERNANCE, LINKS, safeQueue, safeTx } from "~~/utils/interfold/contracts";
import { fmtDuration, fmtTokens, shortAddr } from "~~/utils/interfold/format";

const fmtDay = (unix: number) =>
  new Date(unix * 1000).toLocaleDateString(undefined, { month: "short", day: "numeric" });
const fmtCooldown = (seconds: number) => (seconds % 86_400 === 0 ? `${seconds / 86_400} days` : fmtDuration(seconds));
const fmtPct = (p: number) => `${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}%`;

type Props = {
  owner: Address;
  /** Only the connection's own owner gets the exit controls. */
  primary: boolean;
};

/**
 * Under the owner strip: what this owner has earned from the IPP-001 ciphernode rewards program
 * (12M FOLD over six biweekly epochs), what has actually been paid, where that FOLD sits now, and
 * how to get it out. Earned numbers come from the Foundation's tracker; paid numbers come from the
 * chain (escrow locks the Foundation created for this owner). Hidden for owners the tracker has
 * never seen.
 */
export const FoldRewardsStrip = ({ owner, primary }: Props) => {
  const { rewards: r, isError } = useOwnerFoldRewards(owner);
  const payouts = useFoldPayouts();
  const { locks, paid, ready } = ownerFoldPayouts(payouts.data, owner);
  const tokenIds = useMemo(
    () => ownerFoldPayouts(payouts.data, owner).locks.map(l => l.tokenId),
    [payouts.data, owner],
  );
  const states = useLockStates(tokenIds);
  if (!r || r.empty || isError) return null;

  const cur = r.current;
  const ep = r.currentEpoch;
  const byId = new Map((states.data?.locks ?? []).map(s => [s.tokenId, s]));
  const withdrawn = locks.filter(l => byId.get(l.tokenId)?.phase === "withdrawn").reduce((t, l) => t + l.amount, 0n);
  const title =
    `IPP-001: each epoch's pool is split by ticket-blocks, the sum over the epoch's blocks of this owner's tickets ` +
    `capped at ${r.cap} per bond owner (not per node). "Earned" is the tracker's entitlement for closed epochs; ` +
    `"paid" is what has reached the voting escrow as locks in this owner's name once the epoch's settlement sheet ` +
    `cleared its 48h dispute window.`;

  return (
    <div className="if-unlock" title={title}>
      <div className="if-unlock__row">
        <span className="if-eyebrow">FOLD rewards</span>
        <span className="if-unlock__main">
          <span className="if-mono">{fmtTokens(r.settled)}</span> FOLD earned
          {r.settledEpochs > 0 && (
            <span className="if-unlock__pct if-mono">
              {r.settledEpochs} epoch{r.settledEpochs === 1 ? "" : "s"} closed
            </span>
          )}
        </span>
        <span className="if-unlock__held">
          {!ready ? (
            payouts.isError ? (
              "paid: could not read the escrow"
            ) : (
              "checking payouts…"
            )
          ) : paid === 0n ? (
            "none paid out yet"
          ) : (
            <>
              <span className="if-mono">{fmtTokens(paid)}</span> paid as {locks.length} escrow lock
              {locks.length === 1 ? "" : "s"}
              {withdrawn > 0n && (
                <>
                  {" "}
                  · <span className="if-mono">{fmtTokens(withdrawn)}</span> withdrawn to the wallet
                </>
              )}
            </>
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
      {locks.length > 0 && <WhereItLives owner={owner} locks={locks} states={states.data} primary={primary} />}
    </div>
  );
};

const phaseLabel = (s: LockState | undefined, cooldownDays: string) => {
  if (!s) return "…";
  switch (s.phase) {
    case "locked":
      return "locked, voting power";
    case "exiting":
      return `exit started, cooldown ends ${s.exitDate ? fmtDay(s.exitDate) : `in ${cooldownDays}`}`;
    case "withdrawable":
      return "cooldown over, ready to withdraw";
    case "withdrawn":
      return "withdrawn to the wallet";
  }
};

/** Where the paid FOLD is right now, how it leaves, and (for the connected owner) the buttons to make it leave. */
const WhereItLives = ({
  owner,
  locks,
  states,
  primary,
}: {
  owner: Address;
  locks: FoldPayout[];
  states: ReturnType<typeof useLockStates>["data"];
  primary: boolean;
}) => {
  const { canWriteAsOwner, ownerIsContract, isSafe } = useConsole();
  const byId = new Map((states?.locks ?? []).map(s => [s.tokenId, s]));
  const count = (phase: LockState["phase"]) => locks.filter(l => byId.get(l.tokenId)?.phase === phase).length;
  const cooldownDays = fmtCooldown(states?.cooldown ?? 30 * 86_400);
  const stillLocked = locks.filter(l => byId.get(l.tokenId)?.phase === "locked");
  const nextExit = locks
    .map(l => byId.get(l.tokenId))
    .filter((s): s is LockState => !!s && s.phase === "exiting" && !!s.exitDate)
    .sort((a, b) => a.exitDate! - b.exitDate!)[0];
  const fee = states?.feeBps ?? 0;

  const summary = states
    ? [
        count("locked") > 0 && `${count("locked")} locked`,
        count("exiting") > 0 &&
          `${count("exiting")} exiting${nextExit ? ` (next ends ${fmtDay(nextExit.exitDate!)})` : ""}`,
        count("withdrawable") > 0 && `${count("withdrawable")} ready to withdraw`,
        count("withdrawn") > 0 && `${count("withdrawn")} withdrawn`,
      ]
        .filter(Boolean)
        .join(" · ")
    : "reading lock state…";

  return (
    <>
      <div className="if-unlock__row">
        <span className="if-unlock__held">
          Held in the{" "}
          <a
            className="if-link"
            href={`${LINKS.explorer}/address/${GOVERNANCE.escrow.address}`}
            target="_blank"
            rel="noreferrer"
          >
            voting escrow ↗
          </a>{" "}
          as lock NFT{locks.length === 1 ? "" : "s"}{" "}
          {locks.map((l, i) => (
            <span key={l.tokenId.toString()}>
              {i > 0 && ", "}
              <a
                className="if-mono"
                href={`${LINKS.explorer}/tx/${l.txHash}`}
                target="_blank"
                rel="noreferrer"
                title={`${fmtTokens(l.amount, "FOLD")}, paid ${fmtDay(l.timestamp)}`}
              >
                #{l.tokenId.toString()}
              </a>
            </span>
          ))}{" "}
          in this owner&apos;s name, not in the wallet. It counts as voting power once delegated (see Voting power).
        </span>
        <span className="if-unlock__side">{summary}</span>
      </div>
      <div className="if-unlock__row">
        <span className="if-unlock__held">
          To take it out, per lock: start the exit (the lock stops voting and waits {cooldownDays}), then withdraw and
          the FOLD lands in this wallet{fee > 0 ? ` minus a ${fee / 100}% exit fee` : ", no exit fee"}.
          {!(primary && canWriteAsOwner) && " Connect as this owner to do that here."}
        </span>
      </div>
      {primary && canWriteAsOwner && (
        <Disclosure title={`Withdraw these rewards (${locks.length} lock${locks.length === 1 ? "" : "s"})`}>
          <div className="if-table-wrap" style={{ marginTop: 10 }}>
            <table className="if-table">
              <thead>
                <tr>
                  <th>Lock</th>
                  <th className="if-num">FOLD</th>
                  <th>Paid</th>
                  <th>State</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {locks.map(l => (
                  <LockRow
                    key={l.tokenId.toString()}
                    owner={owner}
                    lock={l}
                    state={byId.get(l.tokenId)}
                    cooldownDays={cooldownDays}
                  />
                ))}
              </tbody>
            </table>
          </div>
          {ownerIsContract && isSafe && stillLocked.length > 1 && (
            <ExitAllBatch owner={owner} locks={stillLocked} states={byId} />
          )}
        </Disclosure>
      )}
    </>
  );
};

const LockRow = ({
  owner,
  lock: l,
  state: s,
  cooldownDays,
}: {
  owner: Address;
  lock: FoldPayout;
  state: LockState | undefined;
  cooldownDays: string;
}) => {
  const id = l.tokenId;
  return (
    <tr style={{ cursor: "default" }}>
      <td className="if-mono">#{id.toString()}</td>
      <td className="if-num if-mono">{fmtTokens(l.amount)}</td>
      <td>{fmtDay(l.timestamp)}</td>
      <td>{phaseLabel(s, cooldownDays)}</td>
      <td>
        {s?.phase === "locked" && (
          <div className="if-actions" style={{ gap: 8 }}>
            <ActionButtons
              label="Approve"
              variant="ghost"
              done={s.approved}
              doneLabel="Approved"
              params={{
                address: GOVERNANCE.lockNft.address,
                abi: GOVERNANCE.lockNft.abi,
                functionName: "approve",
                args: [GOVERNANCE.escrow.address, id],
                simulateAs: owner,
                summary: `Approve the voting escrow to take lock NFT #${id} (first step of the exit)`,
              }}
            />
            <ActionButtons
              label="Start exit"
              variant="ghost"
              disabled={!s.approved}
              disabledReason="approve the escrow for this lock first"
              params={{
                address: GOVERNANCE.escrow.address,
                abi: GOVERNANCE.escrow.abi,
                functionName: "beginWithdrawal",
                args: [id],
                simulateAs: owner,
                summary: `Begin withdrawal of lock #${id} (${fmtTokens(l.amount, "FOLD")}); withdraw after the cooldown`,
              }}
            />
          </div>
        )}
        {s?.phase === "withdrawable" && (
          <ActionButtons
            label={`Withdraw ${fmtTokens(l.amount, "FOLD")}`}
            variant="primary"
            params={{
              address: GOVERNANCE.escrow.address,
              abi: GOVERNANCE.escrow.abi,
              functionName: "withdraw",
              args: [id],
              simulateAs: owner,
              summary: `Withdraw lock #${id} (${fmtTokens(l.amount, "FOLD")}) to ${owner}`,
            }}
          />
        )}
        {s?.phase === "exiting" && "wait"}
        {s?.phase === "withdrawn" && "done"}
      </td>
    </tr>
  );
};

/** Every still-locked lock's approve + beginWithdrawal as one Safe transaction, with the file fallback. */
const ExitAllBatch = ({
  owner,
  locks,
  states,
}: {
  owner: Address;
  locks: FoldPayout[];
  states: Map<bigint, LockState>;
}) => {
  const b = useSafeBatch();
  const [createdAt] = useState(() => Date.now());
  const calls: BatchCall[] = locks.flatMap(l => {
    const out: BatchCall[] = [];
    if (!states.get(l.tokenId)?.approved)
      out.push(
        makeCall(
          GOVERNANCE.lockNft.address,
          GOVERNANCE.lockNft.abi as Abi,
          "approve",
          [GOVERNANCE.escrow.address, l.tokenId],
          `Approve the voting escrow to take lock NFT #${l.tokenId}`,
        ),
      );
    out.push(
      makeCall(
        GOVERNANCE.escrow.address,
        GOVERNANCE.escrow.abi as Abi,
        "beginWithdrawal",
        [l.tokenId],
        `Begin withdrawal of lock #${l.tokenId} (${fmtTokens(l.amount, "FOLD")})`,
      ),
    );
    return out;
  });
  const key = calls.map(c => c.data).join("|");
  useEffect(() => {
    b.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const total = locks.reduce((t, l) => t + l.amount, 0n);
  const name = `Start FOLD reward exit (${locks.length} locks)`;
  const download = () => {
    const json = txBuilderJson(calls, owner, name, calls.map(c => c.summary).join("; "), createdAt);
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "fold-reward-exit.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
      <div className="if-actions">
        <button type="button" className="if-btn if-btn--primary" disabled={b.busy} onClick={() => b.propose(calls)}>
          {b.busy ? <span className="if-spinner" /> : null} Start the exit for all {locks.length} locks · one Safe
          transaction
        </button>
        <button type="button" className="if-btn if-btn--ghost if-btn--sm" onClick={download}>
          Download batch file
        </button>
        <span className="if-action__hint">
          {calls.length} calls; {fmtTokens(total, "FOLD")} stops voting and starts its cooldown.
        </span>
      </div>
      {b.status === "sim-fail" && <Note kind="bad">{b.error}</Note>}
      {b.status === "awaiting-wallet" && <Note>Confirm the batch in Safe{"{Wallet}"}.</Note>}
      {b.status === "proposed" && (
        <Note kind="good">
          Proposed {b.id && <TxLink hash={b.id} href={safeTx(owner, b.id)} />}. Collect signatures in the{" "}
          <a className="if-link" href={safeQueue(owner)} target="_blank" rel="noreferrer">
            Safe queue
          </a>
          ; the table above updates once it executes.
        </Note>
      )}
      {b.status === "error" && <Note kind="bad">{b.error}</Note>}
      <span className="if-stat__sub">Proposing as {shortAddr(owner)}.</span>
    </div>
  );
};
