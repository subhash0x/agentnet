import { NextResponse } from "next/server";
import { getMongoDb } from "@/lib/mongo";

export const runtime = "nodejs";

type Graph = {
  id: string; // e.g., "default"
  agents: { id: string; name: string; purpose?: string }[];
  edges: { source: string; target: string; label?: string }[];
  updatedAt?: Date;
  createdAt?: Date;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id") || "default";
    const db = await getMongoDb();
    const doc = await db.collection<Graph>("graphs").findOne({ id });
    return NextResponse.json({ graph: doc || null }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ graph: null }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Graph;
    if (!body?.id) return NextResponse.json({ ok: false, error: "INVALID" }, { status: 400 });
    const now = new Date();
    const db = await getMongoDb();
    await db.collection<Graph>("graphs").updateOne(
      { id: body.id },
      { $set: { agents: body.agents ?? [], edges: body.edges ?? [], updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}


