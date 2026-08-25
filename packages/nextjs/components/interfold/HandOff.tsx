"use client";

import { useState } from "react";
import { CopyButton, Disclosure, Note } from "./ui";
import { type Address } from "viem";
import { type OwnerFunds } from "~~/hooks/interfold/useOwnerFunds";
import { safeTxBuilder } from "~~/utils/interfold/contracts";
import { fmtTokens, shortAddr } from "~~/utils/interfold/format";

type Props = {
  json: string;
  fileName: string;
  callCount: number;
  owner?: Address;
  funds?: OwnerFunds;
  totalFold: bigint;
  totalSusds: bigint;
};

/**
 * Transaction Builder hand-off: download / copy / preview the batch file, with the import steps
 * tucked away and a shortfall warning that fires when someone acts while the owner cannot cover it.
 */
export const HandOff = ({ json, fileName, callCount, owner, funds, totalFold, totalSusds }: Props) => {
  const [showJson, setShowJson] = useState(false);
  const [actedWhileShort, setActedWhileShort] = useState<string>();

  const shortFold = funds && totalFold > funds.foldBalance ? totalFold - funds.foldBalance : 0n;
  const shortSusds = funds && totalSusds > funds.susdsBalance ? totalSusds - funds.susdsBalance : 0n;
  const isShort = shortFold > 0n || shortSusds > 0n;
  const shortText = [
    shortFold > 0n ? `${fmtTokens(shortFold, "FOLD")} more FOLD` : "",
    shortSusds > 0n ? `${fmtTokens(shortSusds, "sUSDS")} more sUSDS` : "",
  ]
    .filter(Boolean)
    .join(" and ");
  const noteShort = (action: string) => {
    if (isShort) setActedWhileShort(action);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
    noteShort("Downloaded");
  };

  return (
    <div className="if-handoff">
      <div className="if-handoff__row">
        <div className="if-handoff__text">
          <b>Safe Transaction Builder file.</b> Any signer of the Safe can import it to create this exact bundle as one
          transaction. Exporting sends nothing.
        </div>
        <div className="if-actions">
          <button type="button" className="if-btn if-btn--primary" disabled={!json} onClick={download}>
            Download batch file
          </button>
          <CopyButton text={json} label="Copy JSON" className="if-btn--sm" onCopy={() => noteShort("Copied")} />
          <button
            type="button"
            className="if-btn if-btn--ghost if-btn--sm"
            disabled={!json}
            onClick={() => setShowJson(v => !v)}
          >
            {showJson ? "Hide JSON" : "Show JSON"}
          </button>
        </div>
      </div>
      {isShort && (
        <Note kind={actedWhileShort ? "bad" : "warn"}>
          {actedWhileShort ? `${actedWhileShort}, but heads up: ` : "Heads up: "}
          the bond owner {shortAddr(owner)} needs {shortText} for this bundle to execute. It can be imported and signed
          now, but it reverts as a whole unless the Safe is funded first.
        </Note>
      )}
      {!owner && (
        <Note kind="warn">
          No bond owner is known for this node yet, so the file is not tied to a Safe (the importing Safe is fine). The
          node must run <code>set-bond-owner</code> naming that Safe before the bundle executes.
        </Note>
      )}
      {showJson && (
        <pre className="if-json" aria-label="Transaction Builder JSON">
          {json}
        </pre>
      )}
      <Disclosure title="How to import it in Safe">
        <ol className="if-export__steps" style={{ padding: "14px 0 6px 22px" }}>
          <li>
            Send <code>{fileName}</code> to a signer of the Safe{owner ? ` (${shortAddr(owner)})` : ""}.
          </li>
          <li>
            In Safe{"{Wallet}"}: <b>Apps → Transaction Builder</b>
            {owner && (
              <>
                {" "}
                <a className="if-link" href={safeTxBuilder(owner)} target="_blank" rel="noreferrer">
                  (open for this Safe)
                </a>
              </>
            )}
            .
          </li>
          <li>
            Drop the file on <b>Upload a batch</b>. It validates the checksum and lists the {callCount} calls with
            decoded arguments; compare them with the table above.
          </li>
          <li>
            <b>Create Batch</b>, then <b>Send Batch</b>, then sign. It lands in the Safe queue for the other signers.
          </li>
        </ol>
      </Disclosure>
    </div>
  );
};
