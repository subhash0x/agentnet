import { NextResponse } from "next/server";

export const runtime = "nodejs";

type PriceResp = { priceUsd: number; source: string; ts: number };

export async function GET() {
  try {
    // CoinGecko simple price endpoint
    const url = "https://api.coingecko.com/api/v3/simple/price?ids=hedera-hashgraph&vs_currencies=usd";
    const r = await fetch(url, { cache: "no-store" });
    const j = (await r.json()) as { [k: string]: { usd?: number } };
    const price = Number(j?.["hedera-hashgraph"]?.usd || 0);
    const body: PriceResp = { priceUsd: price, source: "coingecko", ts: Date.now() };
    return NextResponse.json(body, { status: 200 });
  } catch {
    return NextResponse.json({ priceUsd: 0, source: "coingecko", ts: Date.now() } as PriceResp, { status: 200 });
  }
}


