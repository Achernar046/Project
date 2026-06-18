# WasteCoin (WST) — Waste-to-Coin Monorepo

แพลตฟอร์ม "Waste-to-Coin" ที่ให้ผู้ใช้นำข้อมูลการคัดแยก/ส่งมอบขยะเข้าระบบ แล้ว **เจ้าหน้าที่ (Officer)** ตรวจสอบและ **Mint เหรียญ WasteCoin (WST)** บนเครือข่าย **Ethereum Sepolia** ส่งเข้ากระเป๋าของผู้ใช้โดยอัตโนมัติ

Repo นี้เป็น **Monorepo** แยกเป็น 3 ส่วนหลัก:

- **Frontend**: `frontend/` (Next.js App Router)
- **Backend API**: `backend-deploy/` (Express + MongoDB + Redis)
- **Smart Contract**: `contracts/` (Solidity + Hardhat)

> 📖 คู่มือ deployment แบบละเอียด: [`docs/deployment.md`](docs/deployment.md)

---

## System Overview

### High-level Architecture

- **Frontend (Next.js)**
  - หน้าเว็บสำหรับ User/Officer
  - เก็บ `JWT` และข้อมูลผู้ใช้ไว้ที่ `localStorage`
  - เรียก Backend ด้วย `fetch` ผ่าน REST API
- **Backend (Express)**
  - Authentication/Authorization (JWT + role)
  - Business logic: submit waste, approve/mint, wallet balance, transfer
  - Custodial wallet: สร้าง wallet ให้ผู้ใช้และเก็บ private key แบบเข้ารหัสใน MongoDB
  - Redis: ใช้สำหรับ token revocation (blacklist JWT)
- **Blockchain (WasteCoin.sol)**
  - ERC20 + AccessControl
  - เฉพาะ address ที่มี `OFFICER_ROLE` เท่านั้นที่เรียก `mintCoins()` ได้

### Main Runtime Flow

#### 1) Register / Login

- **Frontend**: `frontend/app/auth/page.tsx`
- **Backend**: `POST /api/auth/register`, `POST /api/auth/login`

Register:

- Backend สร้าง user ใน collection `users`
- Backend สร้าง Ethereum wallet (custodial)
- Private key ถูกเข้ารหัสด้วย AES-256-CBC แล้วเก็บใน collection `wallets`
- Backend ออก `JWT` กลับไปให้ frontend

#### 2) Submit Waste → Officer Approve → Mint WST

- **User** ส่งรายการขยะ
  - Backend บันทึก `waste_submissions.status = pending`
- **Officer** ดึงรายการ pending แล้วอนุมัติ
  - Backend เรียก smart contract `mintCoins(to, amount, reason)` ผ่าน `ethers v6`
  - Backend บันทึก transaction ลง `transactions`
  - Backend อัปเดต `waste_submissions` เป็น `approved` และเก็บ `blockchain_tx_hash`

#### 3) View Balance / Transfer

- Balance: backend อ่าน `balanceOf()` จาก contract
- Transfer: backend ถอดรหัส private key ของ user (จาก MongoDB) แล้วเซ็น `transfer()` ไปยัง Sepolia

---

## Tech Stack

### Frontend (`frontend/`)

- **Next.js** `^16.x` (App Router, Turbopack)
- **React** `^19.x`
- **TypeScript**
- **Styling**: CSS Modules / global CSS

### Backend (`backend-deploy/`)

- **Node.js** `>= 18`
- **Express**
- **MongoDB** (native driver) — ใช้ MongoDB Atlas
- **Redis** (ioredis) — token revocation
- **Auth**: JWT (`jsonwebtoken`) + bcrypt (`bcryptjs`)
- **Web3**: `ethers v6`
- **Dev**: `ts-node`, `nodemon`

### Smart Contract / Tooling

- **Solidity** `0.8.20`
- **OpenZeppelin Contracts**
- **Hardhat** (+ toolbox)
- **Scripts**: `concurrently`, `dotenv`

---

## Project Structure

```text
.
├─ frontend/                 # Next.js UI
│  ├─ app/
│  │  ├─ page.tsx            # Landing
│  │  ├─ auth/page.tsx       # Login/Register
│  │  ├─ dashboard/page.tsx  # User dashboard
│  │  └─ officer/page.tsx    # Officer dashboard
│  ├─ lib/api.ts             # API URL helper
│  └─ .env                   # NEXT_PUBLIC_API_URL
├─ backend-deploy/           # Express API
│  ├─ src/
│  │  ├─ index.ts            # app + routes + middleware
│  │  ├─ lib/                # auth, mongodb, redis, blockchain, security
│  │  ├─ routes/             # auth, waste, officer, wallet, transactions, users
│  │  └─ models/types.ts
│  ├─ .env                   # backend environment variables
│  ├─ docker-compose.yml     # production Docker setup
│  └─ package.json
├─ contracts/
│  └─ WasteCoin.sol          # ERC20 + roles
├─ docs/
│  ├─ deployment.md          # คู่มือ deployment ละเอียด
│  └─ bug-report.md          # รายการ bug ที่แก้แล้ว
├─ scripts/
│  ├─ verify-setup.js
│  └─ generate-secrets.js
├─ hardhat.config.ts
└─ package.json              # root scripts (compile/test/deploy contract)
```

---

## Environment Variables

### Backend (`backend-deploy/.env`)

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb+srv://<user>:<password>@<cluster>.mongodb.net/<dbname>
MONGODB_DB=waste-coin-db

JWT_SECRET=<64-char hex string>
ENCRYPTION_SECRET=<64-char hex string>

SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your-api-key>
OFFICER_PRIVATE_KEY=0x<your-officer-private-key>
WASTE_COIN_CONTRACT_ADDRESS=0x<your-contract-address>

CORS_ORIGIN=http://localhost:3000
REDIS_URL=redis://localhost:6379

ENABLE_WALLET_EXPORT=false
UPLOAD_MAX_SIZE_MB=5
UPLOAD_DIR=public/uploads
```

### Frontend (`frontend/.env`)

```env
NEXT_PUBLIC_API_URL=http://localhost:5000
```

> **หมายเหตุ**: `NEXT_PUBLIC_*` ต้อง restart frontend เมื่อเปลี่ยนค่า

สร้าง secrets ด้วย:
```bash
npm run generate-secrets
```

---

## How to Run (Development)

### Prerequisites

- Node.js `>= 18`
- Redis (รันอยู่ที่ `localhost:6379`)
- MongoDB Atlas (หรือ local)
- RPC URL สำหรับ Sepolia (Alchemy/Infura)
- Contract ถูก deploy แล้ว และมี `WASTE_COIN_CONTRACT_ADDRESS`

### Install

```bash
# Root (hardhat tooling)
npm install

# Frontend
cd frontend && npm install && cd ..

# Backend
cd backend-deploy && npm install && cd ..
```

### Run Services

เปิด **2 terminal** แยกกัน:

**Terminal 1 — Backend:**
```bash
cd backend-deploy
npm run dev
# → http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# → http://localhost:3000
```

### Dev URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Health check | http://localhost:5000/health |

### Start Redis (ถ้ายังไม่ได้รัน)

```bash
# Windows (หลังติดตั้งผ่าน winget)
Start-Service -Name "Redis"

# macOS
brew services start redis

# Docker
docker run -d -p 6379:6379 redis:7-alpine
```

---

## API (Backend)

Base URL (dev): `http://localhost:5000`

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Waste

- `POST /api/waste/submit` (ต้องมี Bearer token)
- `GET /api/waste/pending` (Officer only)
- `POST /api/waste/approve` (Officer only)

### Wallet

- `GET /api/wallet/balance` (ต้องมี Bearer token)
- `GET /api/wallet/info` (ต้องมี Bearer token)
- `POST /api/wallet/transfer` (ต้องมี Bearer token)
- `GET /api/wallet/export` (ต้องมี Bearer token)

### Transactions

- `GET /api/transactions/history` (ต้องมี Bearer token)

### Officer

- `POST /api/officer/add-coins` (Officer only)
- `GET /api/officer/transactions` (Officer only)

### Users (Officer)

- `GET /api/users/list` (Officer only)

### Health

- `GET /health` — ตรวจสอบ server
- `GET /ready` — ตรวจสอบ database connection

---

## Smart Contract

Contract หลัก: `contracts/WasteCoin.sol`

- ERC20: ชื่อ `WasteCoin`, symbol `WST`, 18 decimals
- `mintCoins(to, amount, reason)` จำกัดสิทธิ์ด้วย `OFFICER_ROLE`
- มี `pause/unpause` สำหรับ emergency stop

### Contract Commands (Hardhat)

```bash
npm run compile
npm run test:contract
npm run deploy:sepolia
```

---

## Utility Scripts

- `npm run verify-setup`
  - ตรวจ Node.js version, ตรวจว่ามี `.env.local`, และตรวจ key variables เบื้องต้น
- `npm run generate-secrets`
  - สร้าง `JWT_SECRET` และ `ENCRYPTION_SECRET` สำหรับนำไปใส่ใน `.env`

---

## Notes (Security)

- ระบบนี้เป็น **custodial wallet**: private key ของผู้ใช้ถูกเก็บใน DB แบบเข้ารหัส และถูกถอดรหัสชั่วคราวเพื่อเซ็นธุรกรรมบน backend
- ห้ามนำ endpoint `GET /api/wallet/export` ไปเปิดใช้งานใน production โดยไม่มีมาตรการเพิ่มเติม (เช่น re-auth, audit log, rate limit)
- ตั้งค่า `ENABLE_WALLET_EXPORT=false` ใน production เสมอ
