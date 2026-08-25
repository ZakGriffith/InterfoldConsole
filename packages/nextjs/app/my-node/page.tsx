import type { NextPage } from "next";
import { MyNode } from "~~/components/interfold/MyNode";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Connect your node",
  description:
    "Node operators: connect your own Interfold ciphernode and set up its bond owner (your wallet or a Safe)",
});

const MyNodePage: NextPage = () => {
  return <MyNode />;
};

export default MyNodePage;
