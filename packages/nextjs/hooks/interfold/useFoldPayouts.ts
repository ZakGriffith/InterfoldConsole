"use client";

import { useQuery } from "@tanstack/react-query";
import { type Address, decodeEventLog, parseAbiItem } from "viem";
import { usePublicClient } from "wagmi";
import { CHAIN_ID, FOLD, GOVERNANCE, REGISTRY_DEPLOYED_ON_BLOCK } from "~~/utils/interfold/contracts";
import { scanLogs } from "~~/utils/interfold/discovery";
import { sameAddr } from "~~/utils/interfold/format";

/**
 * IPP-001 payouts are not plain transfers: a Foundation Safe approves the vote escrow and calls
 * createLockFor per operator, so each reward lands as an escrow lock in the bond owner's name (the
 * Safe payloads on rewards.theinterfold.com spell this out). A payout therefore shows up as FOLD
 * moving payer -> escrow in a tx that mints a lock NFT to the recipient: Deposit(depositor, tokenId,
 * startTs indexed; amount, totalLocked) on the escrow and an ERC-721 mint in the same receipt.
 * Epochs 1-5 were paid on 2026-10-29 from 0x5429…c018, not the 0x8B43… treasury the payloads named,
 * so both are watched.
 */
const PAYERS: readonly Address[] = [
  "0x8B43b2852fc5031D01DDfCDF702973D93A2FF593",
  "0x5429D8c7fD14023f3c414126F94BbE25A05fC018",
];

const ERC20_TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 value)");
const NFT_TRANSFER = parseAbiItem("event Transfer(address indexed from, address indexed to, uint256 indexed tokenId)");
const DEPOSIT = parseAbiItem(
  "event Deposit(address indexed depositor, uint256 indexed tokenId, uint256 indexed startTs, uint256 amount, uint256 totalLocked)",
);

/** One escrow lock the treasury created for a bond owner. */
export type FoldPayout = {
  txHash: `0x${string}`;
  blockNumber: bigint;
  timestamp: number;
  /** Lower-cased bond owner the lock was minted to. */
  recipient: string;
  tokenId: bigint;
  amount: bigint;
};

/** Payouts only happen a few times over the program; a slow refresh is plenty. */
const POLL_MS = 10 * 60_000;

const fetchPayouts = async (client: NonNullable<ReturnType<typeof usePublicClient>>): Promise<FoldPayout[]> => {
  const latest = await client.getBlockNumber();
  const moves = await scanLogs(
    (fromBlock, toBlock) =>
      client.getLogs({
        address: FOLD.address,
        event: ERC20_TRANSFER,
        args: { from: [...PAYERS], to: GOVERNANCE.escrow.address },
        fromBlock,
        toBlock,
      }),
    REGISTRY_DEPLOYED_ON_BLOCK,
    latest,
  );
  const out: FoldPayout[] = [];
  const blockTs = new Map<bigint, number>();
  for (const hash of [...new Set(moves.map(m => m.transactionHash))]) {
    const receipt = await client.getTransactionReceipt({ hash });
    if (!blockTs.has(receipt.blockNumber)) {
      const block = await client.getBlock({ blockNumber: receipt.blockNumber });
      blockTs.set(receipt.blockNumber, Number(block.timestamp));
    }
    const owners = new Map<bigint, string>();
    const amounts = new Map<bigint, bigint>();
    for (const log of receipt.logs) {
      try {
        if (sameAddr(log.address, GOVERNANCE.lockNft.address)) {
          const { args } = decodeEventLog({ abi: [NFT_TRANSFER], data: log.data, topics: log.topics });
          if (args.from === "0x0000000000000000000000000000000000000000")
            owners.set(args.tokenId, args.to.toLowerCase());
        } else if (sameAddr(log.address, GOVERNANCE.escrow.address)) {
          const { args } = decodeEventLog({ abi: [DEPOSIT], data: log.data, topics: log.topics });
          amounts.set(args.tokenId, args.amount);
        }
      } catch {
        /* some other event on the same contract */
      }
    }
    for (const [tokenId, recipient] of owners) {
      out.push({
        txHash: hash,
        blockNumber: receipt.blockNumber,
        timestamp: blockTs.get(receipt.blockNumber)!,
        recipient,
        tokenId,
        amount: amounts.get(tokenId) ?? 0n,
      });
    }
  }
  return out;
};

/** Every IPP-001 escrow lock the Foundation has created so far, shared across owners. */
export const useFoldPayouts = () => {
  const publicClient = usePublicClient({ chainId: CHAIN_ID });
  return useQuery({
    queryKey: ["interfold", "fold-payouts"],
    enabled: !!publicClient,
    queryFn: () => fetchPayouts(publicClient!),
    staleTime: POLL_MS,
    refetchInterval: POLL_MS,
    retry: 1,
  });
};

export const ownerFoldPayouts = (all: FoldPayout[] | undefined, owner: Address) => {
  const locks = (all ?? []).filter(p => sameAddr(p.recipient, owner));
  return { locks, paid: locks.reduce((t, p) => t + p.amount, 0n), ready: all !== undefined };
};
