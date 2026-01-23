import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';

// Status badge component
function StatusBadge({ status }) {
  const styles = {
    approved: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    denied: 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300',
    pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300',
    in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900/50 dark:text-blue-300',
    completed: 'bg-green-100 text-green-800 dark:bg-green-900/50 dark:text-green-300',
    failed: 'bg-gray-100 text-red-600 dark:bg-gray-800 dark:text-red-400',
  };

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || styles.pending}`}>
      {status === 'in_progress' && (
        <span className="w-1.5 h-1.5 bg-blue-500 rounded-full mr-1.5 animate-pulse"></span>
      )}
      {status?.replace('_', ' ')}
    </span>
  );
}

// Stat card component
function StatCard({ title, value, icon, color }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">{title}</p>
          <p className={`mt-2 text-3xl font-bold ${color}`}>{value}</p>
        </div>
        <div className="text-3xl opacity-80">{icon}</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState({
    totalCalls: 0,
    successRate: 0,
    avgDuration: 0,
  });
  const [recentCalls, setRecentCalls] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const API_URL = 'http://localhost:3001';

        // Fetch stats and recent calls in parallel
        const [statsRes, callsRes] = await Promise.all([
          fetch(`${API_URL}/api/stats`),
          fetch(`${API_URL}/api/calls`)
        ]);

        if (statsRes.ok) {
          const statsData = await statsRes.json();
          setStats({
            totalCalls: statsData.totalCalls || 0,
            successRate: statsData.successRate || 0,
            avgDuration: statsData.avgDuration || 0,
          });
        }

        if (callsRes.ok) {
          const callsData = await callsRes.json();
          // Get the 5 most recent calls
          setRecentCalls(Array.isArray(callsData) ? callsData.slice(0, 5) : []);
        }
      } catch (error) {
        console.error('Failed to fetch dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();

    // Refresh data every 10 seconds
    const interval = setInterval(fetchData, 10000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Dashboard</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Overview of your voice AI call activity
          </p>
        </div>
        <Link to="/new-call" className="btn-primary">
          <span className="mr-2">📞</span>
          New Call
        </Link>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <StatCard
          title="Total Calls"
          value={stats.totalCalls}
          icon="📊"
          color="text-gray-900 dark:text-white"
        />
        <StatCard
          title="Success Rate"
          value={`${stats.successRate}%`}
          icon="✅"
          color="text-green-600 dark:text-green-400"
        />
        <StatCard
          title="Avg Duration"
          value={`${stats.avgDuration}s`}
          icon="⏱️"
          color="text-blue-600 dark:text-blue-400"
        />
      </div>

      {/* Recent Calls */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Recent Calls</h3>
        </div>
        {recentCalls.length === 0 ? (
          <div className="p-12 text-center">
            <div className="text-4xl mb-4">📞</div>
            <p className="text-gray-500 dark:text-gray-400">No calls yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
              Start your first call to see it here
            </p>
            <Link to="/new-call" className="btn-primary mt-4">
              Start Your First Call
            </Link>
          </div>
        ) : (
          <div className="divide-y divide-gray-200 dark:divide-slate-700">
            {recentCalls.map((call) => (
              <Link
                key={call.id}
                to={`/calls/${call.id}`}
                className="flex items-center justify-between px-6 py-4 hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <div className="flex items-center space-x-4">
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {call.member_id}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      CPT: {call.cpt_code_queried}
                    </p>
                  </div>
                </div>
                <div className="flex items-center space-x-4">
                  <StatusBadge status={call.outcome || call.status} />
                  <span className="text-sm text-gray-500 dark:text-gray-400">
                    {new Date(call.created_at).toLocaleDateString()}
                  </span>
                  <span className="text-gray-400">→</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
