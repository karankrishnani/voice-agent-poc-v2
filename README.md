# Insurance Prior Auth Voice AI Agent POC

A proof-of-concept demonstrating an AI voice agent that can autonomously call insurance company IVR systems to check prior authorization status.

## Overview

This POC showcases how voice AI can automate the tedious process of calling insurance companies to check prior authorization status. The agent:

1. Dials an insurance IVR phone number
2. Navigates the phone tree using DTMF tones
3. Provides member information when prompted
4. Extracts structured data from the authorization response

**Target audience:** Healthcare technology companies looking to automate patient access workflows (prior auth, benefits verification, claim status).

## Components

| Component | Technology | Port | Description |
|-----------|------------|------|-------------|
| **Dashboard** | React + Vite + Tailwind | 3000 | Web UI for initiating calls and viewing results |
| **Backend** | Express + SQLite | 3001 | API server and database |
| **Mock IVR** | Express + TwiML | 3002 | Simulated insurance phone system |
| **Agent** | Python + Pipecat | - | Voice AI that makes the calls |

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.9+ (for voice agent)
- Twilio account with phone number
- API keys (see below)

### Setup

1. Clone and enter the directory:
   ```bash
   cd insurance-voice-ai-poc
   ```

2. Copy environment template and fill in your API keys:
   ```bash
   cp .env.example .env
   # Edit .env with your actual keys
   ```

3. Run the setup script:
   ```bash
   ./init.sh
   ```

4. Open the dashboard at http://localhost:3000

## Required API Keys

| Service | Key Name | Purpose | Free Tier |
|---------|----------|---------|-----------|
| Twilio | TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER | Telephony | ~$1/month + usage |
| Deepgram | DEEPGRAM_API_KEY | Speech-to-text | Yes |
| ElevenLabs | ELEVENLABS_API_KEY | Text-to-speech | Yes |
| Anthropic | ANTHROPIC_API_KEY | Conversation AI | API credits required |

## Testing the Mock IVR

The mock IVR simulates a real insurance company phone system:

1. Start ngrok to expose local server:
   ```bash
   ngrok http 3002
   ```

2. Configure your Twilio phone number:
   - Go to Twilio Console > Phone Numbers
   - Set webhook URL to: `https://YOUR-NGROK-URL.ngrok.io/voice`

3. Call your Twilio number and navigate the menu:
   - Press 2 for Prior Authorization
   - Press 1 to check status
   - Enter member ID, DOB, and CPT code

## Demo Scenario

1. Open dashboard, go to "New Call"
2. Select test member `ABC123456`
3. Enter CPT code `27447`
4. Click "Start Call"
5. Watch real-time status as agent calls mock IVR
6. View extracted auth data when complete

## Project Structure

```
insurance-voice-ai-poc/
├── backend/              # Express API server
│   ├── src/
│   │   ├── routes/       # API endpoints
│   │   ├── db/           # Database schema and queries
│   │   └── services/     # Business logic
│   └── scripts/          # DB init and seed scripts
│
├── dashboard/            # React frontend
│   ├── src/
│   │   ├── components/   # Reusable UI components
│   │   ├── pages/        # Page components
│   │   ├── api/          # API client
│   │   └── styles/       # CSS/Tailwind
│
├── mock-ivr/             # Twilio IVR simulation
│   ├── src/
│   │   ├── routes/       # TwiML endpoints
│   │   └── twiml/        # TwiML helpers
│
└── agent/                # Voice AI agent (Pipecat)
    ├── src/
    │   ├── agent.py      # Main agent logic
    │   ├── state_machine.py
    │   └── ivr_navigator.py
    └── requirements.txt
```

## API Endpoints

### Members
- `GET /api/members` - List all test members
- `POST /api/members` - Create new member
- `GET /api/members/:id` - Get member by ID
- `DELETE /api/members/:id` - Delete member

### Prior Authorizations
- `GET /api/prior-auths` - List all prior auths
- `POST /api/prior-auths` - Create new auth
- `GET /api/prior-auths/:id` - Get auth by ID
- `PUT /api/prior-auths/:id` - Update auth
- `DELETE /api/prior-auths/:id` - Delete auth

### Calls
- `POST /api/calls` - Initiate new call
- `GET /api/calls` - List call history
- `GET /api/calls/:id` - Get call details with transcript
- `GET /api/calls/:id/status` - Get real-time call status

### Stats & Webhooks
- `GET /api/stats` - Get success metrics
- `POST /api/webhooks/twilio` - Handle Twilio events

## Development

### Running Individual Components

```bash
# Backend only
cd backend && npm run dev

# Dashboard only
cd dashboard && npm run dev

# Mock IVR only
cd mock-ivr && npm run dev

# Agent (Python)
cd agent && python src/main.py
```

### Database

The backend uses SQLite for simplicity. To reset:

```bash
cd backend
rm -f data/database.sqlite
node scripts/init-db.js
node scripts/seed-data.js
```

## Mock IVR Flow

```
Welcome Message
├── Press 1: Claims
├── Press 2: Prior Authorization
│   ├── Press 1: Check Status
│   │   ├── Enter Member ID (9 digits)
│   │   ├── Enter DOB (MMDDYYYY)
│   │   ├── Enter CPT Code
│   │   └── Response: Approved/Denied/Pending/Not Found
│   ├── Press 2: New Request
│   └── Press 0: Representative
├── Press 3: Member Services
└── Press 9: Repeat Menu
```

## Success Metrics

The POC targets:
- 90%+ success rate on mock IVR calls
- Average call duration under 60 seconds
- Accurate data extraction on successful calls
- Graceful failure handling

## Future Enhancements

Not in scope for POC, but planned:
- Support for real insurance company IVRs
- Multiple IVR navigation profiles
- Batch call processing
- Integration with EHR systems
- Prior auth submission (not just status check)
- Appeals filing workflow
- Analytics and reporting

## License

Private - All rights reserved
