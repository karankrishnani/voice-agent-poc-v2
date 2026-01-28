"""
Phase 2: FastAPI WebSocket Server for Twilio ConversationRelay

This server handles real-time voice streaming using Twilio's ConversationRelay
for improved IVR navigation with Claude-based decision making.

See docs/PHASE2-STREAMING.md for architecture details.

Endpoints:
- GET  /              - Health check
- GET  /health        - Health check with status details
- GET  /twiml/{call_id} - TwiML endpoint for Twilio (Feature 83)
- POST /outbound-call - Initiate outbound Twilio call (Feature 84)
- WS   /ws            - WebSocket endpoint for ConversationRelay
"""

import os
import json
import asyncio
import uuid
from typing import Dict, Any, Optional
from datetime import datetime

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Response, HTTPException
from fastapi.responses import HTMLResponse, PlainTextResponse
from loguru import logger
from pydantic import BaseModel
from dotenv import load_dotenv
from twilio.rest import Client as TwilioClient
from twilio.base.exceptions import TwilioRestException

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '..', '.env'))

# Initialize Twilio client (optional - only if credentials are configured)
twilio_client: Optional[TwilioClient] = None
TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_PHONE_NUMBER = os.getenv("TWILIO_PHONE_NUMBER")

if TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN:
    twilio_client = TwilioClient(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)

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


class OutboundCallRequest(BaseModel):
    """Request body for initiating an outbound call."""
    member_id: str
    cpt_code: str
    date_of_birth: str
    ivr_phone_number: Optional[str] = None  # Override target phone number


class OutboundCallResponse(BaseModel):
    """Response body for outbound call initiation."""
    call_id: str
    call_sid: str
    status: str
    twiml_url: str
    message: str


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
        "twilio_configured": twilio_client is not None,
        "environment": {
            "anthropic_key": "configured" if os.getenv("ANTHROPIC_API_KEY") else "missing",
            "backend_url": os.getenv("BACKEND_URL", "http://localhost:3001"),
            "websocket_url": os.getenv("AGENT_WEBSOCKET_URL", "not set")
        }
    }


@app.post("/outbound-call", response_model=OutboundCallResponse)
async def initiate_outbound_call(request: OutboundCallRequest):
    """
    Feature 84: Initiate an outbound call via Twilio.

    Creates a Twilio call with TwiML URL pointing to our ConversationRelay endpoint.
    The call will connect to the IVR and use our WebSocket for real-time voice handling.

    See docs/PHASE2-STREAMING.md Data Flow section for architecture details.

    Args:
        request: OutboundCallRequest with member_id, cpt_code, date_of_birth

    Returns:
        OutboundCallResponse with call_id, call_sid, status, twiml_url

    Raises:
        HTTPException 503: If Twilio is not configured
        HTTPException 500: If Twilio API call fails
    """
    logger.info(f"Outbound call request: member={request.member_id}, cpt={request.cpt_code}")

    # Check if Twilio is configured
    if not twilio_client:
        logger.error("Twilio client not configured - missing credentials")
        raise HTTPException(
            status_code=503,
            detail="Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN."
        )

    # Generate a unique call ID for this session
    call_id = str(uuid.uuid4())

    # Get target phone number (IVR to call)
    ivr_phone_number = request.ivr_phone_number or os.getenv("IVR_PHONE_NUMBER")
    if not ivr_phone_number:
        raise HTTPException(
            status_code=400,
            detail="No IVR phone number provided and IVR_PHONE_NUMBER env var not set"
        )

    # Get our public URL for TwiML (must be accessible by Twilio)
    agent_public_url = os.getenv("AGENT_PUBLIC_URL", os.getenv("AGENT_WEBHOOK_URL", "http://localhost:8000"))
    twiml_url = f"{agent_public_url}/twiml/{call_id}"
    status_callback_url = f"{agent_public_url}/call-status/{call_id}"

    logger.info(f"Creating Twilio call: to={ivr_phone_number}, from={TWILIO_PHONE_NUMBER}")
    logger.info(f"TwiML URL: {twiml_url}")
    logger.info(f"Status callback: {status_callback_url}")

    try:
        # Create the outbound call via Twilio
        call = twilio_client.calls.create(
            to=ivr_phone_number,
            from_=TWILIO_PHONE_NUMBER,
            url=twiml_url,
            status_callback=status_callback_url,
            status_callback_event=["initiated", "ringing", "answered", "completed"],
            status_callback_method="POST",
            record=True  # Record the call for debugging
        )

        logger.info(f"Twilio call created: sid={call.sid}, status={call.status}")

        # Store call metadata in active sessions for later WebSocket connection
        active_sessions[call_id] = {
            "call_sid": call.sid,
            "member_id": request.member_id,
            "cpt_code": request.cpt_code,
            "date_of_birth": request.date_of_birth,
            "status": call.status,
            "created_at": datetime.now().isoformat()
        }

        return OutboundCallResponse(
            call_id=call_id,
            call_sid=call.sid,
            status=call.status,
            twiml_url=twiml_url,
            message=f"Call initiated successfully to {ivr_phone_number}"
        )

    except TwilioRestException as e:
        logger.error(f"Twilio API error: {e.code} - {e.msg}")
        raise HTTPException(
            status_code=500,
            detail=f"Twilio API error: {e.msg}"
        )
    except Exception as e:
        logger.error(f"Unexpected error initiating call: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to initiate call: {str(e)}"
        )


@app.post("/call-status/{call_id}")
async def call_status_callback(call_id: str, request: Request):
    """
    Twilio status callback endpoint.

    Receives status updates from Twilio as the call progresses.
    """
    form_data = await request.form()
    call_sid = form_data.get("CallSid")
    call_status = form_data.get("CallStatus")

    logger.info(f"Call status update: call_id={call_id}, sid={call_sid}, status={call_status}")

    # Update session if it exists
    if call_id in active_sessions:
        active_sessions[call_id]["status"] = call_status

    return {"received": True}


@app.get("/twiml/{call_id}")
async def twiml_get_endpoint(call_id: str):
    """
    GET TwiML endpoint for Twilio to fetch call instructions.

    Feature 83: Returns valid TwiML with ConversationRelay configuration.

    Args:
        call_id: The call ID for context/logging

    Returns:
        TwiML that connects the call to our WebSocket via ConversationRelay.
        Must include Deepgram STT, ElevenLabs TTS, and dtmfDetection.
    """
    logger.info(f"GET TwiML request for call_id: {call_id}")

    # Get WebSocket URL from environment
    websocket_url = os.getenv("AGENT_WEBSOCKET_URL", "ws://localhost:8000/ws")

    # Generate TwiML with ConversationRelay
    # Feature 83 requirements:
    # - <Connect><ConversationRelay> structure
    # - transcriptionProvider=deepgram
    # - ttsProvider=elevenlabs
    # - dtmfDetection=true
    # Minimal TwiML - use Twilio's default STT/TTS (Google + Polly)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay
            url="{websocket_url}"
            dtmfDetection="true">
            <Parameter name="call_id" value="{call_id}"/>
        </ConversationRelay>
    </Connect>
</Response>"""

    return Response(content=twiml, media_type="application/xml")


@app.post("/twiml/{call_id}")
async def twiml_post_endpoint(call_id: str, request: Request):
    """
    POST TwiML endpoint for Twilio to fetch call instructions.

    Twilio often uses POST for TwiML requests. This handles the same as GET.
    """
    logger.info(f"POST TwiML request for call_id: {call_id}")

    # Get WebSocket URL from environment
    websocket_url = os.getenv("AGENT_WEBSOCKET_URL", "ws://localhost:8000/ws")

    # Minimal TwiML - use Twilio's default STT/TTS (Google + Polly)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay
            url="{websocket_url}"
            dtmfDetection="true">
            <Parameter name="call_id" value="{call_id}"/>
        </ConversationRelay>
    </Connect>
</Response>"""

    return Response(content=twiml, media_type="application/xml")


@app.post("/twiml")
async def twiml_endpoint(request: Request):
    """
    POST TwiML endpoint for Twilio to fetch call instructions (legacy support).

    Returns TwiML that connects the call to our WebSocket via ConversationRelay.
    """
    # Get call parameters from Twilio
    form_data = await request.form()
    call_sid = form_data.get("CallSid", "unknown")

    logger.info(f"POST TwiML request for CallSid: {call_sid}")

    # Get WebSocket URL from environment
    websocket_url = os.getenv("AGENT_WEBSOCKET_URL", "ws://localhost:8000/ws")

    # Minimal TwiML - use Twilio's default STT/TTS (Google + Polly)
    twiml = f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Connect>
        <ConversationRelay
            url="{websocket_url}"
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
