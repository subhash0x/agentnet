import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PriceResp = { priceUsd: number; source: string; ts: number };

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = (searchParams.get("symbol") || "HBAR/USD").toUpperCase();
    let feedId = process.env.PYTH_PRICE_ID_HBAR_USD || "3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd"; // HBAR/USD
    if (!feedId) {
      // Fallback: discover by symbol via Hermes v2
      const endpoint = process.env.PYTH_HERMES_URL || "https://hermes.pyth.network";
      const listUrl = `${endpoint.replace(/\/$/, "")}/v2/price_feeds?query=${encodeURIComponent(symbol)}`;
      const lr = await fetch(listUrl, { cache: "no-store" });
      const feeds = (await lr.json()) as Array<{ id?: string; attributes?: { base?: string; quote?: string; symbol?: string } }>;
      const found = Array.isArray(feeds)
        ? feeds.find((f) => {
            const s = String(f?.attributes?.symbol || "").toUpperCase();
            const base = String(f?.attributes?.base || "").toUpperCase();
            const quote = String(f?.attributes?.quote || "").toUpperCase();
            return s.includes("HBAR") && (s.includes("USD") || quote === "USD" || symbol.includes("USD")) && (base === "HBAR" || s.includes("HBAR"));
          })
        : undefined;
      feedId = found?.id || "";
      if (!feedId) {
        return NextResponse.json({ priceUsd: 0, source: "pyth", ts: Date.now(), error: "Feed not found" }, { status: 200 });
      }
    }
    const endpoint = process.env.PYTH_HERMES_URL || "https://hermes.pyth.network";
    const urlV2 = `${endpoint.replace(/\/$/, "")}/v2/updates/price/latest?ids[]=${encodeURIComponent(feedId)}&parsed=true`;
    const r = await fetch(urlV2, { cache: "no-store" });
    if (!r.ok) {
      const txt = await r.text();
      return NextResponse.json({ priceUsd: 0, source: "pyth", ts: Date.now(), error: `hermes_${r.status}: ${txt.slice(0, 200)}` } as PriceResp & { error: string }, { status: 200 });
    }
    const j = (await r.json()) as { parsed?: Array<{ price?: { price?: number | string; expo?: number } }> };
    const raw = Array.isArray(j?.parsed) ? j.parsed[0] : undefined;
    const p = Number(raw?.price?.price ?? 0);
    const e = Number(raw?.price?.expo ?? 0);
    const priceUsd = Number.isFinite(p) && Number.isFinite(e) ? p * Math.pow(10, e) : 0;
    return NextResponse.json({ priceUsd, source: "pyth", ts: Date.now() } satisfies PriceResp, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ priceUsd: 0, source: "pyth", ts: Date.now(), error: message } as PriceResp & { error: string }, { status: 200 });
  }
}


