import React, { useState } from 'react';

export default function Settings() {
  const [settings, setSettings] = useState({
    twilioConfigured: false,
    deepgramConfigured: false,
    elevenlabsConfigured: false,
    anthropicConfigured: false,
    mockIvrUrl: 'http://localhost:3002',
    webhookUrl: '',
  });

  const ApiKeyStatus = ({ configured, name }) => (
    <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-slate-700/50 rounded-lg">
      <div>
        <p className="font-medium text-gray-900 dark:text-white">{name}</p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {configured ? 'Configured via environment variable' : 'Not configured'}
        </p>
      </div>
      <span className={`flex items-center ${configured ? 'text-green-600' : 'text-gray-400'}`}>
        {configured ? (
          <>
            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
            Connected
          </>
        ) : (
          <>
            <span className="w-2 h-2 bg-gray-400 rounded-full mr-2"></span>
            Not Set
          </>
        )}
      </span>
    </div>
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Page Header */}
      <div>
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Settings</h2>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Configure API keys and agent behavior
        </p>
      </div>

      {/* API Keys Status */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">API Keys Status</h3>
        <div className="space-y-3">
          <ApiKeyStatus name="Twilio" configured={settings.twilioConfigured} />
          <ApiKeyStatus name="Deepgram (STT)" configured={settings.deepgramConfigured} />
          <ApiKeyStatus name="ElevenLabs (TTS)" configured={settings.elevenlabsConfigured} />
          <ApiKeyStatus name="Anthropic (Claude)" configured={settings.anthropicConfigured} />
        </div>
        <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
          <p className="text-sm text-blue-800 dark:text-blue-300">
            <strong>Note:</strong> API keys are configured via environment variables for security.
            See <code className="bg-blue-100 dark:bg-blue-800 px-1 rounded">.env.example</code> for required variables.
          </p>
        </div>
      </div>

      {/* Target Configuration */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">IVR Configuration</h3>
        <div className="space-y-4">
          <div>
            <label className="form-label">Mock IVR URL</label>
            <input
              type="url"
              className="form-input"
              value={settings.mockIvrUrl}
              onChange={(e) => setSettings({ ...settings, mockIvrUrl: e.target.value })}
              placeholder="http://localhost:3002"
            />
            <p className="mt-1 text-xs text-gray-500">
              URL of the mock IVR system (for testing) or real IVR endpoint
            </p>
          </div>
          <div>
            <label className="form-label">Webhook URL</label>
            <input
              type="url"
              className="form-input"
              value={settings.webhookUrl}
              onChange={(e) => setSettings({ ...settings, webhookUrl: e.target.value })}
              placeholder="https://your-ngrok-url.ngrok.io"
            />
            <p className="mt-1 text-xs text-gray-500">
              Public URL for Twilio webhooks (use ngrok for local development)
            </p>
          </div>
        </div>
      </div>

      {/* Agent Behavior */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Agent Behavior</h3>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Log Transcripts</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Save complete call transcripts</p>
            </div>
            <input type="checkbox" defaultChecked className="h-5 w-5 rounded text-primary-600" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Record Calls</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Enable call recording via Twilio</p>
            </div>
            <input type="checkbox" className="h-5 w-5 rounded text-primary-600" />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-900 dark:text-white">Auto-retry on Failure</p>
              <p className="text-sm text-gray-500 dark:text-gray-400">Automatically retry failed calls</p>
            </div>
            <input type="checkbox" className="h-5 w-5 rounded text-primary-600" />
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="flex justify-end">
        <button className="btn-primary">
          Save Settings
        </button>
      </div>
    </div>
  );
}
