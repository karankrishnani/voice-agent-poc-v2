import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';

// Status badge component
function StatusBadge({ status }) {
  const styles = {
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    denied: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    auth_found: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    auth_not_found: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    error: 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400',
  };

  return (
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${styles[status] || styles.pending}`}>
      {status?.replace('_', ' ')}
    </span>
  );
}

export default function CallDetail() {
  const { id } = useParams();
  const [call, setCall] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchCallDetails = async () => {
      try {
        const response = await fetch(`/api/calls/${id}`);
        if (response.ok) {
          const data = await response.json();
          // Parse transcript if it's a JSON string
          if (data.transcript && typeof data.transcript === 'string') {
            try {
              data.transcript = JSON.parse(data.transcript);
            } catch (e) {
              data.transcript = [];
            }
          }
          setCall(data);
        } else {
          setCall(null);
        }
      } catch (error) {
        console.error('Failed to fetch call details:', error);
        setCall(null);
      } finally {
        setLoading(false);
      }
    };
    fetchCallDetails();
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  if (!call) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500 dark:text-gray-400">Call not found</p>
        <Link to="/" className="btn-primary mt-4">Back to Dashboard</Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/" className="text-sm text-primary-600 dark:text-primary-400 hover:underline mb-2 inline-block">
            ← Back to Dashboard
          </Link>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Call Details</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Call ID: {call.id}
          </p>
        </div>
        <StatusBadge status={call.outcome} />
      </div>

      {/* Extracted Data Card */}
      {call.extracted_auth_number && (
        <div className="bg-green-50 dark:bg-green-900/20 rounded-xl border border-green-200 dark:border-green-800 p-6">
          <h3 className="text-lg font-semibold text-green-900 dark:text-green-300 mb-4">
            Extracted Authorization Data
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-green-600 dark:text-green-400">Auth Number</p>
              <p className="text-lg font-mono font-bold text-green-900 dark:text-green-200">
                {call.extracted_auth_number}
              </p>
            </div>
            <div>
              <p className="text-sm text-green-600 dark:text-green-400">Status</p>
              <p className="text-lg font-bold text-green-900 dark:text-green-200 capitalize">
                {call.extracted_status}
              </p>
            </div>
            <div>
              <p className="text-sm text-green-600 dark:text-green-400">Valid Through</p>
              <p className="text-lg font-bold text-green-900 dark:text-green-200">
                {call.extracted_valid_through}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Call Metadata */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Call Information</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Member ID</p>
            <p className="font-medium text-gray-900 dark:text-white">{call.member_id}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">CPT Code</p>
            <p className="font-medium text-gray-900 dark:text-white">{call.cpt_code_queried}</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Duration</p>
            <p className="font-medium text-gray-900 dark:text-white">{call.duration_seconds}s</p>
          </div>
          <div>
            <p className="text-sm text-gray-500 dark:text-gray-400">Date</p>
            <p className="font-medium text-gray-900 dark:text-white">
              {new Date(call.started_at).toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Transcript Viewer */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Conversation Transcript</h3>
        </div>
        <div className="p-6 space-y-3 max-h-[500px] overflow-y-auto">
          {call.transcript?.map((turn, index) => {
            const isIvr = turn.speaker?.toLowerCase() === 'ivr';
            return (
            <div
              key={index}
              className={`p-4 rounded-lg ${
                isIvr
                  ? 'transcript-ivr'
                  : 'transcript-agent'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className={`text-xs font-medium uppercase ${
                  isIvr
                    ? 'text-gray-500 dark:text-gray-400'
                    : 'text-blue-600 dark:text-blue-400'
                }`}>
                  {isIvr ? '🤖 IVR' : '🎙️ Agent'}
                </span>
                <span className="text-xs text-gray-400">{turn.timestamp}</span>
              </div>
              {turn.type === 'dtmf' ? (
                <span className="transcript-dtmf">{turn.text}</span>
              ) : (
                <p className="text-gray-900 dark:text-white">{turn.text}</p>
              )}
            </div>
          );
          })}
        </div>
      </div>
    </div>
  );
}
