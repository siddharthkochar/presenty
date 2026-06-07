# Salary Manager

A web app for attendance tracking via face recognition and deterministic salary calculation with AI analytics.

## Tech Stack

- **Frontend:** React + Vite + TypeScript + Tailwind v4 + shadcn/ui
- **Face recognition:** face-api.js (in-browser, no API calls)
- **Database:** Supabase (Postgres + Storage)
- **API server:** Express + Node.js (Gemini AI analytics proxy)
- **Deployment:** Docker + docker-compose on Raspberry Pi
- **HTTPS:** Cloudflare Tunnel + nginx

## Features

- **Capture tab** — opens camera on load, captures frame every 60s during a set window, matches faces locally, logs attendance to Supabase
- **People tab** — register employees with photo, name, work-in time, salary, leave balance; face descriptor computed and stored locally
- **Salary tab** — select person + month + year to view deterministic breakdown: present days, absent, paid/unpaid leave, deduction, final pay
- **Analytics tab** — Gemini AI chat for questions like "who was absent most?" or "total payroll March"

## Salary Formula

```
working_days = calendar days in month (28–31)
per_day      = salary_per_month / working_days
absent       = working_days - days_present
paid_leave   = min(absent, monthly_leave_balance)   # resets monthly, no carryover
unpaid_leave = absent - paid_leave
deduction    = unpaid_leave × per_day
final_pay    = salary_per_month - deduction
```

Lateness is logged but not deducted in v1.

## Setup

### 1. Supabase

1. Create a project at https://supabase.com
2. SQL Editor → run `supabase/migrations/001_init.sql`
3. Storage → New bucket named `faces` → enable public access
4. Settings > API → copy Project URL, anon key, service role key

### 2. Environment Variables

Root `.env` (frontend):

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

`server/.env` (API server):

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-api-key
PORT=3001
```

Get Gemini API key at https://aistudio.google.com. Uses gemini-2.5-flash model.

### 3. Local Development

```sh
npm install
npm run dev          # frontend at http://localhost:5173

cd server
npm install
npx ts-node index.ts  # API at http://localhost:3001
```

Camera requires HTTPS in production; localhost is exempt for testing.

Add to `vite.config.ts` to proxy API locally:

```ts
server: {
  proxy: {
    '/api': { target: 'http://localhost:3001', rewrite: path => path.replace(/^\/api/, '') }
  }
}
```

### 4. Face Models

Model files are in `public/models/` and load automatically in the browser. Re-download if needed:

```sh
BASE=https://github.com/justadudewhohacks/face-api.js/raw/master/weights
cd public/models
for f in tiny_face_detector_model-weights_manifest.json tiny_face_detector_model-shard1 \
          face_landmark_68_model-weights_manifest.json face_landmark_68_model-shard1 \
          face_recognition_model-weights_manifest.json face_recognition_model-shard1 face_recognition_model-shard2; do
  curl -LO "$BASE/$f"
done
```

### 5. Docker Deployment (Raspberry Pi)

```sh
# Clone repo, fill both .env files, then:
docker compose up -d --build
```

Services:
- `web` → port 3000 (nginx serves Vite build, proxies `/api` to `api`)
- `api` → port 3001 (Express + Gemini)

### 6. nginx + Cloudflare Tunnel

Point subdomain at Pi port 3000. Example nginx block:

```nginx
server {
    listen 80;
    server_name salary.yourdomain.com;
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection upgrade;
    }
}
```

Cloudflare Tunnel handles HTTPS termination; no certificate needed on Pi.

### 7. Android Phone

- Open `https://salary.yourdomain.com` in Chrome
- Allow camera permission
- Chrome menu → Add to Home Screen
- Launch icon for full-screen experience

## Settings

Edit capture window and interval in Supabase `settings` table (single row):

| Column | Default | Description |
|--------|---------|-------------|
| `capture_start` | `08:00:00` | Start of capture window |
| `capture_end` | `11:00:00` | End of capture window |
| `capture_interval_sec` | `60` | Seconds between checks |
| `match_threshold` | `0.5` | Face match threshold (lower = stricter) |

## Project Structure

```
salary-manager/
├── src/
│   ├── features/
│   │   ├── CaptureTab.tsx    # camera loop + face match
│   │   ├── PeopleTab.tsx     # register/manage employees
│   │   ├── SalaryTab.tsx     # salary breakdown
│   │   └── AnalyticsTab.tsx  # AI chat
│   ├── lib/
│   │   ├── face.ts           # face-api.js wrapper
│   │   ├── salary.ts         # deterministic salary calc
│   │   └── supabase.ts       # DB client + types
│   └── components/ui/        # shadcn components
├── server/
│   └── index.ts              # Gemini analytics proxy
├── supabase/migrations/      # DB schema
├── public/models/            # face-api.js weights
├── docker-compose.yml
├── Dockerfile.web
└── Dockerfile.api
```
