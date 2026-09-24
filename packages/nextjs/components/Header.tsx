"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectPill } from "~~/components/interfold/ConnectPill";
import { LINKS } from "~~/utils/interfold/contracts";

type HeaderMenuLink = { label: string; href: string; external?: boolean };

/** Two audiences: Fleet is for the wallet that funds nodes (usually a Safe), Set up a node for whoever runs one. */
export const menuLinks: HeaderMenuLink[] = [
  { label: "Fleet", href: "/" },
  { label: "Set up a node", href: "/my-node" },
  { label: "Contracts", href: "/debug" },
  { label: "Docs", href: LINKS.docs, external: true },
];

export const Wordmark = () => (
  <span className="if-wordmark">
    <Link href="/" className="if-wordmark__name" aria-label="Ciphernode Console home">
      Ciphernode Console
    </Link>
    <a className="if-wordmark__sub" href="https://buidlguidl.com" target="_blank" rel="noreferrer">
      by BuidlGuidl
    </a>
  </span>
);

/** Site header in the dashboard.theinterfold.com style: wordmark, pill nav, wallet control. */
export const Header = () => {
  const pathname = usePathname();
  return (
    <header className="if-head">
      <div className="if-head__inner">
        <Wordmark />
        <nav className="if-nav" aria-label="Primary">
          {menuLinks.map(({ label, href, external }) =>
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
