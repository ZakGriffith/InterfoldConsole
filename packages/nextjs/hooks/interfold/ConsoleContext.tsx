"use client";

import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type Address, getAddress, zeroAddress } from "viem";
import { useBytecode, useReadContract } from "wagmi";
import { OwnerPrompt } from "~~/components/interfold/ConnectGate";
import { Loader } from "~~/components/interfold/ui";
import { type ConnectionMode, useIsSafeAccount } from "~~/hooks/interfold/useIsSafeAccount";
import { type OwnerFunds, useOwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { type RegistryParams, useRegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { CHAIN_ID, REGISTRY } from "~~/utils/interfold/contracts";
import { isContractCode, parseAddressList, sameAddr } from "~~/utils/interfold/format";
import { readJson, useLocalStoreVersion, writeJson } from "~~/utils/interfold/localStore";

export type OwnerSource = "override" | "connected" | "operator-of-connected" | "extra";

export type ConsoleState = {
  /** Connected wallet (any mode); undefined when the page is being read without one. */
  connected?: Address;
  connMode: ConnectionMode;
  isSafe: boolean;
  onMainnet: boolean;
  /** The bond owner this part of the page is about: its fleet is shown and writes are simulated as it. */
  owner: Address;
  ownerSource: OwnerSource;
  setOwnerOverride: (a: Address | undefined) => void;
  /** The owner the connection resolves to (connected wallet, its bond owner, or the typed override). */
  primaryOwner?: Address;
  /** Every bond owner the Fleet page lists: the primary one (when connected) plus the tracked ones. */
  owners: Address[];
  addOwner: (a: Address) => void;
  removeOwner: (a: Address) => void;
  /** The bond owner has code (a Safe or other smart account) vs. a plain key. Drives Safe-only UI. */
  ownerIsContract: boolean;
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

/** Bond owners tracked in this browser, connected or not. */
const TRACKED_KEY = "interfold.fleet.owners";

/**
 * Resolves who the bond owner is and gates everything behind a connected wallet:
 *  - nothing connected           → ConnectGate (no addresses, no fleet: the page is public)
 *  - Safe / contract account     → it is the owner
 *  - plain key already named a bond owner on-chain (a node's hot wallet) → follow it to that owner
 *  - plain key with no owner     → OwnerPrompt: type the Safe it should authorize (browser-local)
 * There is deliberately no default owner: nothing identifies a specific Safe before it connects.
 */
export const ConsoleProvider = ({ children }: { children: ReactNode }) => {
  const acct = useIsSafeAccount();
  const [override, setOverrideState] = useState<Address | undefined>();
  // Default ON: nothing should lock while earlier steps sit in the Safe queue; turn off to make each step wait on-chain.
  const [queueMode, setQueueModeState] = useState(true);
  useEffect(() => {
    try {
      setQueueModeState(localStorage.getItem("interfold.queue-mode") !== "0");
    } catch {
      /* default on */
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

  // Tracked bond owners: typed by whoever is looking, no wallet needed. One list for this browser,
  // plus anything in ?owners= (a shareable link) and lists saved by earlier versions of the page.
  const storeVersion = useLocalStoreVersion();
  const tracked = useMemo(
    () => (storeVersion < 0 ? [] : parseAddressList(readJson<string[]>(TRACKED_KEY, []).join(","))),
    [storeVersion],
  );
  useEffect(() => {
    if (storeVersion < 0) return;
    const merged = [...readJson<string[]>(TRACKED_KEY, [])];
    const push = (list: readonly string[]) => {
      for (const a of list) if (!merged.some(x => sameAddr(x, a))) merged.push(a);
    };
    try {
      push(parseAddressList(new URLSearchParams(window.location.search).get("owners")));
      push(readJson<string[]>("interfold.watch.owners", []));
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("interfold.fleet.owners.")) push(readJson<string[]>(k, []));
      }
    } catch {
      /* no storage */
    }
    if (merged.length !== readJson<string[]>(TRACKED_KEY, []).length) writeJson(TRACKED_KEY, merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeVersion < 0]);
  const addOwner = useCallback((a: Address) => {
    const cur = readJson<string[]>(TRACKED_KEY, []);
    if (cur.some(x => sameAddr(x, a))) return;
    writeJson(TRACKED_KEY, [...cur, getAddress(a)]);
  }, []);
  const removeOwner = useCallback((a: Address) => {
    writeJson(
      TRACKED_KEY,
      readJson<string[]>(TRACKED_KEY, []).filter(x => !sameAddr(x, a)),
    );
  }, []);

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
  const { data: ownerCode } = useBytecode({
    address: resolved?.owner,
    chainId: CHAIN_ID,
    query: { enabled: !!resolved?.owner },
  });
  const ownerIsContract = isContractCode(ownerCode);

  const shared = {
    setOwnerOverride,
    addOwner,
    removeOwner,
    params: params.data,
    paramsLoading: params.isLoading,
    paramsError: params.error,
    queueMode,
    setQueueMode,
  };

  // No wallet: the page is read-only and lists whatever bond owners are tracked in this browser.
  if (!acct.address || !acct.isConnected) {
    const value: ConsoleState = {
      ...shared,
      connected: undefined,
      connMode: "none",
      isSafe: false,
      onMainnet: false,
      owner: tracked[0] ?? zeroAddress,
      ownerSource: "extra",
      ownerIsContract: false,
      primaryOwner: undefined,
      owners: tracked,
      canWriteAsOwner: false,
      operatorMode: false,
      funds: undefined,
      fundsLoading: false,
    };
    return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
  }

  if (!resolved)
    return (
      <main className="if-main">
        <Loader label="Checking this wallet" sub={acct.address} />
      </main>
    );
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
    ...shared,
    connected: acct.address,
    connMode: acct.mode,
    isSafe: acct.isSafe,
    onMainnet: acct.onMainnet,
    owner,
    ownerSource,
    ownerIsContract,
    primaryOwner: owner,
    owners: [owner, ...tracked.filter(a => !sameAddr(a, owner))],
    canWriteAsOwner,
    operatorMode,
    funds: funds.data,
    fundsLoading: funds.isLoading,
  };

  if (needsOwnerPrompt) return <OwnerPrompt connected={acct.address} onPick={setOwnerOverride} />;

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useConsole = (): ConsoleState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return v;
};

/**
 * One Fleet section: re-provides the console state with `owner` swapped for another bond owner,
 * so the owner strip, fleet table, wizard and action buttons below it all work unchanged.
 * Writes stay gated on the connected wallet actually being that owner.
 */
export const OwnerScope = ({ owner, children }: { owner: Address; children: ReactNode }) => {
  const parent = useConsole();
  const funds = useOwnerFunds(owner);
  const { data: code } = useBytecode({ address: owner, chainId: CHAIN_ID, query: { enabled: !!owner } });
  const value = useMemo<ConsoleState>(() => {
    if (sameAddr(owner, parent.primaryOwner)) return parent;
    return {
      ...parent,
      owner,
      ownerSource: "extra",
      ownerIsContract: isContractCode(code),
      canWriteAsOwner: parent.onMainnet && sameAddr(parent.connected, owner),
      operatorMode: parent.connMode === "eoa" && !sameAddr(parent.connected, owner),
      funds: funds.data,
      fundsLoading: funds.isLoading,
    };
  }, [parent, owner, code, funds.data, funds.isLoading]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
