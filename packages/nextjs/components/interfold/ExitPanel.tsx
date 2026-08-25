"use client";

import { useEffect, useState } from "react";
import { ActionButtons } from "./ActionButtons";
import { Disclosure, Dl, Field, Note } from "./ui";
import { type Address, formatUnits } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { type WriteParams } from "~~/hooks/interfold/useSafeAwareWrite";
import { REGISTRY } from "~~/utils/interfold/contracts";
import { fmtDuration, fmtTokens, parseTokenInput, sameAddr } from "~~/utils/interfold/format";

type Props = { operator: Address; status?: OperatorStatus };

/** Destructive path, collapsed by default: remove tickets, unbond, deregister, claim. */
export const ExitPanel = ({ operator, status: s }: Props) => {
  const { owner, params: p, connected } = useConsole();
  const [ticketAmt, setTicketAmt] = useState("");
  const [bondAmt, setBondAmt] = useState("");

  useEffect(() => {
    if (s && ticketAmt === "" && s.ticketBalance > 0n) setTicketAmt(formatUnits(s.ticketBalance, 18));
    if (s && bondAmt === "" && s.bond > 0n) setBondAmt(formatUnits(s.bond, 18));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s?.ticketBalance, s?.bond]);

  const ticketWei = parseTokenInput(ticketAmt);
  const bondWei = parseTokenInput(bondAmt);
  const isOperatorConnected = sameAddr(connected, operator);

  const base = { address: REGISTRY.address, abi: REGISTRY.abi, simulateAs: owner } as const;
  const removeTickets: WriteParams | undefined = ticketWei
    ? {
        ...base,
        functionName: "removeTicketBalanceFor",
        args: [operator, ticketWei],
        summary: "Queue ticket balance for exit",
      }
    : undefined;
  const unbond: WriteParams | undefined = bondWei
    ? { ...base, functionName: "unbondCiphernodeFor", args: [operator, bondWei], summary: "Queue bond for exit" }
    : undefined;
  const deregister: WriteParams = {
    ...base,
    functionName: "deregisterOperatorFor",
    args: [operator],
    summary: "Leave the registry and queue bond + tickets",
    simulateAs: isOperatorConnected ? connected : owner,
  };
  const claimable = s ? s.claimableTicket > 0n || s.claimableBond > 0n : false;
  const claim: WriteParams | undefined = s
    ? {
        ...base,
        functionName: "claimExitsFor",
        args: [operator, s.claimableTicket, s.claimableBond],
        summary: "Pay out unlocked exits to the bond owner",
        simulateAs: s.claimableBond > 0n ? owner : (connected ?? owner),
      }
    : undefined;

  return (
    <Disclosure title="Exit, unbond and claim" danger>
      <div className="if-subsection">
        <Dl
          items={[
            ["Exit in progress", s ? (s.exitInProgress ? "Yes" : "No") : "-"],
            [
              "Pending exit",
              s ? `${fmtTokens(s.pendingBondExit, "FOLD")} · ${fmtTokens(s.pendingTicketExit, "sUSDS")}` : "-",
            ],
            [
              "Claimable now",
              s ? `${fmtTokens(s.claimableBond, "FOLD")} · ${fmtTokens(s.claimableTicket, "sUSDS")}` : "-",
            ],
            ["Exit delay", fmtDuration(p?.exitDelay)],
          ]}
        />
        <Note kind="warn">
          Every exit is blocked while a slash proposal is open (<code>OperatorUnderSlash</code>), and nothing here can
          be undone: queued assets wait the full exit delay before <code>claimExitsFor</code> pays them to the bond
          owner.
        </Note>
      </div>

      <div className="if-subsection">
        <div className="if-subsection__title">Remove ticket balance</div>
        <div className="if-subsection__lede">
          Burns the operator&apos;s tFOLD and queues the underlying sUSDS. Below one whole ticket the node stops being
          drawn.
        </div>
        <Field
          label="Amount (sUSDS ticket balance)"
          value={ticketAmt}
          onChange={setTicketAmt}
          placeholder="0.0"
          invalid={ticketAmt.trim() !== "" && ticketWei === null}
          hint={
            s ? `Held: ${fmtTokens(s.ticketBalance, "sUSDS")} (${s.availableTickets.toString()} tickets)` : undefined
          }
          suffix={
            s && s.ticketBalance > 0n ? (
              <button
                type="button"
                className="if-btn if-btn--sm if-btn--ghost"
                onClick={() => setTicketAmt(formatUnits(s.ticketBalance, 18))}
              >
                All
              </button>
            ) : null
          }
        />
        <ActionButtons
          label="Remove tickets"
          variant="danger"
          params={removeTickets}
          disabled={!s || s.ticketBalance === 0n}
          disabledReason="No ticket balance to remove."
        />
      </div>

      <div className="if-subsection">
        <div className="if-subsection__title">Unbond FOLD</div>
        <div className="if-subsection__lede">
          Queues bond for exit.{" "}
          {p &&
            `Below ${fmtTokens(p.activeThreshold, "FOLD")} the node goes inactive; registering again needs the full ${fmtTokens(p.requiredCiphernodeBond, "FOLD")}.`}
        </div>
        <Field
          label="Amount (FOLD)"
          value={bondAmt}
          onChange={setBondAmt}
          placeholder="0.0"
          invalid={bondAmt.trim() !== "" && bondWei === null}
          hint={s ? `Bonded: ${fmtTokens(s.bond, "FOLD")}` : undefined}
          suffix={
            s && s.bond > 0n ? (
              <button
                type="button"
                className="if-btn if-btn--sm if-btn--ghost"
                onClick={() => setBondAmt(formatUnits(s.bond, 18))}
              >
                All
              </button>
            ) : null
          }
        />
        <ActionButtons
          label="Unbond"
          variant="danger"
          params={unbond}
          disabled={!s || s.bond === 0n}
          disabledReason="Nothing is bonded."
        />
      </div>

      <div className="if-subsection">
        <div className="if-subsection__title">Deregister</div>
        <div className="if-subsection__lede">
          Leaves the ciphernode registry and queues <b>both</b> the bond and the ticket balance for exit. The bond owner
          or the operator key may call it.
        </div>
        <ActionButtons
          label="Deregister operator"
          variant="danger"
          params={deregister}
          requires={isOperatorConnected ? "connected" : "owner"}
          disabled={!s || !s.isRegistered}
          disabledReason="The operator is not registered."
        />
      </div>

      <div className="if-subsection">
        <div className="if-subsection__title">Claim unlocked exits</div>
        <div className="if-subsection__lede">
          Anyone may call this once the exit delay has elapsed; proceeds always go to the <b>bond owner</b>, never the
          operator. Claiming bond requires the bond owner as caller.
        </div>
        <ActionButtons
          label={
            s && claimable
              ? `Claim ${fmtTokens(s.claimableBond, "FOLD")} + ${fmtTokens(s.claimableTicket, "sUSDS")}`
              : "Claim"
          }
          params={claim}
          requires={s && s.claimableBond > 0n ? "owner" : "connected"}
          disabled={!claimable}
          disabledReason="Nothing is claimable yet (previewClaimable is zero)."
        />
      </div>
    </Disclosure>
  );
};
