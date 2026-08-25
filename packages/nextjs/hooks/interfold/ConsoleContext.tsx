"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Address, zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { ConnectGate, OwnerPrompt } from "~~/components/interfold/ConnectGate";
import { Loader } from "~~/components/interfold/ui";
import { type ConnectionMode, useIsSafeAccount } from "~~/hooks/interfold/useIsSafeAccount";
import { type OwnerFunds, useOwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { type RegistryParams, useRegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { CHAIN_ID, REGISTRY } from "~~/utils/interfold/contracts";
import { sameAddr } from "~~/utils/interfold/format";

export type OwnerSource = "override" | "connected" | "operator-of-connected";

export type ConsoleState = {
  /** Connected wallet (any mode). Always defined inside the provider: nothing renders without one. */
  connected: Address;
  connMode: ConnectionMode;
  isSafe: boolean;
  onMainnet: boolean;
  /** The bond owner whose fleet is shown and on whose behalf writes are simulated. */
  owner: Address;
  ownerSource: OwnerSource;
  setOwnerOverride: (a: Address | undefined) => void;
  /** True when the connected wallet *is* the owner on mainnet: owner-only writes may be sent. */
  canWriteAsOwner: boolean;
  /** True when a plain key that is not the owner is connected: only operator-side calls make sense. */
  operatorMode: boolean;
  params?: RegistryParams;
  paramsLoading: boolean;
  paramsError?: Error;
  funds?: OwnerFunds;
  fundsLoading: boolean;
  /**
   * Queue mode: keep every action available and propose steps back-to-back even when an earlier
   * step has not executed yet. Gates and reverting simulations become warnings; the Safe executes
   * the queue in nonce order.
   */
  queueMode: boolean;
  setQueueMode: (v: boolean) => void;
};

const Ctx = createContext<ConsoleState | null>(null);

/**
 * Resolves who the bond owner is and gates everything behind a connected wallet:
 *  - nothing connected           → ConnectGate (no addresses, no fleet: the page is public)
 *  - Safe / contract account     → it is the owner
 *  - plain key already named a bond owner on-chain (a node's hot wallet) → follow it to that owner
 *  - plain key with no owner     → OwnerPrompt: type the Safe it should authorize (browser-local)
 * There is deliberately no default owner: nothing identifies a specific Safe before it connects.
 */
export const ConsoleProvider = ({ children, gate }: { children: ReactNode; gate?: ReactNode }) => {
  const acct = useIsSafeAccount();
  const [override, setOverrideState] = useState<Address | undefined>();
  const [queueMode, setQueueModeState] = useState(false);
  useEffect(() => {
    try {
      setQueueModeState(localStorage.getItem("interfold.queue-mode") === "1");
    } catch {
      /* default off */
    }
  }, []);
  const setQueueMode = useCallback((v: boolean) => {
    setQueueModeState(v);
    try {
      localStorage.setItem("interfold.queue-mode", v ? "1" : "0");
    } catch {
      /* in-memory only */
    }
  }, []);

  // A typed bond owner (hot-wallet flow) survives reloads until set-bond-owner lands on-chain.
  const overrideKey = acct.address ? `interfold.owner-override.${acct.address.toLowerCase()}` : undefined;
  useEffect(() => {
    try {
      const v = overrideKey ? localStorage.getItem(overrideKey) : null;
      setOverrideState(v ? (v as Address) : undefined);
    } catch {
      setOverrideState(undefined);
    }
  }, [overrideKey]);
  const setOwnerOverride = useCallback(
    (a: Address | undefined) => {
      setOverrideState(a);
      try {
        if (!overrideKey) return;
        if (a) localStorage.setItem(overrideKey, a);
        else localStorage.removeItem(overrideKey);
      } catch {
        /* in-memory only */
      }
    },
    [overrideKey],
  );

  const { data: ownerOfConnected } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "bondOwnerOf",
    args: acct.address ? [acct.address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!acct.address && acct.mode === "eoa" },
  });

  const resolved = useMemo<{ owner: Address; ownerSource: OwnerSource } | undefined>(() => {
    if (override) return { owner: override, ownerSource: "override" };
    if (!acct.address) return undefined;
    if (acct.mode === "eoa") {
      if (ownerOfConnected && ownerOfConnected !== zeroAddress)
        return { owner: ownerOfConnected, ownerSource: "operator-of-connected" };
      if (acct.isCheckingBytecode) return undefined;
      return { owner: acct.address, ownerSource: "connected" };
    }
    return { owner: acct.address, ownerSource: "connected" };
  }, [override, acct.address, acct.mode, acct.isCheckingBytecode, ownerOfConnected]);

  const params = useRegistryParams();
  const funds = useOwnerFunds(resolved?.owner);

  if (!acct.address || !acct.isConnected || !resolved) return <>{gate ?? <ConnectGate />}</>;
  // Plain key with no override yet: wait for its balances before deciding owner vs. hot wallet (no flash).
  if (acct.mode === "eoa" && resolved.ownerSource === "connected" && funds.data === undefined)
    return (
      <main className="if-main">
        <Loader label="Checking this wallet" sub={acct.address} />
      </main>
    );

  const { owner, ownerSource } = resolved;
  const canWriteAsOwner = acct.onMainnet && sameAddr(acct.address, owner);
  const operatorMode = acct.mode === "eoa" && !sameAddr(acct.address, owner);
  // A plain key that owns nothing and runs no known node is most likely a hot wallet before
  // set-bond-owner: ask which Safe it should authorize instead of treating it as a bond owner.
  const needsOwnerPrompt =
    acct.mode === "eoa" &&
    ownerSource === "connected" &&
    funds.data !== undefined &&
    funds.data.totalBonded === 0n &&
    funds.data.foldBalance === 0n;

  const value: ConsoleState = {
    connected: acct.address,
    connMode: acct.mode,
    isSafe: acct.isSafe,
    onMainnet: acct.onMainnet,
    owner,
    ownerSource,
    setOwnerOverride,
    canWriteAsOwner,
    operatorMode,
    params: params.data,
    paramsLoading: params.isLoading,
    paramsError: params.error,
    funds: funds.data,
    fundsLoading: funds.isLoading,
    queueMode,
    setQueueMode,
  };

  if (needsOwnerPrompt) return <OwnerPrompt connected={acct.address} onPick={setOwnerOverride} />;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useConsole = (): ConsoleState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return v;
};
