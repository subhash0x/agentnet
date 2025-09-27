#!/usr/bin/env node

// Create two Hedera Consensus Service topics (BUY/SELL) and print env lines.
// Requirements: HEDERA_NETWORK, HEDERA_OPERATOR_ID, HEDERA_OPERATOR_KEY in .env.local or env.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Client, TopicCreateTransaction, PrivateKey, AccountInfoQuery } from "@hashgraph/sdk";

// Load .env.local if present without requiring dotenv
try {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const envPath = path.join(__dirname, "..", ".env.local");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
    for (const line of lines) {
      const m = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
      if (!m) continue;
      const key = m[1];
      const val = m[2];
      if (process.env[key] === undefined) process.env[key] = val;
    }
  }
} catch {}

function parseOperatorKey(raw) {
  let s = String(raw || "").trim();
  if (!s) throw new Error("Missing HEDERA_OPERATOR_KEY");

  const tries = (val) => {
    try { return PrivateKey.fromStringDer(val); } catch {}
    try { return PrivateKey.fromStringED25519(val); } catch {}
    try { return PrivateKey.fromStringECDSA(val); } catch {}
    try { return PrivateKey.fromString(val); } catch {}
    return null;
  };

  // Try as-is
  let k = tries(s);
  if (k) return k;

  // Try without 0x
  if (s.startsWith("0x")) {
    k = tries(s.slice(2));
    if (k) return k;
  } else {
    // Try with 0x
    k = tries("0x" + s);
    if (k) return k;
  }

  throw new Error("Unable to parse HEDERA_OPERATOR_KEY. Provide ED25519/ECDSA or DER string.");
}

function getClient() {
  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const operatorId = process.env.HEDERA_OPERATOR_ID;
  let operatorKey = process.env.HEDERA_OPERATOR_KEY;
  // Support reading from file if provided
  if (!operatorKey && process.env.HEDERA_OPERATOR_KEY_FILE && fs.existsSync(process.env.HEDERA_OPERATOR_KEY_FILE)) {
    operatorKey = fs.readFileSync(process.env.HEDERA_OPERATOR_KEY_FILE, "utf8").trim();
  }
  if (!operatorId || !operatorKey) throw new Error("Set HEDERA_OPERATOR_ID and HEDERA_OPERATOR_KEY");
  let client;
  if (network === "mainnet") client = Client.forMainnet();
  else if (network === "previewnet") client = Client.forPreviewnet();
  else client = Client.forTestnet();
  client.setOperator(operatorId, parseOperatorKey(operatorKey));
  return client;
}

async function createTopic(client, memo) {
  const tx = await new TopicCreateTransaction().setTopicMemo(memo).freezeWith(client).execute(client);
  const receipt = await tx.getReceipt(client);
  const topicId = receipt.topicId?.toString();
  if (!topicId) throw new Error("Topic creation failed");
  return topicId;
}

async function main() {
  const buyMemo = process.argv[2] || "Atoa Buy Signals";
  const sellMemo = process.argv[3] || "Atoa Sell Signals";
  const client = getClient();

  // Optional: sanity check operator key vs on-chain key
  try {
    const operatorId = process.env.HEDERA_OPERATOR_ID;
    const info = await new AccountInfoQuery().setAccountId(operatorId).execute(client);
    const onChain = info?.key?.toStringRaw ? info.key.toStringRaw() : String(info?.key || "");
    const priv = parseOperatorKey(process.env.HEDERA_OPERATOR_KEY || "");
    const derived = priv.publicKey.toStringRaw();
    if (onChain && derived && onChain !== derived) {
      console.warn("Warning: operator private key does not match on-chain public key for", operatorId);
      console.warn("On-chain:", onChain);
      console.warn("Derived:", derived);
    }
  } catch (e) {
    console.warn("Operator key sanity check skipped:", e?.message || e);
  }

  const buyTopic = await createTopic(client, buyMemo);
  const sellTopic = await createTopic(client, sellMemo);

  const network = (process.env.HEDERA_NETWORK || "testnet").toLowerCase();
  const scanBase = network === "mainnet" ? "https://hashscan.io/mainnet/topic/" : network === "previewnet" ? "https://hashscan.io/previewnet/topic/" : "https://hashscan.io/testnet/topic/";

  console.log("\nAdd these to your .env.local:\n");
  console.log(`HEDERA_SIGNAL_TOPIC_BUY=${buyTopic}`);
  console.log(`HEDERA_SIGNAL_TOPIC_SELL=${sellTopic}`);
  console.log("\nLinks:");
  console.log(`BUY  → ${scanBase}${buyTopic}`);
  console.log(`SELL → ${scanBase}${sellTopic}`);
}

main().catch((e) => {
  console.error("Error:", e?.message || e);
  process.exit(1);
});


