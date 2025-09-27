import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getMongoDb, type DbAgent, type DbAlert } from "@/lib/mongo";
import { Client, PrivateKey, TopicMessageSubmitTransaction } from "@hashgraph/sdk";

export const runtime = "nodejs";

type Meta = { owner?: string; hederaAccountId?: string } | undefined;

async function getBaselinePriceUsd(): Promise<number> {
  try {
    const endpoint = process.env.PYTH_HERMES_URL || "https://hermes.pyth.network";
    const feedId = process.env.PYTH_PRICE_ID_HBAR_USD || "3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd";
    const url = `${endpoint.replace(/\/$/, "")}/v2/updates/price/latest?ids[]=${encodeURIComponent(feedId)}&parsed=true`;
    const r = await fetch(url, { cache: "no-store" });
    const j = (await r.json()) as { parsed?: Array<{ price?: { price?: number | string; expo?: number } }> };
    const raw = Array.isArray(j?.parsed) ? j.parsed[0] : undefined;
    const p = Number(raw?.price?.price ?? 0);
    const e = Number(raw?.price?.expo ?? 0);
    return Number.isFinite(p) && Number.isFinite(e) ? p * Math.pow(10, e) : 0;
  } catch {
    return 0;
  }
}

function isPriceQuestion(text: string): boolean {
  const t = text.toLowerCase();
  return /(hbar|hedera)/.test(t) && /(price|rate|value|quote)/.test(t);
}

function parseOperatorKey(raw: string): PrivateKey {
  const s = String(raw || "").trim();
  if (!s) throw new Error("Missing HEDERA_OPERATOR_KEY");
  try { return PrivateKey.fromStringDer(s); } catch {}
  try { return PrivateKey.fromStringED25519(s); } catch {}
  try { return PrivateKey.fromStringECDSA(s); } catch {}
  if (s.startsWith("0x")) {
    const nox = s.slice(2);
    try { return PrivateKey.fromStringDer(nox); } catch {}
    try { return PrivateKey.fromStringED25519(nox); } catch {}
    try { return PrivateKey.fromStringECDSA(nox); } catch {}
  }
  return PrivateKey.fromString(s);
}

function getHederaClient(): Client {
  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) throw new Error("Missing operator credentials");
  let client: Client;
  if (network === "mainnet") client = Client.forMainnet();
  else if (network === "previewnet") client = Client.forPreviewnet();
  else client = Client.forTestnet();
  client.setOperator(operatorId, parseOperatorKey(operatorKey));
  return client;
}

async function tryImmediateTradeFromText(text: string, meta: Meta): Promise<{ done?: boolean; message?: string; txId?: string }> {
  const t = String(text || "").toLowerCase();
  const m = t.match(/\b(buy|sell)\b[\s:]*([\$]?\s*\d+(?:\.\d+)?(?:\s*[\$usd]+)?|\d+(?:\.\d+)?\s*hbar)/i);
  if (!m) return {};
  const action = m[1].toLowerCase() as "buy" | "sell";
  const amtRaw = m[2].replace(/\s+/g, "");
  const unit: "usd" | "hbar" = /hbar$/i.test(amtRaw) ? "hbar" : /\$|usd$/i.test(amtRaw) ? "usd" : "hbar";
  const amountStr = amtRaw.replace(/hbar|\$|usd/gi, "");
  const amount = Number(amountStr);
  if (!Number.isFinite(amount) || amount <= 0) return {};

  // Publish to HCS topic immediately
  const topicId = action === "sell" ? process.env.HEDERA_SIGNAL_TOPIC_SELL : process.env.HEDERA_SIGNAL_TOPIC_BUY;
  if (!topicId) return {};
  const client = getHederaClient();
  const payload = {
    kind: "trade_signal",
    action,
    amount,
    unit,
    owner: meta?.owner || null,
    hederaAccountId: meta?.hederaAccountId || null,
    ts: new Date().toISOString(),
    note: "immediate_request",
  };
  const submit = await new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(JSON.stringify(payload)).execute(client);
  const txId = submit.transactionId?.toString();
  const net = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const hashscanBase = net === "mainnet" ? "https://hashscan.io/mainnet/transaction/" : net === "previewnet" ? "https://hashscan.io/previewnet/transaction/" : "https://hashscan.io/testnet/transaction/";
  const link = txId ? `${hashscanBase}${encodeURIComponent(txId)}` : "";
  const linkPart = link ? ` (${link})` : "";
  return { done: true, message: `Recorded ${action} ${amount} ${unit.toUpperCase()} request. Tx: ${txId || "(pending)"}${linkPart}.`, txId };
}

async function tryCreateAlertFromText(text: string, meta: Meta): Promise<{ created?: boolean; message?: string; alertId?: string }> {
  const t = String(text || "").toLowerCase();
  if (!/\bhbar\b|\bhedera\b/.test(t)) return {};

  // Extract percent either before or after direction words
  const pctMatch = t.match(/(\d+(?:\.\d+)?)\s*%/);
  const dirMatch = t.match(/\b(up|down|drop|drops|rise|rises|increase|increases|decrease|decreases|fall|falls)\b/);
  if (!pctMatch || !dirMatch) return {};
  const pct = Number(pctMatch[1]);
  if (!Number.isFinite(pct) || pct <= 0) return {};
  const dir = dirMatch[1];

  // Determine action and amount if present
  const buyAmtMatch = t.match(/\bbuy\b\s*(\d+(?:\.\d+)?)\s*hbar/);
  const sellAmtMatch = t.match(/\bsell\b\s*(\d+(?:\.\d+)?)\s*hbar/);
  const action: DbAlert["action"] = sellAmtMatch ? "sell" : buyAmtMatch ? "buy" : /\bnotify\b|\balert\b|\btell\s*me\b/.test(t) ? "notify" : (/(buy|sell)/.test(t) ? (t.includes("sell") ? "sell" : "buy") : "notify");
  const hbarAmount = action === "notify" ? 0 : Number((buyAmtMatch?.[1] || sellAmtMatch?.[1] || 1));
  if (action !== "notify" && (!Number.isFinite(hbarAmount) || hbarAmount <= 0)) return {};

  const downWords = ["down", "drop", "drops", "decrease", "decreases", "fall", "falls"];
  const triggerType: DbAlert["triggerType"] = downWords.includes(dir) ? "percent_drop" : "percent_rise";

  const hederaAccountId = meta?.hederaAccountId || "";
  const owner = meta?.owner;
  const toAccountId = process.env.HEDERA_TRADE_SINK_ACCOUNT_ID || process.env.HEDERA_OPERATOR_ID || "";
  if (!hederaAccountId) return {};

  const db = await getMongoDb();
  const now = new Date();
  const baselinePrice = await getBaselinePriceUsd();
  const alert: DbAlert = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    owner,
    hederaAccountId,
    toAccountId: toAccountId || undefined,
    hbarAmount: action === "notify" ? 0 : hbarAmount,
    action,
    triggerType,
    triggerValue: pct,
    baselinePrice: baselinePrice || 0,
    cooldownSec: 3600,
    status: "active",
    createdAt: now,
    updatedAt: now,
  };
  await db.collection<DbAlert>("alerts").insertOne(alert as unknown as DbAlert);

  const verb = action === "notify" ? "notify" : action;
  const amountText = action === "notify" ? "" : ` ${hbarAmount} HBAR`;
  const dirText = triggerType === "percent_drop" ? "drops" : "rises";
  return { created: true, message: `Okay, alert set: ${verb}${amountText} when price ${dirText} ${pct}%.`, alertId: alert.id };
}

export async function POST(request: Request) {
  try {
    const { persona, question, meta }: { persona?: string; question?: string; meta?: Meta } = await request.json();
    const trace: string[] = [];
    const apiKeyMissing = !process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // If user asked for current HBAR price, answer directly from Pyth
    if (isPriceQuestion(String(question || ""))) {
      const price = await getBaselinePriceUsd();
      if (price) {
        return NextResponse.json({ answer: `HBAR price: $${price.toFixed(6)} (Pyth)`, trace: ["Rate Oracle: fetched from Pyth"] }, { status: 200 });
      }
    }

    // If user asked for immediate buy/sell with amount, record a trade signal now and return the transaction id
    try {
      const instant = await tryImmediateTradeFromText(String(question || ""), meta);
      if (instant.done) {
        trace.push("Swap Executor: recorded trade signal on HCS");
        return NextResponse.json({ answer: instant.message || "Recorded.", trace, txId: instant.txId }, { status: 200 });
      }
    } catch {}

    // Try handling trade alert intent first
    try {
      const intent = await tryCreateAlertFromText(String(question || ""), meta);
      if (intent.created) {
        trace.push("Orchestrator: created trade alert");
        return NextResponse.json({ answer: intent.message || "Alert created.", trace, alertId: intent.alertId }, { status: 200 });
      }
    } catch {}

    // Load agents from MongoDB at runtime
    let agents: Pick<DbAgent, "id" | "name" | "purpose" | "context">[] = [];
    try {
      const db = await getMongoDb();
      agents = await db
        .collection<DbAgent>("agents")
        .find({}, { projection: { _id: 0, id: 1, name: 1, purpose: 1, context: 1 } })
        .toArray();
    } catch {}

    // If no agents exist, short-circuit with guidance
    if (!agents.length) {
      const emptyMsg = "No agents found in the catalog. Add agents in /agents/new, then try again.";
      trace.push("Orchestrator: no agents available");
      return NextResponse.json({ answer: emptyMsg, trace }, { status: 200 });
    }

    const catalog = agents
      .map((a) => `- id: ${a.id}\n  name: ${a.name}\n  purpose: ${a.purpose || ""}\n  context: ${(a.context || "").slice(0, 400)}`)
      .join("\n\n");

    if (apiKeyMissing) {
      return NextResponse.json({ answer: "Model key missing. Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local and restart the dev server.", trace }, { status: 200 });
    }

    trace.push("Orchestrator: analyzing request");

    // Preferred: ask the model to design a small multi-agent plan and return strict JSON
    const planPrompt = `You are the orchestrator. Break the user's request into 2-5 steps across specialist agents from the catalog.\n` +
      `Return STRICT JSON only: {"steps":[{"agentId":string,"note":string}],"answer":string}.\n` +
      `- steps: ordered execution plan; agentId must be one of the catalog ids.\n` +
      `- note: short present-tense action (e.g., \"fetch rates\", \"plan route\").\n` +
      `Persona: ${persona || "(none)"}\n` +
      `Question: ${question || "(none)"}\n\n` +
      `Catalog:\n${catalog}`;

    try {
      const { text: planText } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: planPrompt });
      const cleaned = (planText || "").trim().replace(/^```json\n?|```$/g, "");
      const parsed = JSON.parse(cleaned) as { steps?: { agentId?: string; note?: string }[]; answer?: string };
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      const valid = steps
        .map((s) => ({ id: String(s.agentId || ""), note: String(s.note || "") }))
        .filter((s) => agents.some((a) => a.id === s.id));
      if (valid.length) {
        const activations = valid.map((s) => s.id);
        for (const s of valid) {
          const a = agents.find((x) => x.id === s.id)!;
          trace.push(`${a.name}: ${s.note || "working"}`);
        }
        // Try a second LLM pass to produce a crisp final answer using the planned steps and agent contexts
        try {
          const used = agents.filter((a) => activations.includes(a.id));
          const planLines = valid.map((s, i) => `${i + 1}. ${s.id}: ${s.note || "do step"}`).join("\n");
          const ctx = used.map((a) => `- ${a.id} (${a.name}): purpose=${a.purpose || ""}; context=${(a.context || "").slice(0, 200)}`).join("\n");
          const finalSynthesisPrompt = `You are the orchestrator. A plan has been selected across agents.\n` +
            `Write the final answer for the user now.\n\n` +
            `Persona: ${persona || "(none)"}\n` +
            `User question: ${question || "(none)"}\n\n` +
            `Plan steps (for your reference, do not list them):\n${planLines}\n\n` +
            `Agent contexts:\n${ctx}\n\n` +
            `Return only the final concise answer as plain text. Do NOT output JSON, code blocks, or markdown fences.`;
          const { text: composed } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: finalSynthesisPrompt });
          const answerSynth = toPlainAnswer(composed || "");
          if (answerSynth) {
            return NextResponse.json({ answer: answerSynth, trace, activations }, { status: 200 });
          }
        } catch {}
        const answer = String(parsed.answer || "").trim() ||
          `Completed: ${valid.map((s) => agents.find((a) => a.id === s.id)?.name).filter(Boolean).join(" → ")}.`;
        return NextResponse.json({ answer, trace, activations }, { status: 200 });
      }
    } catch {
      // fall back to two-stage flow below
    }

    // Fallback: two-stage selection + answer (single agent)
    const selectionPrompt = `You are the orchestrator. Select the single best agent for the user's request.\n` +
      `Return STRICT JSON: {"agentId": string, "reason": string}. No extra text.\n\n` +
      `Persona: ${persona || "(none)"}\n` +
      `Question: ${question || "(none)"}\n\n` +
      `Catalog:\n${catalog}`;

    let chosen: Pick<DbAgent, "id" | "name" | "purpose" | "context"> | null = null;
    try {
      const { text: selText } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: selectionPrompt });
      const cleaned = (selText || "").trim().replace(/^```json\n?|```$/g, "");
      const sel = JSON.parse(cleaned) as { agentId?: string; reason?: string };
      const found = sel?.agentId ? agents.find((a) => a.id === sel.agentId) : undefined;
      if (found) {
        chosen = found;
        trace.push(`Selected agent (LLM): ${found.name}`);
      } else {
        trace.push("Selected agent (LLM): not recognized; proceeding with self-selection in final prompt");
      }
    } catch {
      trace.push("Selection: parsing failed; proceeding with self-selection in final prompt");
    }

    const finalPrompt = chosen
      ? `You are ${chosen.name}. Purpose: ${chosen.purpose || ""}. Context: ${chosen.context || ""}.\n` +
        `Answer the user's request using your capabilities.\n` +
        `Persona: ${persona || "(none)"}\n` +
        `User question: ${question || "(none)"}\n\n` +
        `Respond concisely in plain text. Do NOT output JSON, code blocks, or markdown fences. Do not mention internal agent selection.`
      : `You are an expert orchestrator with access to specialist agents listed below.\n` +
        `Choose the best agent implicitly and answer directly. Do not mention the selection.\n` +
        `Agents:\n${catalog}\n\n` +
        `Persona: ${persona || "(none)"}\n` +
        `User question: ${question || "(none)"}\n\n` +
        `Respond concisely in plain text. Do NOT output JSON, code blocks, or markdown fences.`;

    const { text: finalOut } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: finalPrompt });
    const answer = toPlainAnswer(finalOut || "") || `${chosen ? chosen.name : "Assistant"}: response generated.`;
    if (chosen) trace.push(`${chosen.name}: answering`);
    const activations = chosen ? [chosen.id] : [];
    return NextResponse.json({ answer, trace, activations }, { status: 200 });
  } catch {
    return NextResponse.json({ answer: "Sorry, I couldn't generate an answer right now." }, { status: 200 });
  }
}

function toPlainAnswer(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return "";
  t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === "object") {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          const inner = Object.entries(v as Record<string, unknown>)
            .map(([ik, iv]) => `${ik.replace(/_/g, " ")}: ${String(iv)}`)
            .join(", ");
          parts.push(`${k}: ${inner}`);
        } else {
          parts.push(`${k}: ${String(v)}`);
        }
      }
      return parts.join("\n");
    }
  } catch {
    // not JSON; fall through
  }
  return t;
}


