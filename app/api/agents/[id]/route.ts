import { NextResponse } from "next/server";
import { getMongoDb, type DbAgent } from "@/lib/mongo";
import type { Document } from "mongodb";

export const runtime = "nodejs";

function isPromiseLike<T>(value: unknown): value is PromiseLike<T> {
  return typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";
}

export async function GET(_: Request, context: unknown) {
  try {
    const raw = (context as { params?: unknown })?.params as unknown;
    const resolved = isPromiseLike<{ id: string }>(raw) ? await raw : (raw as { id: string } | undefined);
    const id = String(resolved?.id || "");
    const db = await getMongoDb();
    const doc = await db.collection<DbAgent>("agents").findOne({ id }, { projection: { _id: 0 } });
    return NextResponse.json({ agent: doc || null }, { status: 200 });
  } catch {
    return NextResponse.json({ agent: null }, { status: 200 });
  }
}

export async function PUT(request: Request, context: unknown) {
  try {
    const raw = (context as { params?: unknown })?.params as unknown;
    const resolved = isPromiseLike<{ id: string }>(raw) ? await raw : (raw as { id: string } | undefined);
    const id = String(resolved?.id || "");
    const body = (await request.json()) as Partial<DbAgent>;
    const now = new Date();
    const update: Partial<DbAgent> = {
      name: typeof body.name === "string" ? body.name : undefined,
      purpose: typeof body.purpose === "string" ? body.purpose : undefined,
      context: typeof body.context === "string" ? body.context : undefined,
      updatedAt: now,
    };
    const db = await getMongoDb();
    await db.collection<DbAgent>("agents").updateOne({ id }, { $set: update });
    // Also reflect changes into saved graphs
    const setOps: Record<string, unknown> = {};
    if (update.name !== undefined) setOps["agents.$[elem].name"] = update.name;
    if (update.purpose !== undefined) setOps["agents.$[elem].purpose"] = update.purpose;
    if (Object.keys(setOps).length > 0) {
      try {
        await db.collection("graphs").updateMany(
          { "agents.id": id },
          { $set: setOps },
          { arrayFilters: [{ "elem.id": id }] as Document[] }
        );
      } catch {}
    }
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}

export async function DELETE(_: Request, context: unknown) {
  try {
    const raw = (context as { params?: unknown })?.params as unknown;
    const resolved = isPromiseLike<{ id: string }>(raw) ? await raw : (raw as { id: string } | undefined);
    const id = String(resolved?.id || "");
    const db = await getMongoDb();
    await db.collection("agents").deleteOne({ id });
    // Also remove from default graph if present
    // Use aggregation-style updates to avoid TS PullOperator typing issues
    await db.collection("graphs").updateOne(
      { id: "default" },
      [{ $set: { agents: { $filter: { input: "$agents", as: "a", cond: { $ne: ["$$a.id", id] } } } } } as unknown as Document]
    );
    await db.collection("graphs").updateOne(
      { id: "default" },
      [{ $set: { edges: { $filter: { input: "$edges", as: "e", cond: { $and: [{ $ne: ["$$e.source", id] }, { $ne: ["$$e.target", id] }] } } } } } as unknown as Document]
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}


