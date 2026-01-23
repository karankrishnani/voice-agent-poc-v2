"""
Voice AI Agent Module

Main agent class that orchestrates IVR navigation, speech recognition,
and data extraction for prior authorization status checks.

Uses Pipecat for voice pipeline with:
- Twilio for telephony
- Deepgram for STT
- ElevenLabs for TTS
- Claude for conversation orchestration
"""

import asyncio
import re
from typing import Optional, List, Dict, Any
from loguru import logger

try:
    from twilio.rest import Client as TwilioClient
    from twilio.twiml.voice_response import VoiceResponse, Gather
    TWILIO_AVAILABLE = True
except ImportError:
    TWILIO_AVAILABLE = False
    logger.warning("Twilio SDK not installed. Run: pip install twilio")

try:
    import anthropic
    ANTHROPIC_AVAILABLE = True
except ImportError:
    ANTHROPIC_AVAILABLE = False
    logger.warning("Anthropic SDK not installed. Run: pip install anthropic")

from config import AgentConfig, CallData, CallResult
from state_machine import CallStateMachine, CallState


class VoiceAgent:
    """
    Voice AI agent for automated prior authorization calls.

    This agent:
    1. Initiates outbound calls via Twilio
    2. Navigates IVR menus using DTMF tones
    3. Provides member information via speech/DTMF
    4. Extracts authorization data from responses
    """

    def __init__(self, config: AgentConfig):
        """Initialize the voice agent with configuration."""
        self.config = config
        self.state_machine = CallStateMachine()
        self.transcript: List[Dict[str, str]] = []
        self.current_call_data: Optional[CallData] = None
        self.call_sid: Optional[str] = None

        # Initialize Twilio client
        if TWILIO_AVAILABLE:
            self.twilio_client = TwilioClient(
                config.twilio_account_sid,
                config.twilio_auth_token
            )
        else:
            self.twilio_client = None

        # Initialize Anthropic client for result extraction
        if ANTHROPIC_AVAILABLE:
            self.anthropic_client = anthropic.Anthropic(
                api_key=config.anthropic_api_key
            )
        else:
            self.anthropic_client = None

        logger.info("VoiceAgent initialized")

    async def make_call(self, call_data: CallData) -> CallResult:
        """
        Make an outbound call to check prior authorization status.

        Args:
            call_data: Member and procedure information for the call

        Returns:
            CallResult with extracted authorization data
        """
        self.current_call_data = call_data
        self.transcript = []
        self.state_machine.reset()

        logger.info(f"Starting call for member {call_data.member_id}")

        try:
            # Transition to DIALING
            self.state_machine.transition(CallState.DIALING)
            self._log_event("state_change", {"state": "DIALING"})

            # Initiate Twilio call
            self.call_sid = await self._initiate_twilio_call(call_data.target_phone)

            if not self.call_sid:
                raise Exception("Failed to initiate call - no call SID returned")

            logger.info(f"Call initiated with SID: {self.call_sid}")

            # The actual call flow is handled via webhooks
            # This method returns after call initiation
            # Results will be processed asynchronously via webhook callbacks

            # For synchronous testing, we can poll for completion
            result = await self._wait_for_call_completion()

            return result

        except Exception as e:
            logger.error(f"Call failed: {e}")
            self.state_machine.transition(CallState.CALL_FAILED)

            return CallResult(
                success=False,
                outcome="error",
                error_message=str(e),
                transcript=self.transcript,
            )

    async def _initiate_twilio_call(self, target_phone: str) -> Optional[str]:
        """
        Initiate an outbound call via Twilio.

        Args:
            target_phone: The phone number to call (mock IVR)

        Returns:
            The Twilio call SID if successful, None otherwise
        """
        if not self.twilio_client:
            logger.error("Twilio client not initialized")
            raise Exception("Twilio SDK not available")

        logger.info(f"Initiating call to {target_phone}")

        try:
            # Create the outbound call
            # The webhook URL should handle the voice response
            call = self.twilio_client.calls.create(
                to=target_phone,
                from_=self.config.twilio_phone_number,
                url=f"{self.config.webhook_base_url}/agent/voice",
                status_callback=f"{self.config.webhook_base_url}/agent/status",
                status_callback_event=['initiated', 'ringing', 'answered', 'completed'],
                timeout=self.config.call_timeout_seconds,
                record=self.config.record_calls,
            )

            logger.info(f"Twilio call created: {call.sid}")
            return call.sid

        except Exception as e:
            logger.error(f"Failed to initiate Twilio call: {e}")
            raise

    async def _wait_for_call_completion(self, poll_interval: float = 2.0) -> CallResult:
        """
        Wait for call to complete and return results.

        In production, this would be replaced by webhook-driven updates.
        """
        if not self.twilio_client or not self.call_sid:
            return CallResult(
                success=False,
                outcome="error",
                error_message="No active call to wait for",
                transcript=self.transcript,
            )

        max_wait = self.config.call_timeout_seconds
        elapsed = 0

        while elapsed < max_wait:
            call = self.twilio_client.calls(self.call_sid).fetch()

            logger.debug(f"Call status: {call.status}")

            if call.status in ['completed', 'failed', 'busy', 'no-answer', 'canceled']:
                break

            await asyncio.sleep(poll_interval)
            elapsed += poll_interval

        # Fetch final call details
        call = self.twilio_client.calls(self.call_sid).fetch()

        if call.status == 'completed':
            self.state_machine.transition(CallState.CALL_COMPLETE)

            # Extract result from transcript
            extracted = await self._extract_result_from_transcript()

            return CallResult(
                success=True,
                outcome=extracted.get('outcome', 'auth_found'),
                auth_number=extracted.get('auth_number'),
                status=extracted.get('status'),
                valid_through=extracted.get('valid_through'),
                denial_reason=extracted.get('denial_reason'),
                transcript=self.transcript,
                duration_seconds=call.duration or 0,
            )
        else:
            self.state_machine.transition(CallState.CALL_FAILED)
            return CallResult(
                success=False,
                outcome="error",
                error_message=f"Call ended with status: {call.status}",
                transcript=self.transcript,
            )

    async def handle_voice_webhook(self, request_data: Dict[str, Any]) -> str:
        """
        Handle incoming voice webhook from Twilio.

        This is called when the call connects and at each interaction point.
        Returns TwiML response.

        Args:
            request_data: The POST data from Twilio webhook

        Returns:
            TwiML XML response string
        """
        call_status = request_data.get('CallStatus', '')
        speech_result = request_data.get('SpeechResult', '')
        digits = request_data.get('Digits', '')

        logger.info(f"Voice webhook: status={call_status}, speech={speech_result}, digits={digits}")

        # Log what we heard from the IVR
        if speech_result:
            self._add_transcript_turn("IVR", speech_result)

        # Determine current state and next action
        current_state = self.state_machine.state

        if current_state == CallState.DIALING:
            # Call just connected, transition to navigating menu
            self.state_machine.transition(CallState.NAVIGATING_MENU)
            return self._create_gather_response("Listening for menu options...")

        elif current_state == CallState.NAVIGATING_MENU:
            return await self._handle_menu_navigation(speech_result)

        elif current_state == CallState.PROVIDING_INFO:
            return await self._handle_info_provision(speech_result)

        elif current_state == CallState.WAITING_RESPONSE:
            return await self._handle_waiting_response(speech_result)

        else:
            # Default: keep listening
            return self._create_gather_response("Continuing...")

    async def _handle_menu_navigation(self, ivr_prompt: str) -> str:
        """
        Handle navigation through the IVR menu.

        Analyzes the IVR prompt and sends appropriate DTMF tones.
        """
        prompt_lower = ivr_prompt.lower()

        # Detect main menu - press 2 for prior authorization
        if 'prior authorization' in prompt_lower and 'press 2' in prompt_lower:
            self._add_transcript_turn("Agent", "*pressed 2*")
            self._log_event("dtmf_sent", {"digit": "2"})
            return self._create_dtmf_response("2")

        # Detect prior auth submenu - press 1 for status check
        if 'check the status' in prompt_lower and 'press 1' in prompt_lower:
            self._add_transcript_turn("Agent", "*pressed 1*")
            self._log_event("dtmf_sent", {"digit": "1"})
            self.state_machine.transition(CallState.PROVIDING_INFO)
            return self._create_dtmf_response("1")

        # Detect prompt for member ID
        if 'member id' in prompt_lower:
            self.state_machine.transition(CallState.PROVIDING_INFO)
            return await self._speak_member_id()

        # Detect prompt for date of birth
        if 'date of birth' in prompt_lower:
            return await self._speak_dob()

        # Detect prompt for CPT code
        if 'cpt' in prompt_lower or 'procedure code' in prompt_lower:
            return await self._speak_cpt_code()

        # Default: continue gathering
        return self._create_gather_response("Listening...")

    async def _handle_info_provision(self, ivr_prompt: str) -> str:
        """
        Handle prompts for providing member information.
        """
        prompt_lower = ivr_prompt.lower()

        if 'member id' in prompt_lower:
            return await self._speak_member_id()

        if 'date of birth' in prompt_lower:
            return await self._speak_dob()

        if 'cpt' in prompt_lower or 'procedure code' in prompt_lower:
            self.state_machine.transition(CallState.WAITING_RESPONSE)
            return await self._speak_cpt_code()

        # Continue listening
        return self._create_gather_response("Listening for prompts...")

    async def _handle_waiting_response(self, ivr_response: str) -> str:
        """
        Handle the IVR's response with authorization information.
        """
        response_lower = ivr_response.lower()

        # Check if we received authorization information
        if 'authorization' in response_lower:
            self._add_transcript_turn("IVR", ivr_response)
            self.state_machine.transition(CallState.EXTRACTING_RESULT)

            # Hang up after receiving the result
            return self._create_hangup_response()

        # Check for "hold" message
        if 'hold' in response_lower or 'please wait' in response_lower:
            self.state_machine.transition(CallState.ON_HOLD)
            return self._create_gather_response("On hold, waiting...")

        # Continue listening
        return self._create_gather_response("Waiting for response...")

    async def _speak_member_id(self) -> str:
        """Generate TwiML to speak the member ID."""
        if not self.current_call_data:
            return self._create_gather_response("Error: no call data")

        member_id = self.current_call_data.member_id
        # Spell out the member ID for clarity
        spelled = ' '.join(list(member_id))

        self._add_transcript_turn("Agent", member_id)
        self._log_event("provided_info", {"type": "member_id", "value": member_id})

        # Use DTMF if member ID is numeric, otherwise speak it
        if member_id.isdigit():
            return self._create_dtmf_response(member_id)
        else:
            return self._create_say_and_gather(f"{spelled}")

    async def _speak_dob(self) -> str:
        """Generate TwiML to speak the date of birth."""
        if not self.current_call_data:
            return self._create_gather_response("Error: no call data")

        dob = self.current_call_data.date_of_birth  # MMDDYYYY format

        self._add_transcript_turn("Agent", dob)
        self._log_event("provided_info", {"type": "dob", "value": dob})

        # Send as DTMF tones
        return self._create_dtmf_response(dob)

    async def _speak_cpt_code(self) -> str:
        """Generate TwiML to speak the CPT code."""
        if not self.current_call_data:
            return self._create_gather_response("Error: no call data")

        cpt_code = self.current_call_data.cpt_code

        self._add_transcript_turn("Agent", cpt_code)
        self._log_event("provided_info", {"type": "cpt_code", "value": cpt_code})

        # Send as DTMF tones
        return self._create_dtmf_response(cpt_code)

    async def _extract_result_from_transcript(self) -> Dict[str, Any]:
        """
        Extract structured authorization data from the transcript.

        Uses Claude to parse natural language responses into structured data.
        """
        if not self.transcript:
            return {"outcome": "error", "error_message": "No transcript available"}

        # Build transcript text
        transcript_text = "\n".join([
            f"{turn['speaker']}: {turn['text']}"
            for turn in self.transcript
            if isinstance(turn, dict) and 'speaker' in turn
        ])

        if self.anthropic_client:
            return await self._extract_with_claude(transcript_text)
        else:
            return self._extract_with_regex(transcript_text)

    async def _extract_with_claude(self, transcript_text: str) -> Dict[str, Any]:
        """Use Claude to extract authorization data from transcript."""
        try:
            prompt = f"""Analyze this insurance IVR call transcript and extract the authorization information.

Transcript:
{transcript_text}

Extract the following if present:
1. Authorization number (e.g., PA2024-78432)
2. Status (approved, denied, pending, or not_found)
3. Valid through date (if mentioned)
4. Denial reason (if status is denied)

Respond in JSON format:
{{
    "outcome": "auth_found" or "auth_not_found" or "error",
    "auth_number": "the auth number or null",
    "status": "approved/denied/pending or null",
    "valid_through": "the date or null",
    "denial_reason": "reason or null"
}}

Only respond with the JSON, no other text."""

            response = self.anthropic_client.messages.create(
                model=self.config.claude_model,
                max_tokens=500,
                messages=[{"role": "user", "content": prompt}]
            )

            # Parse the JSON response
            import json
            result_text = response.content[0].text.strip()
            return json.loads(result_text)

        except Exception as e:
            logger.error(f"Claude extraction failed: {e}")
            return self._extract_with_regex(transcript_text)

    def _extract_with_regex(self, transcript_text: str) -> Dict[str, Any]:
        """Fallback extraction using regex patterns."""
        result = {
            "outcome": "auth_not_found",
            "auth_number": None,
            "status": None,
            "valid_through": None,
            "denial_reason": None,
        }

        text_lower = transcript_text.lower()

        # Extract authorization number
        auth_match = re.search(r'(PA\d{4}-\d{5}|PA-?\d+-?\d+)', transcript_text, re.IGNORECASE)
        if auth_match:
            result["auth_number"] = auth_match.group(1).upper()
            result["outcome"] = "auth_found"

        # Extract status
        if 'approved' in text_lower:
            result["status"] = "approved"
        elif 'denied' in text_lower:
            result["status"] = "denied"
        elif 'pending' in text_lower:
            result["status"] = "pending"

        # Extract valid through date
        date_match = re.search(
            r'through\s+(\w+\s+\d{1,2},?\s*\d{4}|\d{1,2}/\d{1,2}/\d{4})',
            transcript_text,
            re.IGNORECASE
        )
        if date_match:
            result["valid_through"] = date_match.group(1)

        # Extract denial reason
        if result["status"] == "denied":
            reason_match = re.search(r'reason[:\s]+([^.]+)', transcript_text, re.IGNORECASE)
            if reason_match:
                result["denial_reason"] = reason_match.group(1).strip()

        # Check for "not found"
        if 'no authorization found' in text_lower:
            result["outcome"] = "auth_not_found"

        return result

    def _create_gather_response(self, message: str = "") -> str:
        """Create a TwiML response that gathers speech input."""
        response = VoiceResponse() if TWILIO_AVAILABLE else None

        if response:
            gather = Gather(
                input='speech',
                action='/agent/voice',
                method='POST',
                timeout=self.config.menu_detection_timeout,
                speech_timeout='auto',
            )
            if message:
                gather.say(message, voice='Polly.Matthew')
            response.append(gather)
            return str(response)
        else:
            # Return raw TwiML if SDK not available
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Gather input="speech" action="/agent/voice" method="POST" timeout="{self.config.menu_detection_timeout}">
        <Say voice="Polly.Matthew">{message}</Say>
    </Gather>
</Response>"""

    def _create_dtmf_response(self, digits: str) -> str:
        """Create a TwiML response that sends DTMF tones."""
        response = VoiceResponse() if TWILIO_AVAILABLE else None

        if response:
            response.play(digits=digits)
            gather = Gather(
                input='speech',
                action='/agent/voice',
                method='POST',
                timeout=self.config.menu_detection_timeout,
                speech_timeout='auto',
            )
            response.append(gather)
            return str(response)
        else:
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Play digits="{digits}"/>
    <Gather input="speech" action="/agent/voice" method="POST" timeout="{self.config.menu_detection_timeout}">
    </Gather>
</Response>"""

    def _create_say_and_gather(self, text: str) -> str:
        """Create a TwiML response that speaks text and then gathers."""
        response = VoiceResponse() if TWILIO_AVAILABLE else None

        if response:
            response.say(text, voice='Polly.Matthew')
            gather = Gather(
                input='speech',
                action='/agent/voice',
                method='POST',
                timeout=self.config.menu_detection_timeout,
                speech_timeout='auto',
            )
            response.append(gather)
            return str(response)
        else:
            return f"""<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Say voice="Polly.Matthew">{text}</Say>
    <Gather input="speech" action="/agent/voice" method="POST" timeout="{self.config.menu_detection_timeout}">
    </Gather>
</Response>"""

    def _create_hangup_response(self) -> str:
        """Create a TwiML response that hangs up the call."""
        response = VoiceResponse() if TWILIO_AVAILABLE else None

        if response:
            response.hangup()
            return str(response)
        else:
            return """<?xml version="1.0" encoding="UTF-8"?>
<Response>
    <Hangup/>
</Response>"""

    def _log_event(self, event_type: str, data: dict):
        """Log a call event to the transcript."""
        event = {
            "type": event_type,
            "data": data,
        }
        self.transcript.append(event)
        logger.debug(f"Event: {event_type} - {data}")

    def _add_transcript_turn(self, speaker: str, text: str):
        """Add a conversation turn to the transcript."""
        turn = {
            "speaker": speaker,
            "text": text,
        }
        self.transcript.append(turn)
        logger.info(f"[{speaker.upper()}] {text}")

    async def cancel_call(self) -> bool:
        """Cancel the current call if one is in progress."""
        if not self.call_sid or not self.twilio_client:
            return False

        try:
            self.twilio_client.calls(self.call_sid).update(status='canceled')
            self.state_machine.transition(CallState.CALL_FAILED)
            logger.info(f"Call {self.call_sid} canceled")
            return True
        except Exception as e:
            logger.error(f"Failed to cancel call: {e}")
            return False
