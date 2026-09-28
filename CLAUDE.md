# Virtual Hospital — CLAUDE.md

ไฟล์นี้ให้บริบทแก่ AI coding assistant เกี่ยวกับโปรเจกต์ **Virtual Hospital (vhos)** ของโรงพยาบาลราชบุรี

---

## ภาพรวมโปรเจกต์

ระบบ Virtual Hospital เป็นเว็บแอปพลิเคชันภายในองค์กร สำหรับบริหารจัดการ:
- การลงทะเบียนผู้ป่วย (Registrations) จาก HosXP
- เคส Telemedicine (with-doctor / no-doctor / appointments)
- การคัดกรองเบื้องต้น (Prescreening)
- การจัดการผู้ใช้งานระบบ (Admin Users)
- ตั้งค่า Cron job อัตโนมัติ (เช่น ส่ง LINE notify)

---

## โครงสร้างโปรเจกต์

```
virtual-hospital/
├── frontend/                  # React + Vite (SPA)
│   ├── src/
│   │   ├── App.jsx            # Root router (React Router v7)
│   │   ├── main.jsx
│   │   ├── index.css          # Global styles (Vanilla CSS)
│   │   ├── api/               # Fetch wrappers ไปยัง backend
│   │   ├── components/        # Shared components (Layout, ProtectedRoute ฯลฯ)
│   │   ├── context/           # AuthContext (JWT session)
│   │   └── pages/             # หน้าต่าง ๆ ของแอป
│   ├── dist/                  # Production build (Vite output — ห้ามแก้มือ)
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── backend/                   # Node.js + Express (API server)
│   ├── server.js              # Entry point — middleware + route mount
│   ├── config/
│   │   └── database.js        # MariaDB connection pools (pool_hos, pool_vhos)
│   ├── routes/                # Express routers แยกตาม feature
│   │   ├── auth.js            # POST /api/login, /api/logout, GET /api/me
│   │   ├── lineid.js          # GET /api/lineid, /api/lineid/today
│   │   ├── telemed.js         # POST /api/create-link
│   │   ├── admin.js           # CRUD /api/admin-users
│   │   ├── telemed-cases.js   # GET /api/telemed-cases
│   │   ├── cronSettings.js    # GET/PUT /api/cron-settings
│   │   └── prescreening.js    # GET/POST /api/prescreening
│   ├── middleware/            # Express middleware (auth guard ฯลฯ)
│   ├── helpers/               # Utility functions
│   ├── cron/
│   │   └── scheduler.js       # node-cron jobs
│   └── package.json
│
└── virtual-hospital.conf      # Nginx config (reverse proxy + static serve)
```

---

## Tech Stack

| Layer      | Technology |
|------------|------------|
| Frontend   | React 19, React Router v7, Vite 8 |
| Styling    | Vanilla CSS (`index.css`) — ห้ามใช้ Tailwind |
| Backend    | Node.js, Express 5 (CommonJS) |
| Database   | MariaDB (2 pools: HosXP DB + vhos DB) |
| Auth       | JWT ใน HTTP-only Cookie |
| Security   | helmet, express-rate-limit, CORS |
| Cron       | node-cron |
| Web Server | Nginx (reverse proxy → port 3001) |

---

## Database

มี 2 connection pools ใน [`backend/config/database.js`](./backend/config/database.js):

| Pool | ตัวแปร env | ใช้งาน |
|------|------------|--------|
| `pool_hos` | `HOSXP_DB_*` | อ่านข้อมูลจาก HosXP (read-only) |
| `pool_vhos` | `VHOS_DB_*` | ฐานข้อมูลของ vhos เอง (read/write) |

ค่า env อยู่ที่ `backend/.env` (ไม่ commit ใน git)

---

## API Routes

| Method | Path | ไฟล์ route | คำอธิบาย |
|--------|------|------------|----------|
| POST | `/api/login` | auth.js | เข้าสู่ระบบ → set JWT cookie |
| POST | `/api/logout` | auth.js | ล้าง cookie |
| GET | `/api/me` | auth.js | ตรวจสอบ session ปัจจุบัน |
| GET | `/api/lineid` | lineid.js | รายการผู้ป่วย LINE ID ทั้งหมด |
| GET | `/api/lineid/today` | lineid.js | ผู้ป่วยที่ลงทะเบียนวันนี้ |
| POST | `/api/create-link` | telemed.js | สร้าง Telemed link |
| GET/POST/PUT/DELETE | `/api/admin-users` | admin.js | จัดการผู้ใช้ระบบ |
| GET | `/api/telemed-cases` | telemed-cases.js | เคส Telemedicine |
| GET/PUT | `/api/cron-settings` | cronSettings.js | ตั้งค่า Cron |
| GET/POST | `/api/prescreening` | prescreening.js | Prescreening |

---

## Frontend Pages

| Path | Component | คำอธิบาย |
|------|-----------|----------|
| `/login` | `LoginPage` | หน้า login (ไม่ต้อง auth) |
| `/` | `TodayRegistrations` | รายการลงทะเบียนวันนี้ |
| `/all` | `AllRegistrations` | รายการลงทะเบียนทั้งหมด |
| `/settings` | `SettingsPage` | ตั้งค่าระบบ + Cron + Admin Users |
| `/telemed-with-doctor` | `TelemedCasesPage` | เคส Telemed มีแพทย์ |
| `/telemed-no-doctor` | `TelemedCasesPage` | เคส Telemed ไม่มีแพทย์ |
| `/telemed-appointments` | `TelemedCasesPage` | นัดหมาย Telemed |
| `/prescreening` | `PrescreeningPage` | คัดกรองเบื้องต้น |

Route ที่ต้อง login ทั้งหมดถูกครอบด้วย `ProtectedRoute` → ถ้าไม่มี session redirect ไป `/login`

---

## Dev Commands

### Frontend
```bash
cd frontend
npm run dev      # dev server (Vite HMR)
npm run build    # build → dist/
npm run lint     # ESLint
```

### Backend
```bash
cd backend
npm start        # node server.js (port 3001)
```

### Deploy (Production)
1. `cd frontend && npm run build` → ได้ `dist/`
2. Nginx serve `dist/` เป็น static
3. Nginx proxy `/api/*` → `http://127.0.0.1:3001`
4. Config Nginx: [`virtual-hospital.conf`](./virtual-hospital.conf)

---

## Security Constraints

- **Authentication**: JWT อยู่ใน HTTP-only Cookie เท่านั้น — ห้ามเก็บใน `localStorage`
- **SQL**: ใช้ parameterized queries (`?` placeholder) ทุก query — ห้าม string interpolation
- **Helmet**: เปิดอยู่เสมอ — อย่าปิด CSP โดยไม่มีเหตุผล
- **Rate Limiting**: 300 req / 15 min (general) — route `/api/login` ควรมี stricter limit
- **CORS**: ปัจจุบัน `cors()` แบบ open — ควร whitelist origin ใน production
- **Body size**: จำกัด `1mb` ทั้ง Nginx และ Express
- **Hidden files**: Nginx block `/.` ทุก path

---

## Coding Conventions

### Frontend
- Component: PascalCase (`MyComponent.jsx`)
- ฟังก์ชัน/ตัวแปร: camelCase
- ใช้ `fetch` ผ่าน wrapper ใน `src/api/` เท่านั้น (ไม่เรียก fetch ตรงในหน้า)
- CSS: ใช้ CSS class จาก `index.css` — ห้ามใช้ inline style ยกเว้นจำเป็น
- ไม่ใช้ TypeScript (JS เท่านั้น)

### Backend
- Module system: CommonJS (`require` / `module.exports`)
- ทุก route handler ต้อง `try/catch` และ return JSON error ที่มีความหมาย
- DB query ต้องคืน connection กลับ pool เสมอ (ใช้ `finally { conn.release() }`)
- Env vars: อ่านจาก `process.env.*` เท่านั้น — ห้าม hardcode credentials

---

## สิ่งที่ควรระวัง

- `pool_hos` (HosXP) — **read-only** ห้าม INSERT/UPDATE/DELETE
- `dist/` directory — **อย่าแก้ไขโดยตรง** ให้ build ใหม่เสมอ
- `backend/.env` — ไม่อยู่ใน git ต้องตั้งค่าใหม่บนเซิร์ฟเวอร์
- Backend ใช้ Express 5 (breaking changes จาก v4 เช่น async error handling)
- React Router v7 ใช้ `<Routes>` + `<Route>` แบบ nested (ไม่ใช่ v5 style)
