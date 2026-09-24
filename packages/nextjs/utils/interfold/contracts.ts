import { parseAbi } from "viem";
import externalContracts from "~~/contracts/externalContracts";

/**
 * Static handles to the Interfold contracts declared in externalContracts.ts (chainId 1).
 * Typed `as const` so useReadContracts / simulateContract infer argument and return types.
 */
export const CHAIN_ID = 1 as const;
export const REGISTRY = externalContracts[CHAIN_ID].BondingRegistry;
export const FOLD = externalContracts[CHAIN_ID].FOLD;
export const SUSDS = externalContracts[CHAIN_ID].sUSDS;
export const TICKET_TOKEN = externalContracts[CHAIN_ID].InterfoldTicketToken;

export const REGISTRY_DEPLOYED_ON_BLOCK = BigInt(REGISTRY.deployedOnBlock);

/**
 * The Interfold (E3 lifecycle) contract: deployments/manifest.json -> mainnet.contracts.interfold in
 * gnosisguild/interfold. Only the pieces the console reads; the full ABI is 4k lines and unused.
 */
export const INTERFOLD = {
  address: "0x28cF63B459e6218C69EA97ea7D90541cf648c715",
  /** Proxy's first event (25,786,382), rounded down. */
  deployedOnBlock: 25_786_000n,
  abi: parseAbi([
    "function requestsPaused() view returns (bool)",
    "event E3StageChanged(uint256 indexed e3Id, uint8 previousStage, uint8 newStage)",
    "event E3Failed(uint256 indexed e3Id, uint8 failedAtStage, uint8 reason)",
    "event RequestsPausedSet(bool paused)",
  ]),
} as const;

export const LINKS = {
  explorer: "https://etherscan.io",
  dashboard: "https://dashboard.theinterfold.com/#operator",
  docs: "https://docs.theinterfold.com/ciphernode-operators",
  docsRoot: "https://docs.theinterfold.com/introduction",
  repo: "https://github.com/gnosisguild/interfold",
  site: "https://theinterfold.com/",
  blog: "https://blog.theinterfold.com/",
  safeApp: "https://app.safe.global",
  /** This console's public URL, used in copied operator instructions. Forks set NEXT_PUBLIC_CONSOLE_URL. */
  console: process.env.NEXT_PUBLIC_CONSOLE_URL ?? "https://interfold-console.vercel.app",
} as const;

export const explorerAddress = (a: string) => `${LINKS.explorer}/address/${a}`;
export const explorerTx = (h: string) => `${LINKS.explorer}/tx/${h}`;
export const safeQueue = (safe: string) => `${LINKS.safeApp}/transactions/queue?safe=eth:${safe}`;
export const safeTx = (safe: string, safeTxHash: string) =>
  `${LINKS.safeApp}/transactions/tx?safe=eth:${safe}&id=multisig_${safe}_${safeTxHash}`;
export const safeTxBuilder = (safe: string) =>
  `${LINKS.safeApp}/apps/open?safe=eth:${safe}&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder`;
