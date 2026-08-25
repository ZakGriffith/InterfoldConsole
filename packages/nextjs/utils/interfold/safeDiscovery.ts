import { type Abi, type Address, type Hex, decodeFunctionData } from "viem";

const OPERATOR_FUNCS = new Set([
  "bondCiphernodeFor",
  "registerOperatorFor",
  "addTicketBalanceFor",
  "unbondCiphernodeFor",
  "removeTicketBalanceFor",
  "deregisterOperatorFor",
  "claimExitsFor",
  "refreshOperatorStatus",
  "proposeBondOwner",
]);

/**
 * Fallback operator discovery when eth_getLogs is unavailable: every executed Safe transaction
 * to the registry, decoded with the registry ABI, yields the `operator` argument.
 * Unauthenticated, free, mainnet only. Returns [] for EOAs (404) or network errors.
 */
export const discoverOperatorsFromSafeHistory = async (
  safe: Address,
  registry: Address,
  abi: Abi,
): Promise<Address[]> => {
  const ops = new Set<string>();
  let url: string | null =
    `https://api.safe.global/tx-service/eth/api/v1/safes/${safe}/multisig-transactions/?to=${registry}&executed=true&limit=100`;
  try {
    for (let page = 0; url && page < 10; page++) {
      const res = await fetch(url);
      if (!res.ok) break;
      const body = (await res.json()) as {
        next: string | null;
        results: { data: Hex | null; isSuccessful: boolean | null }[];
      };
      for (const tx of body.results ?? []) {
        if (!tx.data || tx.isSuccessful === false) continue;
        try {
          const { functionName, args } = decodeFunctionData({ abi, data: tx.data });
          if (OPERATOR_FUNCS.has(functionName)) {
            const op = (args as readonly unknown[])[0];
            if (typeof op === "string") ops.add(op.toLowerCase());
          }
        } catch {
          /* not a registry call */
        }
      }
      url = body.next;
    }
  } catch {
    /* offline / CORS / rate-limited: caller merges other sources */
  }
  return [...ops] as Address[];
};
