"use client";

import { useEffect, useState } from "react";
import { OfflineNode, YOUR_NODE_KEY } from "./OfflineNode";
import { OperatorWizard } from "./OperatorWizard";
import { AddressLink, Badge, Field, Note } from "./ui";
import { type Address } from "viem";
import { useEnsAddress } from "wagmi";
import { ConsoleProvider, useConsole } from "~~/hooks/interfold/ConsoleContext";
import { useOperatorStatus } from "~~/hooks/interfold/useFleetStatus";
import { useIsSafeAccount } from "~~/hooks/interfold/useIsSafeAccount";
import { useOperatorList } from "~~/hooks/interfold/useOperatorList";
import { safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";

const MODE_LABEL = {
  "safe-app": "Safe App",
  "safe-wc": "Safe via WalletConnect",
  eoa: "plain wallet",
  none: "",
} as const;

/** Wallet-driven guide for the node pasted above (or the connected hot wallet itself). */
const Guide = () => {
  const { owner, ownerSource, setOwnerOverride, connected, connMode, isSafe, canWriteAsOwner, operatorMode } =
    useConsole();
  const list = useOperatorList(owner);
  const [node, setNode] = useState<Address>();
  const [input, setInput] = useState("");
  const [ownerInput, setOwnerInput] = useState("");
  const [editingOwner, setEditingOwner] = useState(false);

  // The node is whatever was pasted above; a connected hot wallet is itself the node.
  useEffect(() => {
    if (operatorMode && connected) return setNode(connected);
    try {
      const v = localStorage.getItem(YOUR_NODE_KEY);
      if (v) setNode(toChecksum(v) ?? undefined);
    } catch {
      /* ignore */
    }
  }, [operatorMode, connected]);
  useEffect(() => {
    if (node) list.addManual(node);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [node]);

  const ens = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr } = useEnsAddress({ name: safeNormalize(ens), chainId: 1, query: { enabled: !!ens } });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const oEns = ownerInput.trim().toLowerCase().endsWith(".eth") ? ownerInput.trim() : undefined;
  const { data: oEnsAddr } = useEnsAddress({ name: safeNormalize(oEns), chainId: 1, query: { enabled: !!oEns } });
  const ownerResolved = toChecksum(ownerInput.trim()) ?? (oEnsAddr ? toChecksum(oEnsAddr) : null);
  const status = useOperatorStatus(node);

  return (
    <div className="if-main" style={{ paddingTop: 0, gap: 20 }}>
      <section className="if-card">
        <div className="if-actions" style={{ justifyContent: "space-between" }}>
          <div className="if-actions">
            <span className="if-eyebrow" style={{ margin: 0 }}>
              Connected
            </span>
            {connected && <AddressLink address={connected} />}
            {connected && (
              <Badge kind={canWriteAsOwner && isSafe ? "open" : operatorMode ? "working" : "muted"}>
                {canWriteAsOwner
                  ? `bond owner · ${MODE_LABEL[connMode]}`
                  : operatorMode
                    ? "node hot wallet"
                    : MODE_LABEL[connMode]}
              </Badge>
            )}
          </div>
          {connMode === "eoa" && ownerSource !== "operator-of-connected" && (
            <div className="if-actions">
              <span className="if-stat__sub">
                Bond owner: <AddressLink address={owner} />
              </span>
              <button
                type="button"
                className="if-btn if-btn--ghost if-btn--xs"
                onClick={() => setEditingOwner(v => !v)}
              >
                {editingOwner ? "Cancel" : "Change"}
              </button>
            </div>
          )}
        </div>
        {editingOwner && (
          <div style={{ marginTop: 10, maxWidth: 520 }}>
            <Field
              label="Bond owner (the wallet or Safe that funds this node)"
              value={ownerInput}
              onChange={setOwnerInput}
              placeholder="0x… or name.eth"
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
        {operatorMode && (
          <div style={{ marginTop: 10 }}>
            <Note>
              A node hot wallet can only sign the authorization step here. For bonding, reconnect as the bond owner.
            </Note>
          </div>
        )}
      </section>

      {!node ? (
        <section className="if-card">
          <Field
            label="Which node? (operator key or ENS)"
            value={input}
            onChange={setInput}
            placeholder="0x…"
            suffix={
              <button
                type="button"
                className="if-btn if-btn--sm if-btn--primary"
                disabled={!resolved}
                onClick={() => resolved && setNode(resolved)}
              >
                Open guide
              </button>
            }
          />
        </section>
      ) : (
        <OperatorWizard
          operator={node}
          status={status.data}
          statusLoading={status.isLoading}
          label={list.labels[node.toLowerCase()] ?? ""}
          onLabel={l => list.setLabel(node, l)}
          mode="self"
        />
      )}
    </div>
  );
};

/**
 * "Your node": the paste-and-export flow always comes first and needs no wallet. With a wallet
 * connected, the guided flow (send / propose from it) is offered underneath and opens by itself for a Safe.
 */
export const MyNode = () => {
  const { address, isSafe } = useIsSafeAccount();
  const [guideOpen, setGuideOpen] = useState(false);
  useEffect(() => {
    if (!address) setGuideOpen(false);
    else if (isSafe) setGuideOpen(true);
  }, [address, isSafe]);
  return (
    <>
      <OfflineNode connected={address} guideOpen={!!address && guideOpen} onOpenGuide={() => setGuideOpen(true)} />
      {address && guideOpen && (
        <ConsoleProvider>
          <Guide />
        </ConsoleProvider>
      )}
    </>
  );
};
