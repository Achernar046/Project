'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from './dashboard.module.css';
import { buildApiUrl } from '../../lib/api';

interface TransactionRecord {
    _id: string;
    type: string;
    amount: number;
    to_address?: string;
    blockchain_tx_hash?: string;
    status: string;
    created_at: string;
}

interface RewardRecord {
    _id: string;
    name: string;
    description?: string;
    coin_price: number;
    stock: number;
    image_url?: string;
    category?: string;
}

interface StoredUser {
    name?: string;
    email?: string;
    walletAddress?: string;
}

export default function Dashboard() {
    const router = useRouter();
    const [user, setUser] = useState<StoredUser | null>(null);
    const [balance, setBalance] = useState('0');
    const [loading, setLoading] = useState(true);
    const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
    const [rewards, setRewards] = useState<RewardRecord[]>([]);
    const [copied, setCopied] = useState(false);
    const [selectedReward, setSelectedReward] = useState<string | null>(null);
    const [redeemQuantity, setRedeemQuantity] = useState('1');
    const [redeeming, setRedeeming] = useState(false);
    const [redeemMessage, setRedeemMessage] = useState('');

    useEffect(() => {
        const token = localStorage.getItem('token');
        const rawUser = localStorage.getItem('user');

        if (!token || !rawUser) {
            router.push('/auth');
            return;
        }

        const parsedUser = JSON.parse(rawUser) as StoredUser;
        setUser(parsedUser);

        void loadDashboard(token);
    }, [router]);

    async function loadDashboard(token: string) {
        setLoading(true);
        await Promise.all([fetchBalance(token), fetchTransactions(token), fetchRewards(token)]);
        setLoading(false);
    }

    async function fetchBalance(token: string) {
        try {
            const response = await fetch(buildApiUrl('/api/wallet/balance'), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (response.ok) {
                setBalance(data.balance ?? '0');
            }
        } catch (error) {
            console.error('Failed to fetch balance:', error);
        }
    }

    async function fetchTransactions(token: string) {
        try {
            const response = await fetch(buildApiUrl('/api/transactions/history'), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (response.ok) {
                setTransactions(Array.isArray(data) ? data : []);
            }
        } catch (error) {
            console.error('Failed to fetch transactions:', error);
        }
    }

    async function fetchRewards(token: string) {
        try {
            const response = await fetch(buildApiUrl('/api/rewards/list'), {
                headers: { Authorization: `Bearer ${token}` },
            });
            const data = await response.json();
            if (response.ok) {
                // BUG-004 fix: API returns { success: true, data: [...], pagination: {...} }
                setRewards(Array.isArray(data.data) ? data.data : []);
            }
        } catch (error) {
            console.error('Failed to fetch rewards:', error);
        }
    }

    async function handleRedeem() {
        if (!selectedReward) {
            setRedeemMessage('error:Please select a reward');
            return;
        }

        const token = localStorage.getItem('token');
        if (!token) {
            router.push('/auth');
            return;
        }

        const reward = rewards.find((entry) => entry._id === selectedReward);
        if (!reward) {
            setRedeemMessage('error:Reward not found');
            return;
        }

        const quantity = Math.max(1, parseInt(redeemQuantity, 10) || 1);
        const totalCost = reward.coin_price * quantity;
        if (totalCost > parseFloat(balance)) {
            setRedeemMessage('error:Insufficient WST balance');
            return;
        }

        setRedeeming(true);
        setRedeemMessage('');

        try {
            for (let i = 0; i < quantity; i += 1) {
                const response = await fetch(buildApiUrl('/api/rewards/redeem'), {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        Authorization: `Bearer ${token}`,
                    },
                    body: JSON.stringify({ reward_id: reward._id }),
                });
                const data = await response.json();
                if (!response.ok) {
                    throw new Error(data.error || 'Redeem failed');
                }
            }

            setRedeemMessage(`success:Redeemed ${reward.name} x${quantity} (${totalCost} WST)`);
            setSelectedReward(null);
            setRedeemQuantity('1');
            await loadDashboard(token);
        } catch (error: any) {
            setRedeemMessage(`error:${error.message}`);
        } finally {
            setRedeeming(false);
        }
    }

    function handleCopyAddress() {
        if (!user?.walletAddress) return;
        navigator.clipboard.writeText(user.walletAddress);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }

    function handleLogout() {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        router.push('/');
    }

    function formatTimeAgo(dateStr: string) {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'Just now';
        if (diffMin < 60) return `${diffMin} mins ago`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr} hour${diffHr > 1 ? 's' : ''} ago`;
        const diffDay = Math.floor(diffHr / 24);
        return `${diffDay} day${diffDay > 1 ? 's' : ''} ago`;
    }

    function getInitials(name: string) {
        const parts = name.trim().split(' ').filter(Boolean);
        if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
        return parts[0]?.[0]?.toUpperCase() || '?';
    }

    function formatNumber(value: number) {
        if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`;
        if (value >= 1000) return `${(value / 1000).toFixed(1)}K`;
        return value.toLocaleString();
    }

    const selectedRewardData = rewards.find((reward) => reward._id === selectedReward) || null;
    const confirmedTx = transactions.filter((tx) => tx.status === 'confirmed');
    const pendingTx = transactions.filter((tx) => tx.status === 'pending');

    if (loading) {
        return (
            <div className={styles.loadingScreen}>
                <div className={styles.spinner}></div>
                <p>Loading dashboard...</p>
            </div>
        );
    }

    return (
        <div className={styles.page}>
            <nav className={styles.topNav}>
                <div className={styles.navLeft}>
                    <div className={styles.brand}>
                        <span className={styles.brandIcon}>$$</span>
                        <span className={styles.brandName}>
                            Waste<span className={styles.brandAccent}>Coin</span>
                        </span>
                    </div>
                </div>
                <div className={styles.navRight}>
                    <button className={styles.navIconBtn} title="Notifications">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg>
                    </button>
                    <div className={styles.navDivider}></div>
                    <div className={styles.navUser}>
                        <div className={styles.navUserInfo}>
                            <span className={styles.navUserName}>{user?.name || user?.email || 'User'}</span>
                            <span className={styles.navUserRole}>MEMBER</span>
                        </div>
                        <div className={styles.navAvatar}>{getInitials(user?.name || user?.email || 'U')}</div>
                    </div>
                </div>
            </nav>

            <div className={styles.pageHeader}>
                <div>
                    <div className={styles.breadcrumb}>
                        <span>Home</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 18l6-6-6-6" /></svg>
                        <span className={styles.breadcrumbActive}>Dashboard</span>
                    </div>
                    <h1 className={styles.pageTitle}>My Dashboard</h1>
                    <p className={styles.pageSubtitle}>Wallet, reward redemption, and recent transactions from the live API.</p>
                </div>
                <div className={styles.headerActions}>
                    <button className={styles.btnOutline} onClick={handleLogout}>Logout</button>
                </div>
            </div>

            <div className={styles.statsRow}>
                <div className={styles.statCard}>
                    <div className={`${styles.statIconBox} ${styles.statIconPurple}`}></div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Wallet Balance</span>
                        <div className={styles.statValueRow}>
                            <span className={styles.statValue}>{formatNumber(parseFloat(balance) || 0)}</span>
                            <span className={styles.statUnit}>WST</span>
                        </div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={`${styles.statIconBox} ${styles.statIconBlue}`}></div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Total Transactions</span>
                        <div className={styles.statValueRow}>
                            <span className={styles.statValue}>{transactions.length}</span>
                        </div>
                    </div>
                </div>
                <div className={styles.statCard}>
                    <div className={`${styles.statIconBox} ${styles.statIconGreen}`}></div>
                    <div className={styles.statBody}>
                        <span className={styles.statLabel}>Confirmed</span>
                        <div className={styles.statValueRow}>
                            <span className={styles.statValue}>{confirmedTx.length}</span>
                            {pendingTx.length > 0 && <span className={styles.statUnit}>{pendingTx.length} pending</span>}
                        </div>
                    </div>
                </div>
            </div>

            <div className={styles.mainGrid}>
                <div className={styles.walletPanel}>
                    <div className={styles.panelHeader}>
                        <h2 className={styles.panelTitle}>My Wallet</h2>
                        <span className={styles.walletBadge}>
                            <span className={styles.walletDot}></span>
                            ACTIVE
                        </span>
                    </div>

                    <div className={styles.balanceSection}>
                        <div className={styles.balanceAmount}>{parseFloat(balance || '0').toLocaleString()}</div>
                        <div className={styles.balanceUnit}>WST</div>
                    </div>

                    <div className={styles.walletAddressSection}>
                        <label className={styles.fieldLabel}>Wallet Address</label>
                        <div className={styles.addressBox}>
                            <span className={styles.addressText}>{user?.walletAddress || 'N/A'}</span>
                            <button className={styles.copyBtn} onClick={handleCopyAddress} title="Copy address">Copy</button>
                        </div>
                        {copied && <div className={styles.copiedToast}>Copied</div>}
                    </div>
                </div>

                <div className={styles.rightArea}>
                    <div className={styles.submitPanel}>
                        <div className={styles.submitPanelHeader}>
                            <h2 className={styles.panelTitle}>Rewards</h2>
                            <span className={styles.systemBadge}>
                                <span className={styles.systemDot}></span>
                                LIVE API
                            </span>
                        </div>
                        <p className={styles.submitSubtitle}>Available rewards are loaded from `/api/rewards/list`.</p>

                        <div className={styles.rewardGrid}>
                            {rewards.map((reward) => (
                                <div
                                    key={reward._id}
                                    className={`${styles.rewardCard} ${selectedReward === reward._id ? styles.rewardCardActive : ''}`}
                                    onClick={() => {
                                        setSelectedReward(reward._id);
                                        setRedeemMessage('');
                                    }}
                                >
                                    <div className={styles.rewardIcon}>
                                        <span style={{ fontSize: '1.5rem' }}>Gift</span>
                                    </div>
                                    <div className={styles.rewardInfo}>
                                        <div className={styles.rewardName}>{reward.name}</div>
                                        <div className={styles.rewardDesc}>{reward.description || reward.category || 'Reward available'}</div>
                                    </div>
                                    <div className={styles.rewardCost}>
                                        <span className={styles.rewardCostValue}>{reward.coin_price}</span>
                                        <span className={styles.rewardCostUnit}>WST</span>
                                    </div>
                                    {selectedReward === reward._id && (
                                        <div className={styles.rewardCheck}>
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>

                        {rewards.length === 0 && <div className={styles.noTx}>No rewards available right now</div>}

                        {selectedRewardData && (
                            <div className={styles.redeemActions}>
                                <div className={styles.redeemRow}>
                                    <div className={styles.quantityGroup}>
                                        <label className={styles.fieldLabel}>Quantity</label>
                                        <div className={styles.quantityInput}>
                                            <button type="button" className={styles.quantityBtn} onClick={() => setRedeemQuantity(String(Math.max(1, (parseInt(redeemQuantity, 10) || 1) - 1)))}>-</button>
                                            <input
                                                type="number"
                                                className={styles.quantityValue}
                                                value={redeemQuantity}
                                                onChange={(e) => setRedeemQuantity(e.target.value)}
                                                min="1"
                                                max={String(Math.max(1, selectedRewardData.stock))}
                                            />
                                            <button type="button" className={styles.quantityBtn} onClick={() => setRedeemQuantity(String(Math.min(selectedRewardData.stock, (parseInt(redeemQuantity, 10) || 1) + 1)))}>+</button>
                                        </div>
                                    </div>
                                    <div className={styles.totalCost}>
                                        <span className={styles.fieldLabel}>Total</span>
                                        <span className={styles.totalCostValue}>
                                            {selectedRewardData.coin_price * (Math.max(1, parseInt(redeemQuantity, 10) || 1))} WST
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {redeemMessage && (
                            <div className={redeemMessage.startsWith('success:') ? styles.successMsg : styles.errorMsg}>
                                {redeemMessage.replace(/^(success:|error:)/, '')}
                            </div>
                        )}

                        <div className={styles.formActions}>
                            <button
                                type="button"
                                className={styles.btnCancel}
                                onClick={() => {
                                    setSelectedReward(null);
                                    setRedeemQuantity('1');
                                    setRedeemMessage('');
                                }}
                            >
                                Cancel
                            </button>
                            <button type="button" className={styles.btnConfirm} disabled={redeeming || !selectedReward} onClick={handleRedeem}>
                                {redeeming ? 'Processing...' : 'Redeem'}
                            </button>
                        </div>
                    </div>

                    <div className={styles.transactionsPanel}>
                        <div className={styles.transactionsPanelHeader}>
                            <h2 className={styles.panelTitle}>Recent Transactions</h2>
                            <span className={styles.countBadge}>{transactions.length}</span>
                        </div>
                        <div className={styles.txTable}>
                            <div className={styles.txHeaderRow}>
                                <span className={styles.txHeaderCell}>STATUS</span>
                                <span className={styles.txHeaderCell}>TYPE</span>
                                <span className={styles.txHeaderCell}>AMOUNT</span>
                                <span className={styles.txHeaderCell}>DATE</span>
                            </div>
                            {transactions.length === 0 ? (
                                <div className={styles.noTx}>No transactions yet</div>
                            ) : (
                                transactions.slice(0, 10).map((tx) => (
                                    <div key={tx._id} className={styles.txRow}>
                                        <span className={styles.txCell}>
                                            <span className={`${styles.txStatus} ${tx.status === 'confirmed' ? styles.txStatusCompleted : styles.txStatusPending}`}>
                                                {tx.status}
                                            </span>
                                        </span>
                                        <span className={styles.txCell}>{tx.type}</span>
                                        <span className={styles.txCell}>
                                            <span className={styles.txAmount}>{tx.amount.toLocaleString()} WST</span>
                                        </span>
                                        <span className={`${styles.txCell} ${styles.txDate}`}>{formatTimeAgo(tx.created_at)}</span>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
