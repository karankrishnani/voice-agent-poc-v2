"""
Phase 2: FastAPI WebSocket Server for Twilio ConversationRelay

This server handles real-time voice streaming using Twilio's ConversationRelay
for improved IVR navigation with Claude-based decision making.

See docs/PHASE2-STREAMING.md for architecture details.

Endpoints:
- GET  /          - Health check
- GET  /health    - Health check with status details
- WS   /ws        - WebSocket endpoint for ConversationRelay
- POST /twiml     - TwiML endpoint for Twilio to fetch call instructions
"""

import os
import json
import asyncio
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Response
from fastapi.responses import HTMLResponse, PlainTextResponse
from loguru import logger
from pydantic import BaseModel
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

# Configure logging
logger.add(
    "logs/agent_{time}.log",
    rotation="10 MB",
    retention="7 days",
    level="DEBUG",
    format="{time:YYYY-MM-DD HH:mm:ss} | {level: <8} | {name}:{function}:{line} - {message}"
)

app = FastAPI(
    title="Insurance Voice AI Agent",
    description="Phase 2 WebSocket server for Twilio ConversationRelay",
    version="2.0.0"
)

# Store active WebSocket sessions
active_sessions: Dict[str, Dict[str, Any]] = {}


class SessionContext(BaseModel):
    """Context for an active voice session."""
    call_id: str
    member_id: Optional[str] = None
    cpt_code: Optional[str] = None
    date_of_birth: Optional[str] = None
    state: str = "CONNECTED"
    transcript: list = []
    connected_at: datetime = datetime.now()


# ============ REST Endpoints ============

@app.get("/")
async def root():
    """Root endpoint - health check."""
    return {
        "service": "Insurance Voice AI Agent",
        "version": "2.0.0",
        "phase": 2,
        "status": "healthy",
        "websocket_endpoint": "/ws"
    }


@app.get("/health")
async def health():
    """Detailed health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_sessions": len(active_sessions),
        "environment": {
            "anthropic_key": "configured" if os.getenv("ANTHROPIC_API_KEY") else "missing",
            "backend_url": os.getenv("BACKEND_URL", "http://localhost:3001"),
            "websocket_url": os.getenv("AGENT_WEBSOCKET_URL", "not set")
        }
    }


@app.post("/twiml")
async def twiml_endpoint(request: Request):
    """
    TwiML endpoint for Twilio to fetch call instructions.

    Returns TwiML that connects the call to our WebSocket via ConversationRelay.
    """
    # Get call parameters from Twilio
    form_data = await request.form()
    call_sid = form_data.get("CallSid", "unknown")

    logger.info(f"TwiML request for CallSid: {call_sid}")

    # Get WebSocket URL from environment
    websocket_url = os.getenv("AGENT_WEBSOCKET_URL", "ws://localhost:8000/ws")

    # Generate TwiML with ConversationRelay
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay
            url="{websocket_url}"
            voice="Polly.Matthew"
            language="en-US"
            transcriptionProvider="deepgram"
            speechModel="nova-2"
            ttsProvider="elevenlabs"
            interruptible="true"
            dtmfDetection="true">
            <Parameter name="call_sid" value="{call_sid}"/>
        </ConversationRelay>
    </Connect>
</Response>"""

    return Response(content=twiml, media_type="application/xml")


# ============ WebSocket Handler ============

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """
    WebSocket endpoint for Twilio ConversationRelay.

    Handles bidirectional communication:
    - Receives: setup, prompt (transcribed speech), dtmf, interrupted, error
    - Sends: text (TTS), sendDigits (DTMF), end

    See: https://www.twilio.com/docs/voice/conversationrelay/websocket-messages
    """
    await websocket.accept()
    session_id = None

    logger.info("WebSocket connection accepted")

    try:
        while True:
            # Receive message from Twilio
            data = await websocket.receive_text()
            message = json.loads(data)

            msg_type = message.get("type", "unknown")
            logger.debug(f"Received: {msg_type} - {json.dumps(message, indent=2)[:500]}")

            if msg_type == "setup":
                # Connection setup - extract call parameters
                session_id = message.get("callSid", f"session_{datetime.now().timestamp()}")
                custom_params = message.get("customParameters", {})

                logger.info(f"Setup received for session: {session_id}")
                logger.info(f"Custom parameters: {custom_params}")

                # Create session context
                active_sessions[session_id] = {
                    "context": SessionContext(
                        call_id=custom_params.get("call_id", session_id),
                        member_id=custom_params.get("member_id"),
                        cpt_code=custom_params.get("cpt_code"),
                        date_of_birth=custom_params.get("date_of_birth")
                    ),
                    "websocket": websocket
                }

                # No response needed for setup - wait for IVR to speak first
                logger.info(f"Session {session_id} initialized, waiting for IVR prompt")

            elif msg_type == "prompt":
                # Received transcribed speech from IVR
                voice_prompt = message.get("voicePrompt", "")
                logger.info(f"IVR said: {voice_prompt}")

                if session_id and session_id in active_sessions:
                    session = active_sessions[session_id]
                    session["context"].transcript.append({
                        "speaker": "IVR",
                        "text": voice_prompt,
                        "timestamp": datetime.now().isoformat()
                    })

                    # Process the prompt and decide response
                    response = await process_ivr_prompt(voice_prompt, session["context"])

                    if response:
                        logger.info(f"Sending response: {response}")
                        await websocket.send_text(json.dumps(response))

            elif msg_type == "dtmf":
                # DTMF digit received from IVR (inbound)
                digit = message.get("digit", "")
                logger.info(f"DTMF received: {digit}")

            elif msg_type == "interrupted":
                # Our speech was interrupted
                logger.info("Agent speech was interrupted")

            elif msg_type == "error":
                # Error from ConversationRelay
                error_msg = message.get("description", "Unknown error")
                logger.error(f"ConversationRelay error: {error_msg}")

            else:
                logger.warning(f"Unknown message type: {msg_type}")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        # Clean up session
        if session_id and session_id in active_sessions:
            del active_sessions[session_id]
            logger.info(f"Session {session_id} cleaned up")


async def process_ivr_prompt(prompt: str, context: SessionContext) -> Optional[Dict[str, Any]]:
    """
    Process an IVR prompt and determine the appropriate response.

    This is a simplified version - Phase 2 will add Claude-based decision making.

    Args:
        prompt: The transcribed IVR speech
        context: The current session context

    Returns:
        Response message to send via WebSocket, or None
    """
    prompt_lower = prompt.lower()

    # Log to transcript
    context.transcript.append({
        "speaker": "Agent",
        "action": "processing",
        "prompt": prompt,
        "timestamp": datetime.now().isoformat()
    })

    # Main menu detection - press 2 for prior authorization
    if "prior authorization" in prompt_lower and "press 2" in prompt_lower:
        context.state = "IN_MENU"
        context.transcript.append({"speaker": "Agent", "text": "*pressed 2*"})
        return {"type": "sendDigits", "digits": "2"}

    # Prior auth submenu - press 1 for status check
    if "check" in prompt_lower and "status" in prompt_lower and "press 1" in prompt_lower:
        context.state = "PROVIDING_INFO"
        context.transcript.append({"speaker": "Agent", "text": "*pressed 1*"})
        return {"type": "sendDigits", "digits": "1"}

    if "existing authorization" in prompt_lower and "press 1" in prompt_lower:
        context.state = "PROVIDING_INFO"
        context.transcript.append({"speaker": "Agent", "text": "*pressed 1*"})
        return {"type": "sendDigits", "digits": "1"}

    # Member ID prompt
    if "member id" in prompt_lower and context.member_id:
        context.transcript.append({"speaker": "Agent", "text": context.member_id})
        # Use text for alphanumeric, DTMF for numeric-only
        if context.member_id.isdigit():
            return {"type": "sendDigits", "digits": context.member_id}
        else:
            # Spell out for clarity
            spelled = " ".join(list(context.member_id))
            return {"type": "text", "token": spelled}

    # Date of birth prompt
    if "date of birth" in prompt_lower and context.date_of_birth:
        # Convert YYYY-MM-DD to MMDDYYYY
        if "-" in context.date_of_birth:
            parts = context.date_of_birth.split("-")
            dob_digits = parts[1] + parts[2] + parts[0]  # MMDDYYYY
        else:
            dob_digits = context.date_of_birth
        context.transcript.append({"speaker": "Agent", "text": dob_digits})
        return {"type": "sendDigits", "digits": dob_digits}

    # CPT code prompt
    if ("cpt" in prompt_lower or "procedure code" in prompt_lower) and context.cpt_code:
        context.state = "WAITING_RESPONSE"
        context.transcript.append({"speaker": "Agent", "text": context.cpt_code})
        return {"type": "sendDigits", "digits": context.cpt_code}

    # Authorization result detection
    if "authorization" in prompt_lower and any(s in prompt_lower for s in ["approved", "denied", "pending", "not found"]):
        context.state = "COMPLETE"
        logger.info(f"Authorization result detected: {prompt}")
        # End the call after receiving the result
        return {"type": "end"}

    # No action needed - continue listening
    return None


# ============ Application Startup ============

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    logger.info("=" * 50)
    logger.info("Insurance Voice AI Agent - Phase 2")
    logger.info("=" * 50)
    logger.info(f"Environment: {os.getenv('ENVIRONMENT', 'development')}")
    logger.info(f"Backend URL: {os.getenv('BACKEND_URL', 'http://localhost:3001')}")
    logger.info(f"WebSocket URL: {os.getenv('AGENT_WEBSOCKET_URL', 'not configured')}")
    logger.info("WebSocket endpoint: /ws")
    logger.info("TwiML endpoint: /twiml")
    logger.info("=" * 50)

    # Create logs directory if it doesn't exist
    os.makedirs("logs", exist_ok=True)


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown."""
    logger.info("Shutting down Insurance Voice AI Agent")

    # Close any active sessions
    for session_id in list(active_sessions.keys()):
        try:
            session = active_sessions[session_id]
            if "websocket" in session:
                await session["websocket"].close()
        except Exception as e:
            logger.error(f"Error closing session {session_id}: {e}")
        finally:
            del active_sessions[session_id]

    logger.info("Shutdown complete")


# ============ Run directly for development ============

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )
