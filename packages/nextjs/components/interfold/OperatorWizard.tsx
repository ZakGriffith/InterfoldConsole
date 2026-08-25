"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButtons } from "./ActionButtons";
import { BatchPanel } from "./BatchPanel";
import { ExitPanel } from "./ExitPanel";
import { statusPill } from "./FleetTable";
import { QueueModeToggle } from "./QueueModeToggle";
import { RequirementsNote } from "./RequirementsNote";
import { AddressLink, Badge, CommandBlock, CopyButton, Dl, Field, Note, Step, type StepState } from "./ui";
import { type Address, formatUnits, parseEther, zeroAddress } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { susdsToUsds } from "~~/hooks/interfold/useOwnerFunds";
import { type WriteParams } from "~~/hooks/interfold/useSafeAwareWrite";
import { planOnboarding } from "~~/utils/interfold/batch";
import { FOLD, LINKS, REGISTRY, SUSDS, TICKET_TOKEN } from "~~/utils/interfold/contracts";
import { fmtEth, fmtTokens, maxBig, parseTokenInput, parseWholeInput, sameAddr } from "~~/utils/interfold/format";
import { operatorInstructions } from "~~/utils/interfold/instructions";

type Props = {
  operator: Address;
  status?: OperatorStatus;
  statusLoading: boolean;
  label?: string;
  onLabel?: (label: string) => void;
  /** "fleet": you manage nodes other people run. "self": you are the node operator. */
  mode?: "fleet" | "self";
};

/**
 * Per-node guide: four on-chain steps (authorize, bond, register, tickets), each computed from
 * polled reads on every render. For a Safe owner the batch panel above the steps does all of them
 * in one transaction; the steps remain for doing them one at a time.
 */
export const OperatorWizard = ({ operator, status: s, statusLoading, label = "", onLabel, mode = "fleet" }: Props) => {
  const { owner, ownerIsContract, params: p, funds: f, connected, isSafe } = useConsole();

  // ---- gates ----
  const ownerSet = !!s && sameAddr(s.bondOwner, owner);
  const bondOk = !!(p && s && s.bond >= p.requiredCiphernodeBond);
  const registered = !!s?.isRegistered;
  const minTickets = p ? maxBig(1n, p.minTicketBalance) : 1n;
  const ticketsOk = !!s && s.availableTickets >= minTickets;
  const gates = [ownerSet, bondOk, registered, ticketsOk];
  const firstFail = gates.findIndex(g => !g);
  const stateOf = (i: number): StepState => (gates[i] ? "done" : i === firstFail ? "active" : "todo");
  const allDone = firstFail === -1;

  // ---- inputs ----
  const need = p && s ? maxBig(p.requiredCiphernodeBond - s.bond, 0n) : 0n;
  const [bondInput, setBondInput] = useState("");
  useEffect(() => {
    if (p && s && bondInput.trim() === "" && need > 0n) setBondInput(formatUnits(need, 18));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [need, operator]);
  const bondWei = useMemo(() => parseTokenInput(bondInput), [bondInput]);
  const wantMore = s ? maxBig(minTickets - s.availableTickets, 0n) : 0n;
  const [ticketInput, setTicketInput] = useState("");
  useEffect(() => {
    if (s && ticketInput.trim() === "" && wantMore > 0n) setTicketInput(wantMore.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantMore, operator]);
  const ticketCount = useMemo(() => parseWholeInput(ticketInput), [ticketInput]);
  const ticketCost = p && ticketCount ? ticketCount * p.ticketPrice : null;
  const [labelDraft, setLabelDraft] = useState(label);
  useEffect(() => setLabelDraft(label), [label, operator]);

  // ---- writes ----
  const reg = { address: REGISTRY.address, abi: REGISTRY.abi, simulateAs: owner } as const;
  const approveFold: WriteParams | undefined = bondWei
    ? {
        address: FOLD.address,
        abi: FOLD.abi,
        functionName: "approve",
        args: [REGISTRY.address, bondWei],
        simulateAs: owner,
      }
    : undefined;
  const bond: WriteParams | undefined = bondWei
    ? { ...reg, functionName: "bondCiphernodeFor", args: [operator, bondWei] }
    : undefined;
  const register: WriteParams = { ...reg, functionName: "registerOperatorFor", args: [operator] };
  const approveSusds: WriteParams | undefined = ticketCost
    ? {
        address: SUSDS.address,
        abi: SUSDS.abi,
        functionName: "approve",
        args: [TICKET_TOKEN.address, ticketCost],
        simulateAs: owner,
      }
    : undefined;
  const buyTickets: WriteParams | undefined = ticketCost
    ? { ...reg, functionName: "addTicketBalanceFor", args: [operator, ticketCost] }
    : undefined;
  const refresh: WriteParams = {
    ...reg,
    functionName: "refreshOperatorStatus",
    args: [operator],
    simulateAs: connected ?? owner,
  };
  const setBondOwner: WriteParams = { ...reg, functionName: "setBondOwner", args: [owner], simulateAs: operator };
  const acceptBondOwner: WriteParams = { ...reg, functionName: "acceptBondOwner", args: [operator] };
  const proposeBondOwner: WriteParams = {
    ...reg,
    functionName: "proposeBondOwner",
    args: [operator, owner],
    simulateAs: s?.bondOwner,
  };

  const foldAllowanceOk = !!(f && bondWei && f.foldAllowance >= bondWei);
  const foldBalanceOk = !!(f && bondWei && f.foldBalance >= bondWei);
  const susdsAllowanceOk = !!(f && ticketCost && f.susdsAllowance >= ticketCost);
  const susdsBalanceOk = !!(f && ticketCost && f.susdsBalance >= ticketCost);
  const isOperatorConnected = sameAddr(connected, operator);
  const pill = statusPill(s, owner, p?.requiredCiphernodeBond, p?.minTicketBalance);
  const lowEth = !!s && s.ethBalance < parseEther("0.01");
  const cli = `interfold ciphernode set-bond-owner --owner ${owner}`;
  const nodePlan = planOnboarding(
    owner,
    [{ operator, status: s, label, ticketsWanted: ticketCount ?? undefined }],
    p,
    f,
  );
  const showBatch = ownerIsContract && ownerSet && !allDone && nodePlan.calls.length >= 2;

  return (
    <div className="if-guide">
      {/* Node header */}
      <section className="if-card">
        <header className="if-card__head" style={{ marginBottom: 12 }}>
          <div>
            <div className="if-eyebrow">Node</div>
            <div className="if-actions">
              {onLabel ? (
                <input
                  className="if-field__input if-inline-label"
                  value={labelDraft}
                  placeholder="Label this node"
                  onChange={e => setLabelDraft(e.target.value)}
                  onBlur={() => labelDraft !== label && onLabel(labelDraft)}
                  onKeyDown={e => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                />
              ) : (
                label && <b>{label}</b>
              )}
              <AddressLink address={operator} full />
              {statusLoading && <span className="if-spinner" />}
            </div>
          </div>
          <Badge kind={pill.kind}>{pill.label}</Badge>
        </header>
        <Dl
          items={[
            [
              "Bond owner",
              s ? (
                s.bondOwner === zeroAddress ? (
                  <span className="if-dl__muted">not set yet</span>
                ) : (
                  <AddressLink address={s.bondOwner} />
                )
              ) : (
                "-"
              ),
            ],
            [
              "Bond",
              <span key="b" className="if-mono">
                {fmtTokens(s?.bond, "FOLD")}
                {p && <span className="if-stat__of"> / {fmtTokens(p.requiredCiphernodeBond)}</span>}
              </span>,
            ],
            [
              "Tickets",
              <span key="t" className="if-mono">
                {s ? s.availableTickets.toString() : "-"}
                <span className="if-stat__of"> / {minTickets.toString()} to go active</span>
              </span>,
            ],
            [
              "Hot wallet ETH",
              <span key="e" className="if-mono" style={lowEth ? { color: "var(--if-bad-ink)" } : undefined}>
                {fmtEth(s?.ethBalance)}
                {lowEth ? " · top up, the node pays gas for its duties" : ""}
              </span>,
            ],
          ]}
        />
        {allDone && s && (
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
            {s.isActive ? (
              <Note kind="good">All set. This node is active and eligible for sortition.</Note>
            ) : (
              <>
                <Note kind="warn">
                  Everything is in place but <code>isActive</code> is still false. Anyone can ask the registry to
                  re-evaluate it.{s.exitInProgress ? " An exit is also in progress." : ""}
                </Note>
                <ActionButtons label="Refresh status" variant="ghost" params={refresh} requires="connected" />
              </>
            )}
          </div>
        )}
      </section>

      {!allDone && (
        <RequirementsNote
          foldNeeded={nodePlan.totalFold}
          susdsNeeded={nodePlan.totalSusds}
          tickets={ticketCount ?? wantMore}
          compact
        />
      )}

      {showBatch && (
        <BatchPanel
          title="Do every remaining step for this node in one go"
          plan={nodePlan}
          batchName={`interfold-onboard-${label ? label.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : operator.slice(0, 10)}`}
          showRequirements={false}
        />
      )}

      {!allDone && (
        <>
          <div className="if-eyebrow" style={{ marginBottom: -8 }}>
            {showBatch ? "Or one step at a time" : "Steps"}
          </div>
          {isSafe && <QueueModeToggle />}
          <div className="if-steps">
            <Step
              num={1}
              title="Authorize the bond owner"
              state={stateOf(0)}
              lede={
                mode === "self"
                  ? "Sent by your node's own key. It lets the bond owner post collateral for this node."
                  : "Sent by the node's own key, not by the bond owner. It lets this wallet post collateral for the node."
              }
            >
              {s && s.bondOwner === zeroAddress && (
                <>
                  <CommandBlock command={cli} />
                  {isOperatorConnected ? (
                    <ActionButtons label="Authorize bond owner" params={setBondOwner} requires="connected" />
                  ) : mode === "self" ? (
                    <Note>
                      Run that on the node, or connect the node hot wallet here to sign it. This step completes by
                      itself once it lands.
                    </Note>
                  ) : (
                    <div className="if-actions">
                      <Note>
                        Waiting for the node operator to run that command. This step completes by itself once it lands.
                      </Note>
                      <CopyButton
                        text={operatorInstructions(owner, p)}
                        label="Copy instructions for them"
                        className="if-btn--sm"
                      />
                    </div>
                  )}
                </>
              )}
              {s && s.bondOwner !== zeroAddress && !ownerSet && (
                <>
                  <Note kind="warn">
                    This node is bond-owned by {s.bondOwner}. Transfer: the current owner proposes, the new owner
                    accepts.
                  </Note>
                  {sameAddr(s.pendingBondOwner, owner) ? (
                    <ActionButtons label="Accept bond owner" params={acceptBondOwner} />
                  ) : sameAddr(connected, s.bondOwner) ? (
                    <ActionButtons
                      label={`Propose transfer to ${owner.slice(0, 6)}…`}
                      params={proposeBondOwner}
                      requires="connected"
                    />
                  ) : (
                    <Note>
                      Ask {s.bondOwner} to call <code>proposeBondOwner</code> for this node and {owner.slice(0, 6)}…;
                      the accept button appears here once that lands.
                    </Note>
                  )}
                </>
              )}
            </Step>

            <Step
              num={2}
              title={`Bond ${fmtTokens(p?.requiredCiphernodeBond, "FOLD")}`}
              state={stateOf(1)}
              lede="Slashable collateral pulled from the bond owner. Approve the registry for the amount, then bond."
            >
              {!bondOk && (
                <>
                  <Dl
                    items={[
                      [
                        "Bonded so far",
                        <span key="c" className="if-mono">
                          {fmtTokens(s?.bond, "FOLD")}
                        </span>,
                      ],
                      [
                        "Bond owner holds",
                        <span key="b" className="if-mono">
                          {fmtTokens(f?.foldBalance, "FOLD")}
                        </span>,
                      ],
                      [
                        "Approved for the registry",
                        <span key="a" className="if-mono">
                          {fmtTokens(f?.foldAllowance, "FOLD")}
                        </span>,
                      ],
                    ]}
                  />
                  <Field
                    label="Amount to bond (FOLD)"
                    value={bondInput}
                    onChange={setBondInput}
                    placeholder="0.0"
                    invalid={bondInput.trim() !== "" && bondWei === null}
                  />
                  {bondWei && f && !foldBalanceOk && <Note kind="warn">Not enough FOLD in the bond owner wallet.</Note>}
                  <div className="if-actions if-actions--steps">
                    <ActionButtons
                      label="Approve FOLD"
                      variant="ghost"
                      params={approveFold}
                      done={foldAllowanceOk}
                      doneLabel="FOLD approved"
                      disabled={!ownerSet}
                      disabledReason="authorize first"
                    />
                    <ActionButtons
                      label="Bond FOLD"
                      params={bond}
                      disabled={!ownerSet || !foldAllowanceOk || !foldBalanceOk}
                      disabledReason={
                        !ownerSet
                          ? "authorize first"
                          : !foldAllowanceOk
                            ? "approval not executed yet"
                            : "not enough FOLD"
                      }
                    />
                  </div>
                </>
              )}
            </Step>

            <Step
              num={3}
              title="Register the node"
              state={stateOf(2)}
              lede="Adds the operator key to the ciphernode registry so it can be drawn into committees. Needs the full bond."
            >
              {!registered && (
                <>
                  {s?.exitInProgress && (
                    <Note kind="warn">An exit is in progress; collateral must finish unwinding first.</Note>
                  )}
                  <ActionButtons
                    label="Register"
                    params={register}
                    disabled={!bondOk || !!s?.exitInProgress}
                    disabledReason="full bond not on-chain yet"
                  />
                </>
              )}
            </Step>

            <Step
              num={4}
              title="Buy tickets"
              state={stateOf(3)}
              lede={`Tickets weight the sortition draw: ${fmtTokens(p?.ticketPrice, "sUSDS")} each, at least ${minTickets.toString()} to go active. sUSDS keeps earning while wrapped.`}
            >
              {!ticketsOk && (
                <>
                  <Dl
                    items={[
                      [
                        "Tickets held",
                        <span key="h" className="if-mono">
                          {s ? s.availableTickets.toString() : "-"}
                        </span>,
                      ],
                      [
                        "Bond owner holds",
                        <span key="b" className="if-mono">
                          {fmtTokens(f?.susdsBalance, "sUSDS")}
                          {f && (
                            <span className="if-stat__of">
                              {" "}
                              about {fmtTokens(susdsToUsds(f.susdsBalance, f.susdsRate), "USDS")}
                            </span>
                          )}
                        </span>,
                      ],
                      [
                        "Approved for the ticket token",
                        <span key="a" className="if-mono">
                          {fmtTokens(f?.susdsAllowance, "sUSDS")}
                        </span>,
                      ],
                    ]}
                  />
                  <Field
                    label="Number of tickets"
                    value={ticketInput}
                    onChange={setTicketInput}
                    placeholder="1"
                    invalid={ticketInput.trim() !== "" && ticketCount === null}
                    hint={ticketCost ? `costs ${fmtTokens(ticketCost, "sUSDS")}` : undefined}
                  />
                  {ticketCost && f && !susdsBalanceOk && (
                    <Note kind="warn">Not enough sUSDS in the bond owner wallet (it must be sUSDS, not USDS).</Note>
                  )}
                  <div className="if-actions if-actions--steps">
                    <ActionButtons
                      label="Approve sUSDS"
                      variant="ghost"
                      params={approveSusds}
                      done={susdsAllowanceOk}
                      doneLabel="sUSDS approved"
                      disabled={!registered}
                      disabledReason="register first"
                    />
                    <ActionButtons
                      label="Buy tickets"
                      params={buyTickets}
                      disabled={!registered || !susdsAllowanceOk || !susdsBalanceOk}
                      disabledReason={
                        !registered
                          ? "register first"
                          : !susdsAllowanceOk
                            ? "approval not executed yet"
                            : "not enough sUSDS"
                      }
                    />
                  </div>
                </>
              )}
            </Step>
          </div>
        </>
      )}

      <div className="if-actions">
        <a className="if-btn if-btn--ghost if-btn--sm" href={LINKS.docs} target="_blank" rel="noreferrer">
          Operator docs <span className="if-btn__arrow">→</span>
        </a>
        <a className="if-btn if-btn--ghost if-btn--sm" href={LINKS.dashboard} target="_blank" rel="noreferrer">
          Official dashboard <span className="if-btn__arrow">→</span>
        </a>
      </div>

      <ExitPanel operator={operator} status={s} />
    </div>
  );
};
