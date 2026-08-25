"use client";

import { useEffect, useMemo, useState } from "react";
import { BatchExport } from "./BatchExport";
import { statusPill } from "./FleetTable";
import { RequirementsList } from "./RequirementsNote";
import { AddressLink, Badge, CommandBlock, Dl, Field, Note } from "./ui";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Address, zeroAddress } from "viem";
import { useEnsAddress } from "wagmi";
import { useOperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { useOwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { useRegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { planOnboarding } from "~~/utils/interfold/batch";
import { fmtEth, fmtTokens, maxBig, parseWholeInput, safeNormalize, toChecksum } from "~~/utils/interfold/format";

export const YOUR_NODE_KEY = "interfold.yournode.offline";

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

type Props = {
  connected?: Address;
  guideOpen?: boolean;
  onOpenGuide?: () => void;
};

/**
 * "Your node": paste the operator key, see its on-chain state, get the Safe batch file. No wallet
 * needed. The wallet-driven guide is offered at the bottom.
 */
export const OfflineNode = ({ connected, guideOpen, onOpenGuide }: Props) => {
  const { openConnectModal } = useConnectModal();
  const op = useAddressInput();
  const ownerIn = useAddressInput();
  const [ticketsIn, setTicketsIn] = useState("1");

  // ?op=0x… (or ENS) prefills the node so a link can be shared; otherwise the last pasted key is restored.
  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get("op");
      const v = fromUrl ?? localStorage.getItem(YOUR_NODE_KEY);
      if (v) op.setInput(v);
    } catch {
      /* ignore */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    try {
      if (op.resolved) localStorage.setItem(YOUR_NODE_KEY, op.resolved);
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
  const lowEth = !!s && s.ethBalance < 10n ** 16n;

  return (
    <main className="if-main" style={{ gap: 28 }}>
      <header className="if-guide__head">
        <div className="if-eyebrow">Your node</div>
        <h1 className="if-guide__title">Paste your operator key. Get the Safe batch file.</h1>
        <p className="if-guide__lede">
          No wallet needed. The console reads the node on-chain, works out what its bond owner still has to do, and
          produces the file a Safe signer imports to bond, register and buy tickets in one transaction.
        </p>
      </header>

      <section className="if-card">
        <div className="if-fields">
          <Field
            label="Operator key (the address your node signs with)"
            value={op.input}
            onChange={op.setInput}
            placeholder="0x…"
            invalid={op.invalid}
            hint={op.invalid ? "Not a valid address or ENS name." : "On the node: interfold wallet get"}
          />
          <Field
            label="Tickets to buy"
            value={ticketsIn}
            onChange={setTicketsIn}
            placeholder="1"
            invalid={ticketsIn.trim() !== "" && parseWholeInput(ticketsIn) === null}
            hint={
              params
                ? `${fmtTokens(params.ticketPrice, "sUSDS")} each, at least ${minTickets.toString()} to go active`
                : undefined
            }
          />
        </div>
      </section>

      {operator && (
        <section className="if-card">
          <header className="if-card__head" style={{ marginBottom: 12 }}>
            <div className="if-actions">
              <AddressLink address={operator} full />
              {status.isLoading && <span className="if-spinner" />}
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
                  <span className="if-dl__muted">not set yet</span>
                ),
              ],
              [
                "Bond",
                <span key="b" className="if-mono">
                  {fmtTokens(s?.bond, "FOLD")}
                </span>,
              ],
              ["Registered", s ? (s.isRegistered ? "Yes" : "No") : "-"],
              [
                "Tickets",
                <span key="t" className="if-mono">
                  {s ? s.availableTickets.toString() : "-"}
                </span>,
              ],
              ["Active", s ? (s.isActive ? "Yes" : "No") : "-"],
              [
                "Hot wallet ETH",
                <span key="e" className="if-mono" style={lowEth ? { color: "var(--if-bad-ink)" } : undefined}>
                  {fmtEth(s?.ethBalance)}
                  {lowEth ? " · top up" : ""}
                </span>,
              ],
            ]}
          />
          {s && !onChainOwner && (
            <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
              <Note kind="warn">
                This node has not authorized a bond owner yet. Enter the wallet or Safe that will fund it, then run this
                on the node (sent by the operator key; needs a little ETH):
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
                      : "Needed for the simulation and balance checks."
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
            nodeEth={s.ethBalance}
            owner={owner}
            params={params}
            funds={funds}
            foldNeeded={plan?.totalFold}
            susdsNeeded={plan?.totalSusds}
            tickets={plan && params.ticketPrice > 0n ? plan.totalSusds / params.ticketPrice : undefined}
            compact
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

      <div className="if-actions" style={{ justifyContent: "space-between" }}>
        <span className="if-stat__sub">
          {connected ? (
            <>
              <AddressLink address={connected} /> is connected. Send or propose the steps from it instead of exporting.
            </>
          ) : (
            "Prefer to send the steps yourself? Connect as the bond owner, or as the node hot wallet to authorize it."
          )}
        </span>
        {connected ? (
          <button
            type="button"
            className="if-btn if-btn--ghost if-btn--sm"
            onClick={() => onOpenGuide?.()}
            disabled={guideOpen}
          >
            {guideOpen ? "Guided flow is open below" : "Open the guided flow"}
          </button>
        ) : (
          <button type="button" className="if-btn if-btn--ghost if-btn--sm" onClick={() => openConnectModal?.()}>
            Connect wallet
          </button>
        )}
      </div>
    </main>
  );
};
