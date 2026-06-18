import { Router, Response } from 'express';
import { getDatabase } from '../lib/mongodb';
import { authMiddleware, AuthenticatedRequest } from '../lib/auth-middleware';
import { ensureWalletHasGas, getWalletBalance, transferCoins } from '../lib/blockchain';
import { getUserWalletSigner, decryptPrivateKey } from '../lib/wallet';
import { Transaction, Wallet as WalletDoc } from '../models/types';
import { ObjectId } from 'mongodb';
import { getConfig } from '../lib/config';
import { isValidEthereumAddress, parsePositiveNumber } from '../lib/validation';

const router = Router();

// GET /api/wallet/balance
router.get('/balance', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const walletAddress = req.user!.walletAddress;
        const balance = await getWalletBalance(walletAddress);

        res.json({
            walletAddress,
            balance: balance.toString(),
            symbol: 'WST',
        });
    } catch (error) {
        console.error('Get balance error:', error);
        res.status(500).json({ error: 'Failed to fetch balance' });
    }
});

// GET /api/wallet/info
router.get('/info', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const db = await getDatabase();
        const user = await db.collection('users').findOne({
            _id: new ObjectId(req.user!.userId),
        });

        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        res.json({
            userId: user.user_id,
            name: user.name,
            email: user.email,
            role: user.role,
            walletAddress: user.wallet_address,
        });
    } catch (error) {
        console.error('Get wallet info error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/wallet/transfer
router.post('/transfer', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        const { to_address, amount } = req.body;
        const numericAmount = parsePositiveNumber(amount);

        if (!to_address || numericAmount === null) {
            return res.status(400).json({ error: 'Recipient address and amount are required' });
        }

        if (!isValidEthereumAddress(to_address)) {
            return res.status(400).json({ error: 'Invalid recipient wallet address' });
        }

        if (to_address.toLowerCase() === req.user!.walletAddress.toLowerCase()) {
            return res.status(400).json({ error: 'Cannot transfer to the same wallet address' });
        }

        await ensureWalletHasGas(req.user!.userId, req.user!.walletAddress, 'wallet_transfer');
        const signer = await getUserWalletSigner(req.user!.userId);
        const { txHash } = await transferCoins(signer, to_address, numericAmount);

        const db = await getDatabase();
        const transaction: Transaction = {
            user_id: new ObjectId(req.user!.userId),
            type: 'transfer',
            amount: numericAmount,
            to_address,
            blockchain_tx_hash: txHash,
            status: 'confirmed',
            created_at: new Date(),
        };

        await db.collection<Transaction>('transactions').insertOne(transaction);

        res.json({
            message: 'Transfer successful',
            txHash,
        });
    } catch (error) {
        console.error('Transfer error:', error);
        res.status(500).json({ error: 'Transfer failed' });
    }
});

// GET /api/wallet/export
router.get('/export', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
    try {
        if (!getConfig().walletExportEnabled) {
            return res.status(403).json({ error: 'Wallet export is disabled' });
        }

        const db = await getDatabase();
        const walletDoc = await db.collection<WalletDoc>('wallets').findOne({
            user_id: new ObjectId(req.user!.userId),
        });

        if (!walletDoc) {
            return res.status(404).json({ error: 'Wallet not found' });
        }

        const privateKey = decryptPrivateKey(
            walletDoc.encrypted_private_key,
            walletDoc.encryption_iv
        );

        res.json({
            address: walletDoc.address,
            privateKey: privateKey,
            warning: 'NEVER share your private key with anyone!'
        });
    } catch (error) {
        console.error('Export wallet error:', error);
        res.status(500).json({ error: 'Failed to export wallet' });
    }
});

export default router;
