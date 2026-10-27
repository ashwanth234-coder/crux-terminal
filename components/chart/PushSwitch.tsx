"use client";

import { useState } from "react";
import { useCruxAccount } from "@/hooks/useCruxAccount";
import { enablePush, pushOn, pushSupported } from "@/lib/alertSync";

/**
 * Where an alert says how it reaches you: with Crux closed (web push, once turned on for this device while logged in),
 * or only while a Crux tab is open.
 */
export function PushSwitch() {
  const crux = useCruxAccount();
  const [on, setOn] = useState(pushOn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Registers this device with the relay (again, if it already was); the relay answers with a test notification.
  const register = async () => {
    setBusy(true);
    setError(null);
    try {
      await enablePush(crux.sign!, crux.owner!);
      setOn(true);
    } catch (e) {
      setError((e as Error).message.split("\n")[0]);
    } finally {
      setBusy(false);
    }
  };

  if (on) {
    return (
      <div className="text-[10.5px] leading-snug text-up">
        ✓ Alerts reach this device even with Crux closed.{" "}
        {crux.sign && crux.owner && (
          // The browser remembers "on"; this re-registers with the relay in case it lost the device, and proves it.
          <button type="button" disabled={busy} onClick={() => void register()} className="text-chrome underline decoration-line-2 disabled:opacity-50">
            {busy ? "Sending…" : "Send a test"}
          </button>
        )}
        {error && <p className="mt-1 text-down">{error}</p>}
      </div>
    );
  }
  if (!crux.loggedIn || !crux.sign || !crux.owner) {
    return (
      <p className="text-[10.5px] leading-snug text-dim">
        Fires while a Crux tab is open.{" "}
        <button type="button" onClick={crux.login} className="text-chrome underline decoration-line-2">
          Log in
        </button>{" "}
        to get alerts with Crux closed.
      </p>
    );
  }
  return (
    <div className="text-[10.5px] leading-snug text-dim">
      Fires while a Crux tab is open.{" "}
      <button
        type="button"
        disabled={busy || !pushSupported()}
        onClick={() => void register()}
        className="text-signal underline decoration-signal/40 disabled:opacity-50"
      >
        {busy ? "Turning on…" : "Get them with Crux closed"}
      </button>
      {!pushSupported() && <span> (this browser can&apos;t: on iPhone, add Crux to your home screen first)</span>}
      {error && <p className="mt-1 text-down">{error}</p>}
    </div>
  );
}
