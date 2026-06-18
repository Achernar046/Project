import { ethers } from 'ethers';
import crypto from 'crypto';
import { getDatabase } from './mongodb';
import { getProvider } from './blockchain';
import { ObjectId } from 'mongodb';
import { Wallet as WalletDoc } from '../models/types';
import { getConfig } from './config';

const { encryptionSecret: ENCRYPTION_SECRET } = getConfig();
const ALGORITHM = 'aes-256-cbc';

/**
 * Generate a new Ethereum wallet
 */
export function generateWallet(): { address: string; privateKey: string } {
    const wallet = ethers.Wallet.createRandom();
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
    };
}

/**
 * Encrypt private key for storage
 */
export function encryptPrivateKey(privateKey: string): {
    encryptedKey: string;
    iv: string;
} {
    // Create a 32-byte key from the secret
    const key = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

    // Generate a random initialization vector
    const iv = crypto.randomBytes(16);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt the private key
    let encrypted = cipher.update(privateKey, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return {
        encryptedKey: encrypted,
        iv: iv.toString('hex'),
    };
}

/**
 * Decrypt private key for signing transactions
 */
export function decryptPrivateKey(encryptedKey: string, iv: string): string {
    // Create a 32-byte key from the secret
    const key = crypto.createHash('sha256').update(ENCRYPTION_SECRET).digest();

    // Create decipher
    const decipher = crypto.createDecipheriv(
        ALGORITHM,
        key,
        Buffer.from(iv, 'hex')
    );

    // Decrypt the private key
    let decrypted = decipher.update(encryptedKey, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
}

/**
 * Create a wallet instance from encrypted private key
 */
export function getWalletFromEncrypted(
    encryptedKey: string,
    iv: string
): ethers.Wallet {
    const privateKey = decryptPrivateKey(encryptedKey, iv);
    return new ethers.Wallet(privateKey);
}

/**
 * Get a user's wallet signer from the DB (connected to Sepolia provider)
 * This is the core custodial function — decrypts the key and returns a live signer.
 */
export async function getUserWalletSigner(userId: string): Promise<ethers.Wallet> {
    const db = await getDatabase();
    const walletDoc = await db.collection<WalletDoc>('wallets').findOne({
        user_id: new ObjectId(userId),
    });

    if (!walletDoc) {
        throw new Error('Wallet not found for user');
    }

    const privateKey = decryptPrivateKey(
        walletDoc.encrypted_private_key,
        walletDoc.encryption_iv
    );

    const provider = getProvider();
    const signer = new ethers.Wallet(privateKey, provider);

    if (signer.address.toLowerCase() !== walletDoc.address.toLowerCase()) {
        throw new Error('Stored wallet key does not match wallet address');
    }

    return signer;
}

