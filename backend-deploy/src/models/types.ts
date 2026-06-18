import { ObjectId } from 'mongodb';

export interface User {
    _id?: ObjectId;
    user_id: string;
    name: string;
    email: string;
    password_hash: string;
    role: 'user' | 'officer';
    wallet_address: string;
    profile_image?: string;
    phone_number?: string;
    created_at: Date;
    updated_at: Date;
}

export interface Wallet {
    _id?: ObjectId;
    user_id: ObjectId;
    address: string;
    encrypted_private_key: string;
    encryption_iv: string;
    created_at: Date;
}

export interface WasteSubmission {
    _id?: ObjectId;
    user_id: ObjectId;
    waste_type: string;
    weight_kg: number;
    image_url?: string;
    description?: string;
    status: 'pending' | 'approved' | 'rejected';
    coin_amount?: number;
    reviewed_by?: ObjectId;
    reviewed_at?: Date;
    blockchain_tx_hash?: string;
    created_at: Date;
    updated_at: Date;
}

export interface Transaction {
    _id?: ObjectId;
    user_id: ObjectId;
    type: 'mint' | 'transfer' | 'exchange';
    amount: number;
    from_address?: string;
    to_address?: string;
    blockchain_tx_hash: string;
    waste_submission_id?: ObjectId;
    status: 'pending' | 'confirmed' | 'failed';
    created_at: Date;
}

export interface Reward {
    _id?: ObjectId;
    name: string;
    description: string;
    image_url: string;
    coin_price: number;
    stock: number;
    category?: string;
    created_at: Date;
    updated_at: Date;
}

export interface RedemptionHistory {
    _id?: ObjectId;
    user_id: ObjectId;
    reward_id: ObjectId;
    reward_name: string;
    coin_price: number;
    status: 'pending' | 'processing' | 'shipped' | 'delivered';
    blockchain_tx_hash?: string;
    created_at: Date;
    updated_at: Date;
}

export interface Notification {
    _id?: ObjectId;
    user_id: ObjectId;
    title: string;
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
    is_read: boolean;
    created_at: Date;
}

export interface GasTopUpLog {
    _id?: ObjectId;
    user_id: ObjectId;
    wallet_address: string;
    funded_by_address: string;
    trigger: 'register' | 'wallet_transfer' | 'reward_redeem';
    amount_eth: string;
    min_required_eth: string;
    balance_before_wei: string;
    balance_after_wei: string;
    blockchain_tx_hash: string;
    status: 'confirmed';
    created_at: Date;
}
