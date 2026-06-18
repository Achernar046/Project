import { MongoClient, Db } from 'mongodb';
import { getConfig } from './config';

const { mongodbUri: MONGODB_URI, mongodbDb: MONGODB_DB } = getConfig();

let cachedClient: MongoClient | null = null;
let cachedDb: Db | null = null;

export async function connectToDatabase() {
    if (cachedClient && cachedDb) {
        return { client: cachedClient, db: cachedDb };
    }

    const client = await MongoClient.connect(MONGODB_URI);
    const db = client.db(MONGODB_DB);

    cachedClient = client;
    cachedDb = db;

    return { client, db };
}

export async function getDatabase(): Promise<Db> {
    const { db } = await connectToDatabase();
    return db;
}

export async function pingDatabase(): Promise<void> {
    const { db } = await connectToDatabase();
    await db.command({ ping: 1 });
}
