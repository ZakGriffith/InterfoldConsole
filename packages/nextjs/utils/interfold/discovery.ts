import { type Address, type PublicClient, parseAbiItem } from "viem";
import { REGISTRY, REGISTRY_DEPLOYED_ON_BLOCK } from "~~/utils/interfold/contracts";
import { discoverOperatorsFromSafeHistory } from "~~/utils/interfold/safeDiscovery";

const BOND_OWNER_SET = parseAbiItem("event BondOwnerSet(address indexed operator, address indexed bondOwner)");
const CHUNK = 20_000n;

export type Discovery = { events: Address[]; safe: Address[]; logsFailed: boolean };

/** React Query key shared by the Fleet and Watch pages so one scan serves both. */
export const discoveryKey = (owner: Address) => ["interfold", "operators", owner] as const;

/**
 * Operators that ever named `owner` as bond owner, from two sources:
 *  1. BondOwnerSet(operator, bondOwner = owner) logs since the registry was deployed. One wide
 *     eth_getLogs first (indexed filter => tiny response); public RPCs that refuse wide ranges
 *     fall back to 20k-block chunks.
 *  2. Safe Transaction Service: every executed Safe tx to the registry, decoded for its operator arg.
 * The current on-chain bondOwnerOf decides whether a node is still funded by `owner`.
 */
export const discoverOperators = async (publicClient: PublicClient, owner: Address): Promise<Discovery> => {
  const latest = await publicClient.getBlockNumber();

  const fromEvents = async (): Promise<{ ops: Address[]; failed: boolean }> => {
    const getLogs = (fromBlock: bigint, toBlock: bigint) =>
      publicClient.getLogs({
        address: REGISTRY.address,
        event: BOND_OWNER_SET,
        args: { bondOwner: owner },
        fromBlock,
        toBlock,
      });
    try {
      const logs = await getLogs(REGISTRY_DEPLOYED_ON_BLOCK, latest);
      return { ops: logs.map(l => l.args.operator!).filter(Boolean), failed: false };
    } catch {
      /* wide range refused: chunk */
    }
    try {
      const ops: Address[] = [];
      for (let from = REGISTRY_DEPLOYED_ON_BLOCK; from <= latest; from += CHUNK) {
        const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
        const logs = await getLogs(from, to);
        ops.push(...logs.map(l => l.args.operator!).filter(Boolean));
      }
      return { ops, failed: false };
    } catch {
      return { ops: [], failed: true };
    }
  };

  const [ev, safe] = await Promise.all([
    fromEvents(),
    discoverOperatorsFromSafeHistory(owner, REGISTRY.address, REGISTRY.abi as any),
  ]);
  return { events: ev.ops, safe, logsFailed: ev.failed };
};

/**
 * Every operator that ever set a bond owner, network-wide (unfiltered BondOwnerSet logs). The
 * current bondOwnerOf, read afterwards, says who funds each one today.
 */
export const discoverAllOperators = async (
  publicClient: PublicClient,
): Promise<{ operators: Address[]; logsFailed: boolean }> => {
  const latest = await publicClient.getBlockNumber();
  const getLogs = (fromBlock: bigint, toBlock: bigint) =>
    publicClient.getLogs({ address: REGISTRY.address, event: BOND_OWNER_SET, fromBlock, toBlock });
  const collect = (logs: { args: { operator?: Address } }[]) => {
    const seen = new Set<string>();
    const out: Address[] = [];
    for (const l of logs) {
      const op = l.args.operator;
      if (op && !seen.has(op.toLowerCase())) {
        seen.add(op.toLowerCase());
        out.push(op);
      }
    }
    return out;
  };
  try {
    return { operators: collect(await getLogs(REGISTRY_DEPLOYED_ON_BLOCK, latest)), logsFailed: false };
  } catch {
    /* wide range refused: chunk */
  }
  try {
    const logs = [];
    for (let from = REGISTRY_DEPLOYED_ON_BLOCK; from <= latest; from += CHUNK) {
      const to = from + CHUNK - 1n < latest ? from + CHUNK - 1n : latest;
      logs.push(...(await getLogs(from, to)));
    }
    return { operators: collect(logs), logsFailed: false };
  } catch {
    return { operators: [], logsFailed: true };
  }
};
