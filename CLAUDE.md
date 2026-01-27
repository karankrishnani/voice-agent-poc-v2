# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Insurance Voice AI Agent POC - An AI voice agent that autonomously calls insurance company IVR systems to check prior authorization status. The system navigates phone trees using DTMF tones, provides member information via voice, and extracts structured authorization data.

## Architecture

Three-component system running on separate ports:

| Component | Port | Purpose |
|-----------|------|---------|
| **Backend** | 3001 | Express API server, Twilio webhooks, SQLite database |
| **Dashboard** | 3000 | React + Vite frontend |
| **Mock IVR** | 3002 | Simulated insurance phone system (TwiML responses) |

**Webhook-driven flow**: Backend doesn't stream audio continuously. Twilio captures IVR speech, posts to `/agent/voice` webhook, backend analyzes and returns TwiML instructions. Session state is stored in-memory keyed by Twilio's `CallSid`.

The `/agent` directory contains scaffolded Python code (Pipecat/Deepgram/ElevenLabs/Claude) for future production implementation - the POC uses Twilio's built-in services.

## Common Commands

### Full Development Setup
```bash
./init.sh                    # Install all deps, init DB, start all servers
```

### Individual Components

**Backend (Express API)**
```bash
cd backend
npm run dev                  # Start with --watch (port 3001)
npm run db:reset             # Reset database (delete + init + seed)
```

**Dashboard (React/Vite)**
```bash
cd dashboard
npm run dev                  # Start dev server (port 3000)
npm run build                # Production build
npm run lint                 # ESLint check
```

**Mock IVR**
```bash
cd mock-ivr
npm run dev                  # Start with --watch (port 3002)
npm run tunnel               # Run ngrok tunnel for Twilio webhooks
```

### Webhook Setup for Real Calls
```bash
# Terminal 1: Expose backend to Twilio
ngrok http 3001
# Copy URL to .env as AGENT_WEBHOOK_URL

# Terminal 2: Expose Mock IVR (if using as test target)
ngrok http 3002
# Configure as Twilio phone number's voice webhook
```

### Simulation Mode (No Twilio)
```bash
curl -X POST http://localhost:3001/api/calls/1/simulate
```

## Key Files

- `backend/src/index.js` - Main API server, all routes and webhook handlers
- `backend/src/db/schema.sql` - Database schema (members, prior_authorizations, calls, call_events)
- `mock-ivr/src/index.js` - TwiML IVR logic and phone tree simulation
- `dashboard/src/pages/*.jsx` - Dashboard, NewCall, CallDetail, TestData, Settings pages
- `dashboard/vite.config.js` - Vite config with `/api/*` proxy to backend

## Mock IVR Test Data Behavior

Member ID prefixes determine authorization status:
- `ABC*` → Approved
- `DEF*` → Denied
- `GHI*` → Pending
- Other → Not Found

## Database

SQLite via sql.js (in-memory with auto-save every 30 seconds to `backend/data/database.sqlite`).

Reset: `rm backend/data/database.sqlite` then restart backend.

## API Endpoints

**Calls**: `POST /api/calls` (initiate), `GET /api/calls` (list), `GET /api/calls/:id` (details), `GET /api/calls/:id/status` (poll)

**Webhooks** (Twilio): `POST /agent/voice`, `POST /agent/status`

**Data**: `/api/members`, `/api/prior-auths` (standard CRUD)

## Environment Variables

Required for real calls (see `.env.example`):
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`
- `AGENT_WEBHOOK_URL` (ngrok URL for backend)
- `IVR_PHONE_NUMBER` (target phone number to call)

## Tech Stack

- **Backend**: Express.js (ES modules), sql.js, Twilio SDK
- **Frontend**: React 18, Vite, Tailwind CSS, react-router-dom, lucide-react
- **Mock IVR**: Express.js, TwiML generation
- **Scaffolded Agent**: Pipecat, Deepgram, ElevenLabs, Anthropic Claude
- **Runtime**: Node.js 18+
