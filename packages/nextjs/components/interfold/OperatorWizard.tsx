"use client";

import { useEffect, useMemo, useState } from "react";
import { ActionButtons } from "./ActionButtons";
import { BatchPanel } from "./BatchPanel";
import { ExitPanel } from "./ExitPanel";
import { statusPill } from "./FleetTable";
import { QueueModeToggle } from "./QueueModeToggle";
import { AddressLink, Badge, CommandBlock, CopyButton, Dl, Field, Note, Step, type StepState } from "./ui";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Address, formatUnits, parseEther, zeroAddress } from "viem";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { type OperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { susdsToUsds } from "~~/hooks/interfold/useOwnerFunds";
import { type WriteParams } from "~~/hooks/interfold/useSafeAwareWrite";
import { planOnboarding } from "~~/utils/interfold/batch";
import { FOLD, LINKS, REGISTRY, SUSDS, TICKET_TOKEN } from "~~/utils/interfold/contracts";
import {
  fmtDuration,
  fmtEth,
  fmtTokens,
  maxBig,
  parseTokenInput,
  parseWholeInput,
  sameAddr,
} from "~~/utils/interfold/format";
import { operatorInstructions } from "~~/utils/interfold/instructions";

type Props = {
  operator: Address;
  status?: OperatorStatus;
  statusLoading: boolean;
  label?: string;
  onLabel?: (label: string) => void;
  /** "fleet": you manage nodes other people run. "self": you are the signer *and* the node operator. */
  mode?: "fleet" | "self";
};

const MODE_LABEL = {
  "safe-app": "Safe App",
  "safe-wc": "Safe via WalletConnect",
  eoa: "EOA (plain key)",
  none: "-",
} as const;

/**
 * View C: the five-step guide from dashboard.theinterfold.com, re-targeted at a bond owner that is a Safe.
 * Every step's state is computed from polled reads on each render; nothing is stored locally.
 */
export const OperatorWizard = ({ operator, status: s, statusLoading, label = "", onLabel, mode = "fleet" }: Props) => {
  const {
    owner,
    ownerSource,
    ownerIsContract,
    params: p,
    funds: f,
    connected,
    connMode,
    onMainnet,
    canWriteAsOwner,
    operatorMode,
    isSafe,
  } = useConsole();
  const { openConnectModal } = useConnectModal();

  // ---- gates (reads) ----
  const ownerSet = !!s && sameAddr(s.bondOwner, owner);
  const bondOk = !!(p && s && s.bond >= p.requiredCiphernodeBond);
  const registered = !!s?.isRegistered;
  const minTickets = p ? maxBig(1n, p.minTicketBalance) : 1n;
  const ticketsOk = !!s && s.availableTickets >= minTickets;
  const gates = [ownerSet, bondOk, registered, ticketsOk];
  const firstFail = gates.findIndex(g => !g);
  const stateOf = (i: number): StepState => (gates[i] ? "done" : i === firstFail ? "active" : "todo");
  const walletState: StepState = canWriteAsOwner ? "done" : "active";
  const allDone = firstFail === -1;

  // ---- step 3 input ----
  const need = p && s ? maxBig(p.requiredCiphernodeBond - s.bond, 0n) : 0n;
  const [bondInput, setBondInput] = useState("");
  useEffect(() => {
    if (p && s && bondInput.trim() === "" && need > 0n) setBondInput(formatUnits(need, 18));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [need, operator]);
  const bondWei = useMemo(() => parseTokenInput(bondInput), [bondInput]);

  // ---- step 5 input ----
  const wantMore = s ? maxBig(minTickets - s.availableTickets, 0n) : 0n;
  const [ticketInput, setTicketInput] = useState("");
  useEffect(() => {
    if (s && ticketInput.trim() === "" && wantMore > 0n) setTicketInput(wantMore.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantMore, operator]);
  const ticketCount = useMemo(() => parseWholeInput(ticketInput), [ticketInput]);
  const ticketCost = p && ticketCount ? ticketCount * p.ticketPrice : null;
  const ticketCostUsds = ticketCost !== null && f ? susdsToUsds(ticketCost, f.susdsRate) : undefined;

  // ---- write params ----
  const reg = { address: REGISTRY.address, abi: REGISTRY.abi, simulateAs: owner } as const;
  const approveFold: WriteParams | undefined = bondWei
    ? {
        address: FOLD.address,
        abi: FOLD.abi,
        functionName: "approve",
        args: [REGISTRY.address, bondWei],
        simulateAs: owner,
        summary: "Approve FOLD for the BondingRegistry",
      }
    : undefined;
  const bond: WriteParams | undefined = bondWei
    ? { ...reg, functionName: "bondCiphernodeFor", args: [operator, bondWei], summary: "Bond FOLD for the operator" }
    : undefined;
  const register: WriteParams = {
    ...reg,
    functionName: "registerOperatorFor",
    args: [operator],
    summary: "Register the operator",
  };
  const approveSusds: WriteParams | undefined = ticketCost
    ? {
        address: SUSDS.address,
        abi: SUSDS.abi,
        functionName: "approve",
        args: [TICKET_TOKEN.address, ticketCost],
        simulateAs: owner,
        summary: "Approve sUSDS for the InterfoldTicketToken",
      }
    : undefined;
  const buyTickets: WriteParams | undefined = ticketCost
    ? {
        ...reg,
        functionName: "addTicketBalanceFor",
        args: [operator, ticketCost],
        summary: `Buy ${ticketCount} ticket(s)`,
      }
    : undefined;
  const refresh: WriteParams = {
    ...reg,
    functionName: "refreshOperatorStatus",
    args: [operator],
    simulateAs: connected ?? owner,
    summary: "Re-evaluate active status",
  };
  const setBondOwner: WriteParams = {
    ...reg,
    functionName: "setBondOwner",
    args: [owner],
    simulateAs: operator,
    summary: "Authorize the bond owner (sent by the operator key)",
  };
  const acceptBondOwner: WriteParams = {
    ...reg,
    functionName: "acceptBondOwner",
    args: [operator],
    summary: "Accept the pending bond-owner transfer",
  };
  const proposeBondOwner: WriteParams = {
    ...reg,
    functionName: "proposeBondOwner",
    args: [operator, owner],
    simulateAs: s?.bondOwner,
    summary: "Propose transferring the bond owner (sent by the current owner)",
  };

  const foldAllowanceOk = !!(f && bondWei && f.foldAllowance >= bondWei);
  const foldBalanceOk = !!(f && bondWei && f.foldBalance >= bondWei);
  const susdsAllowanceOk = !!(f && ticketCost && f.susdsAllowance >= ticketCost);
  const susdsBalanceOk = !!(f && ticketCost && f.susdsBalance >= ticketCost);
  const isOperatorConnected = sameAddr(connected, operator);
  const pill = statusPill(s, owner, p?.requiredCiphernodeBond, p?.minTicketBalance);
  const lowEth = !!s && s.ethBalance < parseEther("0.01");
  const cli = `interfold ciphernode set-bond-owner --owner ${owner}`;
  const instructions = operatorInstructions(owner, p);
  const nodePlan = planOnboarding(
    owner,
    [{ operator, status: s, label, ticketsWanted: ticketCount ?? undefined }],
    p,
    f,
  );
  const showBatch = ownerIsContract && ownerSet && !allDone && nodePlan.calls.length >= 2;
  const [labelDraft, setLabelDraft] = useState(label);
  useEffect(() => setLabelDraft(label), [label, operator]);

  return (
    <div className="if-guide">
      {/* Operator position (mirrors the dashboard's `opposition` card) */}
      <section className="if-card">
        <header className="if-card__head">
          <div>
            <div className="if-eyebrow">Operator position</div>
            {label && (
              <h3 className="if-card__title" style={{ marginBottom: 6 }}>
                {label}
              </h3>
            )}
            <div className="if-actions">
              <AddressLink address={operator} full />
              {statusLoading && <span className="if-spinner" />}
            </div>
          </div>
          <div className="if-actions" style={{ alignItems: "flex-start" }}>
            <Badge kind={pill.kind}>{pill.label}</Badge>
          </div>
        </header>
        {onLabel && (
          <div className="if-fields" style={{ marginBottom: 18 }}>
            <Field
              label="Label (who runs this node; stored in this browser)"
              value={labelDraft}
              onChange={setLabelDraft}
              placeholder="e.g. Alice / hetzner-1"
              mono={false}
              suffix={
                labelDraft !== label ? (
                  <button type="button" className="if-btn if-btn--sm if-btn--ghost" onClick={() => onLabel(labelDraft)}>
                    Save
                  </button>
                ) : null
              }
            />
          </div>
        )}
        <Dl
          items={[
            [
              "Bond owner",
              s ? (
                s.bondOwner === zeroAddress ? (
                  <span className="if-dl__muted">Not authorized</span>
                ) : (
                  <AddressLink address={s.bondOwner} />
                )
              ) : (
                "-"
              ),
            ],
            [
              "Ciphernode bond",
              <span key="b" className="if-mono">
                {fmtTokens(s?.bond, "FOLD")}
              </span>,
            ],
            [
              "Tickets",
              <span key="t" className="if-mono">
                {s ? s.availableTickets.toString() : "-"}{" "}
                <span className="if-stat__of">/ {minTickets.toString()} required</span>
              </span>,
            ],
            [
              "Hot wallet ETH",
              <span key="e" className="if-mono" style={lowEth ? { color: "var(--if-bad-ink)" } : undefined}>
                {fmtEth(s?.ethBalance)}
                {lowEth ? " · top up: the node pays gas for duties" : ""}
              </span>,
            ],
          ]}
        />
      </section>

      {showBatch && (
        <BatchPanel
          eyebrow="Shortcut"
          title="Or propose every remaining step as one Safe transaction."
          lede="Approve, bond, register and buy tickets in a single MultiSend proposal: one signature round instead of one per step. The one-off buttons in the steps below still work if you prefer them."
          plan={nodePlan}
          batchName={`interfold-onboard-${label ? label.replace(/[^a-z0-9]+/gi, "-").toLowerCase() : operator.slice(0, 10)}`}
        />
      )}

      {isSafe && <QueueModeToggle />}

      <div className="if-steps">
        {/* 1 */}
        <Step
          num={1}
          title="Connect the bond owner"
          lede="Every step below is a transaction sent by the bond owner. If that is a plain wallet, just connect it. If it is a Safe, open this page as a Safe App inside app.safe.global (Apps → My custom apps → Add custom Safe App → this URL) or pair Safe{Wallet} through WalletConnect, and each step becomes a proposal for its signers."
          state={walletState}
        >
          <Dl
            items={[
              [
                "Connected",
                connected ? <AddressLink address={connected} /> : <span className="if-dl__muted">Not connected</span>,
              ],
              ["Connection", connected ? <Badge kind={isSafe ? "open" : "muted"}>{MODE_LABEL[connMode]}</Badge> : "-"],
              [
                "Network",
                connected ? (
                  onMainnet ? (
                    "Ethereum mainnet"
                  ) : (
                    <span style={{ color: "var(--if-bad-ink)" }}>Wrong network: switch to Ethereum mainnet</span>
                  )
                ) : (
                  "-"
                ),
              ],
              [
                "Bond owner (this guide)",
                <>
                  <AddressLink address={owner} />{" "}
                  <span className="if-dl__muted">
                    {ownerSource === "operator-of-connected" ? "owner of the connected hot wallet" : ownerSource}
                  </span>
                </>,
              ],
            ]}
          />
          {!connected && (
            <div className="if-actions">
              <button type="button" className="if-btn if-btn--primary" onClick={() => openConnectModal?.()}>
                Connect wallet
              </button>
            </div>
          )}
          {connected && !onMainnet && (
            <Note kind="warn">Interfold is deployed on Ethereum mainnet. Switch networks to continue.</Note>
          )}
          {connected && onMainnet && !canWriteAsOwner && !operatorMode && (
            <Note kind="warn">
              The connected wallet is not the bond owner shown above. Connect as {owner} to send, or use the calldata
              export.
            </Note>
          )}
          {operatorMode && (
            <Note>
              Operator mode: a plain key is connected that is not the bond owner. Only operator-side calls (
              <code>setBondOwner</code>, <code>deregisterOperatorFor</code>) can be sent from it. The hot wallet must
              hold ETH for gas and should never hold FOLD or sUSDS.
            </Note>
          )}
        </Step>

        {/* 2 */}
        <Step
          num={2}
          title="Authorize the bond owner"
          lede="The operator key is the hot key your node runs with. The bond owner is the wallet that funds and controls its collateral: a plain wallet or a Safe. Authorization is sent by the operator key itself: it is how the node lets a wallet post collateral on its behalf."
          state={stateOf(0)}
        >
          <Dl
            items={[
              ["Operator key", <AddressLink key="o" address={operator} />],
              ["Bond owner (the funding wallet)", <AddressLink key="w" address={owner} />],
              [
                "Bond owner on-chain",
                s ? (
                  s.bondOwner === zeroAddress ? (
                    <span className="if-dl__muted">Not authorized</span>
                  ) : (
                    <AddressLink address={s.bondOwner} />
                  )
                ) : (
                  "-"
                ),
              ],
              ...(s && s.pendingBondOwner !== zeroAddress
                ? [
                    ["Pending transfer to", <AddressLink key="p" address={s.pendingBondOwner} />] as [
                      React.ReactNode,
                      React.ReactNode,
                    ],
                  ]
                : []),
            ]}
          />
          {s && s.bondOwner === zeroAddress && (
            <>
              {mode === "self" ? (
                <>
                  <Note kind="warn">
                    Run this on your node. It is sent by your operator key and needs a little ETH for gas. Or connect
                    the node&apos;s hot wallet here and sign <code>setBondOwner</code> directly. This step advances by
                    itself once the transaction lands; nothing can be bonded before it.
                  </Note>
                  <CommandBlock command={cli} />
                </>
              ) : (
                <>
                  <Note kind="warn">
                    Waiting for the node operator. They must run the command below on their node (it is sent by their
                    operator key and needs a little ETH for gas). This step advances by itself once that transaction
                    lands; nothing can be bonded before it.
                  </Note>
                  <CommandBlock command={cli} />
                  <div className="if-actions">
                    <CopyButton text={instructions} label="Copy full instructions for them" className="if-btn--sm" />
                  </div>
                  <Note>
                    If <em>you</em> run this node, connect its hot wallet here instead and sign{" "}
                    <code>setBondOwner</code> directly.
                  </Note>
                </>
              )}
              {isOperatorConnected ? (
                <ActionButtons label="Authorize bond owner" params={setBondOwner} requires="connected" />
              ) : (
                <>
                  <Note>
                    To sign it here: connect the operator wallet ({operator.slice(0, 6)}…{operator.slice(-4)}) with
                    MetaMask/WalletConnect, then reconnect as the Safe for the remaining steps.
                  </Note>
                  <ActionButtons
                    label="Authorize bond owner"
                    params={setBondOwner}
                    requires="connected"
                    disabled
                    disabledReason="Must be sent from the operator key."
                  />
                </>
              )}
            </>
          )}
          {s && s.bondOwner !== zeroAddress && !ownerSet && (
            <>
              <Note kind="warn">
                This operator&apos;s collateral is controlled by {s.bondOwner}. Transferring uses a two-step handshake:
                the current owner proposes, the new owner accepts.
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
                  Ask {s.bondOwner} to call{" "}
                  <code>
                    proposeBondOwner({operator.slice(0, 6)}…, {owner.slice(0, 6)}…)
                  </code>
                  ; the accept button appears here once the proposal is on-chain.
                </Note>
              )}
            </>
          )}
          {ownerSet && (
            <Note kind="good">Authorized. The Safe can now bond, register and buy tickets for this operator.</Note>
          )}
        </Step>

        {/* 3 */}
        <Step
          num={3}
          title="Bond the FOLD ciphernode bond"
          lede={`A ciphernode bond of ${fmtTokens(p?.requiredCiphernodeBond, "FOLD")} is the collateral that makes the node eligible to register. It is slashable, and unbonding is subject to the exit delay.`}
          state={stateOf(1)}
        >
          <Dl
            items={[
              [
                "Required bond",
                <span key="r" className="if-mono">
                  {fmtTokens(p?.requiredCiphernodeBond, "FOLD")}
                </span>,
              ],
              [
                "Currently bonded",
                <span key="c" className="if-mono">
                  {fmtTokens(s?.bond, "FOLD")}
                </span>,
              ],
              [
                "Bond owner balance",
                <span key="b" className="if-mono">
                  {fmtTokens(f?.foldBalance, "FOLD")}
                  {f && <span className="if-stat__of"> ({fmtTokens(f.foldTransferable)} transferable)</span>}
                </span>,
              ],
              [
                "Approved for registry",
                <span key="a" className="if-mono">
                  {fmtTokens(f?.foldAllowance, "FOLD")}
                </span>,
              ],
            ]}
          />
          {!bondOk && (
            <Field
              label="Amount to bond (FOLD)"
              value={bondInput}
              onChange={setBondInput}
              placeholder="0.0"
              invalid={bondInput.trim() !== "" && bondWei === null}
              hint={
                bondInput.trim() !== "" && bondWei === null
                  ? "Enter a positive number."
                  : bondWei
                    ? `${bondWei.toString()} wei`
                    : undefined
              }
            />
          )}
          {bondWei && f && !foldBalanceOk && <Note kind="warn">Not enough FOLD in the bond owner wallet.</Note>}
          {bondWei && f && foldBalanceOk && f.foldTransferable < bondWei && (
            <Note>
              Locked (vesting) FOLD is bondable: the registry credits the bond before pulling tokens, so the
              transferable balance does not gate this step.
            </Note>
          )}
          {!ownerSet && (
            <Note>Complete step 2 first: the registry only accepts collateral from an authorized bond owner.</Note>
          )}
          {!bondOk && (
            <>
              <ActionButtons
                label="Approve FOLD"
                variant="ghost"
                params={approveFold}
                done={foldAllowanceOk}
                doneLabel="FOLD approved"
              />
              <ActionButtons
                label="Bond FOLD"
                params={bond}
                disabled={!ownerSet || !foldAllowanceOk || !foldBalanceOk}
                disabledReason={
                  !ownerSet
                    ? "Authorize the bond owner first."
                    : !foldAllowanceOk
                      ? "Approve FOLD for the registry first (the approval must land on-chain before bonding)."
                      : "Insufficient FOLD balance."
                }
              />
            </>
          )}
          {bondOk && <Note kind="good">Fully bonded.</Note>}
        </Step>

        {/* 4 */}
        <Step
          num={4}
          title="Register the ciphernode"
          lede="Registration adds the operator key to the ciphernode registry, making it a candidate for committee sortition."
          state={stateOf(2)}
        >
          <Dl
            items={[
              ["Bonded for registration", bondOk ? "Yes" : "Not yet: bond the full ciphernode bond first"],
              ["Registered", s ? (s.isRegistered ? "Yes" : "No") : "-"],
            ]}
          />
          {s?.isBonded && !bondOk && p && (
            <Note kind="warn">
              This operator meets the active-maintenance threshold, but registration needs the full{" "}
              {fmtTokens(p.requiredCiphernodeBond, "FOLD")}. Bond {fmtTokens(need, "FOLD")} more in step 3.
            </Note>
          )}
          {s?.exitInProgress && (
            <Note kind="warn">
              This operator has an exit in progress. Collateral must finish unwinding before it can register again.
            </Note>
          )}
          <ActionButtons
            label="Register ciphernode"
            params={register}
            done={registered}
            doneLabel="Registered"
            disabled={!bondOk || !!s?.exitInProgress}
            disabledReason="Requires the full bond and no exit in progress."
          />
        </Step>

        {/* 5 */}
        <Step
          num={5}
          title="Buy tickets"
          lede={`Tickets are the collateral that weights sortition. Each costs ${fmtTokens(p?.ticketPrice, "sUSDS")}, and a node needs at least ${minTickets.toString()} to go active. sUSDS keeps earning the Sky savings rate while wrapped.`}
          state={stateOf(3)}
        >
          <Dl
            items={[
              [
                "Ticket price",
                <span key="p" className="if-mono">
                  {fmtTokens(p?.ticketPrice, "sUSDS")}
                  {p && f && (
                    <span className="if-stat__of"> ≈ {fmtTokens(susdsToUsds(p.ticketPrice, f.susdsRate), "USDS")}</span>
                  )}
                </span>,
              ],
              [
                "Minimum to activate",
                <span key="m" className="if-mono">
                  {minTickets.toString()}
                </span>,
              ],
              [
                "Tickets held",
                <span key="h" className="if-mono">
                  {s ? s.availableTickets.toString() : "-"}
                  {s && <span className="if-stat__of"> ({fmtTokens(s.ticketBalance, "sUSDS")} balance)</span>}
                </span>,
              ],
              [
                "Bond owner balance",
                <span key="b" className="if-mono">
                  {fmtTokens(f?.susdsBalance, "sUSDS")}
                  {f && (
                    <span className="if-stat__of">
                      {" "}
                      ≈ {fmtTokens(susdsToUsds(f.susdsBalance, f.susdsRate), "USDS")}
                    </span>
                  )}
                </span>,
              ],
              [
                "Approved for ticket token",
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
            hint={
              ticketCount === null
                ? "Enter a whole number of tickets."
                : `Costs ${fmtTokens(ticketCost ?? undefined, "sUSDS")}${ticketCostUsds !== undefined ? ` ≈ ${fmtTokens(ticketCostUsds, "USDS")}` : ""} · ${ticketCost?.toString()} wei`
            }
          />
          {ticketCost && f && !susdsBalanceOk && (
            <Note kind="warn">
              Not enough sUSDS in the bond owner wallet. Mint sUSDS by depositing USDS into the Sky savings vault first.
            </Note>
          )}
          {!registered && <Note>Tickets can only be added to a registered operator. Complete step 4 first.</Note>}
          <ActionButtons
            label="Approve sUSDS"
            variant="ghost"
            params={approveSusds}
            done={susdsAllowanceOk}
            doneLabel="sUSDS approved"
          />
          <ActionButtons
            label="Buy tickets"
            params={buyTickets}
            disabled={!registered || !susdsAllowanceOk || !susdsBalanceOk}
            disabledReason={
              !registered
                ? "Register first."
                : !susdsAllowanceOk
                  ? "Approve sUSDS for the ticket token first (spender is the InterfoldTicketToken, not the registry)."
                  : "Insufficient sUSDS balance."
            }
          />
          {ticketsOk && <Note kind="good">Ticketed. More tickets scale the sortition odds linearly.</Note>}
        </Step>
      </div>

      {/* After setup */}
      <section className="if-card">
        <div className="if-eyebrow">After setup</div>
        <h3 className="if-card__title">
          {s?.isActive
            ? "This ciphernode is active."
            : allDone
              ? "Set up, but not active yet."
              : "Run the node itself."}
        </h3>
        <p className="if-card__body">
          The on-chain position only makes the key eligible. The ciphernode software must be running with that same
          operator key so it can take part in key generation and decryption when sortition selects it. A registered node
          that fails to participate is slashable, so keep it online and keep its hot wallet funded with ETH.
        </p>
        {allDone && s && !s.isActive && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
            <Note kind="warn">
              All gates pass but <code>isActive</code> is false. Activation also requires the operator&apos;s
              eligibility version to match the protocol&apos;s current configuration; anyone may call{" "}
              <code>refreshOperatorStatus</code> to re-evaluate it.
              {s.exitInProgress ? " An exit is also in progress." : ""}
            </Note>
            <ActionButtons label="Refresh operator status" variant="ghost" params={refresh} requires="connected" />
          </div>
        )}
        <div className="if-card__links">
          <a className="if-btn if-btn--ghost" href={LINKS.docs} target="_blank" rel="noreferrer">
            Documentation <span className="if-btn__arrow">→</span>
          </a>
          <a className="if-btn if-btn--ghost" href={LINKS.repo} target="_blank" rel="noreferrer">
            Node source <span className="if-btn__arrow">→</span>
          </a>
          <a className="if-btn if-btn--ghost" href={LINKS.dashboard} target="_blank" rel="noreferrer">
            Official dashboard <span className="if-btn__arrow">→</span>
          </a>
        </div>
        <p className="if-card__body if-card__body--muted">
          Winding down reverses these steps: <code>deregisterOperatorFor</code> queues the collateral, and after the{" "}
          {fmtDuration(p?.exitDelay)} exit delay <code>claimExitsFor</code> returns it to the bond owner. Both live in
          the panel below.
        </p>
      </section>

      <ExitPanel operator={operator} status={s} />
    </div>
  );
};
