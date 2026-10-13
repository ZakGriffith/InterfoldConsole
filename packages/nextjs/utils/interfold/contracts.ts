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
    // IE3.sol. `requestBlock` is a unix timestamp (EIP-6372 clock), despite the name.
    "struct E3 { uint256 seed; uint8 committeeSize; uint256 requestBlock; uint256[2] inputWindow; bytes32 encryptionSchemeId; address e3Program; uint8 paramSet; bytes customParams; address decryptionVerifier; address pkVerifier; bytes32 committeePublicKey; bytes32 ciphertextOutput; bytes plaintextOutput; address requester; bytes32 ciphertextCommitment; }",
    "struct E3Deadlines { uint256 dkgDeadline; uint256 computeDeadline; uint256 decryptionDeadline; }",
    "function requestsPaused() view returns (bool)",
    "function activeE3Count() view returns (uint256)",
    "function getE3Stage(uint256 e3Id) view returns (uint8)",
    "function getDeadlines(uint256 e3Id) view returns (E3Deadlines deadlines)",
    "function getE3LifecycleDeadline(uint256 e3Id) view returns (uint256)",
    "function checkFailureCondition(uint256 e3Id) view returns (bool canFail, uint8 reason)",
    "event E3Requested(uint256 e3Id, E3 e3, bytes32 indexed cryptoConfigId)",
    "event E3StageChanged(uint256 indexed e3Id, uint8 previousStage, uint8 newStage)",
    "event E3Failed(uint256 indexed e3Id, uint8 failedAtStage, uint8 reason)",
    "event E3FailureReclassified(uint256 indexed e3Id, uint8 previousReason, uint8 reason)",
    "event E3FailureProcessed(uint256 indexed e3Id, uint256 paymentAmount, uint256 honestNodeCount)",
    "event CommitteeFinalized(uint256 indexed e3Id)",
    "event CommitteeFormed(uint256 indexed e3Id)",
    "event CiphertextOutputReferencePublished(uint256 indexed e3Id, bytes32 contentHash, bytes32 ciphertextCommitment, uint32 availabilityBlock, uint128 availabilityLeafIndex)",
    "event CiphertextOutputPublished(uint256 indexed e3Id, bytes ciphertextOutput, bytes32 ciphertextCommitment)",
    "event RewardsDistributed(uint256 indexed e3Id, address[] nodes, uint256[] amounts)",
    "event RewardClaimed(uint256 indexed e3Id, address indexed account, address indexed token, uint256 amount)",
    "event TreasuryCredited(uint256 indexed e3Id, address indexed treasury, address indexed token, uint256 amount)",
    "event RequestsPausedSet(bool paused)",
  ]),
} as const;

/**
 * CiphernodeRegistry (deployments/manifest.json -> mainnet.contracts.ciphernode_registry): runs
 * sortition for each E3. Tickets, the finalized committee and expulsions are its events; the
 * bonding registry mirrors them as committee obligations.
 */
export const CIPHERNODE_REGISTRY = {
  address: "0xC927A5B2d8F68697bC28C0670df05178c93df2d7",
  deployedOnBlock: 25_786_000n,
  abi: parseAbi([
    "event CommitteeRandomnessRequested(uint256 indexed e3Id, uint256 indexed requestId, address indexed provider, uint256 randomnessDeadline)",
    "event TicketSubmitted(uint256 indexed e3Id, address indexed node, uint256 ticketId, uint256 score)",
    "event SortitionCommitteeFinalized(uint256 indexed e3Id, address[] committee, uint256[] scores)",
    "event CommitteeFormationFailed(uint256 indexed e3Id, uint256 nodesSubmitted, uint256 thresholdRequired)",
    "event CommitteeMemberExpelled(uint256 indexed e3Id, address indexed node, bytes32 reason, uint256 activeCountAfter)",
    "event CommitteeViabilityUpdated(uint256 indexed e3Id, uint256 activeCount, uint256 thresholdM, bool viable)",
  ]),
} as const;

/** E3 programs seen on mainnet, by lower-cased address. Everything else shows as its address. */
export const E3_PROGRAMS: Record<string, string> = {
  // Sourcify: project/contracts/CRISPProgram.sol (Interfold governance's secret ballots).
  "0x53fcdb21e73a461cfe6c64b19855204384b91ba3": "CRISP vote",
};

/**
 * E3RefundManager (deployments/manifest.json -> mainnet.contracts.refundManager; impl verified on
 * Sourcify). On a completed E3 Interfold parks each committee member's share of the payment here,
 * payable to that operator's bond owner as snapshotted at request time; the owner claims per E3.
 * Failed E3s refund the requester instead.
 */
export const REFUND_MANAGER = {
  address: "0x1940eF168f4E0B3dA24BEca539856684793B0F6e",
  deployedOnBlock: 25_786_000n,
  abi: parseAbi([
    "function pendingHeldSuccessReward(uint256 e3Id, address account) view returns (uint256)",
    "function claimHeldSuccessReward(uint256 e3Id) returns (uint256)",
    // Permissionless: pays the operator's snapshotted bond owner whoever sends it.
    "function claimOperatorHeldSuccessReward(uint256 e3Id, address operator) returns (uint256)",
    "function operatorHeldRewards(uint256 e3Id, address operator) view returns (uint256 heldSuccess, uint256 heldSlash)",
    "event SuccessRewardHeld(uint256 indexed e3Id, address indexed operator, address indexed token, uint256 amount)",
    "event RewardRecipientSnapshotted(uint256 indexed e3Id, address indexed operator, address indexed recipient)",
    "event HeldSuccessRewardClaimed(uint256 indexed e3Id, address indexed account, address indexed token, uint256 amount)",
  ]),
} as const;

/** The payment token E3 requesters have used so far; rewards arrive in whatever the requester paid. */
export const USDS_ADDRESS = "0xdC035D45d973E3EC169d2276DDab16f1e407384F";

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
  governance: "https://governance.theinterfold.com/",
  governanceProposals: "https://governance.theinterfold.com/plugins/proposals/#/",
  governanceVotingPower: "https://governance.theinterfold.com/plugins/lock/#/",
} as const;

/**
 * Interfold governance (Aragon OSx, secret ballots via CRISP). Addresses taken from
 * governance.theinterfold.com's bundle and checked against Sourcify on 2026-09-30.
 *
 * Voting power is read from BondedVotes: FOLD locked in the voting escrow (counts only once
 * delegated, like ERC20Votes) + FOLD bonded through the BondingRegistry (credited to the bond
 * owner) + vesting-locked FOLD still in the wallet, net of the bond. BondedVotes.delegate reverts
 * (DelegationNotSupported): only the escrow part can be delegated, through the escrow's IVotes adapter.
 */
export const GOVERNANCE = {
  votes: {
    address: "0x028deEA644258c78b1B5B2eacF469F5D781Fb43E",
    abi: parseAbi([
      "function getVotes(address account) view returns (uint256)",
      "function delegates(address account) view returns (address)",
    ]),
  },
  /** IBondedCheckpoints written by the registry; `bonded` is what BondedVotes adds for an owner. */
  bondedCheckpoints: {
    address: "0xDbCaeec5B040A134314FfD43aA2ca0D16006f963",
    abi: parseAbi(["function bonded(address account) view returns (uint256)"]),
  },
  /** Aragon voting escrow: FOLD locked here as lock NFTs; 30-day cooldown to withdraw. */
  escrow: {
    address: "0x71360F335e4Ec9c010e29bA7171bc62c9B4c1F12",
    abi: parseAbi(["function votingPowerForAccount(address account) view returns (uint256)"]),
  },
  /** The escrow's IVotes adapter (escrow.ivotesAdapter()): holds the delegation for locked FOLD. */
  escrowVotes: {
    address: "0x8f141B4D294d39e7D1530916A3eD65B3970C6FEc",
    abi: parseAbi([
      "function getVotes(address account) view returns (uint256)",
      "function delegates(address account) view returns (address)",
      "function delegate(address delegatee)",
    ]),
  },
} as const;

export const explorerAddress = (a: string) => `${LINKS.explorer}/address/${a}`;
export const explorerTx = (h: string) => `${LINKS.explorer}/tx/${h}`;
export const safeQueue = (safe: string) => `${LINKS.safeApp}/transactions/queue?safe=eth:${safe}`;
export const safeTx = (safe: string, safeTxHash: string) =>
  `${LINKS.safeApp}/transactions/tx?safe=eth:${safe}&id=multisig_${safe}_${safeTxHash}`;
export const safeTxBuilder = (safe: string) =>
  `${LINKS.safeApp}/apps/open?safe=eth:${safe}&appUrl=https%3A%2F%2Fapps-portal.safe.global%2Ftx-builder`;
