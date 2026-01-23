"""
Agent Configuration Module

Contains configuration classes for the voice AI agent.
"""

from dataclasses import dataclass
from typing import Optional


@dataclass
class AgentConfig:
    """Configuration for the voice AI agent."""

    # Twilio credentials
    twilio_account_sid: str
    twilio_auth_token: str
    twilio_phone_number: str

    # Voice AI services
    deepgram_api_key: str
    elevenlabs_api_key: str
    anthropic_api_key: str

    # Optional settings
    elevenlabs_voice_id: str = "21m00Tcm4TlvDq8ikWAM"  # Default: Rachel
    deepgram_model: str = "nova-2"
    claude_model: str = "claude-3-haiku-20240307"

    # Timeouts and retries
    call_timeout_seconds: int = 120
    menu_detection_timeout: float = 10.0
    dtmf_delay: float = 0.5
    max_retries: int = 3

    # Logging
    log_transcripts: bool = True
    record_calls: bool = False


@dataclass
class CallData:
    """Data required for making a prior auth status call."""

    member_id: str
    date_of_birth: str  # MMDDYYYY format
    cpt_code: str
    target_phone: str
    call_id: Optional[str] = None


@dataclass
class CallResult:
    """Result of a completed call."""

    success: bool
    outcome: str  # auth_found, auth_not_found, error, timeout
    auth_number: Optional[str] = None
    status: Optional[str] = None  # approved, denied, pending
    valid_through: Optional[str] = None
    denial_reason: Optional[str] = None
    transcript: list = None
    duration_seconds: int = 0
    error_message: Optional[str] = None

    def __post_init__(self):
        if self.transcript is None:
            self.transcript = []
