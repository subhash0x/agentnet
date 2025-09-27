import { NextResponse } from "next/server";
import { AccountCreateTransaction, Client, Hbar, PrivateKey } from "@hashgraph/sdk";

export const runtime = "nodejs";

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

  client.setOperator(operatorId, operatorKey);
  return client;
}

export async function POST() {
  try {
    const client = getHederaClient();
    const privateKey = await PrivateKey.generateED25519Async();
    const publicKey = privateKey.publicKey;

    const initial = process.env.HEDERA_INITIAL_HBAR ? Number(process.env.HEDERA_INITIAL_HBAR) : 0;
    const tx = await new AccountCreateTransaction()
      .setKey(publicKey)
      .setInitialBalance(new Hbar(isFinite(initial) ? initial : 0))
      .execute(client);
    const receipt = await tx.getReceipt(client);
    const accountId = receipt.accountId?.toString() || "";

    if (!accountId) {
      return NextResponse.json({ error: "ACCOUNT_CREATE_FAILED" }, { status: 500 });
    }

    return NextResponse.json(
      {
        accountId,
        privateKey: privateKey.toStringRaw(),
        algorithm: "ed25519",
        network: (process.env.HEDERA_NETWORK || "testnet").toLowerCase(),
      },
      { status: 200 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "UNKNOWN";
    return NextResponse.json({ error: "SERVER_ERROR", message }, { status: 500 });
  }
}


