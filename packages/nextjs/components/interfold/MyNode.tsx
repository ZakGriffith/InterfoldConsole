"use client";

import { useEffect, useState } from "react";
import { NetworkPulse } from "./NetworkPulse";
import { OfflineNode } from "./OfflineNode";
import { OperatorWizard } from "./OperatorWizard";
import { ParamsStrip } from "./ParamsStrip";
import { RequirementsNote } from "./RequirementsNote";
import { AddressLink, Badge, CommandBlock, Empty, Field, Loader, Note } from "./ui";
import { useConnectModal } from "@rainbow-me/rainbowkit";
import { type Address } from "viem";
import { useEnsAddress } from "wagmi";
import { ConsoleProvider, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useOperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { useOperatorList } from "~~/hooks/interfold/useOperatorList";
import { REGISTRY, safeQueue } from "~~/utils/interfold/contracts";
import { fmtTokens, safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

const MODE_LABEL = { "safe-app": "Safe App", "safe-wc": "Safe via WalletConnect", eoa: "plain key", none: "" } as const;

const myNodeKey = (owner: Address) => `interfold.mynode.${owner.toLowerCase()}`;
const readMyNode = (owner: Address): Address | undefined => {
  try {
    const v = localStorage.getItem(myNodeKey(owner));
    return v ? (toChecksum(v) ?? undefined) : undefined;
  } catch {
    return undefined;
  }
};
const writeMyNode = (owner: Address, op: Address | undefined) => {
  try {
    if (op) localStorage.setItem(myNodeKey(owner), op);
    else localStorage.removeItem(myNodeKey(owner));
  } catch {
    /* in-memory only */
  }
};

const Inner = () => {
  const {
    owner,
    ownerSource,
    ownerIsContract,
    setOwnerOverride,
    connected,
    connMode,
    isSafe,
    onMainnet,
    canWriteAsOwner,
    operatorMode,
    params,
    paramsLoading,
  } = useConsole();
  const { openConnectModal } = useConnectModal();
  const list = useOperatorList(owner);

  const [myNode, setMyNode] = useState<Address>();
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [editingOwner, setEditingOwner] = useState(false);
  const ownerEnsInput = ownerInput.trim().toLowerCase().endsWith(".eth") ? ownerInput.trim() : undefined;
  const { data: ownerEnsAddr, isLoading: ownerEnsLoading } = useEnsAddress({
    name: safeNormalize(ownerEnsInput),
    chainId: 1,
    query: { enabled: !!ownerEnsInput },
  });
  const ownerResolved = toChecksum(ownerInput.trim()) ?? (ownerEnsAddr ? toChecksum(ownerEnsAddr) : null);
  const ownerInvalid = ownerInput.trim() !== "" && !ownerResolved && !ownerEnsLoading;

  useEffect(() => {
    setMyNode(readMyNode(owner));
  }, [owner]);

  // A hot wallet connected in operator mode *is* the node: prefill it.
  useEffect(() => {
    if (!myNode && operatorMode && connected) setInput(connected);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [operatorMode, connected]);

  const ensName = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading: ensLoading } = useEnsAddress({
    name: safeNormalize(ensName),
    chainId: 1,
    query: { enabled: !!ensName },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const isOwner = !!resolved && sameAddr(resolved, owner);
  const invalid = input.trim() !== "" && !resolved && !ensLoading;

  const status = useOperatorStatus(myNode);

  const start = () => {
    if (!resolved || isOwner) return;
    writeMyNode(owner, resolved);
    setMyNode(resolved);
    list.addManual(resolved);
    if (label.trim()) list.setLabel(resolved, label);
    setInput("");
    setLabel("");
  };
  const clear = () => {
    writeMyNode(owner, undefined);
    setMyNode(undefined);
  };

  return (
    <main className="if-main">
      <div className="if-guide">
        <header className="if-guide__head">
          <div className="if-eyebrow">Node operators</div>
          <h1 className="if-guide__title">Connect your own node.</h1>
          <p className="if-guide__lede">
            You run a ciphernode; a bond owner posts its collateral. That owner can be your own wallet or a Safe you
            sign for. Connect as the bond owner to bond, register and buy tickets. For a Safe, open this page as a Safe
            App inside Safe{"{Wallet}"} (Apps → My custom apps → this URL) or pair through WalletConnect, and each
            action becomes a proposal for the Safe&apos;s signers. Authorizing the bond owner is the one step your
            node&apos;s own key signs.
          </p>
        </header>

        <NetworkPulse />
        {paramsLoading && !params ? (
          <Loader label="Loading bonding parameters" sub={REGISTRY.address} />
        ) : (
          <ParamsStrip />
        )}

        {/* Who you are connected as */}
        <section className="if-card">
          <header className="if-card__head">
            <div>
              <div className="if-eyebrow">Connected as</div>
              <div className="if-actions">
                {connected ? (
                  <AddressLink address={connected} full />
                ) : (
                  <span className="if-dl__muted">Not connected</span>
                )}
                {connected && (
                  <Badge kind={canWriteAsOwner && isSafe ? "open" : operatorMode ? "working" : "muted"}>
                    {canWriteAsOwner && isSafe
                      ? `the Safe · ${MODE_LABEL[connMode]}`
                      : operatorMode
                        ? "a node hot wallet"
                        : MODE_LABEL[connMode]}
                  </Badge>
                )}
                {connected && !onMainnet && <Badge kind="bad">wrong network</Badge>}
              </div>
            </div>
            <div className="if-actions">
              {!connected && (
                <button
                  type="button"
                  className="if-btn if-btn--primary if-btn--sm"
                  onClick={() => openConnectModal?.()}
                >
                  Connect
                </button>
              )}
              {ownerIsContract && (
                <a className="if-btn if-btn--ghost if-btn--sm" href={safeQueue(owner)} target="_blank" rel="noreferrer">
                  Safe queue <span className="if-btn__arrow">→</span>
                </a>
              )}
            </div>
          </header>
          {canWriteAsOwner && isSafe && (
            <Note kind="good">
              Acting as the bond owner <AddressLink address={owner} />. Bond, register and ticket actions below are
              proposed to this Safe for its signers to confirm.
            </Note>
          )}
          {canWriteAsOwner && !isSafe && (
            <Note kind="good">
              Acting as the bond owner <AddressLink address={owner} /> (a plain key). Transactions are sent directly
              from this wallet.
            </Note>
          )}
          {operatorMode && (
            <Note>
              This is a node&apos;s hot wallet, so only <code>setBondOwner</code> can be signed from here. For the
              bonding steps, reconnect as the Safe (Safe App or WalletConnect).
            </Note>
          )}
          {connMode === "eoa" && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              <div className="if-actions">
                <span className="if-stat__sub">
                  Bond owner for this guide: <AddressLink address={owner} />{" "}
                  {ownerSource === "operator-of-connected"
                    ? "(set on-chain by this node)"
                    : ownerSource === "override"
                      ? "(entered here)"
                      : "(this wallet)"}
                </span>
                {ownerSource !== "operator-of-connected" && (
                  <button
                    type="button"
                    className="if-btn if-btn--ghost if-btn--xs"
                    onClick={() => setEditingOwner(e => !e)}
                  >
                    {editingOwner ? "Cancel" : "Change"}
                  </button>
                )}
              </div>
              {editingOwner && (
                <div className="if-fields">
                  <Field
                    label="Bond owner (the wallet or Safe that funds this node)"
                    value={ownerInput}
                    onChange={setOwnerInput}
                    placeholder="0x… or name.eth"
                    invalid={ownerInvalid}
                    hint={
                      ownerInvalid ? "Not a valid address or ENS name." : "Remembered in this browser for this wallet."
                    }
                    suffix={
                      <button
                        type="button"
                        className="if-btn if-btn--sm if-btn--primary"
                        disabled={!ownerResolved}
                        onClick={() => {
                          if (!ownerResolved) return;
                          setOwnerOverride(sameAddr(ownerResolved, connected) ? undefined : ownerResolved);
                          setOwnerInput("");
                          setEditingOwner(false);
                        }}
                      >
                        Use
                      </button>
                    }
                  />
                </div>
              )}
            </div>
          )}
          {connected && !isSafe && !operatorMode && !canWriteAsOwner && (
            <Note kind="warn">
              This wallet is neither the bond owner <AddressLink address={owner} /> nor a node&apos;s key. Connect as
              the bond owner (as a Safe App or via WalletConnect for a Safe) to send the bonding steps.
            </Note>
          )}
          {!connected && (
            <Note>
              Reads and simulations work without connecting. To send the transactions, connect as the bond owner.
            </Note>
          )}
        </section>

        {/* Your node */}
        {!myNode ? (
          <section className="if-card">
            <div className="if-eyebrow">Your node</div>
            <h2 className="if-card__title">Which operator key does your ciphernode sign with?</h2>
            <p className="if-card__body">On the machine running the node, print its operator key:</p>
            <CommandBlock command="interfold wallet get" />
            <p className="if-card__body">
              Keep that hot wallet funded with a little ETH (≥ 0.01) for gas, and never hold FOLD or sUSDS on it; the
              bond owner posts those.
            </p>
            <div style={{ marginTop: 16 }}>
              <RequirementsNote compact />
            </div>
            <div className="if-fields" style={{ marginTop: 18 }}>
              <Field
                label="Operator key (the ciphernode address)"
                value={input}
                onChange={setInput}
                placeholder="0x…"
                invalid={invalid || isOwner}
                hint={
                  isOwner
                    ? "That is the bond owner itself; the operator key is your node's hot wallet."
                    : invalid
                      ? "Not a valid address."
                      : operatorMode && connected && sameAddr(connected, resolved)
                        ? "Prefilled from the connected hot wallet."
                        : undefined
                }
              />
              <Field
                label="Label (optional: your name, machine)"
                value={label}
                onChange={setLabel}
                placeholder="e.g. Zak / home linux box"
                mono={false}
                suffix={
                  <button
                    type="button"
                    className="if-btn if-btn--sm if-btn--primary"
                    disabled={!resolved || isOwner}
                    onClick={start}
                  >
                    Start
                  </button>
                }
              />
            </div>
            <p className="if-card__body if-card__body--muted">
              Remembered in this browser only. The node also appears under My Nodes for every signer once its
              authorization is on-chain.
            </p>
          </section>
        ) : (
          <>
            <Note>
              Your node: <AddressLink address={myNode} />{" "}
              <button type="button" className="if-btn if-btn--ghost if-btn--xs" onClick={clear}>
                Change
              </button>{" "}
              Each step needs {fmtTokens(params?.requiredCiphernodeBond, "FOLD")} bond and{" "}
              {fmtTokens(params?.ticketPrice, "sUSDS")} per ticket from the bond owner.
            </Note>
            <OperatorWizard
              operator={myNode}
              status={status.data}
              statusLoading={status.isLoading}
              label={list.labels[myNode.toLowerCase()] ?? ""}
              onLabel={l => list.setLabel(myNode, l)}
              mode="self"
            />
          </>
        )}

        {!myNode && !params && !paramsLoading && (
          <Empty>Couldn&apos;t reach the bonding registry. Retrying automatically…</Empty>
        )}
      </div>
    </main>
  );
};

export const MyNode = () => (
  <ConsoleProvider gate={<OfflineNode />}>
    <Inner />
  </ConsoleProvider>
);
