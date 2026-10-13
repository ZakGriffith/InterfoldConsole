"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, type Hex, parseAbiItem } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { E3_COMPLETE, E3_FAILED } from "~~/hooks/interfold/useE3Activity";
import {
  CHAIN_ID,
  CIPHERNODE_REGISTRY,
  INTERFOLD,
  REGISTRY,
  REGISTRY_DEPLOYED_ON_BLOCK,
  USDS_ADDRESS,
} from "~~/utils/interfold/contracts";
import { scanLogs } from "~~/utils/interfold/discovery";

/** IInterfold.CommitteeSize, in enum order. */
export const COMMITTEE_SIZE = ["minimum", "micro", "small"] as const;

const OBLIGATION = parseAbiItem(
  "event CommitteeObligationUpdated(uint256 indexed e3Id, address indexed registry, address indexed operator, bool active)",
);
const TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const ZERO = "0x0000000000000000000000000000000000000000";
const COUNTER_MASK = (1n << 96n) - 1n;
/** Exact block timestamps (one eth_getBlock each) for this many of the newest E3s; older ones are estimated. */
const DATED = 12;
const SLOT_SECONDS = 12;
/**
 * E3s requested by Interfold itself before operators were asked to run anything. #0 (2026-09-19)
 * never formed a committee, #1 (2026-09-21) timed out in DKG. Shown, but marked.
 */
export const LAUNCH_TESTS = new Set([0, 1]);
const blockStamps = new Map<bigint, number>();

/** One E3StageChanged, in order. `at` is exact for the newest E3s and estimated (≈) for older ones. */
export type StageStep = { stage: number; block: bigint; tx: Hex; at?: number; estimated?: boolean };

export type E3Record = {
  id: bigint;
  num: number;
  requestBlock: bigint;
  requestTx: Hex;
  requestedAt: number;
  requester: Address;
  program: Address;
  committeeSize: number;
  paramSet: number;
  cryptoConfigId: Hex;
  encryptionSchemeId: Hex;
  /** Unix seconds: when the program starts and stops taking inputs. */
  inputWindow: [number, number];
  /** Fee token the requester moved into Interfold in the request transaction. */
  payment?: bigint;
  randomness?: { provider: Address; deadline: number };
  stage: number;
  failedAtStage?: number;
  reason?: number;
  steps: StageStep[];
  endBlock?: bigint;
  endedAt?: number;
  endEstimated?: boolean;
  endTx?: Hex;
  /** Every node that answered sortition with a ticket, in order, lower-cased. */
  tickets: { node: string; ticketId: bigint; block: bigint }[];
  /** Sortition's final pick (lower-cased); empty until the committee is finalized. */
  committee: string[];
  formationFailed?: { submitted: bigint; required: bigint };
  /** Nodes whose bond the registry still holds against this E3. */
  obligated: string[];
  expelled: { node: string; reason: Hex; block: bigint }[];
  viability?: { active: bigint; threshold: bigint; viable: boolean };
  ciphertext?: { availabilityBlock: number; leafIndex: bigint; contentHash: Hex; block: bigint; tx: Hex };
  /** One entry per committee member on a completed E3. */
  rewards?: { nodes: Address[]; amounts: bigint[]; block: bigint; token?: Address };
  /** Per bond owner (lower-cased): what it has pulled out so far. */
  claimed: Record<string, bigint>;
  /** Everything credited to the protocol treasury for this E3 (randomness fee, then the protocol share). */
  treasury: bigint;
  /** The flat randomness fee, credited in the request transaction. */
  randomnessFee: bigint;
  refund?: { payment: bigint; honestNodes: bigint; block: bigint };
};

export type E3Ledger = {
  e3s: E3Record[];
  latestBlock: bigint;
  pausedSince?: number;
};

const isTerminal = (stage: number) => stage === E3_COMPLETE || stage === E3_FAILED;

const fetchLedger = async (client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<E3Ledger> => {
  const latest = await client.getBlockNumber();
  const from = INTERFOLD.deployedOnBlock;
  const [lifecycle, sortition, obligations, payments] = await Promise.all([
    scanLogs(
      (fromBlock, toBlock) =>
        client.getLogs({
          address: INTERFOLD.address,
          events: INTERFOLD.abi.filter(x => x.type === "event"),
          fromBlock,
          toBlock,
        }),
      from,
      latest,
    ),
    scanLogs(
      (fromBlock, toBlock) =>
        client.getLogs({
          address: CIPHERNODE_REGISTRY.address,
          events: CIPHERNODE_REGISTRY.abi.filter(x => x.type === "event"),
          fromBlock,
          toBlock,
        }),
      from,
      latest,
    ),
    scanLogs(
      (fromBlock, toBlock) => client.getLogs({ address: REGISTRY.address, event: OBLIGATION, fromBlock, toBlock }),
      from > REGISTRY_DEPLOYED_ON_BLOCK ? from : REGISTRY_DEPLOYED_ON_BLOCK,
      latest,
    ),
    scanLogs(
      (fromBlock, toBlock) =>
        client.getLogs({ address: USDS_ADDRESS, event: TRANSFER, args: { to: INTERFOLD.address }, fromBlock, toBlock }),
      from,
      latest,
    ),
  ]);

  const byId = new Map<bigint, E3Record>();
  const paidByTx = new Map<string, bigint>();
  for (const p of payments) paidByTx.set(p.transactionHash, (paidByTx.get(p.transactionHash) ?? 0n) + p.args.value!);
  let pausedBlock: bigint | undefined;

  // A request transaction logs its treasury credit before E3Requested: create every E3 first (stable sort).
  const requestsFirst = [...lifecycle].sort(
    (a, b) => Number(a.eventName !== "E3Requested") - Number(b.eventName !== "E3Requested"),
  );
  for (const log of requestsFirst) {
    if (log.eventName === "RequestsPausedSet") {
      pausedBlock = log.args.paused ? log.blockNumber : undefined;
      continue;
    }
    if (log.eventName === "E3Requested") {
      const e3 = log.args.e3!;
      const id = log.args.e3Id!;
      byId.set(id, {
        id,
        num: Number(id & COUNTER_MASK),
        requestBlock: log.blockNumber,
        requestTx: log.transactionHash,
        requestedAt: Number(e3.requestBlock),
        requester: e3.requester,
        program: e3.e3Program,
        committeeSize: e3.committeeSize,
        paramSet: e3.paramSet,
        cryptoConfigId: log.args.cryptoConfigId!,
        encryptionSchemeId: e3.encryptionSchemeId,
        inputWindow: [Number(e3.inputWindow[0]), Number(e3.inputWindow[1])],
        payment: paidByTx.get(log.transactionHash),
        stage: 0,
        steps: [],
        tickets: [],
        committee: [],
        obligated: [],
        expelled: [],
        claimed: {},
        treasury: 0n,
        randomnessFee: 0n,
      });
      continue;
    }
    const e3 = byId.get(log.args.e3Id!);
    if (!e3) continue;
    switch (log.eventName) {
      case "E3StageChanged":
        e3.stage = log.args.newStage!;
        e3.steps.push({ stage: e3.stage, block: log.blockNumber, tx: log.transactionHash });
        if (isTerminal(e3.stage)) {
          e3.endBlock = log.blockNumber;
          e3.endTx = log.transactionHash;
        }
        break;
      case "E3Failed":
        e3.failedAtStage = log.args.failedAtStage;
        e3.reason = log.args.reason;
        break;
      case "E3FailureReclassified":
        e3.reason = log.args.reason;
        break;
      case "E3FailureProcessed":
        e3.refund = {
          payment: log.args.paymentAmount!,
          honestNodes: log.args.honestNodeCount!,
          block: log.blockNumber,
        };
        break;
      case "CiphertextOutputReferencePublished":
        e3.ciphertext = {
          availabilityBlock: log.args.availabilityBlock!,
          leafIndex: log.args.availabilityLeafIndex!,
          contentHash: log.args.contentHash!,
          block: log.blockNumber,
          tx: log.transactionHash,
        };
        break;
      case "RewardsDistributed":
        e3.rewards = { nodes: [...log.args.nodes!], amounts: [...log.args.amounts!], block: log.blockNumber };
        break;
      case "RewardClaimed": {
        const k = log.args.account!.toLowerCase();
        e3.claimed[k] = (e3.claimed[k] ?? 0n) + log.args.amount!;
        if (e3.rewards) e3.rewards.token ??= log.args.token;
        break;
      }
      case "TreasuryCredited":
        e3.treasury += log.args.amount!;
        // The credit in the request transaction is the flat randomness fee; a later one is the protocol share.
        if (log.transactionHash === e3.requestTx) e3.randomnessFee += log.args.amount!;
        if (e3.rewards) e3.rewards.token ??= log.args.token;
        break;
    }
  }

  for (const log of sortition) {
    const e3 = byId.get(log.args.e3Id!);
    if (!e3) continue;
    switch (log.eventName) {
      case "CommitteeRandomnessRequested":
        e3.randomness = { provider: log.args.provider!, deadline: Number(log.args.randomnessDeadline) };
        break;
      case "TicketSubmitted":
        e3.tickets.push({ node: log.args.node!.toLowerCase(), ticketId: log.args.ticketId!, block: log.blockNumber });
        break;
      case "SortitionCommitteeFinalized":
        e3.committee = log.args.committee!.map(a => a.toLowerCase());
        break;
      case "CommitteeFormationFailed":
        e3.formationFailed = { submitted: log.args.nodesSubmitted!, required: log.args.thresholdRequired! };
        break;
      case "CommitteeMemberExpelled":
        e3.expelled.push({ node: log.args.node!.toLowerCase(), reason: log.args.reason!, block: log.blockNumber });
        break;
      case "CommitteeViabilityUpdated":
        e3.viability = { active: log.args.activeCount!, threshold: log.args.thresholdM!, viable: log.args.viable! };
        break;
    }
  }

  const active = new Map<bigint, Set<string>>();
  for (const log of obligations) {
    const op = log.args.operator!.toLowerCase();
    if (op === ZERO || !byId.has(log.args.e3Id!)) continue;
    let set = active.get(log.args.e3Id!);
    if (!set) {
      set = new Set();
      active.set(log.args.e3Id!, set);
    }
    if (log.args.active) set.add(op);
    else set.delete(op);
  }
  for (const [id, set] of active) byId.get(id)!.obligated = [...set];

  const e3s = [...byId.values()].sort((a, b) => (a.requestBlock < b.requestBlock ? 1 : -1));

  // Timestamps: the request time is in the struct; stage changes need their blocks.
  const wanted = new Set<bigint>();
  for (const e3 of e3s.slice(0, DATED)) for (const s of e3.steps) wanted.add(s.block);
  if (pausedBlock !== undefined) wanted.add(pausedBlock);
  await Promise.all(
    [...wanted]
      .filter(b => !blockStamps.has(b))
      .map(async b => {
        try {
          blockStamps.set(b, Number((await client.getBlock({ blockNumber: b })).timestamp));
        } catch {
          /* estimated below */
        }
      }),
  );
  for (const e3 of e3s) {
    for (const s of e3.steps) {
      const exact = blockStamps.get(s.block);
      s.at = exact ?? e3.requestedAt + Number(s.block - e3.requestBlock) * SLOT_SECONDS;
      s.estimated = exact === undefined;
    }
    const end = e3.steps.find(s => s.block === e3.endBlock);
    e3.endedAt = end?.at;
    e3.endEstimated = end?.estimated;
  }

  return {
    e3s,
    latestBlock: latest,
    pausedSince: pausedBlock !== undefined ? blockStamps.get(pausedBlock) : undefined,
  };
};

export type LiveE3 = {
  dkgDeadline?: number;
  computeDeadline?: number;
  decryptionDeadline?: number;
  lifecycleDeadline?: number;
  /** checkFailureCondition: anyone may mark the E3 failed now, with this reason. */
  canFail?: { reason: number };
};

/**
 * Every E3 requested on mainnet since Interfold launched, with its request, sortition, lifecycle,
 * outputs and money, from the Interfold, ciphernode registry and bonding registry logs plus the fee
 * token's transfers into Interfold. Live E3s also get their deadlines read from the contract.
 */
export const useE3s = () => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  const q = useQuery({
    queryKey: ["interfold", "e3-ledger"],
    enabled: !!publicClient,
    queryFn: () => fetchLedger(publicClient!),
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: 1,
  });
  const paused = useReadContract({
    address: INTERFOLD.address,
    abi: INTERFOLD.abi,
    functionName: "requestsPaused",
    chainId: CHAIN_ID,
    query: { refetchInterval: 120_000 },
  });

  const liveIds = (q.data?.e3s ?? []).filter(e => !isTerminal(e.stage)).map(e => e.id);
  const reads = useReadContracts({
    contracts: liveIds.flatMap(id => [
      { address: INTERFOLD.address, abi: INTERFOLD.abi, functionName: "getDeadlines", args: [id], chainId: CHAIN_ID },
      {
        address: INTERFOLD.address,
        abi: INTERFOLD.abi,
        functionName: "getE3LifecycleDeadline",
        args: [id],
        chainId: CHAIN_ID,
      },
      {
        address: INTERFOLD.address,
        abi: INTERFOLD.abi,
        functionName: "checkFailureCondition",
        args: [id],
        chainId: CHAIN_ID,
      },
    ]),
    query: { enabled: liveIds.length > 0, refetchInterval: 30_000, staleTime: 15_000 },
  });
  const live: Record<string, LiveE3> = {};
  liveIds.forEach((id, i) => {
    const [d, l, f] = [reads.data?.[i * 3], reads.data?.[i * 3 + 1], reads.data?.[i * 3 + 2]];
    const dl =
      d?.status === "success"
        ? (d.result as unknown as { dkgDeadline: bigint; computeDeadline: bigint; decryptionDeadline: bigint })
        : undefined;
    const fail = f?.status === "success" ? (f.result as unknown as readonly [boolean, number]) : undefined;
    const ts = (v: bigint | undefined) => (v && v > 0n ? Number(v) : undefined);
    live[id.toString()] = {
      dkgDeadline: ts(dl?.dkgDeadline),
      computeDeadline: ts(dl?.computeDeadline),
      decryptionDeadline: ts(dl?.decryptionDeadline),
      lifecycleDeadline: l?.status === "success" ? ts(l.result as bigint) : undefined,
      canFail: fail?.[0] ? { reason: fail[1] } : undefined,
    };
  });

  return {
    data: q.data,
    isLoading: q.isLoading,
    failed: q.isError,
    refetch: q.refetch,
    updatedAt: q.dataUpdatedAt,
    paused: paused.data,
    live,
  };
};
