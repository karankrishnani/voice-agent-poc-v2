"""
Conversation Context for Voice AI Agent

Feature 89: ConversationContext maintains call state across WebSocket messages.

This module tracks the state of an active voice call, including:
- Call metadata (member ID, CPT code, DOB)
- Conversation transcript
- Current navigation state
- Extracted authorization data

See docs/PHASE2-STREAMING.md Phase 4 for architecture details.
"""

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Optional, Dict, Any, List


class CallState(str, Enum):
    """States for IVR navigation."""
    IDLE = "IDLE"
    DIALING = "DIALING"
    CONNECTED = "CONNECTED"
    NAVIGATING_MENU = "NAVIGATING_MENU"
    PROVIDING_INFO = "PROVIDING_INFO"
    WAITING_RESPONSE = "WAITING_RESPONSE"
    EXTRACTING_DATA = "EXTRACTING_DATA"
    COMPLETE = "COMPLETE"
    FAILED = "FAILED"


@dataclass
class TranscriptEntry:
    """A single entry in the conversation transcript."""
    speaker: str  # "IVR", "Agent", or "System"
    text: str
    timestamp: datetime = field(default_factory=datetime.now)
    action_type: Optional[str] = None  # For agent entries: "dtmf", "speak", etc.
    confidence: Optional[float] = None  # For agent decisions

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "speaker": self.speaker,
            "text": self.text,
            "timestamp": self.timestamp.isoformat(),
            "action_type": self.action_type,
            "confidence": self.confidence
        }


@dataclass
class ExtractedAuthorization:
    """Extracted authorization data from IVR response."""
    auth_number: Optional[str] = None
    status: Optional[str] = None  # approved, denied, pending, not_found, expired
    valid_through: Optional[str] = None
    denial_reason: Optional[str] = None
    raw_text: Optional[str] = None  # Original IVR text that contained this data

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for JSON serialization."""
        return {
            "auth_number": self.auth_number,
            "status": self.status,
            "valid_through": self.valid_through,
            "denial_reason": self.denial_reason,
            "raw_text": self.raw_text
        }


@dataclass
class ConversationContext:
    """
    Feature 89: Maintains call state across WebSocket messages.

    Tracks the complete context of a voice call including:
    - Call parameters (member_id, cpt_code, dob)
    - Conversation transcript
    - Current navigation state
    - Retry counters
    - Extracted authorization data
    """

    # Call identifiers
    call_id: str
    call_sid: Optional[str] = None

    # Member/patient info
    member_id: str = ""
    cpt_code: str = ""
    date_of_birth: str = ""  # YYYY-MM-DD format
    provider_name: Optional[str] = None

    # State tracking
    state: CallState = CallState.IDLE
    previous_state: Optional[CallState] = None

    # Transcript
    transcript: List[TranscriptEntry] = field(default_factory=list)

    # Retry tracking (for fallback logic)
    menu_retries: int = 0
    info_retries: int = 0
    uncertain_count: int = 0

    # Limits
    max_menu_retries: int = 3
    max_info_retries: int = 2
    max_uncertain_total: int = 5
    confidence_threshold: float = 0.6

    # Extracted data
    extracted_auth: Optional[ExtractedAuthorization] = None

    # Timing
    started_at: datetime = field(default_factory=datetime.now)
    ended_at: Optional[datetime] = None

    # Last prompt for retry logic
    last_ivr_prompt: Optional[str] = None

    def transition_to(self, new_state: CallState) -> None:
        """
        Transition to a new call state.

        Args:
            new_state: The state to transition to
        """
        self.previous_state = self.state
        self.state = new_state
        self.add_system_entry(f"State: {self.previous_state.value} -> {new_state.value}")

    def add_ivr_entry(self, text: str) -> None:
        """
        Add an IVR (system) transcript entry.

        Args:
            text: The text spoken by the IVR
        """
        self.transcript.append(TranscriptEntry(
            speaker="IVR",
            text=text
        ))
        self.last_ivr_prompt = text

    def add_agent_entry(
        self,
        text: str,
        action_type: str = None,
        confidence: float = None
    ) -> None:
        """
        Add an agent transcript entry.

        Args:
            text: What the agent said/did
            action_type: Type of action (dtmf, speak, etc.)
            confidence: Confidence score if available
        """
        self.transcript.append(TranscriptEntry(
            speaker="Agent",
            text=text,
            action_type=action_type,
            confidence=confidence
        ))

    def add_system_entry(self, text: str) -> None:
        """
        Add a system/internal transcript entry.

        Args:
            text: System message or state change
        """
        self.transcript.append(TranscriptEntry(
            speaker="System",
            text=text
        ))

    def set_extracted_auth(
        self,
        auth_number: str = None,
        status: str = None,
        valid_through: str = None,
        denial_reason: str = None,
        raw_text: str = None
    ) -> None:
        """
        Set the extracted authorization data.

        Args:
            auth_number: Authorization number (e.g., PA2024-78432)
            status: Status (approved, denied, pending, not_found)
            valid_through: Validity date
            denial_reason: Reason for denial if applicable
            raw_text: Original IVR text
        """
        self.extracted_auth = ExtractedAuthorization(
            auth_number=auth_number,
            status=status,
            valid_through=valid_through,
            denial_reason=denial_reason,
            raw_text=raw_text
        )

    def increment_menu_retry(self) -> bool:
        """
        Increment menu retry counter.

        Returns:
            True if under limit, False if limit exceeded
        """
        self.menu_retries += 1
        return self.menu_retries <= self.max_menu_retries

    def increment_info_retry(self) -> bool:
        """
        Increment info retry counter.

        Returns:
            True if under limit, False if limit exceeded
        """
        self.info_retries += 1
        return self.info_retries <= self.max_info_retries

    def increment_uncertain(self) -> bool:
        """
        Increment uncertain counter.

        Returns:
            True if under limit, False if limit exceeded
        """
        self.uncertain_count += 1
        return self.uncertain_count <= self.max_uncertain_total

    def should_retry(self, confidence: float) -> bool:
        """
        Determine if action should be retried based on confidence.

        Args:
            confidence: Confidence score from Claude

        Returns:
            True if confidence is below threshold and retries remain
        """
        if confidence >= self.confidence_threshold:
            return False
        return self.increment_uncertain()

    def mark_complete(self) -> None:
        """Mark the call as complete."""
        self.transition_to(CallState.COMPLETE)
        self.ended_at = datetime.now()

    def mark_failed(self, reason: str = None) -> None:
        """
        Mark the call as failed.

        Args:
            reason: Failure reason
        """
        self.transition_to(CallState.FAILED)
        self.ended_at = datetime.now()
        if reason:
            self.add_system_entry(f"Failed: {reason}")

    def get_duration_seconds(self) -> int:
        """Get call duration in seconds."""
        end = self.ended_at or datetime.now()
        return int((end - self.started_at).total_seconds())

    def get_transcript_for_claude(self) -> List[Dict[str, str]]:
        """
        Get transcript formatted for Claude context.

        Returns only IVR and Agent entries (not system entries).
        """
        return [
            {"speaker": e.speaker, "text": e.text}
            for e in self.transcript
            if e.speaker in ("IVR", "Agent")
        ]

    def to_dict(self) -> Dict[str, Any]:
        """Convert context to dictionary for JSON serialization."""
        return {
            "call_id": self.call_id,
            "call_sid": self.call_sid,
            "member_id": self.member_id,
            "cpt_code": self.cpt_code,
            "date_of_birth": self.date_of_birth,
            "provider_name": self.provider_name,
            "state": self.state.value,
            "transcript": [e.to_dict() for e in self.transcript],
            "menu_retries": self.menu_retries,
            "info_retries": self.info_retries,
            "uncertain_count": self.uncertain_count,
            "extracted_auth": self.extracted_auth.to_dict() if self.extracted_auth else None,
            "started_at": self.started_at.isoformat(),
            "ended_at": self.ended_at.isoformat() if self.ended_at else None,
            "duration_seconds": self.get_duration_seconds()
        }

    @classmethod
    def create(
        cls,
        call_id: str,
        member_id: str,
        cpt_code: str,
        date_of_birth: str,
        call_sid: str = None,
        provider_name: str = None
    ) -> "ConversationContext":
        """
        Factory method to create a new conversation context.

        Args:
            call_id: Unique call identifier
            member_id: Patient/member ID
            cpt_code: CPT procedure code
            date_of_birth: DOB in YYYY-MM-DD format
            call_sid: Twilio Call SID (optional)
            provider_name: Insurance provider name (optional)

        Returns:
            New ConversationContext instance
        """
        ctx = cls(
            call_id=call_id,
            call_sid=call_sid,
            member_id=member_id,
            cpt_code=cpt_code,
            date_of_birth=date_of_birth,
            provider_name=provider_name
        )
        ctx.transition_to(CallState.IDLE)
        return ctx
