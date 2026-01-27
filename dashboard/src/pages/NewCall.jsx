import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

export default function NewCall() {
  const navigate = useNavigate();
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [callStatus, setCallStatus] = useState(null);

  const [formData, setFormData] = useState({
    memberId: '',
    cptCode: '',
  });

  // Phase 2: Streaming mode toggle - default to streaming (Phase 2)
  const [streamingMode, setStreamingMode] = useState(true);

  // Phase 2: Provider selector - default to Random
  const [selectedProvider, setSelectedProvider] = useState('random');

  // Provider list from docs/PHASE2-STREAMING.md Phase 8
  const providers = [
    { id: 'random', name: 'Random', description: 'Randomly select a provider' },
    { id: 'abc', name: 'ABC Insurance', description: 'Standard baseline' },
    { id: 'uhc', name: 'United Healthcare', description: 'Info order: member-id, cpt, dob' },
    { id: 'aetna', name: 'Aetna', description: 'Voice-first ("say or press")' },
    { id: 'cigna', name: 'Cigna', description: 'Long-winded prompts' },
    { id: 'kaiser', name: 'Kaiser', description: 'Terse prompts' },
    { id: 'molina', name: 'Molina', description: 'Language menu first' },
    { id: 'anthem', name: 'Anthem', description: 'Requires NPI' },
    { id: 'humana', name: 'Humana', description: 'Numeric IDs only' },
    { id: 'bcbs', name: 'BCBS', description: 'Spells out numbers' },
    { id: 'tricare', name: 'Tricare', description: 'Nested sub-menus' },
  ];

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const response = await fetch('/api/members');
        if (response.ok) {
          const data = await response.json();
          setMembers(data);
        }
      } catch (error) {
        console.error('Failed to fetch members:', error);
      } finally {
        setLoading(false);
      }
    };
    fetchMembers();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setCallStatus({ state: 'DIALING', message: 'Initiating call...' });

    try {
      // Step 1: Create the call record
      // Use /api/calls/stream for streaming mode, /api/calls for webhook mode
      const endpoint = streamingMode ? '/api/calls/stream' : '/api/calls';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: formData.memberId,
          cpt_code_queried: formData.cptCode,
          provider: selectedProvider !== 'random' ? selectedProvider : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate call');
      }

      const callData = await response.json();

      // Check if this is a real Twilio call or simulation mode
      if (callData.mode === 'twilio') {
        // Real Twilio call - poll for status updates
        setCallStatus({ state: 'DIALING', message: 'Calling IVR... Answer your phone!' });

        // Poll for call status
        const pollStatus = async () => {
          for (let i = 0; i < 120; i++) { // Poll for up to 2 minutes
            await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2 seconds

            try {
              const statusResponse = await fetch(`/api/calls/${callData.id}`);
              if (statusResponse.ok) {
                const statusData = await statusResponse.json();

                if (statusData.status === 'in_progress') {
                  setCallStatus({ state: 'NAVIGATING_MENU', message: 'Call connected, agent navigating IVR...' });
                } else if (statusData.status === 'completed') {
                  const outcomeMessage = statusData.extracted_status
                    ? `Auth ${statusData.extracted_auth_number}: ${statusData.extracted_status}`
                    : 'No authorization found';
                  setCallStatus({ state: 'CALL_COMPLETE', message: `Call completed! ${outcomeMessage}` });
                  setTimeout(() => navigate(`/calls/${callData.id}`), 2000);
                  return;
                } else if (statusData.status === 'failed') {
                  setCallStatus({ state: 'CALL_FAILED', message: 'Call failed: ' + (statusData.outcome || 'Unknown error') });
                  setSubmitting(false);
                  return;
                }
              }
            } catch (e) {
              console.error('Error polling status:', e);
            }
          }
          // Timeout
          setCallStatus({ state: 'CALL_FAILED', message: 'Call timed out' });
          setSubmitting(false);
        };

        pollStatus();
      } else {
        // Simulation mode - run the simulation
        setCallStatus({ state: 'NAVIGATING_MENU', message: 'Connected, navigating IVR (simulation)...' });

        const simulateResponse = await fetch(`/api/calls/${callData.id}/simulate`, {
          method: 'POST',
        });

        if (!simulateResponse.ok) {
          throw new Error('Call simulation failed');
        }

        const result = await simulateResponse.json();

        if (result.call.status === 'completed') {
          const outcomeMessage = result.call.extracted_status
            ? `Auth ${result.call.extracted_auth_number}: ${result.call.extracted_status}`
            : 'No authorization found';
          setCallStatus({ state: 'CALL_COMPLETE', message: `Call completed! ${outcomeMessage}` });
          setTimeout(() => navigate(`/calls/${callData.id}`), 2000);
        } else {
          setCallStatus({ state: 'CALL_FAILED', message: 'Call failed: ' + (result.call.outcome || 'Unknown error') });
          setSubmitting(false);
        }
      }
    } catch (error) {
      setCallStatus({ state: 'CALL_FAILED', message: 'Call failed: ' + error.message });
      setSubmitting(false);
    }
  };

  const getStatusColor = (state) => {
    switch (state) {
      case 'CALL_COMPLETE': return 'text-green-600 bg-green-100 border-green-200';
      case 'CALL_FAILED': return 'text-red-600 bg-red-100 border-red-200';
      default: return 'text-blue-600 bg-blue-100 border-blue-200';
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">New Call</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Initiate a voice AI call to check prior authorization status
        </p>
      </div>

      {/* Call Status Display */}
      {callStatus && (
        <div className={`rounded-xl border-2 p-6 ${getStatusColor(callStatus.state)}`}>
          <div className="flex items-center space-x-4">
            {callStatus.state !== 'CALL_COMPLETE' && callStatus.state !== 'CALL_FAILED' && (
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-current"></div>
            )}
            {callStatus.state === 'CALL_COMPLETE' && <span className="text-3xl">✅</span>}
            {callStatus.state === 'CALL_FAILED' && <span className="text-3xl">❌</span>}
            <div>
              <p className="font-semibold">{callStatus.state.replace('_', ' ')}</p>
              <p className="text-sm opacity-80">{callStatus.message}</p>
            </div>
          </div>
        </div>
      )}

      {/* Call Form */}
      <form onSubmit={handleSubmit} className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6 space-y-6">
        {/* Member Selection */}
        <div>
          <label htmlFor="memberId" className="form-label">
            Select Member
          </label>
          <select
            id="memberId"
            className="form-select"
            value={formData.memberId}
            onChange={(e) => setFormData({ ...formData, memberId: e.target.value })}
            disabled={submitting}
            required
          >
            <option value="">Choose a member...</option>
            {members.map((member) => (
              <option key={member.member_id} value={member.member_id}>
                {member.first_name} {member.last_name} ({member.member_id})
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Select from test members or manage them in Test Data
          </p>
        </div>

        {/* CPT Code */}
        <div>
          <label htmlFor="cptCode" className="form-label">
            CPT Procedure Code
          </label>
          <input
            type="text"
            id="cptCode"
            className="form-input"
            placeholder="e.g., 27447"
            value={formData.cptCode}
            onChange={(e) => setFormData({ ...formData, cptCode: e.target.value })}
            disabled={submitting}
            required
            pattern="[0-9]{5}"
            title="Enter a 5-digit CPT code"
          />
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Enter the 5-digit CPT code to check authorization status
          </p>
        </div>

        {/* Common CPT Codes Quick Select */}
        <div>
          <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Common CPT Codes:
          </p>
          <div className="flex flex-wrap gap-2">
            {['27447', '29881', '63030', '27130', '70553'].map((code) => (
              <button
                key={code}
                type="button"
                className="px-3 py-1 text-sm bg-gray-100 dark:bg-slate-700 rounded-lg hover:bg-gray-200 dark:hover:bg-slate-600 transition-colors"
                onClick={() => setFormData({ ...formData, cptCode: code })}
                disabled={submitting}
              >
                {code}
              </button>
            ))}
          </div>
        </div>

        {/* Phase 2: Streaming Mode Toggle */}
        <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
          <div>
            <label htmlFor="streamingMode" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Streaming Mode (Phase 2)
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {streamingMode
                ? 'Uses ConversationRelay with Claude AI for intelligent IVR navigation'
                : 'Uses webhook-based TwiML flow with regex extraction'
              }
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={streamingMode}
            onClick={() => setStreamingMode(!streamingMode)}
            disabled={submitting}
            className={`
              relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent
              transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2
              ${streamingMode ? 'bg-blue-600' : 'bg-gray-300 dark:bg-slate-600'}
              ${submitting ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <span
              className={`
                pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                transition duration-200 ease-in-out
                ${streamingMode ? 'translate-x-5' : 'translate-x-0'}
              `}
            />
          </button>
        </div>

        {/* Phase 2: Provider Selector */}
        <div>
          <label htmlFor="provider" className="form-label">
            IVR Provider Profile
          </label>
          <select
            id="provider"
            className="form-select"
            value={selectedProvider}
            onChange={(e) => setSelectedProvider(e.target.value)}
            disabled={submitting}
          >
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.name} {provider.id !== 'random' ? `- ${provider.description}` : ''}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
            Select a specific insurance IVR variation to test, or Random for variety
          </p>
        </div>

        {/* Submit Button */}
        <div className="pt-4 border-t border-gray-200 dark:border-slate-700">
          <button
            type="submit"
            className="btn-primary w-full"
            disabled={submitting || !formData.memberId || !formData.cptCode}
          >
            {submitting ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2"></div>
                Call in Progress...
              </>
            ) : (
              <>
                <span className="mr-2">📞</span>
                Start Call
              </>
            )}
          </button>
        </div>
      </form>

      {/* Help Text */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 border border-blue-100 dark:border-blue-800">
        <h4 className="font-medium text-blue-900 dark:text-blue-300">How it works:</h4>
        <ol className="mt-2 text-sm text-blue-800 dark:text-blue-400 space-y-1 list-decimal list-inside">
          <li>Select a test member and enter a CPT code</li>
          <li>The AI agent will call the mock insurance IVR</li>
          <li>Watch real-time status as the agent navigates the phone tree</li>
          <li>View extracted authorization data when complete</li>
        </ol>
      </div>
    </div>
  );
}
