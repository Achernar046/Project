import { ethers } from 'ethers';
import { getConfig } from './config';
import { getDatabase } from './mongodb';
import { ObjectId } from 'mongodb';
import { GasTopUpLog } from '../models/types';

// ABI for WasteCoin contract (only the functions we need)
export const WASTE_COIN_ABI = [
    'function name() view returns (string)',
    'function symbol() view returns (string)',
    'function decimals() view returns (uint8)',
    'function balanceOf(address account) view returns (uint256)',
    'function transfer(address to, uint256 amount) returns (bool)',
    'function mintCoins(address to, uint256 amount, string reason)',
    'event CoinsMinted(address indexed to, uint256 amount, string reason)',
    'event Transfer(address indexed from, address indexed to, uint256 value)',
];

const {
    sepoliaRpcUrl: RPC_URL,
    wasteCoinContractAddress: CONTRACT_ADDRESS,
    officerPrivateKey: OFFICER_PRIVATE_KEY,
    walletMinGasBalanceEth: WALLET_MIN_GAS_BALANCE_ETH,
    walletGasTopUpAmountEth: WALLET_GAS_TOP_UP_AMOUNT_ETH,
} = getConfig();

/**
 * Get Ethereum provider for Sepolia testnet
 */
export function getProvider(): ethers.JsonRpcProvider {
    return new ethers.JsonRpcProvider(RPC_URL);
}

/**
 * Get WasteCoin contract instance (read-only)
 */
export function getContract(): ethers.Contract {
    const provider = getProvider();
    return new ethers.Contract(CONTRACT_ADDRESS, WASTE_COIN_ABI, provider);
}

/**
 * Get WasteCoin contract instance with signer (for transactions)
 */
export function getContractWithSigner(wallet: ethers.Wallet): ethers.Contract {
    const provider = getProvider();
    const signer = wallet.connect(provider);
    return new ethers.Contract(CONTRACT_ADDRESS, WASTE_COIN_ABI, signer);
}

/**
 * Get officer wallet for minting coins
 */
export function getOfficerWallet(): ethers.Wallet {
    const provider = getProvider();
    return new ethers.Wallet(OFFICER_PRIVATE_KEY, provider);
}

export async function getNativeBalance(address: string): Promise<bigint> {
    const provider = getProvider();
    return provider.getBalance(address);
}

export async function ensureWalletHasGas(
    userId: string,
    address: string,
    trigger: GasTopUpLog['trigger']
): Promise<{ funded: boolean; txHash?: string }> {
    const provider = getProvider();
    const currentBalance = await provider.getBalance(address);
    const minBalanceWei = ethers.parseEther(WALLET_MIN_GAS_BALANCE_ETH);

    if (currentBalance >= minBalanceWei) {
        console.info(
            `[gas-topup] skipped trigger=${trigger} userId=${userId} address=${address} balanceWei=${currentBalance.toString()}`
        );
        return { funded: false };
    }

    const officerWallet = getOfficerWallet();
    const topUpAmountWei = ethers.parseEther(WALLET_GAS_TOP_UP_AMOUNT_ETH);
    const tx = await officerWallet.sendTransaction({
        to: address,
        value: topUpAmountWei,
    });
    const receipt = await tx.wait();
    if (!receipt) {
        throw new Error('Wallet gas top-up transaction was not confirmed');
    }
    const updatedBalance = await provider.getBalance(address);
    const db = await getDatabase();
    const logRecord: GasTopUpLog = {
        user_id: new ObjectId(userId),
        wallet_address: address,
        funded_by_address: officerWallet.address,
        trigger,
        amount_eth: WALLET_GAS_TOP_UP_AMOUNT_ETH,
        min_required_eth: WALLET_MIN_GAS_BALANCE_ETH,
        balance_before_wei: currentBalance.toString(),
        balance_after_wei: updatedBalance.toString(),
        blockchain_tx_hash: receipt.hash,
        status: 'confirmed',
        created_at: new Date(),
    };
    await db.collection<GasTopUpLog>('gas_topups').insertOne(logRecord);
    console.info(
        `[gas-topup] funded trigger=${trigger} userId=${userId} address=${address} txHash=${receipt.hash} beforeWei=${currentBalance.toString()} afterWei=${updatedBalance.toString()}`
    );

    return {
        funded: true,
        txHash: receipt.hash,
    };
}

/**
 * Get wallet balance in WST tokens
 */
export async function getWalletBalance(address: string): Promise<string> {
    const contract = getContract();
    const balance = await contract.balanceOf(address);
    return ethers.formatEther(balance);
}

/**
 * Mint coins to a user (officer only)
 */
export async function mintCoins(
    toAddress: string,
    amount: number,
    reason: string
): Promise<{ txHash: string; amount: string }> {
    const officerWallet = getOfficerWallet();
    const contract = getContractWithSigner(officerWallet);

    // Convert amount to wei (18 decimals)
    const amountInWei = ethers.parseEther(amount.toString());

    // Send transaction
    const tx = await contract.mintCoins(toAddress, amountInWei, reason);

    // Wait for confirmation
    const receipt = await tx.wait();

    // BUG-006 fix: tx.wait() can return null if transaction is dropped
    if (!receipt) {
        throw new Error('Mint transaction was not confirmed (receipt is null)');
    }

    return {
        txHash: receipt.hash,
        amount: amount.toString(),
    };
}

/**
 * Transfer coins from one wallet to another
 */
export async function transferCoins(
    fromWallet: ethers.Wallet,
    toAddress: string,
    amount: number
): Promise<{ txHash: string }> {
    const contract = getContractWithSigner(fromWallet);

    // Convert amount to wei
    const amountInWei = ethers.parseEther(amount.toString());

    // Send transaction
    const tx = await contract.transfer(toAddress, amountInWei);

    // Wait for confirmation
    const receipt = await tx.wait();

    // BUG-007 fix: tx.wait() can return null if transaction is dropped
    if (!receipt) {
        throw new Error('Transfer transaction was not confirmed (receipt is null)');
    }

    return {
        txHash: receipt.hash,
    };
}
