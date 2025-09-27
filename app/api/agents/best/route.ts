import { NextResponse } from "next/server";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";

  // Stub: rank a few sample agents by a simple relevance random score
  const catalog = [
    { id: "fx-router", name: "FX Router" },
    { id: "onchain-swap", name: "Onchain Swap" },
    { id: "kyc-l2", name: "KYC Verifier" },
    { id: "invoice-settle", name: "Invoice Settler" },
    { id: "notify", name: "Notifier" },
    { id: "risk", name: "Risk Scorer" },
  ];

  const agents = catalog
    .map((a) => ({ ...a, score: Math.random() * (q ? 1 : 0.7) + (q ? 0.4 : 0.1) }))
    .sort((a, b) => b.score - a.score);

  return NextResponse.json({ agents });
}


