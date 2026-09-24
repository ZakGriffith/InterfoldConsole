"use client";

import { OfflineNode } from "./OfflineNode";

/**
 * "Set up a node": for whoever runs the machine. Paste the operator key, see what is missing,
 * register the peer ID, export the Safe batch for the bond owner. No wallet needed. Anyone holding
 * the bond owner wallet sends the steps from the Fleet page instead.
 */
export const MyNode = () => <OfflineNode />;
