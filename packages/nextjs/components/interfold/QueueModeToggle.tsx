"use client";

import { useConsole } from "~~/hooks/interfold/ConsoleContext";

/** Queue mode switch: propose steps back-to-back; gates and reverting simulations become warnings. */
export const QueueModeToggle = () => {
  const { queueMode, setQueueMode } = useConsole();
  return (
    <label className={`if-toggle ${queueMode ? "if-toggle--on" : ""}`}>
      <input type="checkbox" checked={queueMode} onChange={e => setQueueMode(e.target.checked)} />
      <span className="if-toggle__body">
        <span className="if-toggle__title">Queue mode {queueMode ? "on" : "off"}</span>
        <span className="if-toggle__sub">
          Keep every step available so you can propose approve, bond, register and tickets one after another without
          waiting for each to execute. Steps whose prerequisite is still queued show a warning instead of locking, and
          the Safe executes the queue in order. On by default. Off: each step waits for the previous one to execute
          on-chain.
        </span>
      </span>
    </label>
  );
};
