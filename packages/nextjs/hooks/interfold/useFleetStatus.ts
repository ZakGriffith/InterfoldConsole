"use client";

import { useMemo } from "react";
import { type Address, zeroAddress } from "viem";
import { mainnet } from "viem/chains";
import { useReadContracts } from "wagmi";
import scaffoldConfig from "~~/scaffold.config";
import { CHAIN_ID, REGISTRY } from "~~/utils/interfold/contracts";

export type OperatorStatus = {
  operator: Address;
  bondOwner: Address;
  pendingBondOwner: Address;
  bond: bigint;
  isBonded: boolean;
  isRegistered: boolean;
  isActive: boolean;
  ticketBalance: bigint;
  availableTickets: bigint;
  exitInProgress: boolean;
  pendingTicketExit: bigint;
  pendingBondExit: bigint;
  claimableTicket: bigint;
  claimableBond: bigint;
  /** Hot-wallet ETH; the node pays gas for duties and an empty wallet silently misses them. */
  ethBalance: bigint;
};

const MULTICALL3 = mainnet.contracts.multicall3.address;
const MULTICALL3_ABI = [
  {
    type: "function",
    name: "getEthBalance",
    stateMutability: "view",
    inputs: [{ name: "addr", type: "address" }],
    outputs: [{ name: "balance", type: "uint256" }],
  },
] as const;

const PER_OP = [
  "bondOwnerOf",
  "pendingBondOwnerOf",
  "getCiphernodeBond",
  "isCiphernodeBonded",
  "isRegistered",
  "isActive",
  "getTicketBalance",
  "availableTickets",
  "hasExitInProgress",
  "pendingExits",
  "previewClaimable",
] as const;
const STRIDE = PER_OP.length + 1; // + getEthBalance

const pair = (v: unknown): [bigint, bigint] => {
  if (Array.isArray(v)) return [BigInt(v[0] ?? 0), BigInt(v[1] ?? 0)];
  if (v && typeof v === "object") {
    const o = v as Record<string, bigint>;
    const vals = Object.values(o);
    return [o.ticket ?? o.ticketAmount ?? vals[0] ?? 0n, o.ciphernodeBond ?? o.bondAmount ?? o.bond ?? vals[1] ?? 0n];
  }
  return [0n, 0n];
};

/**
 * Status for every operator in one multicall (11 registry views + Multicall3.getEthBalance per row),
 * polled at scaffoldConfig.pollingInterval. Keyed by lower-cased operator address.
 */
export const useFleetStatus = (operators: readonly Address[]) => {
  const contracts = useMemo(
    () =>
      operators.flatMap(op => [
        ...PER_OP.map(functionName => ({
          address: REGISTRY.address,
          abi: REGISTRY.abi,
          functionName,
          args: [op],
          chainId: CHAIN_ID,
        })),
        { address: MULTICALL3, abi: MULTICALL3_ABI, functionName: "getEthBalance", args: [op], chainId: CHAIN_ID },
      ]),
    [operators],
  );

  const q = useReadContracts({
    contracts: contracts as any,
    query: { enabled: operators.length > 0, refetchInterval: scaffoldConfig.pollingInterval },
  });

  const statuses = useMemo(() => {
    const out: Record<string, OperatorStatus> = {};
    const r = q.data;
    if (!r) return out;
    operators.forEach((op, i) => {
      const slice = r.slice(i * STRIDE, (i + 1) * STRIDE);
      if (slice.length < STRIDE || slice.slice(0, PER_OP.length).some(x => x.status !== "success")) return;
      const v = slice.map(x => x.result);
      const [pendingTicketExit, pendingBondExit] = pair(v[9]);
      const [claimableTicket, claimableBond] = pair(v[10]);
      out[op.toLowerCase()] = {
        operator: op,
        bondOwner: (v[0] as Address) ?? zeroAddress,
        pendingBondOwner: (v[1] as Address) ?? zeroAddress,
        bond: (v[2] as bigint) ?? 0n,
        isBonded: !!v[3],
        isRegistered: !!v[4],
        isActive: !!v[5],
        ticketBalance: (v[6] as bigint) ?? 0n,
        availableTickets: (v[7] as bigint) ?? 0n,
        exitInProgress: !!v[8],
        pendingTicketExit,
        pendingBondExit,
        claimableTicket,
        claimableBond,
        ethBalance: slice[11]?.status === "success" ? ((slice[11].result as bigint) ?? 0n) : 0n,
      };
    });
    return out;
  }, [q.data, operators]);

  return { statuses, isLoading: q.isLoading, error: q.error ?? undefined, refetch: q.refetch };
};

/** Convenience for a single address that may not be in the fleet list yet. */
export const useOperatorStatus = (operator: Address | undefined) => {
  const ops = useMemo(() => (operator ? [operator] : []), [operator]);
  const { statuses, ...rest } = useFleetStatus(ops);
  return { data: operator ? statuses[operator.toLowerCase()] : undefined, ...rest };
};
