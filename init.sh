#!/bin/bash

# Insurance Voice AI POC - Development Setup

echo "======================================"
echo "Insurance Voice AI POC"
echo "Development Environment Setup"
echo "======================================"
echo ""

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
  echo "Warning: Missing environment variables:"
  for var in "${missing_vars[@]}"; do
    echo "   - $var"
  done
  echo ""
  echo "Create a .env file with these variables or export them."
  echo "Some features (voice agent, mock IVR) require these to function."
  echo ""
fi

# Check for Node.js
if ! command -v node &> /dev/null; then
  echo "Error: Node.js is required but not installed."
  echo "Please install Node.js 18+ and try again."
  exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
  echo "Warning: Node.js 18+ recommended. Found: $(node -v)"
fi

# Check for Python (for agent)
if ! command -v python3 &> /dev/null; then
  echo "Warning: Python 3 not found. The voice agent requires Python."
fi

# Install dependencies
echo "Installing dependencies..."
echo ""

if [ -d "backend" ]; then
  echo "Installing backend dependencies..."
  cd backend && npm install && cd ..
fi

if [ -d "dashboard" ]; then
  echo "Installing dashboard dependencies..."
  cd dashboard && npm install && cd ..
fi

if [ -d "mock-ivr" ]; then
  echo "Installing mock IVR dependencies..."
  cd mock-ivr && npm install && cd ..
fi

if [ -d "agent" ] && [ -f "agent/requirements.txt" ]; then
  echo "Installing agent dependencies..."
  cd agent
  if command -v python3 &> /dev/null; then
    python3 -m pip install -r requirements.txt --quiet
  fi
  cd ..
fi

# Initialize database
echo ""
echo "Initializing database..."
if [ -d "backend" ]; then
  cd backend
  if [ -f "scripts/init-db.js" ]; then
    node scripts/init-db.js
  fi
  if [ -f "scripts/seed-data.js" ]; then
    node scripts/seed-data.js
  fi
  cd ..
fi

# Start services
echo ""
echo "Starting services..."
echo ""

# Store PIDs for cleanup
PIDS=()

# Start backend
if [ -d "backend" ]; then
  cd backend && npm run dev &
  PIDS+=($!)
  cd ..
  echo "   Backend API starting on http://localhost:3001"
fi

# Start dashboard
if [ -d "dashboard" ]; then
  cd dashboard && npm run dev &
  PIDS+=($!)
  cd ..
  echo "   Dashboard starting on http://localhost:3000"
fi

# Start mock IVR (if configured)
if [ -d "mock-ivr" ]; then
  cd mock-ivr && npm run dev &
  PIDS+=($!)
  cd ..
  echo "   Mock IVR starting on http://localhost:3002"
fi

# Wait for services to be ready
echo ""
echo "Waiting for services to start..."
sleep 5

# Health checks
echo ""
echo "Health Checks:"
curl -s http://localhost:3001/health > /dev/null 2>&1 && echo "   Backend API is running" || echo "   Backend API not responding"
curl -s http://localhost:3000 > /dev/null 2>&1 && echo "   Dashboard is running" || echo "   Dashboard not responding"
curl -s http://localhost:3002/health > /dev/null 2>&1 && echo "   Mock IVR is running" || echo "   Mock IVR not responding"

echo ""
echo "======================================"
echo "Quick Reference"
echo "======================================"
echo "   Dashboard:  http://localhost:3000"
echo "   API:        http://localhost:3001"
echo "   Mock IVR:   http://localhost:3002"
echo ""
echo "To test the Mock IVR:"
echo "   1. Run: ngrok http 3002"
echo "   2. Configure Twilio webhook to the ngrok URL"
echo "   3. Call your Twilio number"
echo ""
echo "To stop all services:"
echo "   pkill -f 'node.*dev'"
echo "======================================"

# Keep script running to maintain background processes
wait
