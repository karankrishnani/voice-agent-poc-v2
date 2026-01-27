"""
Backend API Client for Python Agent

Feature 99: HTTP client for communicating with Node.js backend.

This module handles all HTTP communication between the Python voice agent
and the Node.js backend API, including:
- Posting extraction results
- Updating call status
- Fetching member data

See docs/PHASE2-STREAMING.md Phase 3 for integration details.
"""

import os
import httpx
from typing import Optional, Dict, Any, List
from loguru import logger
from pydantic import BaseModel


class ExtractionData(BaseModel):
    """Data model for authorization extraction results."""
    auth_number: Optional[str] = None
    status: Optional[str] = None  # approved, denied, pending, not_found
    valid_through: Optional[str] = None
    denial_reason: Optional[str] = None
    transcript: Optional[List[Dict[str, str]]] = None
    failure_reason: Optional[str] = None  # Feature 112: max_uncertain_exceeded, max_menu_retries, etc.


class BackendClient:
    """
    Feature 99: HTTP client for Node.js backend communication.

    Handles all API calls to the backend including:
    - POST /api/calls/:id/extraction - Send extraction results
    - PUT /api/calls/:id - Update call status
    - GET /api/members/:id - Fetch member data
    """

    def __init__(self, base_url: Optional[str] = None):
        """
        Initialize backend client.

        Args:
            base_url: Backend API base URL (defaults to BACKEND_URL env var)
        """
        self.base_url = base_url or os.getenv("BACKEND_URL", "http://localhost:3001")
        self.client = httpx.AsyncClient(timeout=30.0)
        logger.info(f"Backend client initialized: {self.base_url}")

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()

    async def post_extraction(
        self,
        call_id: str,
        extraction: ExtractionData
    ) -> Dict[str, Any]:
        """
        Feature 99: Post extraction results to backend.

        Args:
            call_id: The call ID (numeric or call_sid)
            extraction: ExtractionData with auth results

        Returns:
            Response from backend
        """
        url = f"{self.base_url}/api/calls/{call_id}/extraction"
        payload = extraction.model_dump(exclude_none=True)

        logger.info(f"Posting extraction to {url}")
        logger.debug(f"Payload: {payload}")

        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()
            logger.info(f"Extraction posted successfully: {result.get('message')}")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Backend error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Failed to post extraction: {e}")
            raise

    async def update_call_status(
        self,
        call_id: str,
        status: str,
        outcome: Optional[str] = None,
        transcript: Optional[List[Dict[str, str]]] = None,
        duration_seconds: Optional[int] = None
    ) -> Dict[str, Any]:
        """
        Update call status in backend.

        Args:
            call_id: The call ID
            status: New status (initiated, in_progress, completed, failed)
            outcome: Call outcome
            transcript: Conversation transcript
            duration_seconds: Call duration

        Returns:
            Updated call data
        """
        url = f"{self.base_url}/api/calls/{call_id}"
        payload = {
            "status": status,
            "outcome": outcome,
            "transcript": transcript,
            "duration_seconds": duration_seconds
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        logger.info(f"Updating call status: {call_id} -> {status}")

        try:
            response = await self.client.put(url, json=payload)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPStatusError as e:
            logger.error(f"Backend error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Failed to update call: {e}")
            raise

    async def get_member(self, member_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch member data from backend.

        Args:
            member_id: The member ID

        Returns:
            Member data dict or None if not found
        """
        url = f"{self.base_url}/api/members/{member_id}"

        try:
            response = await self.client.get(url)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch member: {e}")
            return None

    async def get_call(self, call_id: str) -> Optional[Dict[str, Any]]:
        """
        Fetch call data from backend.

        Args:
            call_id: The call ID

        Returns:
            Call data dict or None if not found
        """
        url = f"{self.base_url}/api/calls/{call_id}"

        try:
            response = await self.client.get(url)
            if response.status_code == 404:
                return None
            response.raise_for_status()
            return response.json()
        except Exception as e:
            logger.error(f"Failed to fetch call: {e}")
            return None

    def post_extraction_sync(
        self,
        call_id: str,
        extraction: ExtractionData
    ) -> Dict[str, Any]:
        """
        Synchronous version of post_extraction for non-async contexts.
        """
        import asyncio
        return asyncio.run(self.post_extraction(call_id, extraction))

    async def post_failure(
        self,
        call_id: str,
        reason: str,
        transcript: Optional[List[Dict[str, str]]] = None
    ) -> Dict[str, Any]:
        """
        Feature 112: Post call failure with specific reason.

        Failure reasons:
        - max_uncertain_exceeded: Too many low-confidence responses
        - max_menu_retries: Failed to navigate menu after 3 attempts
        - max_info_retries: Failed to provide info after 2 attempts
        - ivr_timeout: No response from IVR
        - agent_error: Internal agent error

        Args:
            call_id: The call ID
            reason: Specific failure reason
            transcript: Partial conversation transcript

        Returns:
            Response from backend
        """
        url = f"{self.base_url}/api/calls/{call_id}/failure"
        payload = {
            "reason": reason,
            "transcript": transcript
        }
        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        logger.warning(f"Posting failure for call {call_id}: {reason}")

        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            result = response.json()
            logger.info(f"Failure recorded: {result.get('message')}")
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"Backend error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Failed to post failure: {e}")
            raise


# Singleton instance for convenience
_client: Optional[BackendClient] = None


def get_backend_client() -> BackendClient:
    """Get or create singleton backend client."""
    global _client
    if _client is None:
        _client = BackendClient()
    return _client


async def post_extraction_to_backend(
    call_id: str,
    auth_number: str = None,
    status: str = None,
    valid_through: str = None,
    denial_reason: str = None,
    transcript: List[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Convenience function to post extraction results.

    Args:
        call_id: The call ID
        auth_number: Authorization number
        status: Auth status (approved, denied, pending, not_found)
        valid_through: Validity date
        denial_reason: Reason for denial
        transcript: Conversation transcript

    Returns:
        Backend response
    """
    client = get_backend_client()
    extraction = ExtractionData(
        auth_number=auth_number,
        status=status,
        valid_through=valid_through,
        denial_reason=denial_reason,
        transcript=transcript
    )
    return await client.post_extraction(call_id, extraction)


async def post_failure_to_backend(
    call_id: str,
    reason: str,
    transcript: List[Dict[str, str]] = None
) -> Dict[str, Any]:
    """
    Feature 112: Convenience function to post call failure.

    Args:
        call_id: The call ID
        reason: Failure reason (max_uncertain_exceeded, max_menu_retries, etc.)
        transcript: Partial conversation transcript

    Returns:
        Backend response
    """
    client = get_backend_client()
    return await client.post_failure(call_id, reason, transcript)
