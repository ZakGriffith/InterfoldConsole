"use client";

import { Wordmark } from "~~/components/Header";
import { LINKS, REGISTRY, explorerAddress } from "~~/utils/interfold/contracts";

/** Dark footer in the dashboard.theinterfold.com style. */
export const Footer = () => (
  <footer className="if-foot">
    <div className="if-foot__inner">
      <div>
        <Wordmark />
        <p className="if-foot__tag">
          An independent BuidlGuidl tool for running Interfold ciphernodes funded from a Gnosis Safe: bond, register,
          buy tickets, monitor and exit. Built on Scaffold-ETH 2. Not affiliated with or endorsed by the Interfold team.
        </p>
      </div>
      <div className="if-foot__cols">
        <div>
          <div className="if-foot__col-head">Learn</div>
          <a href={LINKS.docs} target="_blank" rel="noreferrer">
            Ciphernode operators
          </a>
          <a href={`${LINKS.docs}/tickets-and-sortition`} target="_blank" rel="noreferrer">
            Tickets &amp; sortition
          </a>
          <a href={`${LINKS.docs}/exits-and-slashing`} target="_blank" rel="noreferrer">
            Exits &amp; slashing
          </a>
        </div>
        <div>
          <div className="if-foot__col-head">Interfold</div>
          <a href={LINKS.dashboard} target="_blank" rel="noreferrer">
            Official dashboard
          </a>
          <a href={LINKS.repo} target="_blank" rel="noreferrer">
            Node source
          </a>
          <a href={LINKS.site} target="_blank" rel="noreferrer">
            Website
          </a>
        </div>
        <div>
          <div className="if-foot__col-head">This console</div>
          <a href="https://github.com/scaffold-eth/scaffold-eth-2" target="_blank" rel="noreferrer">
            Scaffold-ETH 2
          </a>
          <a href="https://app.safe.global" target="_blank" rel="noreferrer">
            Safe{"{Wallet}"}
          </a>
          <a href="https://buidlguidl.com" target="_blank" rel="noreferrer">
            BuidlGuidl
          </a>
        </div>
      </div>
    </div>
    <div className="if-foot__rule">
      <span>© 2026 BuidlGuidl · Built in the open</span>
      <a className="if-mono" href={explorerAddress(REGISTRY.address)} target="_blank" rel="noreferrer">
        BondingRegistry on Ethereum ↗
      </a>
    </div>
  </footer>
);
