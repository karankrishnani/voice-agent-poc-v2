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

# Import Claude-based message handling (Feature 85, 90)
from .message_handlers import MessageHandler, WebSocketResponse
from .retry_handler import RetryHandler
from .context import ConversationContext, CallState

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

# Store active WebSocket sessions (for call metadata before WebSocket connects)
active_sessions: Dict[str, Dict[str, Any]] = {}

# Global handlers for Claude-based IVR navigation (initialized at startup)
message_handler: Optional[MessageHandler] = None
retry_handler: Optional[RetryHandler] = None


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
    active_context_count = len(message_handler.contexts) if message_handler else 0
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "active_sessions": active_context_count,
        "twilio_configured": twilio_client is not None,
        "claude_handler_ready": message_handler is not None,
        "retry_handler_ready": retry_handler is not None,
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

    Uses Claude-based MessageHandler for intelligent IVR navigation (Feature 85, 90).

    Handles bidirectional communication:
    - Receives: setup, prompt (transcribed speech), dtmf, interrupted, error
    - Sends: text (TTS), sendDigits (DTMF), end

    See: https://www.twilio.com/docs/voice/conversationrelay/websocket-messages
    """
    global message_handler, retry_handler

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

            # Extract session_id from setup message or use existing
            if msg_type == "setup":
                session_id = message.get("callSid", f"session_{datetime.now().timestamp()}")
                logger.info(f"Setup received for session: {session_id}")

            # Use MessageHandler to process all message types
            if message_handler:
                response, context = await message_handler.handle_message(data, session_id)

                # Record activity for silence timeout tracking
                if retry_handler and context:
                    retry_handler.record_activity(context.call_id)

                # Send response if one was generated
                if response:
                    response_json = response.to_json()
                    logger.info(f"Sending response: {response_json}")
                    await websocket.send_text(response_json)
            else:
                # Fallback if handler not initialized (shouldn't happen)
                logger.error("MessageHandler not initialized - cannot process message")

    except WebSocketDisconnect:
        logger.info(f"WebSocket disconnected for session: {session_id}")
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
        import traceback
        logger.error(traceback.format_exc())
    finally:
        # Clean up session context and retry tracking
        if session_id:
            if message_handler:
                message_handler.remove_context(session_id)
            if retry_handler:
                context = message_handler.get_context(session_id) if message_handler else None
                if context:
                    retry_handler.reset_all_tracking(context.call_id)
            logger.info(f"Session {session_id} cleaned up")


# ============ Application Startup ============

@app.on_event("startup")
async def startup_event():
    """Initialize application on startup."""
    global message_handler, retry_handler

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

    # Initialize Claude-based message handler (Feature 85, 90)
    try:
        message_handler = MessageHandler()
        retry_handler = RetryHandler()
        logger.info("Claude MessageHandler and RetryHandler initialized successfully")
    except Exception as e:
        logger.error(f"Failed to initialize Claude handlers: {e}")
        logger.warning("Server will start but Claude-based navigation will not work")
        # Don't raise - allow server to start for health checks etc.


@app.on_event("shutdown")
async def shutdown_event():
    """Cleanup on application shutdown."""
    global message_handler, retry_handler

    logger.info("Shutting down Insurance Voice AI Agent")

    # Clean up all MessageHandler contexts
    if message_handler:
        for session_id in list(message_handler.contexts.keys()):
            try:
                context = message_handler.contexts[session_id]
                if retry_handler:
                    retry_handler.reset_all_tracking(context.call_id)
                message_handler.remove_context(session_id)
            except Exception as e:
                logger.error(f"Error cleaning up session {session_id}: {e}")

    # Clean up any remaining active_sessions (legacy)
    for session_id in list(active_sessions.keys()):
        try:
            del active_sessions[session_id]
        except Exception as e:
            logger.error(f"Error closing session {session_id}: {e}")

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
