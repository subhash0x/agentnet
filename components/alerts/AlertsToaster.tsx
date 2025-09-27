"use client";

import React from "react";

type Fired = {
  id: string;
  action: string;
  seq?: number;
  topicId?: string;
  at: number;
};

export default function AlertsToaster() {
  const [items, setItems] = React.useState<Fired[]>([]);
  const timerRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    let isMounted = true;
    async function tick() {
      try {
        const r = await fetch("/api/alerts", { cache: "no-store" });
        const j = (await r.json()) as { alerts?: Array<{ id: string; messageSequence?: number; topicId?: string; updatedAt?: string; lastNotifiedAt?: string; action?: string }> };
        const fired = (j.alerts || []).filter((a) => typeof a.messageSequence === "number" && a.messageSequence! > 0);
        if (isMounted && fired.length) {
          // compute base only for href later; no need to keep a variable to satisfy linter
          setItems((prev) => {
            const seen = new Set(prev.map((p) => p.id + ":" + p.seq));
            const add: Fired[] = [];
            for (const a of fired) {
              const key = a.id + ":" + a.messageSequence;
              if (!seen.has(key)) {
                add.push({ id: a.id, action: a.action || "notify", seq: a.messageSequence, topicId: a.topicId, at: Date.now() });
              }
            }
            return add.length ? [...prev, ...add].slice(-5) : prev;
          });
        }
      } catch {}
    }
    tick();
    timerRef.current = window.setInterval(tick, 1000);
    return () => {
      isMounted = false;
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, []);

  if (!items.length) return null;

  const net = (process.env.NEXT_PUBLIC_HEDERA_NETWORK || process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const base = net === "mainnet" ? "https://hashscan.io/mainnet/topic/" : net === "previewnet" ? "https://hashscan.io/previewnet/topic/" : "https://hashscan.io/testnet/topic/";

  return (
    <div className="fixed right-3 bottom-3 z-50 flex flex-col gap-2">
      {items.map((f) => (
        <a
          key={f.id + String(f.seq)}
          href={f.topicId ? `${base}${f.topicId}` : undefined}
          target="_blank"
          rel="noreferrer"
          className="max-w-sm bg-[#11132a] text-white border border-white/15 px-3 py-2 rounded shadow hover:bg-[#15183a] transition-colors"
        >
          <div className="text-xs opacity-70">Alert</div>
          <div className="text-sm font-semibold capitalize">{f.action === "notify" ? "Price alert fired" : `Order signal: ${f.action}`}</div>
          <div className="text-xs opacity-75">{f.seq ? `Seq #${f.seq}` : null}{f.topicId ? ` · ${f.topicId}` : null}</div>
        </a>
      ))}
    </div>
  );
}


