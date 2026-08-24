"use client";

import { type ReactNode, useState } from "react";
import { explorerAddress, explorerTx } from "~~/utils/interfold/contracts";
import { shortAddr, shortHash } from "~~/utils/interfold/format";

export type StepState = "done" | "active" | "todo";

/** Numbered wizard card (mirrors the dashboard's `opstep`). */
export const Step = ({
  num,
  title,
  lede,
  state,
  children,
}: {
  num: number;
  title: ReactNode;
  lede: ReactNode;
  state: StepState;
  children?: ReactNode;
}) => (
  <section className={`if-step if-step--${state}`} aria-current={state === "active" ? "step" : undefined}>
    <div className="if-step__rail">
      <span className="if-step__num">{state === "done" ? "✓" : num}</span>
    </div>
    <div className="if-step__body">
      <header className="if-step__head">
        <h3 className="if-step__title">{title}</h3>
        <span className={`if-step__badge if-step__badge--${state}`}>
          {state === "done" ? "Complete" : state === "active" ? "Next" : "Pending"}
        </span>
      </header>
      <p className="if-step__lede">{lede}</p>
      <div className="if-step__content">{children}</div>
    </div>
  </section>
);

export const Field = ({
  label,
  hint,
  value,
  onChange,
  placeholder,
  invalid,
  suffix,
  mono = true,
  disabled,
}: {
  label: ReactNode;
  hint?: ReactNode;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
  suffix?: ReactNode;
  mono?: boolean;
  disabled?: boolean;
}) => (
  <label className="if-field">
    <span className="if-field__label">{label}</span>
    <span className="if-field__control">
      <input
        className={`if-field__input ${mono ? "if-mono" : ""} ${invalid ? "if-field__input--bad" : ""}`}
        value={value}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
        onChange={e => onChange(e.target.value)}
      />
      {suffix}
    </span>
    {hint && <span className="if-field__hint">{hint}</span>}
  </label>
);

export const Note = ({ kind = "info", children }: { kind?: "info" | "warn" | "bad" | "good"; children: ReactNode }) => (
  <div className={`if-note if-note--${kind}`}>
    <span className="if-note__dot" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

export const AddressLink = ({ address, full }: { address: string; full?: boolean }) => (
  <a className="if-hash" href={explorerAddress(address)} target="_blank" rel="noreferrer" title={address}>
    <span className="if-mono">{full ? address : shortAddr(address)}</span>
    <span className="if-hash__icon" aria-hidden="true">
      ↗
    </span>
  </a>
);

export const TxLink = ({ hash, href }: { hash: string; href?: string }) => (
  <a className="if-hash" href={href ?? explorerTx(hash)} target="_blank" rel="noreferrer" title={hash}>
    <span className="if-mono">{shortHash(hash)}</span>
    <span className="if-hash__icon" aria-hidden="true">
      ↗
    </span>
  </a>
);

export type BadgeKind = "working" | "open" | "published" | "muted" | "warn" | "bad";

export const Badge = ({ kind, children }: { kind: BadgeKind; children: ReactNode }) => (
  <span className={`if-badge if-badge--${kind}`}>
    <span className="if-badge__dot" />
    <span>{children}</span>
  </span>
);

export const Dl = ({ items }: { items: Array<[ReactNode, ReactNode]> }) => (
  <dl className="if-dl">
    {items.map(([k, v], i) => (
      <div key={i} style={{ display: "contents" }}>
        <dt>{k}</dt>
        <dd>{v}</dd>
      </div>
    ))}
  </dl>
);

export const Stat = ({
  label,
  value,
  of,
  sub,
  mono = true,
  title,
}: {
  label: ReactNode;
  value: ReactNode;
  of?: ReactNode;
  sub?: ReactNode;
  mono?: boolean;
  title?: string;
}) => (
  <div className="if-stat" title={title}>
    <div className="if-stat__label">{label}</div>
    <div className={`if-stat__value ${mono ? "if-mono" : ""}`}>
      {value}
      {of && <span className="if-stat__of">{of}</span>}
    </div>
    {sub && <div className="if-stat__sub">{sub}</div>}
  </div>
);

export const Loader = ({ label, sub }: { label: string; sub?: string }) => (
  <div className="if-loader" role="status" aria-live="polite">
    <span className="if-loader__ring" aria-hidden="true" />
    <div>
      <div className="if-loader__label">{label}</div>
      {sub && <div className="if-loader__sub if-mono">{sub}</div>}
    </div>
  </div>
);

export const Empty = ({ children }: { children: ReactNode }) => (
  <div className="if-empty">
    <span className="if-empty__dot" aria-hidden="true" />
    <span>{children}</span>
  </div>
);

export const CopyButton = ({
  text,
  label = "Copy",
  className = "",
}: {
  text: string;
  label?: string;
  className?: string;
}) => {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={`if-btn if-btn--ghost if-btn--xs ${className}`}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          /* clipboard blocked: the text is visible on screen anyway */
        }
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
};

export const Disclosure = ({
  title,
  danger,
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  danger?: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`if-disclosure ${danger ? "if-disclosure--danger" : ""}`}>
      <button type="button" className="if-disclosure__toggle" onClick={() => setOpen(o => !o)} aria-expanded={open}>
        <span>{title}</span>
        <span className={`if-disclosure__chev ${open ? "if-disclosure__chev--open" : ""}`}>▼</span>
      </button>
      {open && <div className="if-disclosure__body">{children}</div>}
    </div>
  );
};

/** A shell command on its own line with the copy control beside it (never inline in prose). */
export const CommandBlock = ({ command, label = "Copy" }: { command: string; label?: string }) => (
  <div className="if-cmd">
    <span className="if-cmd__prompt" aria-hidden="true">
      $
    </span>
    <code className="if-cmd__code">{command}</code>
    <CopyButton text={command} label={label} />
  </div>
);
