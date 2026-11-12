import { MongoClient } from "mongodb";

const globalForMongo = globalThis;

export function getMongoDatabase() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MongoDB is not configured. Set MONGODB_URI in the server environment.");
  }

  if (!globalForMongo.cartsyncMongoClientPromise) {
    const client = new MongoClient(uri, {
      maxPoolSize: 5,
      maxIdleTimeMS: 30_000,
      serverSelectionTimeoutMS: 5_000
    });
    globalForMongo.cartsyncMongoClientPromise = client.connect().catch((error) => {
      globalForMongo.cartsyncMongoClientPromise = null;
      throw error;
    });
  }

  return globalForMongo.cartsyncMongoClientPromise.then((client) =>
    client.db(process.env.MONGODB_DB || "cartsync")
  );
}
