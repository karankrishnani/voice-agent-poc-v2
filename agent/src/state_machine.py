"""
Call State Machine Module

Manages the state transitions for voice agent calls.
"""

from enum import Enum, auto
from typing import Optional, List, Dict
from loguru import logger


class CallState(Enum):
    """Possible states during a voice agent call."""

    IDLE = auto()
    DIALING = auto()
    NAVIGATING_MENU = auto()
    PROVIDING_INFO = auto()
    WAITING_RESPONSE = auto()
    ON_HOLD = auto()
    EXTRACTING_RESULT = auto()
    CALL_COMPLETE = auto()
    CALL_FAILED = auto()


# Valid state transitions
VALID_TRANSITIONS: Dict[CallState, List[CallState]] = {
    CallState.IDLE: [CallState.DIALING],
    CallState.DIALING: [CallState.NAVIGATING_MENU, CallState.CALL_FAILED],
    CallState.NAVIGATING_MENU: [
        CallState.PROVIDING_INFO,
        CallState.WAITING_RESPONSE,
        CallState.ON_HOLD,
        CallState.CALL_FAILED,
    ],
    CallState.PROVIDING_INFO: [
        CallState.WAITING_RESPONSE,
        CallState.NAVIGATING_MENU,
        CallState.CALL_FAILED,
    ],
    CallState.WAITING_RESPONSE: [
        CallState.NAVIGATING_MENU,
        CallState.ON_HOLD,
        CallState.EXTRACTING_RESULT,
        CallState.CALL_FAILED,
    ],
    CallState.ON_HOLD: [
        CallState.NAVIGATING_MENU,
        CallState.WAITING_RESPONSE,
        CallState.CALL_FAILED,
    ],
    CallState.EXTRACTING_RESULT: [CallState.CALL_COMPLETE, CallState.CALL_FAILED],
    CallState.CALL_COMPLETE: [],  # Terminal state
    CallState.CALL_FAILED: [],  # Terminal state
}


class CallStateMachine:
    """
    State machine for managing voice agent call states.

    Ensures valid transitions and provides state change callbacks.
    """

    def __init__(self):
        """Initialize the state machine in IDLE state."""
        self._state = CallState.IDLE
        self._state_history: List[CallState] = [CallState.IDLE]
        self._callbacks: Dict[CallState, List[callable]] = {}

    @property
    def state(self) -> CallState:
        """Get the current state."""
        return self._state

    @property
    def state_history(self) -> List[CallState]:
        """Get the history of state transitions."""
        return self._state_history.copy()

    def can_transition(self, target_state: CallState) -> bool:
        """Check if a transition to the target state is valid."""
        valid_targets = VALID_TRANSITIONS.get(self._state, [])
        return target_state in valid_targets

    def transition(self, target_state: CallState) -> bool:
        """
        Attempt to transition to a new state.

        Args:
            target_state: The state to transition to

        Returns:
            True if transition was successful, False otherwise

        Raises:
            ValueError: If the transition is invalid
        """
        if not self.can_transition(target_state):
            # Allow any state to transition to CALL_FAILED
            if target_state == CallState.CALL_FAILED:
                logger.warning(
                    f"Forcing transition to CALL_FAILED from {self._state.name}"
                )
            else:
                raise ValueError(
                    f"Invalid state transition: {self._state.name} -> {target_state.name}"
                )

        old_state = self._state
        self._state = target_state
        self._state_history.append(target_state)

        logger.info(f"State transition: {old_state.name} -> {target_state.name}")

        # Trigger callbacks
        self._trigger_callbacks(target_state)

        return True

    def reset(self):
        """Reset the state machine to IDLE."""
        self._state = CallState.IDLE
        self._state_history = [CallState.IDLE]
        logger.debug("State machine reset to IDLE")

    def on_state(self, state: CallState, callback: callable):
        """
        Register a callback for when a specific state is entered.

        Args:
            state: The state to trigger the callback
            callback: Function to call when entering the state
        """
        if state not in self._callbacks:
            self._callbacks[state] = []
        self._callbacks[state].append(callback)

    def _trigger_callbacks(self, state: CallState):
        """Trigger all callbacks registered for a state."""
        if state in self._callbacks:
            for callback in self._callbacks[state]:
                try:
                    callback(state)
                except Exception as e:
                    logger.error(f"Callback error for state {state.name}: {e}")

    def is_terminal(self) -> bool:
        """Check if the current state is terminal (call ended)."""
        return self._state in (CallState.CALL_COMPLETE, CallState.CALL_FAILED)

    def is_active(self) -> bool:
        """Check if a call is currently active."""
        return self._state not in (
            CallState.IDLE,
            CallState.CALL_COMPLETE,
            CallState.CALL_FAILED,
        )
