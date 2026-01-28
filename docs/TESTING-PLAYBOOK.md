# Testing Playbook

How to test the Voice Agent from the UI.

## Prerequisites

### 1. Environment Setup

Ensure `.env` is configured with:
```bash
# Twilio credentials
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...

# Target IVR (mock or real)
IVR_PHONE_NUMBER=+1...

# Public URLs (via ngrok)
AGENT_PUBLIC_URL=https://xxxx.ngrok-free.app
AGENT_WEBSOCKET_URL=wss://xxxx.ngrok-free.app/ws

# Claude API
ANTHROPIC_API_KEY=sk-ant-...
```

### 2. Start All Servers

**Terminal 1 - Backend (Node.js)**
```bash
cd backend
npm run dev
# Runs on http://localhost:3001
```

**Terminal 2 - Dashboard (React)**
```bash
cd dashboard
npm run dev
# Runs on http://localhost:3000
```

**Terminal 3 - Mock IVR (Node.js)**
```bash
cd mock-ivr
npm run dev
# Runs on http://localhost:3002
```

**Terminal 4 - Python Agent**
```bash
cd agent
uvicorn src.server:app --host 0.0.0.0 --port 8000 --reload
# Runs on http://localhost:8000
```

**Terminal 5 - ngrok tunnels**
```bash
cd /path/to/voice-agent-poc-v2
ngrok start --all --config ngrok.yml
```

This starts tunnels defined in the project's `ngrok.yml`:
- `agent` → localhost:8000 (Python agent)
- `mock-ivr` → localhost:3002 (Mock IVR)

After starting, copy the agent URL to `.env`:
- `AGENT_PUBLIC_URL=https://xxxx.ngrok-free.app`
- `AGENT_WEBSOCKET_URL=wss://xxxx.ngrok-free.app/ws`

### 3. Verify All Services

```bash
# Check backend
curl http://localhost:3001/api/members

# Check Python agent
curl http://localhost:8000/health
# Should show: "claude_handler_ready": true

# Check mock IVR
curl http://localhost:3002/health
```

---

## Test Procedure

### Step 1: Open Dashboard

Navigate to http://localhost:3000 in your browser.

You should see:
- "System Online" indicator (green)
- Dashboard with call statistics
- Navigation: Dashboard, New Call, Test Data, Settings

### Step 2: Initiate a Call

1. Click **"New Call"** in the navigation
2. Select a member from the dropdown (e.g., "John Smith (ABC123456)")
3. Enter or click a CPT code (e.g., "27447")
4. Ensure **"Streaming Mode (Phase 2)"** is toggled ON
5. Optionally select an IVR Provider Profile (or leave as "Random")
6. Click **"Start Call"**

The UI should show:
- "DIALING" status
- "Streaming call initiated..."
- Form fields become disabled

### Step 3: Monitor Agent Logs

In the Python agent terminal, watch for:

```
# Session lookup (verifies fix)
Looked up session data for call_id=xxx: {'member_id': 'ABC123456', ...}

# Context creation
Context created: call_id=xxx, member_id=ABC123456

# IVR prompts
IVR said: For English, press 1.

# Claude decisions
Decision: type=ActionType.DTMF, value=1, confidence=1.0

# Responses sent
Sending response: {"type": "sendDigits", "digits": "1"}
```

**Or use this one-liner to filter logs:**
```bash
tail -f /tmp/agent.log | grep -E "(IVR said|Decision:|Sending response|Context created|Looked up)"
```

### Step 4: Verify Call Completion

After the call ends, check:

1. **Agent logs** - Should show `status=completed` or call failure reason
2. **Dashboard** - Refresh page, click on the call in "Recent Calls"
3. **Call Details** - Shows member ID, CPT code, duration, transcript (if integration working)

---

## Expected Test Results

### Member ID Prefix Behavior (Mock IVR)

| Member ID Prefix | Expected Outcome |
|------------------|------------------|
| `ABC*` | Approved |
| `DEF*` | Denied |
| `GHI*` | Pending |
| Other | Not Found |

### Successful Call Flow

1. IVR: "Welcome to ABC Insurance"
2. IVR: "For English, press 1" → Agent: DTMF 1
3. IVR: "For prior authorization, press 2" → Agent: DTMF 2
4. IVR: "Enter member ID" → Agent: Speaks "A B C 1 2 3 4 5 6"
5. IVR: "Enter date of birth" → Agent: Speaks DOB
6. IVR: "Authorization PA-12345 is approved through..." → Agent: Extracts data
7. Call ends with extracted authorization info

---

## Troubleshooting

### "claude_handler_ready": false

**Cause:** Anthropic SDK version mismatch

**Fix:**
```bash
pip install --upgrade anthropic
# Restart agent
```

### "MessageHandler not initialized"

**Cause:** Claude handler failed at startup

**Check:** Look at agent startup logs for error details

### UI Stuck on "DIALING"

**Cause:** Known bug - UI polls backend, but streaming calls go through Python agent

**Workaround:** Refresh page after call completes

### Empty Transcript

**Cause:** Known bug - Python agent doesn't POST transcripts to backend

**Status:** Tracked in OUTSTANDING-BUGS.md

### Call Loops / Fails with Uncertainty

**Cause:** Poor STT quality from ConversationRelay

**Symptoms:**
- Garbled transcriptions like "A pre mail" instead of "Para español"
- Agent keeps pressing 9 (repeat)
- "Max uncertainty reached"

**Status:** Tracked in OUTSTANDING-BUGS.md

---

## Quick Test Commands

### Start a call via API (bypassing UI)

```bash
# Via Python agent directly
curl -X POST http://localhost:8000/outbound-call \
  -H "Content-Type: application/json" \
  -d '{"member_id": "ABC123456", "cpt_code": "27447", "date_of_birth": "1965-03-15"}'

# Via backend (uses configured webhook)
curl -X POST http://localhost:3001/api/calls \
  -H "Content-Type: application/json" \
  -d '{"member_id": "ABC123456", "prior_auth_id": 1}'
```

### Check active sessions

```bash
curl http://localhost:8000/health
# Shows "active_sessions" count
```

### View recent calls

```bash
curl http://localhost:3001/api/calls | jq '.[0:3]'
```

---

## Log Locations

| Component | Log Location |
|-----------|--------------|
| Python Agent | `/tmp/agent.log` or terminal output |
| Backend | Terminal output |
| Mock IVR | Terminal output |
| Dashboard | Browser console (F12) |
