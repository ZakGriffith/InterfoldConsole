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
          Propose steps back-to-back without waiting for each to execute; the Safe runs its queue in order.
        </span>
      </span>
    </label>
  );
};
