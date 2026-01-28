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
import re
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

    async def handle_message(
        self,
        message_json: str,
        session_id: str = None,
        session_data: Dict[str, Any] = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """
        Handle a WebSocket message and return a response.

        Args:
            message_json: Raw JSON string from WebSocket
            session_id: Optional session ID for context lookup
            session_data: Optional session data from active_sessions (for setup messages)

        Returns:
            Tuple of (response to send, updated context)
        """
        message = WebSocketMessage.from_json(message_json)
        logger.debug(f"Handling message type: {message.type}")

        handler_method = getattr(self, f"_handle_{message.type}", self._handle_unknown)
        # Check if handler is async (prompt handler) or sync
        import asyncio
        if asyncio.iscoroutinefunction(handler_method):
            return await handler_method(message, session_id, session_data)
        return handler_method(message, session_id, session_data)

    def _handle_setup(
        self,
        message: WebSocketMessage,
        session_id: str = None,
        session_data: Dict[str, Any] = None
    ) -> Tuple[Optional[WebSocketResponse], ConversationContext]:
        """
        Feature 90: Handle setup message and extract call context.

        Session data is looked up server-side from active_sessions using call_id,
        with fallback to customParameters for backwards compatibility.

        Setup message structure:
        {
            "type": "setup",
            "callSid": "CA...",
            "customParameters": {
                "call_id": "..."
            }
        }
        """
        call_sid = message.data.get("callSid", session_id)
        custom_params = message.data.get("customParameters", {})

        logger.info(f"Setup received - CallSid: {call_sid}")
        logger.info(f"Custom parameters: {custom_params}")
        logger.info(f"Session data from active_sessions: {session_data}")

        # Use session_data (from active_sessions) with fallback to customParameters
        # This allows the server to look up member data without passing it over the wire
        session_data = session_data or {}

        # Create conversation context - prefer session_data, fall back to customParameters
        context = ConversationContext.create(
            call_id=custom_params.get("call_id", call_sid),
            member_id=session_data.get("member_id") or custom_params.get("member_id", ""),
            cpt_code=session_data.get("cpt_code") or custom_params.get("cpt_code", ""),
            date_of_birth=session_data.get("date_of_birth") or custom_params.get("date_of_birth", ""),
            call_sid=call_sid,
            provider_name=session_data.get("provider_name") or custom_params.get("provider_name")
        )

        # Transition to connected state
        context.transition_to(CallState.CONNECTED)

        # Store context for this session
        self.contexts[call_sid] = context

        # No response needed for setup - wait for IVR to speak
        logger.info(f"Context created: call_id={context.call_id}, member_id={context.member_id}")
        return None, context

    async def _handle_prompt(
        self,
        message: WebSocketMessage,
        session_id: str = None,
        session_data: Dict[str, Any] = None
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

        # STATE-BASED FILTERING: If awaiting IVR result, check if we should respond
        if context.state == CallState.AWAITING_IVR_RESULT:
            should_process = self._should_process_while_awaiting(voice_prompt, context)
            if not should_process:
                logger.info(f"State=AWAITING_IVR_RESULT: Buffering prompt, not responding: {voice_prompt[:50]}...")
                return None, context
            else:
                logger.info(f"State=AWAITING_IVR_RESULT: New context detected, resuming processing")
                context.transition_to(CallState.CONNECTED)
                context.clear_last_action()

        # Use Claude to decide response (async)
        decision = await self.navigator.decide(
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
        session_id: str = None,
        session_data: Dict[str, Any] = None
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
        session_id: str = None,
        session_data: Dict[str, Any] = None
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
        session_id: str = None,
        session_data: Dict[str, Any] = None
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
        session_id: str = None,
        session_data: Dict[str, Any] = None
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
        # Phase 2: When confidence < 60%, send DTMF 9 to request IVR repeat
        if decision.confidence < context.confidence_threshold:
            if not context.should_retry(decision.confidence):
                logger.warning("Max uncertainty reached - marking call failed")
                context.mark_failed("Too many uncertain responses")
                return WebSocketResponse.end()
            # Low confidence but retries remain - send DTMF 9 to request repeat
            logger.info(f"Low confidence ({decision.confidence}) - sending DTMF 9 to request repeat")
            context.add_agent_entry(
                text="[Requesting repeat - low confidence]",
                action_type="dtmf",
                confidence=decision.confidence
            )
            return WebSocketResponse.send_digits("9")

        # Convert decision to response
        if decision.type == ActionType.DTMF:
            context.set_last_action("dtmf", decision.value)
            context.transition_to(CallState.AWAITING_IVR_RESULT)
            return WebSocketResponse.send_digits(decision.value)

        elif decision.type == ActionType.SPEAK:
            context.set_last_action("speak", decision.value)
            context.transition_to(CallState.AWAITING_IVR_RESULT)
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
            # Phase 2: Send DTMF 9 to request IVR repeat (most IVRs use 9 for "repeat")
            logger.info("Uncertain decision - sending DTMF 9 to request repeat")
            return WebSocketResponse.send_digits("9")

        return None

    def _should_process_while_awaiting(self, prompt: str, context: ConversationContext) -> bool:
        """
        Decide if we should process this prompt while in AWAITING_IVR_RESULT state.

        Returns True if this looks like a new context (IVR moved on).
        Returns False if this looks like continuation of what we just responded to.
        """
        prompt_lower = prompt.lower()

        # After DTMF: ignore other menu options
        if context.last_action_type == "dtmf":
            if self._is_menu_option(prompt):
                return False  # Still reading menu options, ignore
            return True  # Different type of prompt, process it

        # After SPEAK: check if IVR is asking for same info again (retry) or moved on
        if context.last_action_type == "speak":
            # If IVR moved to a DIFFERENT question, process it
            # This is heuristic - if prompt doesn't mention what we just provided, it's new
            last_value_keywords = self._extract_keywords(context.last_action_value)
            prompt_mentions_same = any(kw in prompt_lower for kw in last_value_keywords)

            if not prompt_mentions_same:
                return True  # New question, process it
            return False  # Still on same topic, wait

        return True  # Default: process

    def _is_menu_option(self, prompt: str) -> bool:
        """Check if prompt is a menu option."""
        prompt_lower = prompt.lower()
        return bool(re.search(r'press \d|say .+ or press', prompt_lower))

    def _extract_keywords(self, value: str) -> list:
        """Extract keywords from last action value for matching."""
        if not value:
            return []
        # For member ID, DOB, etc. - extract key terms
        return [value.lower()[:3]] if value else []  # Simple: first 3 chars

    def get_context(self, session_id: str) -> Optional[ConversationContext]:
        """Get context for a session."""
        return self.contexts.get(session_id)

    def remove_context(self, session_id: str) -> None:
        """Remove context for a session (on disconnect)."""
        if session_id in self.contexts:
            del self.contexts[session_id]
            logger.info(f"Context removed for session: {session_id}")
