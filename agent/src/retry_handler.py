"""
Retry Handler for Voice AI Agent

Feature 107: Implements retry logic for IVR navigation failures.

This module provides centralized retry handling for:
- Menu navigation retries (max 3)
- Info provision retries (max 2)
- Uncertainty handling (max 5 total)

See docs/PHASE2-STREAMING.md Phase 7 for retry strategy details.
"""

from enum import Enum
from typing import Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timedelta
import hashlib
from loguru import logger

from .context import ConversationContext, CallState


class RetryType(str, Enum):
    """Types of retries tracked by the handler."""
    MENU = "menu"
    INFO = "info"
    UNCERTAIN = "uncertain"
    SILENCE = "silence"
    REPEATED_PROMPT = "repeated_prompt"


@dataclass
class RetryResult:
    """Result of a retry attempt."""
    should_continue: bool
    retry_count: int
    max_retries: int
    action: Optional[str] = None  # "dtmf_9", "speak_repeat", "end_call"
    reason: Optional[str] = None


class RetryHandler:
    """
    Feature 107: Handles retry logic for IVR navigation.

    Tracks retry counts and determines when to:
    - Request repeat (DTMF 9)
    - Continue with fallback action
    - End call with failure

    Thresholds (from docs/PHASE2-STREAMING.md Phase 7):
    - MAX_MENU_RETRIES = 3
    - MAX_INFO_RETRIES = 2
    - MAX_UNCERTAIN_TOTAL = 5
    - CONFIDENCE_THRESHOLD = 0.6
    """

    def __init__(
        self,
        max_menu_retries: int = 3,
        max_info_retries: int = 2,
        max_uncertain_total: int = 5,
        confidence_threshold: float = 0.6,
        silence_timeout_seconds: int = 10,
        max_silence_timeouts: int = 2
    ):
        """
        Initialize retry handler with configurable limits.

        Args:
            max_menu_retries: Maximum menu navigation retry attempts
            max_info_retries: Maximum info provision retry attempts
            max_uncertain_total: Maximum total uncertain responses
            confidence_threshold: Minimum confidence to proceed without retry
            silence_timeout_seconds: Seconds of silence before triggering repeat
            max_silence_timeouts: Max silence timeouts before ending call
        """
        self.max_menu_retries = max_menu_retries
        self.max_info_retries = max_info_retries
        self.silence_timeout_seconds = silence_timeout_seconds
        self.max_silence_timeouts = max_silence_timeouts

        # Track last activity and silence timeout count per context
        self._last_activity: dict[str, datetime] = {}
        self._silence_counts: dict[str, int] = {}

        # Track prompt hashes for repeated prompt detection (Feature 111)
        self._last_prompt_hash: dict[str, str] = {}
        self._repeated_prompt_count: dict[str, int] = {}
        self.max_repeated_prompts: int = 2  # Try alternative after 2 repeats
        self.max_uncertain_total = max_uncertain_total
        self.confidence_threshold = confidence_threshold

    def check_menu_retry(self, context: ConversationContext) -> RetryResult:
        """
        Check if menu retry should be attempted.

        After 3 failed menu navigation attempts, the call should end.

        Args:
            context: Current conversation context

        Returns:
            RetryResult indicating whether to continue
        """
        context.menu_retries += 1
        current = context.menu_retries
        max_retries = context.max_menu_retries

        logger.info(f"Menu retry {current}/{max_retries}")

        if current >= max_retries:
            logger.warning(f"Max menu retries ({max_retries}) reached - ending call")
            context.mark_failed(f"Max menu retries ({max_retries}) exceeded")
            return RetryResult(
                should_continue=False,
                retry_count=current,
                max_retries=max_retries,
                action="end_call",
                reason=f"Menu navigation failed after {max_retries} attempts"
            )

        return RetryResult(
            should_continue=True,
            retry_count=current,
            max_retries=max_retries,
            action="dtmf_9",
            reason=f"Retrying menu navigation ({current}/{max_retries})"
        )

    def check_info_retry(self, context: ConversationContext) -> RetryResult:
        """
        Check if info provision retry should be attempted.

        Feature 108: After 2 failed attempts to provide info (member ID, DOB),
        the agent ends the call with failure status.

        Args:
            context: Current conversation context

        Returns:
            RetryResult indicating whether to continue
        """
        context.info_retries += 1
        current = context.info_retries
        max_retries = context.max_info_retries

        logger.info(f"Info retry {current}/{max_retries}")

        if current >= max_retries:
            logger.warning(f"Max info retries ({max_retries}) reached - ending call")
            context.mark_failed(f"Max info retries ({max_retries}) exceeded - unable to provide member information")
            return RetryResult(
                should_continue=False,  # End call after max info retries
                retry_count=current,
                max_retries=max_retries,
                action="end_call",
                reason=f"Info provision failed after {max_retries} attempts"
            )

        return RetryResult(
            should_continue=True,
            retry_count=current,
            max_retries=max_retries,
            action="speak_repeat",
            reason=f"Retrying info provision ({current}/{max_retries})"
        )

    def check_uncertainty(
        self,
        context: ConversationContext,
        confidence: float
    ) -> RetryResult:
        """
        Check if low confidence response should trigger retry.

        Args:
            context: Current conversation context
            confidence: Confidence score from Claude (0.0 - 1.0)

        Returns:
            RetryResult indicating action to take
        """
        if confidence >= self.confidence_threshold:
            return RetryResult(
                should_continue=True,
                retry_count=context.uncertain_count,
                max_retries=self.max_uncertain_total,
                action=None,
                reason="Confidence above threshold"
            )

        context.uncertain_count += 1
        current = context.uncertain_count
        max_uncertain = self.max_uncertain_total

        logger.info(f"Low confidence ({confidence:.2f}) - uncertain count {current}/{max_uncertain}")

        if current >= max_uncertain:
            logger.warning(f"Max uncertain responses ({max_uncertain}) reached - ending call")
            context.mark_failed(f"Too many uncertain responses ({max_uncertain})")
            return RetryResult(
                should_continue=False,
                retry_count=current,
                max_retries=max_uncertain,
                action="end_call",
                reason=f"Exceeded maximum uncertainty threshold"
            )

        return RetryResult(
            should_continue=True,
            retry_count=current,
            max_retries=max_uncertain,
            action="dtmf_9",
            reason=f"Low confidence ({confidence:.2f}), requesting repeat"
        )

    def reset_menu_retries(self, context: ConversationContext) -> None:
        """Reset menu retry counter after successful navigation."""
        if context.menu_retries > 0:
            logger.debug(f"Reset menu retries from {context.menu_retries} to 0")
            context.menu_retries = 0

    def reset_info_retries(self, context: ConversationContext) -> None:
        """Reset info retry counter after successful info provision."""
        if context.info_retries > 0:
            logger.debug(f"Reset info retries from {context.info_retries} to 0")
            context.info_retries = 0

    def should_end_call(self, context: ConversationContext) -> Tuple[bool, Optional[str]]:
        """
        Check if any limit has been exceeded and call should end.

        Args:
            context: Current conversation context

        Returns:
            Tuple of (should_end, reason)
        """
        if context.state in (CallState.COMPLETE, CallState.FAILED):
            return True, f"Call already in terminal state: {context.state.value}"

        if context.menu_retries >= context.max_menu_retries:
            return True, f"Max menu retries ({context.max_menu_retries}) exceeded"

        if context.info_retries >= context.max_info_retries:
            return True, f"Max info retries ({context.max_info_retries}) exceeded"

        if context.uncertain_count >= context.max_uncertain_total:
            return True, f"Max uncertain responses ({context.max_uncertain_total}) exceeded"

        return False, None

    def get_retry_summary(self, context: ConversationContext) -> dict:
        """
        Get summary of retry state for logging/debugging.

        Args:
            context: Current conversation context

        Returns:
            Dictionary with retry counts and limits
        """
        silence_count = self._silence_counts.get(context.call_id, 0)
        return {
            "menu_retries": f"{context.menu_retries}/{context.max_menu_retries}",
            "info_retries": f"{context.info_retries}/{context.max_info_retries}",
            "uncertain_count": f"{context.uncertain_count}/{context.max_uncertain_total}",
            "silence_timeouts": f"{silence_count}/{self.max_silence_timeouts}",
            "confidence_threshold": self.confidence_threshold,
            "should_end": self.should_end_call(context)[0]
        }

    # ===========================================
    # Silence Timeout Handling (Feature 110)
    # ===========================================

    def record_activity(self, call_id: str) -> None:
        """
        Record activity timestamp for a call (resets silence timer).

        Call this when any message is received from the IVR.

        Args:
            call_id: Unique call identifier
        """
        self._last_activity[call_id] = datetime.now()
        logger.debug(f"Activity recorded for call {call_id}")

    def check_silence_timeout(self, context: ConversationContext) -> RetryResult:
        """
        Feature 110: Check if silence timeout has occurred.

        After 10s of silence from IVR, request repeat.
        After 2 silence timeouts, end call.

        Args:
            context: Current conversation context

        Returns:
            RetryResult indicating action to take
        """
        call_id = context.call_id
        last_activity = self._last_activity.get(call_id)

        if last_activity is None:
            # No activity recorded yet - start tracking
            self.record_activity(call_id)
            return RetryResult(
                should_continue=True,
                retry_count=0,
                max_retries=self.max_silence_timeouts,
                action=None,
                reason="Activity tracking started"
            )

        elapsed = (datetime.now() - last_activity).total_seconds()

        if elapsed < self.silence_timeout_seconds:
            return RetryResult(
                should_continue=True,
                retry_count=self._silence_counts.get(call_id, 0),
                max_retries=self.max_silence_timeouts,
                action=None,
                reason=f"No timeout ({elapsed:.1f}s < {self.silence_timeout_seconds}s)"
            )

        # Silence timeout occurred
        self._silence_counts[call_id] = self._silence_counts.get(call_id, 0) + 1
        current = self._silence_counts[call_id]

        logger.warning(f"Silence timeout {current}/{self.max_silence_timeouts} for call {call_id}")

        if current >= self.max_silence_timeouts:
            logger.error(f"Max silence timeouts reached for call {call_id} - ending call")
            context.mark_failed("IVR silence timeout - no response")
            return RetryResult(
                should_continue=False,
                retry_count=current,
                max_retries=self.max_silence_timeouts,
                action="end_call",
                reason="ivr_timeout"
            )

        # Reset timer and request repeat
        self.record_activity(call_id)
        context.add_system_entry(f"Silence timeout ({current}/{self.max_silence_timeouts}) - requesting repeat")

        return RetryResult(
            should_continue=True,
            retry_count=current,
            max_retries=self.max_silence_timeouts,
            action="dtmf_9",
            reason=f"Silence timeout, requesting repeat ({current}/{self.max_silence_timeouts})"
        )

    def reset_silence_tracking(self, call_id: str) -> None:
        """
        Reset silence tracking for a call (on disconnect).

        Args:
            call_id: Unique call identifier
        """
        if call_id in self._last_activity:
            del self._last_activity[call_id]
        if call_id in self._silence_counts:
            del self._silence_counts[call_id]
        logger.debug(f"Silence tracking reset for call {call_id}")

    # ===========================================
    # Repeated Prompt Detection (Feature 111)
    # ===========================================

    def _hash_prompt(self, prompt: str) -> str:
        """
        Create a normalized hash of a prompt for comparison.

        Normalizes the prompt by:
        - Converting to lowercase
        - Removing extra whitespace
        - Removing punctuation

        Args:
            prompt: The IVR prompt text

        Returns:
            MD5 hash of the normalized prompt
        """
        # Normalize: lowercase, strip whitespace, remove punctuation
        normalized = prompt.lower().strip()
        # Remove common punctuation
        for char in ".,!?;:":
            normalized = normalized.replace(char, "")
        # Collapse multiple spaces
        normalized = " ".join(normalized.split())
        return hashlib.md5(normalized.encode()).hexdigest()

    def check_repeated_prompt(
        self,
        context: ConversationContext,
        prompt: str
    ) -> Tuple[bool, RetryResult]:
        """
        Feature 111: Detect when IVR repeats the same prompt.

        When IVR repeats a prompt, it usually means our input wasn't accepted.
        Track repetitions and suggest alternative approach after 2 repeats.

        Args:
            context: Current conversation context
            prompt: The current IVR prompt text

        Returns:
            Tuple of (is_repeated, RetryResult)
        """
        call_id = context.call_id
        current_hash = self._hash_prompt(prompt)
        last_hash = self._last_prompt_hash.get(call_id)

        # Update last hash
        self._last_prompt_hash[call_id] = current_hash

        if last_hash is None or current_hash != last_hash:
            # New prompt - reset repeat counter
            self._repeated_prompt_count[call_id] = 0
            return False, RetryResult(
                should_continue=True,
                retry_count=0,
                max_retries=self.max_repeated_prompts,
                action=None,
                reason="New prompt detected"
            )

        # Same prompt repeated
        self._repeated_prompt_count[call_id] = self._repeated_prompt_count.get(call_id, 0) + 1
        repeat_count = self._repeated_prompt_count[call_id]

        logger.warning(f"Repeated prompt detected ({repeat_count}/{self.max_repeated_prompts})")
        context.add_system_entry(f"Repeated prompt detected ({repeat_count}/{self.max_repeated_prompts})")

        # Suggest alternative approach after max repeats
        if repeat_count >= self.max_repeated_prompts:
            logger.info("Max repeated prompts reached - trying alternative approach")
            return True, RetryResult(
                should_continue=True,
                retry_count=repeat_count,
                max_retries=self.max_repeated_prompts,
                action="alternative",  # Try speech instead of DTMF or vice versa
                reason="Repeated prompt - try alternative input method"
            )

        return True, RetryResult(
            should_continue=True,
            retry_count=repeat_count,
            max_retries=self.max_repeated_prompts,
            action="retry_same",
            reason=f"Repeated prompt ({repeat_count}/{self.max_repeated_prompts})"
        )

    def reset_prompt_tracking(self, call_id: str) -> None:
        """
        Reset prompt tracking for a call (on disconnect).

        Args:
            call_id: Unique call identifier
        """
        if call_id in self._last_prompt_hash:
            del self._last_prompt_hash[call_id]
        if call_id in self._repeated_prompt_count:
            del self._repeated_prompt_count[call_id]
        logger.debug(f"Prompt tracking reset for call {call_id}")

    def reset_all_tracking(self, call_id: str) -> None:
        """
        Reset all tracking for a call (on disconnect).

        Args:
            call_id: Unique call identifier
        """
        self.reset_silence_tracking(call_id)
        self.reset_prompt_tracking(call_id)
        logger.info(f"All retry tracking reset for call {call_id}")
