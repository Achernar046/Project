import { MongoClient } from 'mongodb';
import { hashPassword } from '../src/lib/auth';
import { getConfig } from '../src/lib/config';

async function createOfficer() {
    const config = getConfig();
    const client = new MongoClient(config.mongodbUri);

    try {
        await client.connect();
        const db = client.db(config.mongodbDb);
        
        const officerId = '999';
        const password = 'password123';
        const passwordHash = await hashPassword(password);
        
        const officer = {
            user_id: officerId,
            name: 'System Officer',
            email: 'officer@wastecoin.local',
            password_hash: passwordHash,
            role: 'officer',
            status: 'approved',
            created_at: new Date(),
            updated_at: new Date(),
        };

        const result = await db.collection('users').updateOne(
            { user_id: officerId },
            { $set: officer },
            { upsert: true }
        );

        console.log(`Officer account created or updated successfully!`);
        console.log(`User ID: ${officerId}`);
        console.log(`Password: ${password}`);
    } catch (error) {
        console.error('Failed to create officer:', error);
    } finally {
        await client.close();
    }
}

createOfficer();
