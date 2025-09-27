import { NextResponse } from "next/server";
import { getMongoDb, type DbAlert } from "@/lib/mongo";

export const runtime = "nodejs";

async function getCurrentPriceUsd(): Promise<number> {
  try {
    const r = await fetch("/api/oracle/price", { cache: "no-store" });
    const j = (await r.json()) as { priceUsd?: number };
    return Number(j?.priceUsd || 0);
  } catch {
    return 0;
  }
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const owner = searchParams.get("owner") || undefined;
    const id = searchParams.get("id") || undefined;
    const db = await getMongoDb();
    if (id) {
      const alert = await db.collection<DbAlert>("alerts").findOne({ id }, { projection: { _id: 0 } });
      return NextResponse.json({ alert: alert || null }, { status: 200 });
    }
    const q = owner ? { owner } : {};
    const alerts = await db.collection<DbAlert>("alerts").find(q, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray();
    return NextResponse.json({ alerts }, { status: 200 });
  } catch {
    return NextResponse.json({ alerts: [] }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DbAlert> & { triggerValue?: number };
    const now = new Date();
    const price = await getCurrentPriceUsd();
    const alert: DbAlert = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      owner: body.owner || undefined,
      hederaAccountId: String(body.hederaAccountId || "").trim(),
      toAccountId: body.toAccountId ? String(body.toAccountId).trim() : undefined,
      hbarAmount: Number(body.hbarAmount || 0),
      action: (body.action as DbAlert["action"]) || "buy",
      triggerType: (body.triggerType as DbAlert["triggerType"]) || "percent_drop",
      triggerValue: Number(body.triggerValue || 0),
      baselinePrice: Number(body.baselinePrice || price || 0),
      cooldownSec: Number.isFinite(body.cooldownSec as number) ? Number(body.cooldownSec) : 3600,
      status: "active",
      createdAt: now,
      updatedAt: now,
    };

    if (!alert.hederaAccountId || !alert.hbarAmount || !alert.triggerValue || !alert.baselinePrice) {
      return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
    }

    const db = await getMongoDb();
    await db.collection<DbAlert>("alerts").insertOne(alert as unknown as DbAlert);
    return NextResponse.json({ ok: true, alert }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const db = await getMongoDb();
    if (id) {
      await db.collection("alerts").deleteOne({ id });
    } else {
      await db.collection("alerts").deleteMany({});
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}


