"""
Insurance Voice AI Agent - Main Entry Point

This module initializes and runs the voice AI agent for automated
prior authorization status checks.
"""

import asyncio
import os
from dotenv import load_dotenv
from loguru import logger

from agent import VoiceAgent
from config import AgentConfig

# Load environment variables
load_dotenv()


async def main():
    """Main entry point for the voice agent."""
    logger.info("Starting Insurance Voice AI Agent")

    # Validate required environment variables
    required_vars = [
        "TWILIO_ACCOUNT_SID",
        "TWILIO_AUTH_TOKEN",
        "TWILIO_PHONE_NUMBER",
        "DEEPGRAM_API_KEY",
        "ELEVENLABS_API_KEY",
        "ANTHROPIC_API_KEY",
    ]

    missing_vars = [var for var in required_vars if not os.getenv(var)]
    if missing_vars:
        logger.error(f"Missing required environment variables: {missing_vars}")
        logger.info("Please set these variables in your .env file")
        return

    # Initialize configuration
    config = AgentConfig(
        twilio_account_sid=os.getenv("TWILIO_ACCOUNT_SID"),
        twilio_auth_token=os.getenv("TWILIO_AUTH_TOKEN"),
        twilio_phone_number=os.getenv("TWILIO_PHONE_NUMBER"),
        deepgram_api_key=os.getenv("DEEPGRAM_API_KEY"),
        elevenlabs_api_key=os.getenv("ELEVENLABS_API_KEY"),
        anthropic_api_key=os.getenv("ANTHROPIC_API_KEY"),
    )

    # Create and run agent
    agent = VoiceAgent(config)

    try:
        # Example: Make a test call
        # In production, this would be triggered by the backend API
        test_call_data = {
            "member_id": "ABC123456",
            "date_of_birth": "03151965",  # MMDDYYYY
            "cpt_code": "27447",
            "target_phone": os.getenv("MOCK_IVR_PHONE", "+1234567890"),
        }

        logger.info(f"Initiating test call: {test_call_data}")
        # result = await agent.make_call(test_call_data)
        # logger.info(f"Call result: {result}")

        logger.info("Agent initialized successfully")
        logger.info("Ready to receive call requests from backend API")

        # Keep running (in production, would integrate with API server)
        # await asyncio.Event().wait()

    except KeyboardInterrupt:
        logger.info("Shutting down agent...")
    except Exception as e:
        logger.error(f"Agent error: {e}")
        raise


if __name__ == "__main__":
    asyncio.run(main())
