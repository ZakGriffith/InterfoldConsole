"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ConnectPill } from "~~/components/interfold/ConnectPill";
import { LINKS } from "~~/utils/interfold/contracts";

type HeaderMenuLink = { label: string; href: string; external?: boolean };

export const menuLinks: HeaderMenuLink[] = [
  { label: "Run a ciphernode", href: "/" },
  { label: "Debug contracts", href: "/debug" },
  { label: "Docs", href: LINKS.docs, external: true },
];

export const Wordmark = () => (
  <span className="if-wordmark">
    <span className="if-wordmark__name">Interfold</span>
    <span className="if-wordmark__sub">Operator console</span>
  </span>
);

/** Site header in the dashboard.theinterfold.com style: wordmark, pill nav, wallet control. */
export const Header = () => {
  const pathname = usePathname();
  return (
    <header className="if-head">
      <div className="if-head__inner">
        <Link href="/" aria-label="Interfold operator console home">
          <Wordmark />
        </Link>
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
