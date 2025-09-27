import { NextResponse } from "next/server";
import { getMongoDb, type DbAlert } from "@/lib/mongo";
import { Client, PrivateKey, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hashgraph/sdk";

export const runtime = "nodejs";

function parseOperatorKey(raw: string): PrivateKey {
  let s = raw.trim();
  if (s.startsWith("0x")) s = s.slice(2);
  try { return PrivateKey.fromStringDer(s); } catch {}
  try { return PrivateKey.fromStringED25519(s); } catch {}
  try { return PrivateKey.fromStringECDSA(s); } catch {}
  return PrivateKey.fromString(raw);
}

function getHederaClient(): Client {
  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  const operatorKey = process.env.HEDERA_OPERATOR_KEY;
  if (!operatorId || !operatorKey) {
    throw new Error("Missing HEDERA_OPERATOR_ID or HEDERA_OPERATOR_KEY");
  }
  let client: Client;
  if (network === "mainnet") client = Client.forMainnet();
  else if (network === "previewnet") client = Client.forPreviewnet();
  else client = Client.forTestnet();
  client.setOperator(operatorId, parseOperatorKey(operatorKey));
  return client;
}

async function getPriceUsd(): Promise<number> {
  // Fetch directly from Pyth Hermes to avoid dependency on internal endpoint
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

export async function POST() {
  try {
    const db = await getMongoDb();
    const active = await db.collection<DbAlert>("alerts").find({ status: "active" }).toArray();
    const price = await getPriceUsd();
    if (!price) return NextResponse.json({ checked: active.length, triggered: 0 }, { status: 200 });

    const now = new Date();
    let triggered = 0;
    const client = getHederaClient();

    for (const a of active) {
      const cooldown = (a.cooldownSec ?? 3600) * 1000;
      const lastNotifyMs = a.lastNotifiedAt ? new Date(a.lastNotifiedAt).getTime() : 0;
      const withinCooldown = lastNotifyMs && now.getTime() - lastNotifyMs < cooldown;
      if (withinCooldown) continue;
      // allow multiple signals for same alert over time; do not block on existing topic/messageSequence

      const dropHit = a.triggerType === "percent_drop" && price <= a.baselinePrice * (1 - a.triggerValue / 100);
      const riseHit = a.triggerType === "percent_rise" && price >= a.baselinePrice * (1 + a.triggerValue / 100);
      if (!dropHit && !riseHit) continue;

      try {
        // Choose topic by action: prefer env if present
        let topicId = a.topicId;
        const envTopic = a.action === "sell" ? process.env.HEDERA_SIGNAL_TOPIC_SELL : process.env.HEDERA_SIGNAL_TOPIC_BUY;
        if (!topicId) {
          topicId = envTopic;
        }
        if (!topicId) {
          const tx = await new TopicCreateTransaction().execute(client);
          const rc = await tx.getReceipt(client);
          topicId = rc.topicId?.toString();
        }
        if (topicId) {
          const payload = {
            kind: a.action === "notify" ? "price_alert" : "trade_signal",
            action: a.action,
            amount: a.hbarAmount,
            triggerType: a.triggerType,
            triggerValue: a.triggerValue,
            baselinePrice: a.baselinePrice,
            currentPrice: price,
            alertId: a.id,
            owner: a.owner || null,
            ts: now.toISOString(),
          };
          const submit = await new TopicMessageSubmitTransaction()
            .setTopicId(topicId)
            .setMessage(JSON.stringify(payload))
            .execute(client);
          const rc = await submit.getReceipt(client);
          const seq = (rc as unknown as { sequenceNumber?: number }).sequenceNumber;
          triggered++;
          await db.collection("alerts").updateOne(
            { id: a.id },
            { $set: { topicId, messageSequence: typeof seq === "number" ? seq : undefined, lastNotifiedAt: now, updatedAt: now } }
          );
        }
      } catch {}
    }

    return NextResponse.json({ checked: active.length, triggered }, { status: 200 });
  } catch {
    return NextResponse.json({ checked: 0, triggered: 0 }, { status: 200 });
  }
}

export async function GET() {
  try {
    const db = await getMongoDb();
    const alerts = await db.collection<DbAlert>("alerts").find({}, { projection: { _id: 0 } }).toArray();
    return NextResponse.json({ alerts, count: alerts.length }, { status: 200 });
  } catch {
    return NextResponse.json({ alerts: [], count: 0 }, { status: 200 });
  }
}


