import type { NextPage } from "next";
import { MyNode } from "~~/components/interfold/MyNode";
import { getMetadata } from "~~/utils/scaffold-eth/getMetadata";

export const metadata = getMetadata({
  title: "Connect your node",
  description: "Safe signers: connect your own Interfold ciphernode with the Safe as its bond owner",
});

const MyNodePage: NextPage = () => {
  return <MyNode />;
};

export default MyNodePage;
