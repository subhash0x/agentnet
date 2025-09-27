import { NextResponse } from "next/server";
import { Client, PrivateKey, ScheduleInfoQuery, ScheduleSignTransaction } from "@hashgraph/sdk";

export const runtime = "nodejs";

function parseKey(raw: string): PrivateKey {
  let s = raw.trim();
  if (s.startsWith("0x")) s = s.slice(2);
  try { return PrivateKey.fromStringDer(s); } catch {}
  try { return PrivateKey.fromStringED25519(s); } catch {}
  try { return PrivateKey.fromStringECDSA(s); } catch {}
  return PrivateKey.fromString(raw);
}

function getClient(): Client {
  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  if (network === "mainnet") return Client.forMainnet();
  if (network === "previewnet") return Client.forPreviewnet();
  return Client.forTestnet();
}

type Body = { scheduleId: string; privateKey: string };

export async function POST(request: Request) {
  try {
    const { scheduleId, privateKey }: Body = await request.json();
    if (!scheduleId || !privateKey) return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });

    const client = getClient();
    const key = parseKey(privateKey);

    const prepared = await new ScheduleSignTransaction().setScheduleId(scheduleId).freezeWith(client).sign(key);
    const submit = await prepared.execute(client);
    const receipt = await submit.getReceipt(client);

    const info = await new ScheduleInfoQuery().setScheduleId(scheduleId).execute(client);

    return NextResponse.json({ status: receipt.status.toString(), info }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ error: "SERVER_ERROR", message }, { status: 500 });
  }
}


