"use client";

import { useState } from "react";
import { RequirementsNote } from "./RequirementsNote";
import { CopyButton, Field, Note } from "./ui";
import { type Address } from "viem";
import { useEnsAddress, useEnsName } from "wagmi";
import { useConsole } from "~~/hooks/interfold/ConsoleContext";
import { fmtTokens, safeNormalize, sameAddr, toChecksum } from "~~/utils/interfold/format";
import { operatorInstructions } from "~~/utils/interfold/instructions";

type Props = {
  existing: readonly Address[];
  onStart: (operator: Address, label: string) => void;
};

/**
 * Entry point for a node run by someone else with this Safe as its bond owner:
 * hand them the instructions, paste the operator key they send back, start the guide.
 */
export const OnboardCard = ({ existing, onStart }: Props) => {
  const { owner, ownerIsContract, params: p, funds: f } = useConsole();
  const ownerWord = ownerIsContract ? "Safe" : "wallet";
  const { data: ownerEns } = useEnsName({ address: owner, chainId: 1 });
  const [input, setInput] = useState("");
  const [label, setLabel] = useState("");

  const ensName = input.trim().toLowerCase().endsWith(".eth") ? input.trim() : undefined;
  const { data: ensAddr, isLoading: ensLoading } = useEnsAddress({
    name: safeNormalize(ensName),
    chainId: 1,
    query: { enabled: !!ensName },
  });
  const resolved = toChecksum(input.trim()) ?? (ensAddr ? toChecksum(ensAddr) : null);
  const invalid = input.trim() !== "" && !resolved && !ensLoading;
  const isOwner = !!resolved && sameAddr(resolved, owner);
  const known = !!resolved && existing.some(o => sameAddr(o, resolved));

  const nodesCapacity = f && p && p.requiredCiphernodeBond > 0n ? f.foldBalance / p.requiredCiphernodeBond : undefined;
  const instructions = operatorInstructions(owner, p, ownerEns ?? undefined);

  const start = () => {
    if (!resolved || isOwner) return;
    onStart(resolved, label);
    setInput("");
    setLabel("");
  };

  return (
    <section className="if-card">
      <header className="if-card__head">
        <div>
          <div className="if-eyebrow">Onboard a new ciphernode</div>
          <h2 className="if-card__title">Someone else runs the node; this {ownerWord} posts the collateral.</h2>
          <p className="if-card__body">
            The node operator only has to authorize this bond owner from their operator key. Everything else — bonding{" "}
            {fmtTokens(p?.requiredCiphernodeBond, "FOLD")}, registering, buying tickets — is sent from this {ownerWord}{" "}
            in the guide below.
            {nodesCapacity !== undefined && (
              <>
                {" "}
                It can currently fund <b>{nodesCapacity.toString()}</b> more node
                {nodesCapacity === 1n ? "" : "s"}.
              </>
            )}
          </p>
        </div>
        <div className="if-actions">
          <CopyButton text={instructions} label="Copy instructions for the node operator" className="if-btn--sm" />
        </div>
      </header>

      <div style={{ marginBottom: 18 }}>
        <RequirementsNote compact />
      </div>

      <div className="if-fields">
        <Field
          label="Operator key they sent you (the ciphernode address, or ENS)"
          value={input}
          onChange={setInput}
          placeholder="0x…"
          invalid={invalid || isOwner}
          hint={
            isOwner
              ? "That is the bond owner itself. The operator key is the node's hot wallet, never the bond owner."
              : invalid
                ? "Not a valid address or ENS name."
                : known
                  ? "Already in the fleet — starting will just open its guide."
                  : "From `interfold wallet get` on their machine."
          }
        />
        <Field
          label="Label (optional, stored in this browser)"
          value={label}
          onChange={setLabel}
          placeholder="e.g. Alice — hetzner-1"
          mono={false}
          suffix={
            <button
              type="button"
              className="if-btn if-btn--sm if-btn--primary"
              disabled={!resolved || isOwner}
              onClick={start}
            >
              Start onboarding
            </button>
          }
        />
      </div>

      <div style={{ marginTop: 16 }}>
        <Note>
          Order of operations: send them the instructions → they run{" "}
          <code>interfold ciphernode set-bond-owner --owner {owner.slice(0, 6)}…</code> → they send you the operator key
          → paste it here. The guide waits on step 2 until their authorization lands on-chain, then unlocks bonding.
        </Note>
      </div>
    </section>
  );
};
