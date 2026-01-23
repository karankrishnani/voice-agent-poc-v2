## YOUR ROLE - INITIALIZER AGENT (Session 1 of Many)

You are the FIRST agent in a long-running autonomous development process.
Your job is to set up the foundation for all future coding agents.

This is a **Voice AI Agent** project - it involves telephony, not just web development.

### FIRST: Read the Project Specification

Start by reading `app_spec.txt` in your working directory. This file contains
the complete specification for:
- Voice AI agent that makes phone calls
- Mock insurance IVR system
- Dashboard for monitoring calls
- Backend API and database

Read it carefully before proceeding.

### CRITICAL FIRST TASK: Create Features

Based on `app_spec.txt`, create features using the feature_create_bulk tool.

**Target: 75 features** (as specified in app_spec.txt)

Features should cover these categories:

#### A. Mock IVR System (~15 features)
```
- IVR welcome message plays correctly
- DTMF input routes to correct menu
- Prior auth menu options work
- Member ID collection via voice prompt
- DOB collection via voice prompt  
- CPT code collection via voice prompt
- Auth lookup returns correct status (approved case)
- Auth lookup returns correct status (denied case)
- Auth lookup returns correct status (pending case)
- Auth lookup returns not found for unknown member
- Invalid member ID handled gracefully
- Hold simulation works
- Transfer simulation works
- Error handling for malformed input
- TwiML responses are valid XML
```

#### B. Voice AI Agent Core (~20 features)
```
- Agent can initiate outbound call via Twilio
- Agent detects call answered
- Agent detects voicemail/no answer
- Agent can send DTMF tones
- Agent speech recognition receives text
- Agent can speak via TTS
- State machine transitions: IDLE to DIALING
- State machine transitions: DIALING to NAVIGATING_MENU
- State machine transitions: NAVIGATING_MENU to PROVIDING_INFO
- State machine handles hold detection
- State machine handles call completion
- State machine handles call failure
- Agent navigates to prior auth menu (press 2)
- Agent navigates to status check (press 1)
- Agent speaks member ID when prompted
- Agent speaks DOB when prompted
- Agent speaks CPT code when prompted
- Agent waits for and captures final response
- Agent extracts auth number from response
- Agent extracts status from response
- Agent extracts valid date from response
- Agent handles "not found" response
- Agent gracefully handles disconnect
- Transcript logged for entire call
```

#### C. Backend API (~15 features)
```
- GET /api/members returns member list
- POST /api/members creates new member
- GET /api/members/:id returns single member
- DELETE /api/members/:id removes member
- GET /api/prior-auths returns auth list
- POST /api/prior-auths creates new auth
- GET /api/prior-auths/:id returns single auth
- PUT /api/prior-auths/:id updates auth
- DELETE /api/prior-auths/:id removes auth
- POST /api/calls initiates new call
- GET /api/calls returns call history
- GET /api/calls/:id returns call details
- GET /api/calls/:id/status returns real-time status
- POST /api/webhooks/twilio handles call events
- GET /api/stats returns success metrics
```

#### D. Dashboard UI (~20 features)
```
- Dashboard page loads without errors
- Dashboard shows call statistics
- Dashboard shows recent calls list
- Call status badges display correctly
- New Call page loads
- Member dropdown populated from API
- CPT code input with validation
- Start Call button initiates call
- Real-time call status display during call
- Transcript updates live during call
- Call Detail page loads
- Call metadata displays correctly
- Extracted data card shows auth info
- Full transcript viewer works
- Transcript alternates colors for speakers
- Test Data page loads
- Members CRUD operations work
- Prior Auths CRUD operations work
- Seed data button works
- Settings page loads
- Responsive layout on mobile
- Dark/light theme works
```

#### E. Integration & End-to-End (~5 features)
```
- Full call flow: dashboard → agent → mock IVR → result displayed
- Call with approved auth returns correct extracted data
- Call with denied auth returns correct extracted data  
- Call with not found returns appropriate message
- Multiple sequential calls work correctly
```

**Use the feature_create_bulk tool:**

```
Use the feature_create_bulk tool with features=[
  {
    "category": "functional",
    "name": "IVR welcome message plays",
    "description": "When calling the mock IVR, the welcome message plays with menu options",
    "steps": [
      "Step 1: Call the mock IVR phone number",
      "Step 2: Wait for call to connect",
      "Step 3: Verify welcome message plays",
      "Step 4: Verify menu options are spoken (press 1, 2, 3)"
    ]
  },
  // ... more features
]
```

**IMPORTANT:** Create all 75 features before proceeding. You can batch them
(e.g., 25 at a time) if needed.

---

### SECOND TASK: Create init.sh

Create a script that future agents can use to set up the development environment:

```bash
#!/bin/bash

# Insurance Voice AI POC - Development Setup

echo "🏥 Insurance Voice AI POC - Starting Development Environment"

# Check for required environment variables
required_vars=(
  "TWILIO_ACCOUNT_SID"
  "TWILIO_AUTH_TOKEN"
  "TWILIO_PHONE_NUMBER"
  "DEEPGRAM_API_KEY"
  "ELEVENLABS_API_KEY"
  "ANTHROPIC_API_KEY"
)

missing_vars=()
for var in "${required_vars[@]}"; do
  if [ -z "${!var}" ]; then
    missing_vars+=("$var")
  fi
done

if [ ${#missing_vars[@]} -ne 0 ]; then
  echo "⚠️  Missing environment variables:"
  for var in "${missing_vars[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "Create a .env file with these variables or export them."
  echo "Some features (voice agent, mock IVR) require these to function."
  echo ""
fi

# Install dependencies
echo "📦 Installing dependencies..."

if [ -d "backend" ]; then
  cd backend && npm install && cd ..
fi

if [ -d "dashboard" ]; then
  cd dashboard && npm install && cd ..
fi

if [ -d "mock-ivr" ]; then
  cd mock-ivr && npm install && cd ..
fi

if [ -d "agent" ]; then
  cd agent && pip install -r requirements.txt && cd ..
fi

# Initialize database
echo "🗄️  Initializing database..."
if [ -d "backend" ]; then
  cd backend
  npm run db:migrate 2>/dev/null || node scripts/init-db.js
  npm run db:seed 2>/dev/null || node scripts/seed-data.js
  cd ..
fi

# Start services
echo "🚀 Starting services..."

# Start backend
if [ -d "backend" ]; then
  cd backend && npm run dev &
  BACKEND_PID=$!
  cd ..
  echo "   Backend API starting on http://localhost:3001"
fi

# Start dashboard
if [ -d "dashboard" ]; then
  cd dashboard && npm run dev &
  DASHBOARD_PID=$!
  cd ..
  echo "   Dashboard starting on http://localhost:3000"
fi

# Start mock IVR (if configured)
if [ -d "mock-ivr" ]; then
  cd mock-ivr && npm run dev &
  IVR_PID=$!
  cd ..
  echo "   Mock IVR starting on http://localhost:3002"
fi

# Wait for services to be ready
echo ""
echo "⏳ Waiting for services to start..."
sleep 5

# Health checks
echo ""
echo "🏥 Health Checks:"
curl -s http://localhost:3001/health > /dev/null && echo "   ✅ Backend API is running" || echo "   ❌ Backend API not responding"
curl -s http://localhost:3000 > /dev/null && echo "   ✅ Dashboard is running" || echo "   ❌ Dashboard not responding"
curl -s http://localhost:3002/health > /dev/null && echo "   ✅ Mock IVR is running" || echo "   ❌ Mock IVR not responding"

echo ""
echo "📋 Quick Reference:"
echo "   Dashboard:  http://localhost:3000"
echo "   API:        http://localhost:3001"
echo "   Mock IVR:   http://localhost:3002"
echo ""
echo "📞 To test the Mock IVR:"
echo "   1. Run: ngrok http 3002"
echo "   2. Configure Twilio webhook to the ngrok URL"
echo "   3. Call your Twilio number"
echo ""
echo "🛑 To stop all services: pkill -f 'node.*dev'"
```

### THIRD TASK: Create Project Structure

Set up the monorepo structure:

```
insurance-voice-ai-poc/
├── app_spec.txt              # Project specification
├── coding_prompt.md          # Instructions for coding agents
├── initializer_prompt.md     # This file
├── init.sh                   # Setup script
├── claude-progress.txt       # Progress tracking
├── README.md                 # Project documentation
├── .env.example              # Environment variable template
├── .gitignore
│
├── backend/                  # Express API server
│   ├── package.json
│   ├── src/
│   │   ├── index.js          # Entry point
│   │   ├── routes/
│   │   │   ├── members.js
│   │   │   ├── prior-auths.js
│   │   │   ├── calls.js
│   │   │   └── webhooks.js
│   │   ├── db/
│   │   │   ├── database.js   # SQLite connection
│   │   │   ├── schema.sql
│   │   │   └── seed-data.js
│   │   └── services/
│   │       └── twilio.js
│   └── scripts/
│       ├── init-db.js
│       └── seed-data.js
│
├── dashboard/                # React frontend
│   ├── package.json
│   ├── vite.config.js
│   ├── index.html
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── components/
│   │   │   ├── Layout.jsx
│   │   │   ├── CallStatusCard.jsx
│   │   │   ├── TranscriptViewer.jsx
│   │   │   └── StatusBadge.jsx
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── NewCall.jsx
│   │   │   ├── CallDetail.jsx
│   │   │   ├── TestData.jsx
│   │   │   └── Settings.jsx
│   │   ├── api/
│   │   │   └── client.js
│   │   └── styles/
│   │       └── index.css
│   └── tailwind.config.js
│
├── mock-ivr/                 # Twilio IVR simulation
│   ├── package.json
│   ├── src/
│   │   ├── index.js
│   │   ├── routes/
│   │   │   ├── welcome.js
│   │   │   ├── menu.js
│   │   │   ├── prior-auth.js
│   │   │   └── collect-info.js
│   │   └── twiml/
│   │       └── helpers.js
│   └── README.md
│
└── agent/                    # Voice AI agent (Python/Pipecat)
    ├── requirements.txt
    ├── src/
    │   ├── main.py
    │   ├── agent.py          # Main agent logic
    │   ├── state_machine.py  # Call state management
    │   ├── ivr_navigator.py  # IVR navigation logic
    │   ├── data_extractor.py # Result parsing
    │   └── config.py
    └── README.md
```

### FOURTH TASK: Initialize Git

```bash
git init
git add .
git commit -m "Initial setup: project structure, features, and configuration

- Created app_spec.txt with full project specification
- Generated 75 features via feature_create_bulk
- Set up monorepo structure (backend, dashboard, mock-ivr, agent)
- Created init.sh for environment setup
- Added README.md with project overview
"
```

### FIFTH TASK: Create Essential Files

**README.md:**
```markdown
# Insurance Prior Auth Voice AI Agent POC

A proof-of-concept demonstrating an AI voice agent that can autonomously 
call insurance company IVR systems to check prior authorization status.

## Components

- **Dashboard** (React): Web UI for initiating calls and viewing results
- **Backend** (Express): API server and database
- **Mock IVR** (Twilio): Simulated insurance phone system
- **Agent** (Pipecat): Voice AI that makes the calls

## Quick Start

1. Copy `.env.example` to `.env` and fill in API keys
2. Run `./init.sh` to install dependencies and start services
3. Open http://localhost:3000

## Required API Keys

- Twilio (account SID, auth token, phone number)
- Deepgram (speech-to-text)
- ElevenLabs (text-to-speech)
- Claude API (conversation orchestration)

## Testing the Mock IVR

1. Run `ngrok http 3002`
2. Configure Twilio webhook to the ngrok URL
3. Call your Twilio number
4. Navigate: Press 2 → Press 1 → Enter member info

## Demo Scenario

1. Open dashboard, go to "New Call"
2. Select test member ABC123456
3. Enter CPT code 27447
4. Click "Start Call"
5. Watch real-time status as agent calls mock IVR
6. View extracted auth data when complete
```

**.env.example:**
```
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1234567890

# Voice AI Services
DEEPGRAM_API_KEY=your_deepgram_key
ELEVENLABS_API_KEY=your_elevenlabs_key

# Claude API
ANTHROPIC_API_KEY=your_anthropic_key

# Server Ports
BACKEND_PORT=3001
DASHBOARD_PORT=3000
MOCK_IVR_PORT=3002

# Database
DATABASE_PATH=./data/database.sqlite
```

**.gitignore:**
```
node_modules/
__pycache__/
*.pyc
.env
.env.local
*.sqlite
*.db
dist/
build/
.DS_Store
*.log
.ngrok/
```

### SIXTH TASK: Create claude-progress.txt

```markdown
# Insurance Voice AI POC - Progress Tracking

## Session 1 - Initialization

### Accomplished
- Read and understood app_spec.txt
- Created 75 features covering:
  - Mock IVR system (15 features)
  - Voice AI agent (20 features)
  - Backend API (15 features)
  - Dashboard UI (20 features)
  - Integration/E2E (5 features)
- Set up project structure (monorepo)
- Created init.sh setup script
- Initialized git repository
- Created README and configuration files

### Current Status
- Features passing: 0/75
- Project structure: ✅ Created
- Backend: 🔲 Not started
- Dashboard: 🔲 Not started
- Mock IVR: 🔲 Not started
- Voice Agent: 🔲 Not started

### Next Session Should
1. Implement backend API with SQLite database
2. Create database schema and seed data
3. Build basic Express routes for members and prior-auths
4. Test API endpoints work correctly

### Environment Notes
- API keys needed (see .env.example)
- ngrok required for Twilio webhook testing
- Python environment needed for Pipecat agent

### Architecture Decisions
- Using SQLite for simplicity (easy to reset/seed)
- Monorepo structure for easy development
- Mock IVR separate from backend for isolation
- Pipecat chosen for voice agent (open source, flexible)
```

### OPTIONAL: Start Implementation

If you have time remaining, begin implementing the foundation:

**Priority 1: Backend Database**
- Set up SQLite connection
- Create schema (members, prior_authorizations, calls, call_events)
- Add seed data script

**Priority 2: Basic API Routes**
- GET/POST /api/members
- GET/POST /api/prior-auths

Get the next feature:
```
Use the feature_get_next tool
```

### ENDING THIS SESSION

Before your context fills up:

1. ✅ All features created (verify with feature_get_stats)
2. ✅ Project structure in place
3. ✅ Git repository initialized
4. ✅ claude-progress.txt updated
5. ✅ Environment ready for next session

The next agent will continue implementation with a fresh context window.

---

**Remember:** This POC has external dependencies (Twilio, Deepgram, etc.).
Focus first on components that can be built and tested independently:
1. Backend API and database
2. Dashboard UI
3. Mock IVR
4. Voice Agent (requires all API keys)

---

Begin by reading app_spec.txt, then create all 75 features.
