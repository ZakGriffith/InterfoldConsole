import type { NextPage } from "next";
import { E3Ledger } from "~~/components/interfold/E3Ledger";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "E3s",
  description: "Every encrypted computation (E3) Interfold ran on mainnet: committee, outcome, timing and payment",
});

const E3sPage: NextPage = () => {
  return <E3Ledger />;
};

export default E3sPage;
