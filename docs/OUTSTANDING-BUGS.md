# Outstanding Bugs

## Bug 1: Poor STT Quality / Timing Issue
**Status:** Open
**Severity:** High
**Component:** Twilio ConversationRelay STT

**Description:**
The speech-to-text transcription from Twilio's ConversationRelay produces garbled output for some IVR prompts, causing Claude to be uncertain and the call to fail.

**Example:**
- IVR says: "Para español, presione 2" (or similar)
- STT transcribes as: "A pre mail, 2"
- Claude correctly identifies this as unclear and returns `uncertain`

**Additional Issue:**
The agent responds to "For English, press 1" immediately, before the IVR finishes reading all menu options. This causes a loop where:
1. Agent presses 1 for English
2. IVR continues with Spanish option (which agent receives as next prompt)
3. Agent is uncertain, presses 9 to repeat
4. Loop repeats

**Possible Fixes:**
1. Wait for a pause/silence before responding (accumulate prompts)
2. Improve prompt to Claude to recognize partial menu options
3. Configure ConversationRelay STT settings for better accuracy
4. Add pattern matching to filter out obvious "other language" menu options

---

## Bug 2: Missing Transcript Integration (Python → Backend)
**Status:** Open
**Severity:** Medium
**Component:** Python Agent → Backend Integration

**Description:**
The Python agent stores conversation transcripts in memory (`ConversationContext`) but never sends them to the Node.js backend. The dashboard shows empty "Conversation Transcript" section for streaming calls.

**Root Cause:**
No code exists in the Python agent to POST transcript updates to the backend's API endpoints.

**Backend endpoints available:**
- `PUT /api/calls/:callSid/complete` - accepts `transcript` field
- `PUT /api/calls/:callSid/failed` - accepts `transcript` field
- `PUT /api/calls/:id` - accepts `transcript` field

**Fix Required:**
Add code to Python agent (`server.py` or `message_handlers.py`) to POST transcript updates to backend after each IVR interaction or at call completion.

---

## Bug 3: UI Stuck on "DIALING" for Streaming Calls
**Status:** Open
**Severity:** Low
**Component:** Dashboard ↔ Python Agent

**Description:**
When initiating a streaming call from the dashboard, the UI sometimes stays stuck on "DIALING" / "Call in Progress" even after the call completes.

**Root Cause:**
The dashboard polls the backend for call status, but the Python agent's `/outbound-call` endpoint creates calls that the backend doesn't track the same way.

**Workaround:**
Refresh the page after call completes.

**Fix Required:**
Ensure Python agent updates backend call status via API, or have dashboard poll Python agent directly.

---

## Bug 4: Duration Shows "s" (Empty)
**Status:** Open
**Severity:** Low
**Component:** Backend / Python Agent

**Description:**
Call details page shows "Duration: s" instead of actual duration (e.g., "Duration: 34s").

**Root Cause:**
`duration_seconds` field is not being calculated/stored when call completes.

**Fix Required:**
Calculate duration from `started_at` to `ended_at` timestamps and store in database.

---

## Resolved Bugs

### ~~Bug: Claude Handler Not Initialized~~
**Status:** FIXED (2026-01-28)
**Resolution:** Upgraded `anthropic` package from 0.34.2 to 0.76.0

**Original Issue:**
```
Failed to initialize Claude handlers: Client.__init__() got an unexpected keyword argument 'proxies'
```

**Root Cause:**
Version mismatch - `anthropic 0.34.2` passed deprecated `proxies` argument that `httpx 0.28.1` no longer accepts.

---

### ~~Bug: Member Data Passed Over Wire via TwiML~~
**Status:** FIXED (2026-01-28)
**Resolution:** Implemented server-side session lookup (Option A)

**Original Issue:**
Member ID, CPT code, and DOB were being passed as TwiML parameters through Twilio, causing data to potentially be truncated or mangled.

**Fix:**
TwiML now only passes `call_id`. Session data is looked up server-side from `active_sessions` when WebSocket connects.
