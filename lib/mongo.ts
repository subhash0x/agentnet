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


