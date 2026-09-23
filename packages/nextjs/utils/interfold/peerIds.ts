import { type Address } from "viem";

/** ed25519 libp2p peer IDs in base58btc: "12D3KooW" + 44 chars. Printed by `interfold net get-peer-id`. */
export const PEER_ID_RE = /^12D3KooW[1-9A-HJ-NP-Za-km-z]{44}$/;

export type PeerEntry = { peerId: string; updatedAt: string; by: string };

/** Message the operator key or bond owner signs to change or clear an existing entry. */
export const signMessageFor = (operator: Address, peerId: string) =>
  peerId
    ? `Interfold console: set peer ID ${peerId} for operator ${operator}`
    : `Interfold console: clear the peer ID for operator ${operator}`;

export const shortPeerId = (p?: string) => (!p || p.length < 16 ? (p ?? "") : `${p.slice(0, 8)}…${p.slice(-6)}`);
