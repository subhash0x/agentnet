import { NextResponse } from "next/server";
import { getMongoDb, type DbAgent } from "@/lib/mongo";

export const runtime = "nodejs";

const AGENTS: DbAgent[] = [
  { id: "orchestrator", name: "Orchestrator", purpose: "route tasks to specialists and ensure end-to-end completion", context: "Coordinates agent-to-agent workflows. Decides which specialist to invoke based on query. Tracks progress and retries failures." },
  { id: "kyc-aml", name: "KYC/AML", purpose: "verify parties and screen sanctions", context: "Collects minimal PII, checks sanctions and watchlists, and returns pass/fail with reasons. Does not store PII beyond session." },
  { id: "rate-oracle", name: "Rate Oracle", purpose: "fetch crypto/fiat prices and FX rates", context: "Aggregates prices from multiple public APIs (CoinGecko, CoinPaprika, forex) and returns median with 24h change." },
  { id: "route-planner", name: "Route Planner", purpose: "choose optimal chain/bridge/DEX path", context: "Given asset in/out and constraints (fee, speed, trust), suggests route candidates with rationale." },
  { id: "bridge-executor", name: "Bridge Executor", purpose: "bridge assets cross-chain", context: "Calls preferred bridges based on planner output. Confirms receipt via destination chain RPC." },
  { id: "swap-executor", name: "Swap Executor", purpose: "perform on-chain swaps with slippage limits", context: "Chooses DEX/aggregator, constructs transaction with slippage and deadline. Reports tx hash and fills." },
  { id: "fee-relayer", name: "Fee Relayer", purpose: "sponsor or optimize gas fees", context: "Estimates gas across chains, optionally sponsors via paymaster/relayer. Minimizes total fees while meeting latency." },
  { id: "risk-scanner", name: "Risk Scanner", purpose: "check counterparties/contracts for risk flags", context: "Scores addresses and contracts (age, deployer reputation, known exploits) and recommends proceed/hold." },
  { id: "compliance-logger", name: "Compliance Logger", purpose: "record audit trail and travel rule data", context: "Produces structured logs for transfers and retains minimal metadata for audit requirements." },
  { id: "notifier", name: "Notifier", purpose: "send real-time status and receipts", context: "Delivers push/email/webhook updates with transaction links and final receipt JSON." },
  { id: "web-search", name: "Web Search", purpose: "search web and give information", context: "Fetches latest info, headlines, docs; summarizes findings. Good for market/news queries." },
  { id: "tax-tracker", name: "Tax Tracker", purpose: "track cost basis and realized PnL", context: "Maintains per-asset lots, computes capital gains events and exports CSV/JSON for accounting." },
  { id: "guardian", name: "Guardian", purpose: "default agent to solve generic requests end-to-end", context: "Fallback agent. If no specialist matches, attempt to answer directly or route to web-search and synthesizer." },
];

export async function POST() {
  try {
    const db = await getMongoDb();
    // wipe existing
    await db.collection("agents").deleteMany({});
    const now = new Date();
    await db.collection<DbAgent>("agents").insertMany(
      AGENTS.map((a) => ({ ...a, createdAt: now, updatedAt: now }))
    );
    // Persist a default collaborative graph wiring
    const graphAgents = AGENTS.map((a) => ({ id: a.id, name: a.name, purpose: a.purpose }));
    const edges = [
      { source: "guardian", target: "orchestrator", label: "route" },
      { source: "guardian", target: "web-search", label: "info" },
      { source: "web-search", target: "orchestrator", label: "facts" },
      { source: "orchestrator", target: "kyc-aml", label: "verify" },
      { source: "orchestrator", target: "risk-scanner", label: "risk" },
      { source: "orchestrator", target: "route-planner", label: "plan" },
      { source: "rate-oracle", target: "route-planner", label: "rates" },
      { source: "route-planner", target: "bridge-executor", label: "bridge" },
      { source: "route-planner", target: "swap-executor", label: "swap" },
      { source: "fee-relayer", target: "swap-executor", label: "gas" },
      { source: "fee-relayer", target: "bridge-executor", label: "gas" },
      { source: "swap-executor", target: "compliance-logger", label: "tx" },
      { source: "bridge-executor", target: "compliance-logger", label: "bridge-tx" },
      { source: "swap-executor", target: "notifier", label: "settled" },
      { source: "bridge-executor", target: "notifier", label: "bridged" },
      { source: "compliance-logger", target: "notifier", label: "receipt" },
      { source: "swap-executor", target: "tax-tracker", label: "lots" },
      { source: "bridge-executor", target: "tax-tracker", label: "lots" },
    ];
    await db.collection("graphs").updateOne(
      { id: "default" },
      { $set: { agents: graphAgents, edges, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true, count: AGENTS.length }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}


