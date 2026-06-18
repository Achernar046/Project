# Officer Wallet Repair — 2026-03-31

> เอกสารบันทึกการแก้ไข Officer Wallet และระบบ Gas Top-up  
> อัปเดต: มิถุนายน 2026 (ตรวจสอบจาก source code ปัจจุบัน)

## ภาพรวม

WasteCoin ใช้ **Custodial Wallet Model** — ระบบจัดการ wallet ให้ user โดยอัตโนมัติ  
Officer Wallet ทำหน้าที่หลัก 2 อย่าง:
1. **Mint WST tokens** ให้ user (approve waste, add-coins)
2. **เติม ETH (Gas)** ให้ user wallets อัตโนมัติ

---

## Officer Wallet Configuration

**จาก `src/lib/blockchain.ts`:**

```typescript
const officerWallet = new ethers.Wallet(OFFICER_PRIVATE_KEY, provider);
```

| Env Variable | Description |
|---|---|
| `OFFICER_PRIVATE_KEY` | Private key `0x...` ของ officer wallet |
| `SEPOLIA_RPC_URL` | Ethereum Sepolia RPC (Infura/Alchemy) |
| `WASTE_COIN_CONTRACT_ADDRESS` | WST contract address |
| `WALLET_MIN_GAS_BALANCE_ETH` | Threshold (default: `0.0003` ETH) |
| `WALLET_GAS_TOP_UP_AMOUNT_ETH` | จำนวน ETH ที่เติมต่อครั้ง (default: `0.001` ETH) |

---

## Gas Top-up System

**File:** `src/lib/blockchain.ts` → `ensureWalletHasGas()`

### Trigger Events

| Event | Endpoint | Mode |
|---|---|---|
| User สมัครสมาชิก | `POST /api/auth/register` | **Non-blocking async** |
| User โอน WST | `POST /api/wallet/transfer` | **Blocking** (รอก่อนโอน) |
| User แลกรางวัล | `POST /api/rewards/redeem` | **Blocking** (รอก่อนแลก) |

### Flow

```
ensureWalletHasGas(userId, address, trigger)
    │
    ├─ provider.getBalance(address) → balanceBefore
    │
    ├─ balanceBefore >= WALLET_MIN_GAS_BALANCE_ETH?
    │   └─ YES → return { funded: false }  [ไม่ต้องเติม]
    │
    └─ NO → เติม ETH
        ├─ officerWallet.sendTransaction({
        │       to: address,
        │       value: WALLET_GAS_TOP_UP_AMOUNT_ETH
        │   })
        ├─ รอ receipt (transaction confirmed)
        ├─ provider.getBalance(address) → balanceAfter
        └─ DB: insertOne(gas_topups, {
               user_id, wallet_address, funded_by_address,
               trigger, amount_eth, min_required_eth,
               balance_before_wei, balance_after_wei,
               blockchain_tx_hash, status: 'confirmed',
               created_at
           })
```

### Default Values

```typescript
MIN_GAS_BALANCE = WALLET_MIN_GAS_BALANCE_ETH || 0.0003  // ETH
TOP_UP_AMOUNT   = WALLET_GAS_TOP_UP_AMOUNT_ETH || 0.001  // ETH
```

---

## GasTopUpLog Schema

**จาก `src/models/types.ts`:**

```typescript
interface GasTopUpLog {
    _id?: ObjectId;
    user_id: ObjectId;           // user ที่ได้รับ gas
    wallet_address: string;      // address ของ user wallet
    funded_by_address: string;   // address ของ officer wallet
    trigger: 'register' | 'wallet_transfer' | 'reward_redeem';
    amount_eth: string;          // จำนวน ETH ที่เติม
    min_required_eth: string;    // threshold
    balance_before_wei: string;  // ยอดก่อนเติม (wei)
    balance_after_wei: string;   // ยอดหลังเติม (wei)
    blockchain_tx_hash: string;  // tx hash ของการเติม gas
    status: 'confirmed';
    created_at: Date;
}
```

**Collection:** `gas_topups`  
**Index:** `{user_id: 1, created_at: -1}`

---

## User Wallet Creation

เมื่อ user register สำเร็จ (`POST /api/auth/register`):

```typescript
// 1. สร้าง wallet ใหม่
const { address, privateKey } = generateWallet();  // ethers.Wallet.createRandom()

// 2. เข้ารหัส private key
const { encryptedKey, iv } = encryptPrivateKey(privateKey);
// Algorithm: AES-256-CBC
// Key: SHA-256(ENCRYPTION_SECRET) → 32 bytes
// IV: crypto.randomBytes(16) per wallet

// 3. บันทึกลง DB
await db.collection('wallets').insertOne({
    user_id: newUser._id,
    address,
    encrypted_private_key: encryptedKey,
    encryption_iv: iv,
    created_at: new Date()
});

// 4. เติม gas แบบ async (ไม่ block response)
ensureWalletHasGas(userId, address, 'register').catch(err => logger.error(...));
```

---

## Repair Script

**File:** `scripts/repair-officer-wallet.ts`  
**Command:** `npm run repair:officer-wallet`

สำหรับใช้กรณี:
- Officer wallet ขาด ETH
- ต้องการตรวจสอบ officer wallet status
- แก้ไข wallet ที่มีปัญหา

---

## getOfficerWallet() Function

**File:** `src/lib/blockchain.ts`

```typescript
export function getOfficerWallet(): ethers.Wallet {
    return new ethers.Wallet(OFFICER_PRIVATE_KEY, getProvider());
}
```

ใช้ใน:
- `POST /api/waste/approve` → `mintCoins()`
- `POST /api/officer/add-coins` → `mintCoins()`
- `POST /api/rewards/redeem` → officer เป็น receiver ของ WST
- `ensureWalletHasGas()` → ส่ง ETH จาก officer

---

## Contract Functions

**ABI ที่ใช้จริง:**

| Function | Signature | ใช้ใน |
|---|---|---|
| `balanceOf` | `balanceOf(address) → uint256` | `GET /api/wallet/balance` |
| `transfer` | `transfer(address to, uint256 amount) → bool` | transfer, redeem |
| `mintCoins` | `mintCoins(address to, uint256 amount, string reason)` | approve, add-coins |

**Amount handling:**
- Input amount เป็น WST (human readable)
- Converted: `ethers.parseEther(amount.toString())` → wei (18 decimals)
- Display: `ethers.formatEther(balance)` → string

---

## Troubleshooting

### Gas Top-up ล้มเหลว

1. ตรวจ officer wallet ETH balance บน Sepolia
2. ตรวจ `OFFICER_PRIVATE_KEY` ใน env
3. ตรวจ `SEPOLIA_RPC_URL` (Infura/Alchemy quota)
4. ดู logs: `gas top-up failed` หรือ `ensureWalletHasGas`

### Mint WST ล้มเหลว

1. ตรวจ officer wallet มี permission บน contract หรือไม่
2. ตรวจ `WASTE_COIN_CONTRACT_ADDRESS` ถูกต้อง
3. ตรวจ officer wallet มี ETH พอสำหรับ gas

### ตรวจ Gas Top-up ประวัติ

ดูใน MongoDB collection `gas_topups`:

```javascript
db.gas_topups.find({ user_id: ObjectId("...") }).sort({ created_at: -1 })
```

---

## Security Notes

- Officer private key เก็บใน env var `OFFICER_PRIVATE_KEY` — ห้าม commit ใน git
- User private keys เข้ารหัส AES-256-CBC ก่อนเก็บ DB (`encrypted_private_key`, `encryption_iv`)
- `getUserWalletSigner()` มี guard ตรวจ `signer.address === walletDoc.address`
- `ENABLE_WALLET_EXPORT=false` by default — ป้องกัน user export private key โดยไม่ตั้งใจ
