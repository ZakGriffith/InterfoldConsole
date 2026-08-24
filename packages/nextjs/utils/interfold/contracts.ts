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

export const LINKS = {
  explorer: "https://etherscan.io",
  dashboard: "https://dashboard.theinterfold.com/#operator",
  docs: "https://docs.theinterfold.com/ciphernode-operators",
  docsRoot: "https://docs.theinterfold.com/introduction",
  repo: "https://github.com/gnosisguild/interfold",
  site: "https://theinterfold.com/",
  blog: "https://blog.theinterfold.com/",
  safeApp: "https://app.safe.global",
} as const;

export const explorerAddress = (a: string) => `${LINKS.explorer}/address/${a}`;
export const explorerTx = (h: string) => `${LINKS.explorer}/tx/${h}`;
export const safeQueue = (safe: string) => `${LINKS.safeApp}/transactions/queue?safe=eth:${safe}`;
export const safeTx = (safe: string, safeTxHash: string) =>
  `${LINKS.safeApp}/transactions/tx?safe=eth:${safe}&id=multisig_${safe}_${safeTxHash}`;
export const safeTxBuilder = (safe: string) =>
  `${LINKS.safeApp}/apps/open?safe=eth:${safe}&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder`;
