"use client";

import { useEffect, useMemo, useState } from "react";
import { BatchExport } from "./BatchExport";
import { statusPill } from "./FleetTable";
import { NetworkPulse } from "./NetworkPulse";
import { RequirementsList } from "./RequirementsNote";
import { AddressLink, Badge, CommandBlock, Dl, Field, Note } from "./ui";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Address, zeroAddress } from "viem";
import { useEnsAddress } from "wagmi";
import { useOperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { useOwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { useRegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { planOnboarding } from "~~/utils/interfold/batch";
import { LINKS } from "~~/utils/interfold/contracts";
import { fmtEth, fmtTokens, maxBig, parseWholeInput, safeNormalize, toChecksum } from "~~/utils/interfold/format";

const KEY = "interfold.yournode.offline";

const useAddressInput = (initial = "") => {
  const [input, setInput] = useState(initial);
  const ens = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading } = useEnsAddress({
    name: safeNormalize(ens),
    chainId: 1,
    query: { enabled: !!ens },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const invalid = input.trim() !== "" && !resolved && !isLoading;
  return { input, setInput, resolved, invalid };
};

/**
 * "Your node" with no wallet connected: paste the operator key, read its on-chain state, and get the
 * Safe Transaction Builder file for whoever funds it. Nothing here needs a signature.
 */
type Props = {
  /** Connected wallet, if any. The paste-and-export flow works either way. */
  connected?: Address;
  guideOpen?: boolean;
  onOpenGuide?: () => void;
};

export const OfflineNode = ({ connected, guideOpen, onOpenGuide }: Props) => {
  const { openConnectModal } = useConnectModal();
  const op = useAddressInput();
  const ownerIn = useAddressInput();
  const [ticketsIn, setTicketsIn] = useState("1");

  // remember the pasted operator in this browser
  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY);
      if (v) op.setInput(v);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (op.resolved) localStorage.setItem(KEY, op.resolved);
    } catch {
      /* ignore */
    }
  }, [op.resolved]);

  const { data: params } = useRegistryParams();
  const operator = op.resolved ?? undefined;
  const status = useOperatorStatus(operator);
  const s = status.data;
  const onChainOwner: Address | undefined = s && s.bondOwner !== zeroAddress ? s.bondOwner : undefined;
  const owner: Address | undefined = onChainOwner ?? ownerIn.resolved ?? undefined;
  const { data: funds } = useOwnerFunds(owner);

  const minTickets = params ? maxBig(1n, params.minTicketBalance) : 1n;
  const ticketsWanted = parseWholeInput(ticketsIn) ?? minTickets;
  const plan = useMemo(
    () =>
      operator && s
        ? planOnboarding(owner ?? zeroAddress, [{ operator, status: s, ticketsWanted }], params, funds, {
            assumeAuthorized: true,
          })
        : undefined,
    [operator, s, owner, params, funds, ticketsWanted],
  );
  const pill = s
    ? statusPill(s, owner ?? zeroAddress, params?.requiredCiphernodeBond, params?.minTicketBalance)
    : undefined;
  const cli = `interfold ciphernode set-bond-owner --owner ${owner ?? "<bond-owner-address>"}`;

  return (
    <main className="if-main">
      <div className="if-guide">
        <header className="if-guide__head">
          <div className="if-eyebrow">Node operators</div>
          <h1 className="if-guide__title">Your node.</h1>
          <p className="if-guide__lede">
            Paste your ciphernode&apos;s operator key. No wallet needed: this reads its on-chain status, works out what
            the bond owner still has to do, and produces the file a Safe signer imports to bond, register and buy
            tickets for it in one transaction. Connect a wallet only if you want to send those steps yourself.
          </p>
        </header>

        <NetworkPulse />

        <section className="if-card">
          <div className="if-eyebrow">Your node</div>
          <h2 className="if-card__title">Which operator key does your ciphernode sign with?</h2>
          <p className="if-card__body">On the machine running the node, print its operator key:</p>
          <CommandBlock command="interfold wallet get" />
          <div className="if-fields" style={{ marginTop: 16 }}>
            <Field
              label="Operator key (the ciphernode address)"
              value={op.input}
              onChange={op.setInput}
              placeholder="0x…"
              invalid={op.invalid}
              hint={op.invalid ? "Not a valid address or ENS name." : "The node's hot wallet, never the bond owner."}
            />
            <Field
              label="Tickets to buy"
              value={ticketsIn}
              onChange={setTicketsIn}
              placeholder="1"
              invalid={ticketsIn.trim() !== "" && parseWholeInput(ticketsIn) === null}
              hint={
                params
                  ? `${fmtTokens(params.ticketPrice, "sUSDS")} each · at least ${minTickets.toString()} to go active`
                  : undefined
              }
            />
          </div>
          {op.resolved && <p className="if-card__body if-card__body--muted">Remembered in this browser only.</p>}
        </section>

        {operator && (
          <section className="if-card">
            <header className="if-card__head">
              <div>
                <div className="if-eyebrow">On-chain status</div>
                <div className="if-actions">
                  <AddressLink address={operator} full />
                  {status.isLoading && <span className="if-spinner" />}
                </div>
              </div>
              {pill && <Badge kind={pill.kind}>{pill.label}</Badge>}
            </header>
            <Dl
              items={[
                [
                  "Bond owner",
                  onChainOwner ? (
                    <AddressLink address={onChainOwner} />
                  ) : (
                    <span className="if-dl__muted">not set yet: the node has not run set-bond-owner</span>
                  ),
                ],
                [
                  "Ciphernode bond",
                  <span key="b" className="if-mono">
                    {fmtTokens(s?.bond, "FOLD")}
                  </span>,
                ],
                ["Registered", s ? (s.isRegistered ? "Yes" : "No") : "-"],
                [
                  "Tickets",
                  <span key="t" className="if-mono">
                    {s ? s.availableTickets.toString() : "-"}{" "}
                    <span className="if-stat__of">/ {minTickets.toString()} required</span>
                  </span>,
                ],
                ["Active", s ? (s.isActive ? "Yes" : "No") : "-"],
                [
                  "Hot wallet ETH",
                  <span
                    key="e"
                    className="if-mono"
                    style={s && s.ethBalance < 10n ** 16n ? { color: "var(--if-bad-ink)" } : undefined}
                  >
                    {fmtEth(s?.ethBalance)}
                    {s && s.ethBalance < 10n ** 16n ? " · top up: the node pays gas for its duties" : ""}
                  </span>,
                ],
              ]}
            />

            {s && !onChainOwner && (
              <div style={{ marginTop: 18, display: "flex", flexDirection: "column", gap: 12 }}>
                <Note kind="warn">
                  This node has not authorized a bond owner yet. Enter the wallet or Safe that will fund it so the file
                  and the checks below can use it, then run this on the node (sent by the operator key; needs a little
                  ETH):
                </Note>
                <div className="if-fields">
                  <Field
                    label="Bond owner (the wallet or Safe that will fund this node)"
                    value={ownerIn.input}
                    onChange={ownerIn.setInput}
                    placeholder="0x… or name.eth"
                    invalid={ownerIn.invalid}
                    hint={
                      ownerIn.invalid
                        ? "Not a valid address or ENS name."
                        : "Optional, but the simulation and the balance checks need it."
                    }
                  />
                </div>
                <CommandBlock command={cli} />
              </div>
            )}
          </section>
        )}

        {operator && s && params && (
          <>
            <RequirementsList
              owner={owner}
              params={params}
              funds={funds}
              foldNeeded={plan?.totalFold}
              susdsNeeded={plan?.totalSusds}
              tickets={plan && params.ticketPrice > 0n ? plan.totalSusds / params.ticketPrice : undefined}
            />
            {plan && (
              <BatchExport
                calls={plan.calls}
                owner={owner}
                funds={funds}
                totalFold={plan.totalFold}
                totalSusds={plan.totalSusds}
                batchName={`interfold-onboard-${operator.slice(0, 10)}`}
              />
            )}
          </>
        )}

        <section className="if-card">
          {" "}
          <div className="if-eyebrow">Or do it here</div>
          <h3 className="if-card__title">
            {connected ? "Send the steps from the connected wallet." : "Connect a wallet to send the steps yourself."}
          </h3>
          <p className="if-card__body">
            {connected ? (
              <>
                <AddressLink address={connected} /> is connected. The guided flow below lets a bond owner (a plain
                wallet, or a Safe via Safe App / WalletConnect) propose or send bond, register and tickets, and lets a
                node&apos;s hot wallet sign <code>setBondOwner</code>.
              </>
            ) : (
              <>
                Connect as the bond owner (a plain wallet, or a Safe via Safe App / WalletConnect) to propose or send
                bond, register and tickets directly from this page, or connect the node&apos;s hot wallet to sign{" "}
                <code>setBondOwner</code>.
              </>
            )}
          </p>
          <div className="if-card__links">
            {connected ? (
              <button
                type="button"
                className="if-btn if-btn--primary"
                onClick={() => onOpenGuide?.()}
                disabled={guideOpen}
              >
                {guideOpen ? "Guided flow is open below" : "Open the guided flow"}
              </button>
            ) : (
              <button type="button" className="if-btn if-btn--primary" onClick={() => openConnectModal?.()}>
                Connect wallet
              </button>
            )}
            <a className="if-btn if-btn--ghost" href={LINKS.docs} target="_blank" rel="noreferrer">
              Operator docs <span className="if-btn__arrow">→</span>
            </a>
          </div>
        </section>
      </div>
    </main>
  );
};
