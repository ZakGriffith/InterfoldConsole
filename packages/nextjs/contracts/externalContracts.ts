import { GenericContractsDeclaration } from "~~/utils/scaffold-eth/contract";

/**
 * Interfold ciphernode-operator contracts on Ethereum mainnet (chainId 1).
 *
 * Source of truth: verified Solidity on Sourcify (2026-08-24).
 *  - BondingRegistry is an ERC-1967 proxy; ABI below is the implementation ABI
 *    (impl 0x4FF6e77A10E8f06C11a4DD2A71b6AB55394640e4) filtered to operator/bond-owner
 *    functions + ALL events + ALL custom errors (so reverts decode in the UI).
 *  - FOLD ABI is the verified InterfoldToken ABI filtered to ERC-20 + lock views + errors.
 *  - sUSDS (ERC-4626) and tFOLD (ticket token) ABIs are hand-written minimal subsets.
 *
 * Spender cheat-sheet (get this wrong and the tx reverts):
 *   approve FOLD  -> spender = BondingRegistry   (bondCiphernodeFor pulls FOLD)
 *   approve sUSDS -> spender = InterfoldTicketToken (addTicketBalanceFor pulls sUSDS via ticketToken.depositFrom)
 */
const externalContracts = {
  1: {
    BondingRegistry: {
      address: "0x0ec90465095C21830BEcED07e032809A2Bd2915F",
      // Proxy creation tx 0x4cd136cc…448d, block 25473398 (2026-07-06); bounds event scans.
      deployedOnBlock: 25473398,
      abi: [
        {
          name: "acceptBondOwner",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "addTicketBalanceFor",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "availableTickets",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "bondCiphernodeFor",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "bondOwnerOf",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "address",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "ciphernodeBondActiveBps",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "ciphernodeBondToken",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "contract IERC20",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "claimExitsFor",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
            {
              name: "maxTicketAmount",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "maxCiphernodeBondAmount",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "deregisterOperatorFor",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "eligibilityConfigurationVersion",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "exitDelay",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "getCiphernodeBond",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "getTicketBalance",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "hasExitInProgress",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "isActive",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "isCiphernodeBonded",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "isRegistered",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "minTicketBalance",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "numActiveOperators",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "numRegisteredOperators",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "pendingBondOwnerOf",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "address",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "pendingExits",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "ticket",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "ciphernodeBond",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "previewClaimable",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "ticket",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "ciphernodeBond",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "proposeBondOwner",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
            {
              name: "newOwner",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "refreshOperatorStatus",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "refreshOperatorStatuses",
          type: "function",
          inputs: [
            {
              name: "operatorList",
              type: "address[]",
              internalType: "address[]",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "registerOperatorFor",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "registry",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "contract ICiphernodeRegistry",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "removeTicketBalanceFor",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "requiredCiphernodeBond",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "setBondOwner",
          type: "function",
          inputs: [
            {
              name: "bondOwner",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "ticketPrice",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "ticketToken",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "contract InterfoldTicketToken",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "totalBonded",
          type: "function",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "unbondCiphernodeFor",
          type: "function",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [],
          stateMutability: "nonpayable",
        },
        {
          name: "AssetsClaimed",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "ticketAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "ciphernodeBondAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "AssetsQueuedForExit",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "ticketAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "ciphernodeBondAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "unlockTimestamp",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
          ],
          anonymous: false,
        },
        {
          name: "BondOwnerSet",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "bondOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "BondOwnerTransferProposed",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "currentOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "pendingOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "BondedCheckpointsDetached",
          type: "event",
          inputs: [
            {
              name: "previousCheckpoints",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "BondedCheckpointsSet",
          type: "event",
          inputs: [
            {
              name: "checkpoints",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "BondingAssetConfigUpdated",
          type: "event",
          inputs: [
            {
              name: "ticketToken",
              type: "address",
              indexed: true,
              internalType: "contract InterfoldTicketToken",
            },
            {
              name: "ciphernodeBondToken",
              type: "address",
              indexed: true,
              internalType: "contract IERC20",
            },
            {
              name: "ticketPrice",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "requiredCiphernodeBond",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "expectedTicketDecimals",
              type: "uint8",
              indexed: false,
              internalType: "uint8",
            },
            {
              name: "expectedCiphernodeBondDecimals",
              type: "uint8",
              indexed: false,
              internalType: "uint8",
            },
            {
              name: "configurationVersion",
              type: "uint64",
              indexed: true,
              internalType: "uint64",
            },
          ],
          anonymous: false,
        },
        {
          name: "CiphernodeBondSurplusSwept",
          type: "event",
          inputs: [
            {
              name: "token",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "to",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "CiphernodeBondUpdated",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "delta",
              type: "int256",
              indexed: false,
              internalType: "int256",
            },
            {
              name: "newBond",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "reason",
              type: "bytes32",
              indexed: true,
              internalType: "bytes32",
            },
          ],
          anonymous: false,
        },
        {
          name: "CiphernodeDeregistrationRequested",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "unlockAt",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
          ],
          anonymous: false,
        },
        {
          name: "CommitteeObligationUpdated",
          type: "event",
          inputs: [
            {
              name: "e3Id",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "registry",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "active",
              type: "bool",
              indexed: false,
              internalType: "bool",
            },
          ],
          anonymous: false,
        },
        {
          name: "ConfigurationUpdated",
          type: "event",
          inputs: [
            {
              name: "parameter",
              type: "bytes32",
              indexed: true,
              internalType: "bytes32",
            },
            {
              name: "oldValue",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "newValue",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "EligibilityConfigurationVersionUpdated",
          type: "event",
          inputs: [
            {
              name: "version",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "Initialized",
          type: "event",
          inputs: [
            {
              name: "version",
              type: "uint64",
              indexed: false,
              internalType: "uint64",
            },
          ],
          anonymous: false,
        },
        {
          name: "ManagerBanUpdated",
          type: "event",
          inputs: [
            {
              name: "slashingManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "banned",
              type: "bool",
              indexed: false,
              internalType: "bool",
            },
          ],
          anonymous: false,
        },
        {
          name: "OperatorActivationChanged",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "active",
              type: "bool",
              indexed: false,
              internalType: "bool",
            },
          ],
          anonymous: false,
        },
        {
          name: "OwnershipTransferStarted",
          type: "event",
          inputs: [
            {
              name: "previousOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "newOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "OwnershipTransferred",
          type: "event",
          inputs: [
            {
              name: "previousOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "newOwner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "PendingAssetsSlashed",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "ticketAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "ciphernodeBondAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "includedLockedAssets",
              type: "bool",
              indexed: false,
              internalType: "bool",
            },
          ],
          anonymous: false,
        },
        {
          name: "RegistrySet",
          type: "event",
          inputs: [
            {
              name: "registry",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "ReservedSlashedTicketFundsRouted",
          type: "event",
          inputs: [
            {
              name: "slashingManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "proposalId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "refundManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "RewardDistributorUpdated",
          type: "event",
          inputs: [
            {
              name: "distributor",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "authorized",
              type: "bool",
              indexed: false,
              internalType: "bool",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashLockUpdated",
          type: "event",
          inputs: [
            {
              name: "slashingManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "proposalId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "active",
              type: "bool",
              indexed: false,
              internalType: "bool",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashRouteDestinationReleased",
          type: "event",
          inputs: [
            {
              name: "slashingManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "e3Id",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashRouteDestinationSnapshotted",
          type: "event",
          inputs: [
            {
              name: "slashingManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "e3Id",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "refundManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashedFundsTreasurySet",
          type: "event",
          inputs: [
            {
              name: "treasury",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashedFundsWithdrawn",
          type: "event",
          inputs: [
            {
              name: "to",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "ticketAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "ciphernodeBondAmount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashedTicketFundsReserved",
          type: "event",
          inputs: [
            {
              name: "slashingManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "proposalId",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "e3Id",
              type: "uint256",
              indexed: true,
              internalType: "uint256",
            },
            {
              name: "refundManager",
              type: "address",
              indexed: false,
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashingManagerAuthorizationUpdated",
          type: "event",
          inputs: [
            {
              name: "slashingManager",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "authorized",
              type: "bool",
              indexed: false,
              internalType: "bool",
            },
          ],
          anonymous: false,
        },
        {
          name: "SlashingManagerUpdated",
          type: "event",
          inputs: [
            {
              name: "previous",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "next",
              type: "address",
              indexed: true,
              internalType: "address",
            },
          ],
          anonymous: false,
        },
        {
          name: "TicketBalanceUpdated",
          type: "event",
          inputs: [
            {
              name: "operator",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "delta",
              type: "int256",
              indexed: false,
              internalType: "int256",
            },
            {
              name: "newBalance",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
            {
              name: "reason",
              type: "bytes32",
              indexed: true,
              internalType: "bytes32",
            },
          ],
          anonymous: false,
        },
        {
          name: "AlreadyRegistered",
          type: "error",
          inputs: [],
        },
        {
          name: "ArrayLengthMismatch",
          type: "error",
          inputs: [],
        },
        {
          name: "AssetConfigurationInUse",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "e3Assignments",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "openSlashLocks",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "pendingRoutes",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "AssetTransferMismatch",
          type: "error",
          inputs: [
            {
              name: "asset",
              type: "address",
              internalType: "address",
            },
            {
              name: "expected",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "actual",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "BondOwnerAlreadySet",
          type: "error",
          inputs: [
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
            {
              name: "bondOwner",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "BondOwnerTransferViolatesLock",
          type: "error",
          inputs: [
            {
              name: "bondOwner",
              type: "address",
              internalType: "address",
            },
            {
              name: "lockedBalance",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "controlledBalance",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "BondingAssetDecimalsMismatch",
          type: "error",
          inputs: [
            {
              name: "asset",
              type: "address",
              internalType: "address",
            },
            {
              name: "expected",
              type: "uint8",
              internalType: "uint8",
            },
            {
              name: "actual",
              type: "uint8",
              internalType: "uint8",
            },
          ],
        },
        {
          name: "BondingAssetDecimalsUnavailable",
          type: "error",
          inputs: [
            {
              name: "asset",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "CiphernodeBanned",
          type: "error",
          inputs: [],
        },
        {
          name: "E3AssignmentNotFound",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "e3Id",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "E3AssignmentNotTerminal",
          type: "error",
          inputs: [
            {
              name: "e3Id",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ExitDelayMustExceedSortitionWindow",
          type: "error",
          inputs: [
            {
              name: "exitDelay",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "requiredDelay",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ExitDelayOutOfBounds",
          type: "error",
          inputs: [
            {
              name: "exitDelay",
              type: "uint64",
              internalType: "uint64",
            },
          ],
        },
        {
          name: "ExitInProgress",
          type: "error",
          inputs: [],
        },
        {
          name: "ExitNotReady",
          type: "error",
          inputs: [],
        },
        {
          name: "IncompatibleCiphernodeBondToken",
          type: "error",
          inputs: [
            {
              name: "token",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "IncompatibleSlashingManager",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "InsufficientBalance",
          type: "error",
          inputs: [],
        },
        {
          name: "InvalidAmount",
          type: "error",
          inputs: [],
        },
        {
          name: "InvalidBondingAsset",
          type: "error",
          inputs: [
            {
              name: "asset",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "InvalidConfiguration",
          type: "error",
          inputs: [],
        },
        {
          name: "InvalidInitialization",
          type: "error",
          inputs: [],
        },
        {
          name: "ManagerHasActiveBans",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "count",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ManagerHasE3Assignments",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "count",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ManagerHasOpenSlashLocks",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "count",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ManagerHasPendingSlashRoutes",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "count",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "MaxAuthorizedDistributors",
          type: "error",
          inputs: [],
        },
        {
          name: "NoPendingDeregistration",
          type: "error",
          inputs: [],
        },
        {
          name: "NotBondOwner",
          type: "error",
          inputs: [
            {
              name: "caller",
              type: "address",
              internalType: "address",
            },
            {
              name: "operator",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "NotCiphernodeBonded",
          type: "error",
          inputs: [],
        },
        {
          name: "NotInitializing",
          type: "error",
          inputs: [],
        },
        {
          name: "NotRegistered",
          type: "error",
          inputs: [],
        },
        {
          name: "OnlyRewardDistributor",
          type: "error",
          inputs: [],
        },
        {
          name: "OperatorInActiveCommittee",
          type: "error",
          inputs: [],
        },
        {
          name: "OperatorUnderSlash",
          type: "error",
          inputs: [],
        },
        {
          name: "OutstandingAssetLiabilities",
          type: "error",
          inputs: [
            {
              name: "asset",
              type: "address",
              internalType: "address",
            },
            {
              name: "amount",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "OwnableInvalidOwner",
          type: "error",
          inputs: [
            {
              name: "owner",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "OwnableUnauthorizedAccount",
          type: "error",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ReentrancyGuardReentrantCall",
          type: "error",
          inputs: [],
        },
        {
          name: "RenounceOwnershipDisabled",
          type: "error",
          inputs: [],
        },
        {
          name: "ReservedSlashedFunds",
          type: "error",
          inputs: [],
        },
        {
          name: "SafeERC20FailedOperation",
          type: "error",
          inputs: [
            {
              name: "token",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "SlashLockAlreadyExists",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "proposalId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "SlashLockNotFound",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "proposalId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "SlashReservationAlreadyExists",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "proposalId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "SlashReservationNotFound",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "proposalId",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "SlashRouteDestinationNotFound",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "e3Id",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "SlashingManagerBondingMismatch",
          type: "error",
          inputs: [
            {
              name: "manager",
              type: "address",
              internalType: "address",
            },
            {
              name: "configuredBondingRegistry",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "TicketTokenRegistryMismatch",
          type: "error",
          inputs: [
            {
              name: "configured",
              type: "address",
              internalType: "address",
            },
            {
              name: "expected",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "TimestampOverflow",
          type: "error",
          inputs: [],
        },
        {
          name: "TooManyTranches",
          type: "error",
          inputs: [],
        },
        {
          name: "Unauthorized",
          type: "error",
          inputs: [],
        },
        {
          name: "ZeroAddress",
          type: "error",
          inputs: [],
        },
        {
          name: "ZeroAmount",
          type: "error",
          inputs: [],
        },
        // --- appended: errors thrown by FOLD / sUSDS / SafeERC20 *inside* registry calls, so viem can decode nested reverts ---
        {
          name: "ERC20ExceededSafeSupply",
          type: "error",
          inputs: [
            {
              name: "increasedSupply",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "cap",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ERC20InsufficientAllowance",
          type: "error",
          inputs: [
            {
              name: "spender",
              type: "address",
              internalType: "address",
            },
            {
              name: "allowance",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "needed",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ERC20InsufficientBalance",
          type: "error",
          inputs: [
            {
              name: "sender",
              type: "address",
              internalType: "address",
            },
            {
              name: "balance",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "needed",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ERC20InvalidApprover",
          type: "error",
          inputs: [
            {
              name: "approver",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC20InvalidReceiver",
          type: "error",
          inputs: [
            {
              name: "receiver",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC20InvalidSender",
          type: "error",
          inputs: [
            {
              name: "sender",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC20InvalidSpender",
          type: "error",
          inputs: [
            {
              name: "spender",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "InsufficientUnlockedBalance",
          type: "error",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
            {
              name: "spendable",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "value",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
      ],
    },
    FOLD: {
      address: "0xE172e9B6cfBeeB5593bDcE3f077356FDb33af904",
      abi: [
        {
          name: "BONDING_REGISTRY",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "address",
              internalType: "contract IBondingRegistry",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "NO_MORE_LOCKS",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "allowance",
          type: "function",
          inputs: [
            {
              name: "owner",
              type: "address",
              internalType: "address",
            },
            {
              name: "spender",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "approve",
          type: "function",
          inputs: [
            {
              name: "spender",
              type: "address",
              internalType: "address",
            },
            {
              name: "value",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "nonpayable",
        },
        {
          name: "balanceOf",
          type: "function",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "decimals",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint8",
              internalType: "uint8",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "lockedBalanceOf",
          type: "function",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "name",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "string",
              internalType: "string",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "symbol",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "string",
              internalType: "string",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "tgeTimestamp",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint64",
              internalType: "uint64",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "totalSupply",
          type: "function",
          inputs: [],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "transfer",
          type: "function",
          inputs: [
            {
              name: "to",
              type: "address",
              internalType: "address",
            },
            {
              name: "value",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          outputs: [
            {
              name: "",
              type: "bool",
              internalType: "bool",
            },
          ],
          stateMutability: "nonpayable",
        },
        {
          name: "transferableBalanceOf",
          type: "function",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
          outputs: [
            {
              name: "",
              type: "uint256",
              internalType: "uint256",
            },
          ],
          stateMutability: "view",
        },
        {
          name: "Approval",
          type: "event",
          inputs: [
            {
              name: "owner",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "spender",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "value",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "Transfer",
          type: "event",
          inputs: [
            {
              name: "from",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "to",
              type: "address",
              indexed: true,
              internalType: "address",
            },
            {
              name: "value",
              type: "uint256",
              indexed: false,
              internalType: "uint256",
            },
          ],
          anonymous: false,
        },
        {
          name: "AccessControlBadConfirmation",
          type: "error",
          inputs: [],
        },
        {
          name: "AccessControlUnauthorizedAccount",
          type: "error",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
            {
              name: "neededRole",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
        },
        {
          name: "AlreadyLive",
          type: "error",
          inputs: [],
        },
        {
          name: "CheckpointUnorderedInsertion",
          type: "error",
          inputs: [],
        },
        {
          name: "ClaimLockExemptQueuedLocks",
          type: "error",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ClaimSourceAlreadySet",
          type: "error",
          inputs: [
            {
              name: "current",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ConflictingQueuedClaimPolicy",
          type: "error",
          inputs: [
            {
              name: "existingPolicyId",
              type: "bytes32",
              internalType: "bytes32",
            },
            {
              name: "newPolicyId",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
        },
        {
          name: "ECDSAInvalidSignature",
          type: "error",
          inputs: [],
        },
        {
          name: "ECDSAInvalidSignatureLength",
          type: "error",
          inputs: [
            {
              name: "length",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ECDSAInvalidSignatureS",
          type: "error",
          inputs: [
            {
              name: "s",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
        },
        {
          name: "ERC20ExceededSafeSupply",
          type: "error",
          inputs: [
            {
              name: "increasedSupply",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "cap",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ERC20InsufficientAllowance",
          type: "error",
          inputs: [
            {
              name: "spender",
              type: "address",
              internalType: "address",
            },
            {
              name: "allowance",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "needed",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ERC20InsufficientBalance",
          type: "error",
          inputs: [
            {
              name: "sender",
              type: "address",
              internalType: "address",
            },
            {
              name: "balance",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "needed",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ERC20InvalidApprover",
          type: "error",
          inputs: [
            {
              name: "approver",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC20InvalidReceiver",
          type: "error",
          inputs: [
            {
              name: "receiver",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC20InvalidSender",
          type: "error",
          inputs: [
            {
              name: "sender",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC20InvalidSpender",
          type: "error",
          inputs: [
            {
              name: "spender",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC2612ExpiredSignature",
          type: "error",
          inputs: [
            {
              name: "deadline",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ERC2612InvalidSigner",
          type: "error",
          inputs: [
            {
              name: "signer",
              type: "address",
              internalType: "address",
            },
            {
              name: "owner",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "ERC5805FutureLookup",
          type: "error",
          inputs: [
            {
              name: "timepoint",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "clock",
              type: "uint48",
              internalType: "uint48",
            },
          ],
        },
        {
          name: "ERC6372InconsistentClock",
          type: "error",
          inputs: [],
        },
        {
          name: "InsufficientUnlockedBalance",
          type: "error",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
            {
              name: "spendable",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "value",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "InvalidAccountNonce",
          type: "error",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
            {
              name: "currentNonce",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "InvalidBondingRegistry",
          type: "error",
          inputs: [
            {
              name: "registry",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "InvalidCcaWindow",
          type: "error",
          inputs: [
            {
              name: "ccaStart",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "ccaEnd",
              type: "uint64",
              internalType: "uint64",
            },
          ],
        },
        {
          name: "InvalidNoMoreLocks",
          type: "error",
          inputs: [
            {
              name: "noMoreLocks",
              type: "uint256",
              internalType: "uint256",
            },
            {
              name: "minimum",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "InvalidPolicy",
          type: "error",
          inputs: [],
        },
        {
          name: "InvalidShortString",
          type: "error",
          inputs: [],
        },
        {
          name: "MaxSupplyExceeded",
          type: "error",
          inputs: [],
        },
        {
          name: "MintingClosed",
          type: "error",
          inputs: [],
        },
        {
          name: "OwnableInvalidOwner",
          type: "error",
          inputs: [
            {
              name: "owner",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "OwnableUnauthorizedAccount",
          type: "error",
          inputs: [
            {
              name: "account",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "PolicyAlreadyDefined",
          type: "error",
          inputs: [
            {
              name: "policyId",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
        },
        {
          name: "PolicyNotDefined",
          type: "error",
          inputs: [
            {
              name: "policyId",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
        },
        {
          name: "RelinkAmountExceeded",
          type: "error",
          inputs: [],
        },
        {
          name: "RelinkSourceAlreadyVested",
          type: "error",
          inputs: [
            {
              name: "policyId",
              type: "bytes32",
              internalType: "bytes32",
            },
          ],
        },
        {
          name: "RenounceOwnershipDisabled",
          type: "error",
          inputs: [],
        },
        {
          name: "RenounceRoleDisabledForOwner",
          type: "error",
          inputs: [],
        },
        {
          name: "SafeCastOverflowedUintDowncast",
          type: "error",
          inputs: [
            {
              name: "bits",
              type: "uint8",
              internalType: "uint8",
            },
            {
              name: "value",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "StringTooLong",
          type: "error",
          inputs: [
            {
              name: "str",
              type: "string",
              internalType: "string",
            },
          ],
        },
        {
          name: "TgeTooEarly",
          type: "error",
          inputs: [
            {
              name: "current",
              type: "uint64",
              internalType: "uint64",
            },
            {
              name: "notBefore",
              type: "uint64",
              internalType: "uint64",
            },
          ],
        },
        {
          name: "TooManyLocks",
          type: "error",
          inputs: [],
        },
        {
          name: "TooManyQueuedLocks",
          type: "error",
          inputs: [],
        },
        {
          name: "TransferRestricted",
          type: "error",
          inputs: [
            {
              name: "from",
              type: "address",
              internalType: "address",
            },
            {
              name: "to",
              type: "address",
              internalType: "address",
            },
          ],
        },
        {
          name: "VotesExpiredSignature",
          type: "error",
          inputs: [
            {
              name: "expiry",
              type: "uint256",
              internalType: "uint256",
            },
          ],
        },
        {
          name: "ZeroAddress",
          type: "error",
          inputs: [],
        },
        {
          name: "ZeroAmount",
          type: "error",
          inputs: [],
        },
      ],
    },
    sUSDS: {
      address: "0xa3931d71877C0E7a3148CB7Eb4463524FEc27fbD",
      abi: [
        {
          type: "function",
          name: "name",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "symbol",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "decimals",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "uint8",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "totalSupply",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [
            {
              type: "address",
              name: "account",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "allowance",
          stateMutability: "view",
          inputs: [
            {
              type: "address",
              name: "owner",
            },
            {
              type: "address",
              name: "spender",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            {
              type: "address",
              name: "spender",
            },
            {
              type: "uint256",
              name: "value",
            },
          ],
          outputs: [
            {
              type: "bool",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [
            {
              type: "address",
              name: "to",
            },
            {
              type: "uint256",
              name: "value",
            },
          ],
          outputs: [
            {
              type: "bool",
              name: "",
            },
          ],
        },
        {
          type: "event",
          name: "Transfer",
          anonymous: false,
          inputs: [
            {
              type: "address",
              name: "from",
              indexed: true,
            },
            {
              type: "address",
              name: "to",
              indexed: true,
            },
            {
              type: "uint256",
              name: "value",
              indexed: false,
            },
          ],
        },
        {
          type: "event",
          name: "Approval",
          anonymous: false,
          inputs: [
            {
              type: "address",
              name: "owner",
              indexed: true,
            },
            {
              type: "address",
              name: "spender",
              indexed: true,
            },
            {
              type: "uint256",
              name: "value",
              indexed: false,
            },
          ],
        },
        {
          type: "function",
          name: "asset",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "address",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "convertToAssets",
          stateMutability: "view",
          inputs: [
            {
              type: "uint256",
              name: "shares",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "convertToShares",
          stateMutability: "view",
          inputs: [
            {
              type: "uint256",
              name: "assets",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "deposit",
          stateMutability: "nonpayable",
          inputs: [
            {
              type: "uint256",
              name: "assets",
            },
            {
              type: "address",
              name: "receiver",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "shares",
            },
          ],
        },
        {
          type: "function",
          name: "redeem",
          stateMutability: "nonpayable",
          inputs: [
            {
              type: "uint256",
              name: "shares",
            },
            {
              type: "address",
              name: "receiver",
            },
            {
              type: "address",
              name: "owner",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "assets",
            },
          ],
        },
      ],
    },
    InterfoldTicketToken: {
      address: "0xC0B5b49a3949eC4B520eF21BaCFE16e3695F3B5D",
      abi: [
        {
          type: "function",
          name: "name",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "symbol",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "string",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "decimals",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "uint8",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "totalSupply",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "balanceOf",
          stateMutability: "view",
          inputs: [
            {
              type: "address",
              name: "account",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "allowance",
          stateMutability: "view",
          inputs: [
            {
              type: "address",
              name: "owner",
            },
            {
              type: "address",
              name: "spender",
            },
          ],
          outputs: [
            {
              type: "uint256",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "approve",
          stateMutability: "nonpayable",
          inputs: [
            {
              type: "address",
              name: "spender",
            },
            {
              type: "uint256",
              name: "value",
            },
          ],
          outputs: [
            {
              type: "bool",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "transfer",
          stateMutability: "nonpayable",
          inputs: [
            {
              type: "address",
              name: "to",
            },
            {
              type: "uint256",
              name: "value",
            },
          ],
          outputs: [
            {
              type: "bool",
              name: "",
            },
          ],
        },
        {
          type: "event",
          name: "Transfer",
          anonymous: false,
          inputs: [
            {
              type: "address",
              name: "from",
              indexed: true,
            },
            {
              type: "address",
              name: "to",
              indexed: true,
            },
            {
              type: "uint256",
              name: "value",
              indexed: false,
            },
          ],
        },
        {
          type: "event",
          name: "Approval",
          anonymous: false,
          inputs: [
            {
              type: "address",
              name: "owner",
              indexed: true,
            },
            {
              type: "address",
              name: "spender",
              indexed: true,
            },
            {
              type: "uint256",
              name: "value",
              indexed: false,
            },
          ],
        },
        {
          type: "function",
          name: "underlying",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "address",
              name: "",
            },
          ],
        },
        {
          type: "function",
          name: "registry",
          stateMutability: "view",
          inputs: [],
          outputs: [
            {
              type: "address",
              name: "",
            },
          ],
        },
      ],
    },
  },
} as const;

export default externalContracts satisfies GenericContractsDeclaration;
