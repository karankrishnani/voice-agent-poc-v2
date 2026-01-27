"""
ConversationRelay Message Handlers

Feature 90: Handle ConversationRelay WebSocket messages.

This module processes incoming WebSocket messages from Twilio's ConversationRelay
and generates appropriate responses using the Claude navigator.

See docs/PHASE2-STREAMING.md Phase 2 for message types and architecture.

Message Types (from Twilio):
- setup: Connection established, contains customParameters
- prompt: Transcribed speech from IVR
- dtmf: DTMF digit received
- interrupted: Agent speech was interrupted
- error: Error from ConversationRelay

Response Types (to Twilio):
- text: Text to speak via TTS
- sendDigits: DTMF digits to send
- end: End the call
"""

import json
from typing import Optional, Dict, Any, Tuple
from dataclasses import dataclass
from loguru import logger

from .context import ConversationContext, CallState
from .claude_navigator import ClaudeNavigator, NavigatorDecision, ActionType


@dataclass
class WebSocketMessage:
    """Parsed WebSocket message from ConversationRelay."""
    type: str
    data: Dict[str, Any]

    @classmethod
    def from_json(cls, json_str: str) -> "WebSocketMessage":
        """Parse JSON string into WebSocketMessage."""
        data = json.loads(json_str)
        return cls(
            type=data.get("type", "unknown"),
            data=data
        )


@dataclass
class WebSocketResponse:
    """Response to send back to ConversationRelay."""
    type: str  # "text", "sendDigits", "end"
    payload: Dict[str, Any]

    def to_json(self) -> str:
        """Convert to JSON string for sending."""
        response = {"type": self.type, **self.payload}
        return json.dumps(response)

    @classmethod
    def text(cls, message: str) -> "WebSocketResponse":
        """Create a text (TTS) response."""
        return cls(type="text", payload={"token": message})

    @classmethod
    def send_digits(cls, digits: str) -> "WebSocketResponse":
        """Create a DTMF response."""
        return cls(type="sendDigits", payload={"digits": digits})

    @classmethod
    def end(cls) -> "WebSocketResponse":
        """Create an end call response."""
        return cls(type="end", payload={})


class MessageHandler:
    """
    Feature 90: Handler for ConversationRelay WebSocket messages.

    Processes incoming messages, maintains context, and generates
    appropriate responses using Claude for decision making.
    """

    def __init__(self, navigator: Optional[ClaudeNavigator] = None):
        """
        Initialize message handler.

        Args:
            navigator: ClaudeNavigator instance (creates new one if not provided)
        """
        self.navigator = navigator or ClaudeNavigator()
        self.contexts: Dict[str, ConversationContext] = {}

    def handle_message(
        self,
        message_json: str,
        session_id: str = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """
        Handle a WebSocket message and return a response.

        Args:
            message_json: Raw JSON string from WebSocket
            session_id: Optional session ID for context lookup

        Returns:
            Tuple of (response to send, updated context)
        """
        message = WebSocketMessage.from_json(message_json)
        logger.debug(f"Handling message type: {message.type}")

        handler_method = getattr(self, f"_handle_{message.type}", self._handle_unknown)
        return handler_method(message, session_id)

    def _handle_setup(
        self,
        message: WebSocketMessage,
        session_id: str = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """
        Feature 90: Handle setup message and extract customParameters.

        Setup message structure:
        {
            "type": "setup",
            "callSid": "CA...",
            "customParameters": {
                "call_id": "...",
                "member_id": "...",
                "cpt_code": "...",
                "date_of_birth": "..."
            }
        }
        """
        call_sid = message.data.get("callSid", session_id)
        custom_params = message.data.get("customParameters", {})

        logger.info(f"Setup received - CallSid: {call_sid}")
        logger.info(f"Custom parameters: {custom_params}")

        # Create conversation context from parameters
        context = ConversationContext.create(
            call_id=custom_params.get("call_id", call_sid),
            member_id=custom_params.get("member_id", ""),
            cpt_code=custom_params.get("cpt_code", ""),
            date_of_birth=custom_params.get("date_of_birth", ""),
            call_sid=call_sid,
            provider_name=custom_params.get("provider_name")
        )

        # Transition to connected state
        context.transition_to(CallState.CONNECTED)

        # Store context for this session
        self.contexts[call_sid] = context

        # No response needed for setup - wait for IVR to speak
        logger.info(f"Context created: call_id={context.call_id}, member_id={context.member_id}")
        return None, context

    def _handle_prompt(
        self,
        message: WebSocketMessage,
        session_id: str = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """
        Handle prompt (transcribed speech) message.

        Prompt message structure:
        {
            "type": "prompt",
            "voicePrompt": "..."
        }
        """
        voice_prompt = message.data.get("voicePrompt", "")
        context = self.contexts.get(session_id)

        if not context:
            logger.error(f"No context for session: {session_id}")
            context = ConversationContext.create(
                call_id=session_id or "unknown",
                member_id="",
                cpt_code="",
                date_of_birth=""
            )
            self.contexts[session_id] = context

        logger.info(f"IVR said: {voice_prompt}")
        context.add_ivr_entry(voice_prompt)

        # Use Claude to decide response
        decision = self.navigator.decide_sync(
            ivr_prompt=voice_prompt,
            member_id=context.member_id,
            cpt_code=context.cpt_code,
            date_of_birth=context.date_of_birth,
            conversation_history=context.get_transcript_for_claude()
        )

        response = self._decision_to_response(decision, context)
        return response, context

    def _handle_dtmf(
        self,
        message: WebSocketMessage,
        session_id: str = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """
        Handle DTMF message (inbound digit from IVR).

        DTMF message structure:
        {
            "type": "dtmf",
            "digit": "1"
        }
        """
        digit = message.data.get("digit", "")
        context = self.contexts.get(session_id)

        if context:
            context.add_ivr_entry(f"[DTMF: {digit}]")
            logger.info(f"DTMF received: {digit}")

        # No response typically needed for inbound DTMF
        return None, context

    def _handle_interrupted(
        self,
        message: WebSocketMessage,
        session_id: str = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """Handle interrupted message (agent speech was cut off)."""
        context = self.contexts.get(session_id)

        if context:
            context.add_system_entry("Agent speech interrupted")
            logger.info("Agent speech was interrupted")

        return None, context

    def _handle_error(
        self,
        message: WebSocketMessage,
        session_id: str = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """Handle error message from ConversationRelay."""
        error_description = message.data.get("description", "Unknown error")
        context = self.contexts.get(session_id)

        logger.error(f"ConversationRelay error: {error_description}")

        if context:
            context.add_system_entry(f"Error: {error_description}")
            context.mark_failed(error_description)

        return None, context

    def _handle_unknown(
        self,
        message: WebSocketMessage,
        session_id: str = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """Handle unknown message type."""
        logger.warning(f"Unknown message type: {message.type}")
        context = self.contexts.get(session_id)
        return None, context

    def _decision_to_response(
        self,
        decision: NavigatorDecision,
        context: ConversationContext
    ) -> Optional[WebSocketResponse]:
        """
        Convert a Claude decision to a WebSocket response.

        Args:
            decision: NavigatorDecision from Claude
            context: Current conversation context

        Returns:
            WebSocketResponse or None
        """
        logger.info(f"Decision: type={decision.type}, value={decision.value}, confidence={decision.confidence}")

        # Record the decision in transcript
        context.add_agent_entry(
            text=decision.value or f"[{decision.type.value}]",
            action_type=decision.type.value,
            confidence=decision.confidence
        )

        # Check confidence and handle retries
        if decision.confidence < context.confidence_threshold:
            if not context.should_retry(decision.confidence):
                logger.warning("Max uncertainty reached - marking call failed")
                context.mark_failed("Too many uncertain responses")
                return WebSocketResponse.end()

        # Convert decision to response
        if decision.type == ActionType.DTMF:
            context.transition_to(CallState.NAVIGATING_MENU)
            return WebSocketResponse.send_digits(decision.value)

        elif decision.type == ActionType.SPEAK:
            context.transition_to(CallState.PROVIDING_INFO)
            return WebSocketResponse.text(decision.value)

        elif decision.type == ActionType.EXTRACT:
            context.transition_to(CallState.EXTRACTING_DATA)
            if decision.extracted_data:
                context.set_extracted_auth(
                    auth_number=decision.extracted_data.get("auth_number"),
                    status=decision.extracted_data.get("status"),
                    valid_through=decision.extracted_data.get("valid_through"),
                    denial_reason=decision.extracted_data.get("denial_reason"),
                    raw_text=context.last_ivr_prompt
                )
            context.mark_complete()
            return WebSocketResponse.end()

        elif decision.type == ActionType.WAIT:
            context.transition_to(CallState.WAITING_RESPONSE)
            return None

        elif decision.type == ActionType.UNCERTAIN:
            context.increment_uncertain()
            # For uncertain, we might ask to repeat
            return WebSocketResponse.text("I'm sorry, could you please repeat that?")

        return None

    def get_context(self, session_id: str) -> Optional[ConversationContext]:
        """Get context for a session."""
        return self.contexts.get(session_id)

    def remove_context(self, session_id: str) -> None:
        """Remove context for a session (on disconnect)."""
        if session_id in self.contexts:
            del self.contexts[session_id]
            logger.info(f"Context removed for session: {session_id}")
