import { NextResponse } from "next/server";
import { getMongoDb, type DbAgent } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getMongoDb();
    const docs = await db.collection<DbAgent>("agents").find({}, { projection: { _id: 0 } }).sort({ updatedAt: -1 }).toArray();
    return NextResponse.json({ agents: docs }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ agents: [], error: "DB_ERROR" }, { status: 200 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<DbAgent>;
    const now = new Date();
    const agent: DbAgent = {
      id: String(body.id || "").trim(),
      name: String(body.name || "").trim(),
      purpose: body.purpose ? String(body.purpose) : undefined,
      context: body.context ? String(body.context) : undefined,
      createdAt: now,
      updatedAt: now,
    };

    if (!agent.id || !agent.name) {
      return NextResponse.json({ ok: false, error: "INVALID_INPUT" }, { status: 400 });
    }

    const db = await getMongoDb();
    await db.collection<DbAgent>("agents").updateOne(
      { id: agent.id },
      { $set: { name: agent.name, purpose: agent.purpose, context: agent.context, updatedAt: now }, $setOnInsert: { createdAt: now } },
      { upsert: true }
    );
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}

export async function DELETE() {
  try {
    const db = await getMongoDb();
    await db.collection("agents").deleteMany({});
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: "DB_ERROR" }, { status: 500 });
  }
}


