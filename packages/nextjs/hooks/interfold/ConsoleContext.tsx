"use client";

import { type ReactNode, createContext, useContext, useMemo, useState } from "react";
import { type Address, zeroAddress } from "viem";
import { useReadContract } from "wagmi";
import { type ConnectionMode, useIsSafeAccount } from "~~/hooks/interfold/useIsSafeAccount";
import { type OwnerFunds, useOwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { type RegistryParams, useRegistryParams } from "~~/hooks/interfold/useRegistryParams";
import { CHAIN_ID, DEFAULT_BOND_OWNER, REGISTRY } from "~~/utils/interfold/contracts";
import { sameAddr } from "~~/utils/interfold/format";

export type OwnerSource = "override" | "connected" | "operator-of-connected" | "default";

export type ConsoleState = {
  /** Connected wallet (any mode). */
  connected?: Address;
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
};

const Ctx = createContext<ConsoleState | null>(null);

export const ConsoleProvider = ({ children }: { children: ReactNode }) => {
  const acct = useIsSafeAccount();
  const [override, setOwnerOverride] = useState<Address | undefined>();

  // If a hot wallet connects, follow it to its bond owner so the Safe's fleet shows up automatically.
  const { data: ownerOfConnected } = useReadContract({
    address: REGISTRY.address,
    abi: REGISTRY.abi,
    functionName: "bondOwnerOf",
    args: acct.address ? [acct.address] : undefined,
    chainId: CHAIN_ID,
    query: { enabled: !!acct.address && acct.mode === "eoa" },
  });

  const { owner, ownerSource } = useMemo<{ owner: Address; ownerSource: OwnerSource }>(() => {
    if (override) return { owner: override, ownerSource: "override" };
    if (acct.address && acct.onMainnet) {
      if (acct.mode === "eoa" && ownerOfConnected && ownerOfConnected !== zeroAddress) {
        return { owner: ownerOfConnected, ownerSource: "operator-of-connected" };
      }
      return { owner: acct.address, ownerSource: "connected" };
    }
    return { owner: DEFAULT_BOND_OWNER, ownerSource: "default" };
  }, [override, acct.address, acct.onMainnet, acct.mode, ownerOfConnected]);

  const params = useRegistryParams();
  const funds = useOwnerFunds(owner);

  const canWriteAsOwner = !!acct.address && acct.onMainnet && sameAddr(acct.address, owner);
  const operatorMode = !!acct.address && acct.mode === "eoa" && !sameAddr(acct.address, owner);

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
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};

export const useConsole = (): ConsoleState => {
  const v = useContext(Ctx);
  if (!v) throw new Error("useConsole must be used inside <ConsoleProvider>");
  return v;
};
