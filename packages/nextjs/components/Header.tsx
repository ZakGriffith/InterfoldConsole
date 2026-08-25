"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount } from "wagmi";
import { ConnectPill } from "~~/components/interfold/ConnectPill";
import { LINKS } from "~~/utils/interfold/contracts";

type HeaderMenuLink = { label: string; href: string; external?: boolean; connectedLabel?: string };

/** The first tab is "Home" (landing + network stats) until a wallet connects, then "My Nodes" (the fleet). */
export const menuLinks: HeaderMenuLink[] = [
  { label: "Home", connectedLabel: "My Nodes", href: "/" },
  { label: "Your node", href: "/my-node" },
  { label: "Contracts", href: "/debug" },
  { label: "Docs", href: LINKS.docs, external: true },
];

export const Wordmark = () => (
  <span className="if-wordmark">
    <span className="if-wordmark__name">Ciphernode Console</span>
    <span className="if-wordmark__sub">by BuidlGuidl</span>
  </span>
);

/** Site header in the dashboard.theinterfold.com style: wordmark, pill nav, wallet control. */
export const Header = () => {
  const pathname = usePathname();
  const { isConnected } = useAccount();
  return (
    <header className="if-head">
      <div className="if-head__inner">
        <Link href="/" aria-label="Ciphernode Console home">
          <Wordmark />
        </Link>
        <nav className="if-nav" aria-label="Primary">
          {menuLinks
            .map(l => ({ ...l, label: isConnected && l.connectedLabel ? l.connectedLabel : l.label }))
            .map(({ label, href, external }) =>
              external ? (
                <a key={href} className="if-nav__link" href={href} target="_blank" rel="noreferrer">
                  {label} ↗
                </a>
              ) : (
                <Link key={href} href={href} className={`if-nav__link ${pathname === href ? "if-nav__link--on" : ""}`}>
                  {label}
                </Link>
              ),
            )}
        </nav>
        <div className="if-head__cta">
          <ConnectPill />
        </div>
      </div>
    </header>
  );
};
