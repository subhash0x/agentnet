import { MongoClient, ServerApiVersion } from "mongodb";

const uri = process.env.MONGODB_URI || "";
if (!uri) {
  // Don't throw at import time to avoid Next.js build issues on client side imports.
  // Server-side routes should validate before use.
}

declare global {
  // eslint-disable-next-line no-var
  var _mongoClientPromise: Promise<MongoClient> | undefined;
}

let clientPromise: Promise<MongoClient>;

if (process.env.NODE_ENV === "development") {
  if (!global._mongoClientPromise) {
    const client = new MongoClient(uri, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    });
    global._mongoClientPromise = client.connect();
  }
  clientPromise = global._mongoClientPromise!;
} else {
  const client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });
  clientPromise = client.connect();
}

export async function getMongoDb(dbName = process.env.MONGODB_DB || "atoa") {
  if (!uri) throw new Error("MONGODB_URI is not set");
  const client = await clientPromise;
  return client.db(dbName);
}

export type DbAgent = {
  id: string;
  name: string;
  purpose?: string;
  context?: string;
  createdAt?: Date;
  updatedAt?: Date;
};


export type DbAlert = {
  id: string;
  owner?: string; // wallet address or user id
  hederaAccountId: string; // source account to spend
  toAccountId?: string; // optional destination (not required for HCS recording)
  hbarAmount: number; // amount to trade when triggered (0 allowed for notify)
  action: "buy" | "sell" | "notify"; // intent to record or notify-only
  triggerType: "percent_drop" | "percent_rise";
  triggerValue: number; // e.g., 10 means 10%
  baselinePrice: number; // captured at creation
  cooldownSec?: number; // default 3600
  status: "active" | "paused" | "completed" | "cancelled";
  scheduleId?: string; // legacy (if we later re-enable scheduled transfers)
  scheduledTxId?: string; // legacy
  topicId?: string; // HCS topic used to record signals
  messageSequence?: number; // HCS sequence number of last signal
  lastCheckedAt?: Date;
  lastNotifiedAt?: Date;
  createdAt?: Date;
  updatedAt?: Date;
};


