# WasteCoin — Deployment Guide

คู่มือการ deploy ระบบ **WasteCoin (WST)** ครอบคลุมทั้งโหมด **Local Development** และ **Production**

---

## สารบัญ

- [Architecture Overview](#architecture-overview)
- [Prerequisites](#prerequisites)
- [Environment Variables](#environment-variables)
- [Local Development](#local-development)
- [Production (Docker Compose)](#production-docker-compose)
- [Production (Manual)](#production-manual)
- [Smart Contract Deployment](#smart-contract-deployment)
- [Health Check & Verification](#health-check--verification)
- [Troubleshooting](#troubleshooting)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│                   Client Browser                │
└──────────────────────┬──────────────────────────┘
                       │ HTTP
                       ▼
┌─────────────────────────────────────────────────┐
│         Frontend — Next.js (Port 3000)          │
│   app/auth  │  app/dashboard  │  app/officer    │
└──────────────────────┬──────────────────────────┘
                       │ REST API (HTTP/HTTPS)
                       ▼
┌─────────────────────────────────────────────────┐
│         Backend — Express API (Port 5000)       │
│  /api/auth  │  /api/waste  │  /api/wallet  ...  │
└──────┬───────────────┬──────────────────────────┘
       │               │
       ▼               ▼
┌────────────┐  ┌─────────────────────────────────┐
│   Redis    │  │   MongoDB Atlas / Local          │
│  (6379)    │  │  collections: users, wallets,    │
│  Sessions/ │  │  waste_submissions, transactions │
│  Revoke    │  └─────────────────────────────────┘
└────────────┘
                       │ ethers v6
                       ▼
┌─────────────────────────────────────────────────┐
│       Ethereum Sepolia Testnet                  │
│    Contract: WasteCoin.sol (ERC20 + Roles)      │
└─────────────────────────────────────────────────┘
```

---

## Prerequisites

### Software Required

| Software | Version | หมายเหตุ |
|---|---|---|
| Node.js | `>= 18` | แนะนำ LTS |
| npm | `>= 9` | มากับ Node.js |
| Redis | `>= 6` | สำหรับ token revocation |
| MongoDB | Atlas หรือ local `>= 6` | |
| Docker (optional) | `>= 24` | สำหรับ production deploy |

### External Services Required

| Service | ใช้ทำอะไร | วิธีรับ |
|---|---|---|
| **MongoDB Atlas** | Database หลัก | [mongodb.com/atlas](https://mongodb.com/atlas) |
| **Infura / Alchemy** | Sepolia RPC URL | [infura.io](https://infura.io) หรือ [alchemy.com](https://alchemy.com) |
| **Ethereum Wallet** | Officer private key สำหรับ mint | สร้างผ่าน MetaMask หรือ `npm run generate-secrets` |
| **Sepolia ETH** | Gas fee สำหรับ mint transactions | [Sepolia faucet](https://sepoliafaucet.com) |

---

## Environment Variables

### Backend (`backend-deploy/.env`)

คัดลอกจาก `.env.example` แล้วกรอกค่า:

```bash
cp backend-deploy/.env.example backend-deploy/.env
```

| Variable | ค่าตัวอย่าง (Dev) | คำอธิบาย |
|---|---|---|
| `PORT` | `5000` | Port ของ backend server |
| `NODE_ENV` | `development` | `development` หรือ `production` |
| `MONGODB_URI` | `mongodb+srv://...` | MongoDB connection string |
| `MONGODB_DB` | `waste-coin-db` | ชื่อ database |
| `JWT_SECRET` | *(random 64 hex chars)* | Secret สำหรับ sign JWT |
| `ENCRYPTION_SECRET` | *(random 64 hex chars)* | Secret สำหรับ encrypt private keys |
| `SEPOLIA_RPC_URL` | `https://sepolia.infura.io/v3/...` | Ethereum Sepolia RPC endpoint |
| `OFFICER_PRIVATE_KEY` | `0x...` | Private key ของ Officer wallet |
| `WASTE_COIN_CONTRACT_ADDRESS` | `0x...` | Address ของ smart contract |
| `CORS_ORIGIN` | `http://localhost:3000` | Frontend URL ที่อนุญาต (production) |
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |
| `ENABLE_WALLET_EXPORT` | `false` | เปิด/ปิด endpoint export private key |
| `UPLOAD_MAX_SIZE_MB` | `5` | ขนาดไฟล์อัปโหลดสูงสุด (MB) |

> **⚠️ สำคัญ**: สร้าง `JWT_SECRET` และ `ENCRYPTION_SECRET` ด้วย:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```
> หรือรัน `npm run generate-secrets` ที่ root

### Frontend (`frontend/.env`)

```bash
cp frontend/.env.example frontend/.env
```

| Variable | ค่า (Dev) | ค่า (Production) |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `http://localhost:5000` | `https://api.yourdomain.com` |

> **หมายเหตุ**: `NEXT_PUBLIC_*` ต้อง rebuild frontend เมื่อเปลี่ยนค่า

---

## Local Development

### 1. Clone & Install

```bash
git clone <repo-url>
cd project

# ติดตั้ง dependencies ทั้งหมด
npm install
cd frontend && npm install && cd ..
cd backend-deploy && npm install && cd ..
```

### 2. ตั้งค่า Environment

```bash
# Backend
cp backend-deploy/.env.example backend-deploy/.env
# แก้ไข backend-deploy/.env ให้ครบ

# Frontend
cp frontend/.env.example frontend/.env
# แก้ไข: NEXT_PUBLIC_API_URL=http://localhost:5000
```

### 3. เริ่ม Redis

**Windows (winget):**
```powershell
winget install --id Redis.Redis -e
# Redis จะถูก register เป็น Windows Service อัตโนมัติ
# ตรวจสอบ:
redis-cli ping  # ควรได้ PONG
```

**macOS (Homebrew):**
```bash
brew install redis
brew services start redis
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

**Docker (ทุก platform):**
```bash
docker run -d --name wastecoin-redis -p 6379:6379 redis:7-alpine
```

### 4. รัน Services

เปิด **2 terminal** แยกกัน:

**Terminal 1 — Backend:**
```bash
cd backend-deploy
npm run dev
# Server จะรันที่ http://localhost:5000
```

**Terminal 2 — Frontend:**
```bash
cd frontend
npm run dev
# Server จะรันที่ http://localhost:3000
```

### 5. ตรวจสอบ

```bash
# Backend health check
curl http://localhost:5000/health

# ควรได้:
# {"status":"ok","environment":"development","message":"WasteCoin Backend is running"}
```

เปิดเบราว์เซอร์ที่ `http://localhost:3000`

---

## Production (Docker Compose)

> ต้องมี Docker และ Docker Compose ติดตั้งในเครื่อง server

### 1. เตรียม Environment

```bash
# สร้างไฟล์ .env สำหรับ Docker Compose
cp backend-deploy/.env.example backend-deploy/.env
```

แก้ไข `backend-deploy/.env` ให้ครบ โดยเฉพาะ:
- `NODE_ENV=production`
- `CORS_ORIGIN=https://your-frontend-domain.com`
- `REDIS_URL=redis://redis:6379`  ← ใช้ชื่อ service แทน localhost

### 2. Build & Start

```bash
cd backend-deploy
docker compose up -d --build
```

Services ที่จะรัน:
| Container | Port | คำอธิบาย |
|---|---|---|
| `waste-coin-backend` | `3000` | Express API |
| `waste-coin-frontend` | `3001` | Next.js Frontend |
| `waste-coin-redis` | *(internal)* | Redis (internal only) |

### 3. ตรวจสอบ

```bash
# ดู status ของทุก container
docker compose ps

# ดู logs ของ backend
docker compose logs -f backend

# Health check
curl http://localhost:3000/health
```

### 4. หยุด Services

```bash
docker compose down

# หยุดและลบ volumes (ลบ Redis data ด้วย)
docker compose down -v
```

---

## Production (Manual)

### 1. Build Backend

```bash
cd backend-deploy
npm install --production=false
npm run build
# output จะอยู่ที่ backend-deploy/dist/
```

### 2. Run Backend

```bash
NODE_ENV=production node dist/index.js
```

หรือใช้ **PM2** (แนะนำ):
```bash
npm install -g pm2
pm2 start dist/index.js --name wastecoin-backend
pm2 save
pm2 startup
```

### 3. Build Frontend

```bash
cd frontend
npm install
npm run build
npm run start  # รันที่ port 3001
```

หรือใช้ PM2:
```bash
pm2 start npm --name wastecoin-frontend -- run start
```

### 4. Nginx Reverse Proxy (แนะนำ)

ตัวอย่าง config `/etc/nginx/sites-available/wastecoin`:

```nginx
# Frontend
server {
    listen 80;
    server_name yourdomain.com;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Backend API
server {
    listen 80;
    server_name api.yourdomain.com;

    location / {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header Host $host;
    }
}
```

---

## Smart Contract Deployment

> ทำครั้งเดียว — บันทึก address เพื่อใส่ใน `WASTE_COIN_CONTRACT_ADDRESS`

### 1. ตั้งค่า Hardhat

สร้าง `.env.local` ที่ root:

```env
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/<your-key>
OFFICER_PRIVATE_KEY=0x<your-officer-private-key>
```

### 2. Compile Contract

```bash
npm run compile
```

### 3. Test Contract

```bash
npm run test:contract
```

### 4. Deploy ไป Sepolia

```bash
npm run deploy:sepolia
```

> บันทึก contract address ที่ได้ แล้วนำไปใส่ใน `WASTE_COIN_CONTRACT_ADDRESS` ของ backend

### 5. Grant Officer Role

หลัง deploy ต้อง grant `OFFICER_ROLE` ให้กับ Officer wallet:

```javascript
// ตัวอย่างผ่าน Hardhat console
const contract = await ethers.getContractAt("WasteCoin", CONTRACT_ADDRESS);
const OFFICER_ROLE = await contract.OFFICER_ROLE();
await contract.grantRole(OFFICER_ROLE, OFFICER_WALLET_ADDRESS);
```

---

## Health Check & Verification

### Backend Endpoints

| Endpoint | Method | คำอธิบาย |
|---|---|---|
| `/health` | GET | ตรวจสอบว่า server ทำงานอยู่ |
| `/ready` | GET | ตรวจสอบ database connection |

```bash
# Health
curl http://localhost:5000/health
# Response: {"status":"ok","environment":"development",...}

# Readiness (DB check)
curl http://localhost:5000/ready
# Response: {"status":"ready","database":"ok",...}
```

### ตรวจสอบ Services ทั้งหมด

```bash
# Redis
redis-cli ping
# Expected: PONG

# Backend
curl http://localhost:5000/health

# Frontend
curl http://localhost:3000
```

---

## Troubleshooting

### ❌ `Failed to fetch` บน Login page

**สาเหตุ:** Frontend ชี้ไปผิด API URL

**แก้ไข:** ตรวจสอบ `frontend/.env`
```env
NEXT_PUBLIC_API_URL=http://localhost:5000  # ต้องตรงกับ backend PORT
```
แล้ว restart frontend

---

### ❌ `Redis: Connection is closed`

**สาเหตุ:** Redis ยังไม่ได้รัน

**แก้ไข (Windows):**
```powershell
# ตรวจสอบ Windows Service
Get-Service -Name "Redis"

# ถ้า Stopped ให้ start
Start-Service -Name "Redis"
```

**แก้ไข (Docker):**
```bash
docker run -d -p 6379:6379 redis:7-alpine
```

---

### ❌ `EADDRINUSE: address already in use`

**สาเหตุ:** Port ถูกใช้งานอยู่แล้ว

**แก้ไข (Windows):**
```powershell
# หา process ที่ใช้ port
Get-NetTCPConnection -LocalPort 5000 -State Listen | Select-Object OwningProcess

# Kill process
Stop-Process -Id <PID> -Force
```

**แก้ไข (Linux/macOS):**
```bash
lsof -ti:5000 | xargs kill -9
```

---

### ❌ `E11000 duplicate key error` (MongoDB index)

**สาเหตุ:** มี documents ที่ `user_id: null` อยู่ในฐานข้อมูล ขัดกับ unique index

**แก้ไข:** ระบบจะ clean up อัตโนมัติตอน startup (ดู `src/lib/db-indexes.ts`)
ถ้ายังมีปัญหา ให้ลบ collection แล้วรัน backend ใหม่

---

### ❌ Backend ไม่อ่านค่าใหม่จาก `.env`

**สาเหตุ:** nodemon ต้องการ restart ใหม่

**แก้ไข:** หยุด backend แล้วรันใหม่:
```bash
# กด Ctrl+C แล้ว
npm run dev
```

---

## Port Reference

| Service | Port (Dev) | Port (Docker) |
|---|---|---|
| Frontend (Next.js) | `3000` | `3001` |
| Backend (Express) | `5000` | `3000` |
| Redis | `6379` | *(internal)* |
| MongoDB | Atlas (cloud) | Atlas (cloud) |

---

## Current Dev URLs

| Service | URL |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:5000 |
| Backend Health | http://localhost:5000/health |
| Backend Ready | http://localhost:5000/ready |
