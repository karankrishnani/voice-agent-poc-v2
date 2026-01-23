import React, { useState, useEffect } from 'react';

export default function TestData() {
  const [members, setMembers] = useState([]);
  const [priorAuths, setPriorAuths] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('members');

  useEffect(() => {
    // TODO: Fetch from API
    setMembers([
      { id: 1, member_id: 'ABC123456', first_name: 'John', last_name: 'Smith', date_of_birth: '1965-03-15', payer_name: 'Blue Cross Blue Shield' },
      { id: 2, member_id: 'DEF789012', first_name: 'Sarah', last_name: 'Johnson', date_of_birth: '1978-07-22', payer_name: 'Aetna' },
      { id: 3, member_id: 'GHI345678', first_name: 'Michael', last_name: 'Williams', date_of_birth: '1982-11-08', payer_name: 'United Healthcare' },
    ]);
    setPriorAuths([
      { id: 1, member_id: 'ABC123456', auth_number: 'PA2024-78432', cpt_code: '27447', status: 'approved', valid_through: '2024-06-30' },
      { id: 2, member_id: 'DEF789012', auth_number: 'PA2024-65234', cpt_code: '29881', status: 'denied', denial_reason: 'Conservative treatment not attempted' },
      { id: 3, member_id: 'GHI345678', auth_number: 'PA2024-92145', cpt_code: '63030', status: 'pending', valid_through: null },
    ]);
    setLoading(false);
  }, []);

  const handleSeedData = async () => {
    if (!window.confirm('This will reset all test data to default values. Continue?')) return;

    // TODO: Call seed API
    alert('Seed data functionality - TODO: Implement API call');
  };

  const StatusBadge = ({ status }) => {
    const styles = {
      approved: 'bg-green-100 text-green-800',
      denied: 'bg-red-100 text-red-800',
      pending: 'bg-amber-100 text-amber-800',
      expired: 'bg-gray-100 text-gray-600',
    };
    return (
      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${styles[status] || styles.pending}`}>
        {status}
      </span>
    );
  };

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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Test Data</h2>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage test members and prior authorizations for the mock IVR
          </p>
        </div>
        <button onClick={handleSeedData} className="btn-secondary">
          <span className="mr-2">🌱</span>
          Seed Sample Data
        </button>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200 dark:border-slate-700">
        <nav className="flex space-x-8">
          <button
            onClick={() => setActiveTab('members')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'members'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Members ({members.length})
          </button>
          <button
            onClick={() => setActiveTab('priorAuths')}
            className={`pb-4 px-1 border-b-2 font-medium text-sm transition-colors ${
              activeTab === 'priorAuths'
                ? 'border-primary-500 text-primary-600 dark:text-primary-400'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Prior Authorizations ({priorAuths.length})
          </button>
        </nav>
      </div>

      {/* Members Table */}
      {activeTab === 'members' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">Test Members</h3>
            <button className="btn-primary text-sm">
              <span className="mr-1">+</span> Add Member
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Member ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Name</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">DOB</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Payer</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {members.map((member) => (
                  <tr key={member.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900 dark:text-white">{member.member_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">{member.first_name} {member.last_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.date_of_birth}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{member.payer_name}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button className="text-primary-600 hover:text-primary-900 mr-3">Edit</button>
                      <button className="text-red-600 hover:text-red-900">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Prior Auths Table */}
      {activeTab === 'priorAuths' && (
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200 dark:border-slate-700 flex justify-between items-center">
            <h3 className="font-semibold text-gray-900 dark:text-white">Prior Authorizations</h3>
            <button className="btn-primary text-sm">
              <span className="mr-1">+</span> Add Prior Auth
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-slate-700">
              <thead className="bg-gray-50 dark:bg-slate-700/50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Auth #</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Member</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">CPT</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Valid Through</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                {priorAuths.map((auth) => (
                  <tr key={auth.id} className="hover:bg-gray-50 dark:hover:bg-slate-700/30">
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900 dark:text-white">{auth.auth_number}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{auth.member_id}</td>
                    <td className="px-6 py-4 whitespace-nowrap font-mono text-sm text-gray-900 dark:text-white">{auth.cpt_code}</td>
                    <td className="px-6 py-4 whitespace-nowrap"><StatusBadge status={auth.status} /></td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{auth.valid_through || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button className="text-primary-600 hover:text-primary-900 mr-3">Edit</button>
                      <button className="text-red-600 hover:text-red-900">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
