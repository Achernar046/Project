import { MongoClient } from 'mongodb';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || '';
const MONGODB_DB = process.env.MONGODB_DB || 'waste-coin-db';

const rewards = [
    {
        name: 'Starbucks Voucher (100 THB)',
        description: 'ใช้แทนเงินสด 100 บาท ที่ร้าน Starbucks ทุกสาขา',
        image_url: 'https://images.unsplash.com/photo-1544787210-282bbd415999?q=80&w=500',
        coin_price: 50,
        stock: 10,
        category: 'Voucher',
        created_at: new Date(),
        updated_at: new Date()
    },
    {
        name: 'WasteCoin Eco-Bag',
        description: 'ถุงผ้ารักษ์โลกลาย Limited Edition จากโครงการ WasteCoin',
        image_url: 'https://images.unsplash.com/photo-1597484662317-9bd773efde58?q=80&w=500',
        coin_price: 30,
        stock: 50,
        category: 'Merchandise',
        created_at: new Date(),
        updated_at: new Date()
    },
    {
        name: 'Tumbler (Stainless Steel)',
        description: 'กระบอกน้ำเก็บอุณหภูมิร้อน-เย็น ลายพิเศษ ช่วยลดการใช้พลาสติก',
        image_url: 'https://images.unsplash.com/photo-1517254456976-ee8682099819?q=80&w=500',
        coin_price: 120,
        stock: 15,
        category: 'Merchandise',
        created_at: new Date(),
        updated_at: new Date()
    }
];

async function seed() {
    if (!MONGODB_URI) {
        console.error('❌ MONGODB_URI is not defined');
        process.exit(1);
    }

    const client = new MongoClient(MONGODB_URI);
    try {
        await client.connect();
        const db = client.db(MONGODB_DB);
        
        // Clear existing rewards
        await db.collection('rewards').deleteMany({});
        
        // Insert new rewards
        const result = await db.collection('rewards').insertMany(rewards);
        console.log(`✅ Successfully seeded ${result.insertedCount} rewards`);
        
    } catch (error) {
        console.error('❌ Error seeding data:', error);
    } finally {
        await client.close();
    }
}

seed();
