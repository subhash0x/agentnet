import { NextResponse } from "next/server";
import { Client, Hbar, PrivateKey, ScheduleCreateTransaction, TransferTransaction } from "@hashgraph/sdk";

export const runtime = "nodejs";

function parseOperatorKey(raw: string): PrivateKey {
  let s = raw.trim();
  if (s.startsWith("0x")) s = s.slice(2);
  try {
    return PrivateKey.fromStringDer(s);
  } catch {}
  try {
    return PrivateKey.fromStringED25519(s);
  } catch {}
  try {
    return PrivateKey.fromStringECDSA(s);
  } catch {}
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

  const priv = parseOperatorKey(operatorKey);
  client.setOperator(operatorId, priv);
  return client;
}

type Body = {
  fromAccountId: string;
  toAccountId: string;
  hbar: number;
};

export async function POST(request: Request) {
  try {
    const { fromAccountId, toAccountId, hbar }: Body = await request.json();
    if (!fromAccountId || !toAccountId || !Number.isFinite(hbar) || hbar <= 0) {
      return NextResponse.json({ error: "INVALID_INPUT" }, { status: 400 });
    }

    const client = getHederaClient();

    const transfer = new TransferTransaction()
      .addHbarTransfer(fromAccountId, new Hbar(-hbar))
      .addHbarTransfer(toAccountId, new Hbar(hbar));

    const scheduleTx = await new ScheduleCreateTransaction()
      .setScheduledTransaction(transfer)
      .execute(client);
    const receipt = await scheduleTx.getReceipt(client);
    const scheduleId = receipt.scheduleId?.toString();
    const scheduledTxId = receipt.scheduledTransactionId?.toString();

    if (!scheduleId || !scheduledTxId) {
      return NextResponse.json({ error: "SCHEDULE_CREATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json({ scheduleId, scheduledTxId }, { status: 200 });
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ error: "SERVER_ERROR", message }, { status: 500 });
  }
}


