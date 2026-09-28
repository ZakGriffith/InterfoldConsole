import type { NextPage } from "next";
import { WatchFleet } from "~~/components/interfold/WatchFleet";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Watch",
  description: "Paste bond owner wallets and see every Interfold ciphernode they fund, no wallet connection needed",
});

const WatchPage: NextPage = () => {
  return <WatchFleet />;
};

export default WatchPage;
