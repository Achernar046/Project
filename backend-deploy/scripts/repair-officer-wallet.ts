import { ObjectId } from 'mongodb';
import { ethers } from 'ethers';
import { connectToDatabase } from '../src/lib/mongodb';
import { encryptPrivateKey, generateWallet } from '../src/lib/wallet';
import { getConfig } from '../src/lib/config';
import { User, Wallet } from '../src/models/types';

async function main() {
    const targetEmail = process.argv[2]?.trim().toLowerCase() || 'test@gmail.com';
    const strategy = process.argv[3]?.trim().toLowerCase() || 'fresh';
    const config = getConfig();
    const replacementWallet = strategy === 'configured'
        ? new ethers.Wallet(config.officerPrivateKey)
        : generateWallet();
    const { db, client } = await connectToDatabase();

    try {
        const user = await db.collection<User>('users').findOne({ email: targetEmail, role: 'officer' });

        if (!user?._id) {
            throw new Error(`Officer user not found for email ${targetEmail}`);
        }

        const existingWallet = await db.collection<Wallet>('wallets').findOne({ user_id: user._id });
        const encrypted = encryptPrivateKey(replacementWallet.privateKey);
        const updatedAt = new Date();

        await db.collection<User>('users').updateOne(
            { _id: user._id },
            {
                $set: {
                    wallet_address: replacementWallet.address,
                    updated_at: updatedAt,
                },
            }
        );

        await db.collection<Wallet>('wallets').updateOne(
            { user_id: user._id },
            {
                $set: {
                    address: replacementWallet.address,
                    encrypted_private_key: encrypted.encryptedKey,
                    encryption_iv: encrypted.iv,
                },
                $setOnInsert: {
                    user_id: user._id as ObjectId,
                    created_at: updatedAt,
                },
            },
            { upsert: true }
        );

        console.log(JSON.stringify({
            email: targetEmail,
            strategy,
            userId: user._id.toString(),
            oldUserWalletAddress: user.wallet_address,
            oldWalletDocAddress: existingWallet?.address ?? null,
            newWalletAddress: replacementWallet.address,
        }, null, 2));
    } finally {
        await client.close();
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
