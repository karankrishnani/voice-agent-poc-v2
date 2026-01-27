"""
Claude Navigator for IVR Decision Making

Feature 85: Claude 3.5 Haiku analyzes IVR prompts and returns structured decisions.

This module provides intelligent navigation through IVR systems using Claude
for understanding natural language prompts and deciding appropriate responses.

See docs/PHASE2-STREAMING.md for architecture and Claude vs Regex comparison.
"""

import os
import json
from typing import Optional, Dict, Any
from enum import Enum
from pydantic import BaseModel, Field
from anthropic import Anthropic
from loguru import logger


class ActionType(str, Enum):
    """Valid action types for IVR navigation."""
    DTMF = "dtmf"           # Press a digit
    SPEAK = "speak"         # Say something (member ID, DOB, etc.)
    WAIT = "wait"           # Wait for more input
    EXTRACT = "extract"     # Extract authorization data from response
    UNCERTAIN = "uncertain" # Unable to determine action confidently


class NavigatorDecision(BaseModel):
    """Structured decision from Claude navigator."""
    type: ActionType
    value: Optional[str] = Field(default=None, description="DTMF digit or text to speak")
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0.0-1.0")
    reasoning: str = Field(description="Explanation of the decision")
    extracted_data: Optional[Dict[str, Any]] = Field(
        default=None,
        description="Extracted authorization data (for extract type)"
    )


# System prompt for Claude navigator
SYSTEM_PROMPT = """You are an AI agent navigating an insurance company's IVR (Interactive Voice Response) system to check prior authorization status.

Your role is to analyze IVR prompts and decide the appropriate action. You will receive:
1. The current IVR prompt (what the system just said)
2. Call context (member ID, CPT code, date of birth)
3. Conversation history

You must respond with a JSON object containing:
- type: One of "dtmf" (press digit), "speak" (say something), "wait" (listen more), "extract" (found authorization data), "uncertain" (need help)
- value: The DTMF digit to press OR the text to speak (null for wait/extract/uncertain)
- confidence: A score from 0.0 to 1.0 indicating your confidence in this decision
- reasoning: Brief explanation of why you chose this action
- extracted_data: (Only for type="extract") Object with auth_number, status, valid_through fields

Guidelines:
1. For menu navigation, identify which option leads to "prior authorization" or "authorization status"
2. When asked for member ID, spell it out clearly (e.g., "A B C 1 2 3 4 5 6")
3. When asked for date of birth, provide as 8 digits MMDDYYYY
4. When asked for CPT code, provide the 5-digit code
5. When you hear authorization results, extract: auth_number, status (approved/denied/pending/not_found), valid_through date
6. If uncertain, set type="uncertain" with confidence < 0.6

Common IVR patterns:
- "Press 1 for X, press 2 for Y" → Identify the right option and send DTMF
- "Enter your member ID" → Speak the member ID
- "Enter date of birth" → Speak DOB as MMDDYYYY
- "Authorization PA-XXXX is approved through DATE" → Extract data
- "No authorization found" → Extract with status="not_found"

Always respond with valid JSON only, no additional text."""


class ClaudeNavigator:
    """
    Claude-powered IVR navigation decision maker.

    Uses Claude 3.5 Haiku for fast, intelligent responses to IVR prompts.
    """

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize Claude navigator.

        Args:
            api_key: Anthropic API key (defaults to ANTHROPIC_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        if not self.api_key:
            raise ValueError("ANTHROPIC_API_KEY not set")

        self.client = Anthropic(api_key=self.api_key)
        self.model = "claude-3-5-haiku-20241022"  # Fast model for real-time responses

        logger.info(f"Claude navigator initialized with model: {self.model}")

    async def decide(
        self,
        ivr_prompt: str,
        member_id: str,
        cpt_code: str,
        date_of_birth: str,
        conversation_history: Optional[list] = None
    ) -> NavigatorDecision:
        """
        Analyze IVR prompt and return navigation decision.

        Args:
            ivr_prompt: The text spoken by the IVR system
            member_id: Patient/member identifier
            cpt_code: CPT procedure code being queried
            date_of_birth: Patient DOB in YYYY-MM-DD format
            conversation_history: List of previous IVR interactions

        Returns:
            NavigatorDecision with action type, value, confidence, and reasoning
        """
        logger.info(f"Analyzing IVR prompt: {ivr_prompt[:100]}...")

        # Build context message
        context = f"""CALL CONTEXT:
- Member ID: {member_id}
- CPT Code: {cpt_code}
- Date of Birth: {date_of_birth}"""

        # Format conversation history if provided
        history_text = ""
        if conversation_history:
            history_text = "\n\nCONVERSATION HISTORY:\n"
            for entry in conversation_history[-10:]:  # Last 10 entries
                speaker = entry.get("speaker", "Unknown")
                text = entry.get("text", "")
                history_text += f"{speaker}: {text}\n"

        # Build the user message
        user_message = f"""{context}
{history_text}
CURRENT IVR PROMPT:
{ivr_prompt}

Analyze this prompt and provide your decision as JSON."""

        try:
            # Call Claude API
            response = self.client.messages.create(
                model=self.model,
                max_tokens=500,
                system=SYSTEM_PROMPT,
                messages=[
                    {"role": "user", "content": user_message}
                ]
            )

            # Extract response text
            response_text = response.content[0].text.strip()
            logger.debug(f"Claude response: {response_text}")

            # Parse JSON response
            try:
                decision_data = json.loads(response_text)
            except json.JSONDecodeError:
                # Try to extract JSON from response if it contains extra text
                import re
                json_match = re.search(r'\{[^{}]*\}', response_text, re.DOTALL)
                if json_match:
                    decision_data = json.loads(json_match.group())
                else:
                    raise ValueError(f"Could not parse JSON from response: {response_text}")

            # Validate and create decision object
            decision = NavigatorDecision(
                type=ActionType(decision_data.get("type", "uncertain")),
                value=decision_data.get("value"),
                confidence=float(decision_data.get("confidence", 0.5)),
                reasoning=decision_data.get("reasoning", "No reasoning provided"),
                extracted_data=decision_data.get("extracted_data")
            )

            logger.info(f"Decision: type={decision.type}, value={decision.value}, confidence={decision.confidence}")
            return decision

        except Exception as e:
            logger.error(f"Claude navigator error: {e}")
            # Return uncertain decision on error
            return NavigatorDecision(
                type=ActionType.UNCERTAIN,
                value=None,
                confidence=0.0,
                reasoning=f"Error analyzing prompt: {str(e)}",
                extracted_data=None
            )

    def decide_sync(
        self,
        ivr_prompt: str,
        member_id: str,
        cpt_code: str,
        date_of_birth: str,
        conversation_history: Optional[list] = None
    ) -> NavigatorDecision:
        """
        Synchronous version of decide() for non-async contexts.

        Same parameters and return type as decide().
        """
        import asyncio
        return asyncio.run(self.decide(
            ivr_prompt, member_id, cpt_code, date_of_birth, conversation_history
        ))


# Convenience function for quick decisions
async def analyze_ivr_prompt(
    prompt: str,
    member_id: str,
    cpt_code: str,
    date_of_birth: str,
    history: Optional[list] = None
) -> NavigatorDecision:
    """
    Quick helper to analyze a single IVR prompt.

    Creates a navigator instance and returns the decision.
    """
    navigator = ClaudeNavigator()
    return await navigator.decide(prompt, member_id, cpt_code, date_of_birth, history)
