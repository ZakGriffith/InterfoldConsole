"use client";

import { useState } from "react";
import { softwarePill } from "./FleetTable";
import { Badge, CommandBlock, Field, Note } from "./ui";
import { type Address } from "viem";
import { useAccount, useSignMessage } from "wagmi";
import { ago, useNodeProbe } from "~~/hooks/interfold/useNodeProbe";
import { type RegisterError, usePeerRegistry, useRegisterPeerId } from "~~/hooks/interfold/usePeerRegistry";
import { sameAddr, shortAddr } from "~~/utils/interfold/format";
import { PEER_ID_RE, shortPeerId, signMessageFor } from "~~/utils/interfold/peerIds";

type Props = { operator: Address; bondOwner?: Address };

/**
 * Optional monitoring opt-in. The operator pastes the node's libp2p peer ID once; the probe then
 * finds the node on the network by itself and the console can show "up, version x". Renders
 * nothing when this deployment has no registry store.
 */
export const PeerIdCard = ({ operator, bondOwner }: Props) => {
  const reg = usePeerRegistry();
  const register = useRegisterPeerId();
  const probe = useNodeProbe();
  const { address: connected } = useAccount();
  const { signMessageAsync, isPending: signing } = useSignMessage();
  const [input, setInput] = useState("");
  const [msg, setMsg] = useState<{ kind: "good" | "bad"; text: string }>();

  if (!reg.enabled) return null;

  const entry = reg.entryFor(operator);
  const sw = softwarePill(probe.byOperator[operator.toLowerCase()], probe.report, probe.stale);
  const canSign = !!connected && (sameAddr(connected, operator) || (!!bondOwner && sameAddr(connected, bondOwner)));
  const trimmed = input.trim();
  const valid = PEER_ID_RE.test(trimmed);
  const busy = register.isPending || signing;

  const submit = async (peerId: string) => {
    setMsg(undefined);
    const done = () => {
      setInput("");
      setMsg({
        kind: "good",
        text: peerId
          ? "Registered. The probe runs every 10 minutes; the Software status updates after the next run."
          : "Cleared.",
      });
    };
    try {
      await register.mutateAsync({ operator, peerId });
      done();
    } catch (e) {
      const err = e as RegisterError;
      if (!err.needsSignature) return setMsg({ kind: "bad", text: err.message });
      if (!canSign || !connected)
        return setMsg({
          kind: "bad",
          text: "This node already has a peer ID. To change it, connect as the node's hot wallet or as its bond owner (plain wallet) and try again.",
        });
      try {
        const signature = await signMessageAsync({ message: signMessageFor(operator, peerId) });
        await register.mutateAsync({ operator, peerId, signer: connected, signature });
        done();
      } catch (e2) {
        setMsg({ kind: "bad", text: (e2 as Error).message });
      }
    }
  };

  return (
    <section className="if-card">
      <header className="if-card__head">
        <div>
          <div className="if-eyebrow">Monitoring (optional)</div>
          <h2 className="if-section-title">Let the console see whether this node is up</h2>
        </div>
        <span className="if-actions" style={{ gap: 6 }} title={sw.title}>
          <Badge kind={sw.kind}>{sw.label}</Badge>
          {sw.sub && <span className="if-stat__sub">{sw.sub}</span>}
        </span>
      </header>
      <p className="if-stat__sub" style={{ margin: "0 0 12px" }}>
        The registry only knows collateral; it cannot tell whether the process is running or which version it is on.
        Every node has a stable libp2p peer ID. Paste it here once and a probe looks the node up on the network every 10
        minutes and reads the version it announces. Nothing runs on the node and the peer ID is not secret.
      </p>
      {entry ? (
        <p className="if-stat__sub" style={{ margin: "0 0 12px" }}>
          Registered peer ID <code title={entry.peerId}>{shortPeerId(entry.peerId)}</code>, {ago(entry.updatedAt)}
          {entry.by !== "open" ? ` by ${shortAddr(entry.by)}` : ""}.
        </p>
      ) : (
        <p className="if-stat__sub" style={{ margin: "0 0 12px" }}>
          No peer ID registered for this node yet. On the node:
        </p>
      )}
      {!entry && <CommandBlock command="interfold net get-peer-id" />}
      <div className="if-addrow" style={{ marginTop: 12 }}>
        <Field
          label={entry ? "Replace peer ID" : "Peer ID"}
          value={input}
          onChange={setInput}
          placeholder="12D3KooW…"
          invalid={trimmed !== "" && !valid}
          hint={trimmed !== "" && !valid ? "Peer IDs start with 12D3KooW and are 52 characters." : undefined}
        />
        <div className="if-addrow__actions">
          <button
            type="button"
            className="if-btn if-btn--primary"
            disabled={!valid || busy}
            onClick={() => submit(trimmed)}
          >
            {busy ? <span className="if-spinner" /> : null} {entry ? "Update" : "Register"}
          </button>
          {entry && canSign && (
            <button type="button" className="if-btn if-btn--ghost" disabled={busy} onClick={() => submit("")}>
              Clear
            </button>
          )}
        </div>
      </div>
      {msg && (
        <div style={{ marginTop: 12 }}>
          <Note kind={msg.kind}>{msg.text}</Note>
        </div>
      )}
    </section>
  );
};
