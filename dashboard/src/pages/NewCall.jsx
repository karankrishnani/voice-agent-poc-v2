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
      // Make actual API call to create the call
      const response = await fetch('/api/calls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          member_id: formData.memberId,
          cpt_code_queried: formData.cptCode,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to initiate call');
      }

      const callData = await response.json();

      // Simulate call progress for demo (since we don't have actual Twilio)
      setTimeout(() => setCallStatus({ state: 'NAVIGATING_MENU', message: 'Connected, navigating IVR menu...' }), 2000);
      setTimeout(() => setCallStatus({ state: 'PROVIDING_INFO', message: 'Providing member information...' }), 4000);
      setTimeout(() => setCallStatus({ state: 'WAITING_RESPONSE', message: 'Waiting for authorization status...' }), 6000);
      setTimeout(() => {
        setCallStatus({ state: 'CALL_COMPLETE', message: 'Call completed!' });
        // Navigate to call detail after a moment
        setTimeout(() => navigate(`/calls/${callData.id}`), 1500);
      }, 8000);
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
