import type { NextPage } from "next";
import { OperatorConsole } from "~~/components/interfold/OperatorConsole";

/** Canonical route from the interfold-operator-ui skill; the same console also lives at `/`. */
const Operators: NextPage = () => {
  return <OperatorConsole />;
};

export default Operators;
