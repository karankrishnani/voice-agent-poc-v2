-- Insurance Voice AI POC - Database Schema

-- Members table
CREATE TABLE IF NOT EXISTS members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT UNIQUE NOT NULL,  -- e.g., "ABC123456"
    first_name TEXT NOT NULL,
    last_name TEXT NOT NULL,
    date_of_birth TEXT NOT NULL,     -- YYYY-MM-DD format
    payer_name TEXT,                  -- e.g., "Blue Cross Blue Shield"
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Prior Authorizations table
CREATE TABLE IF NOT EXISTS prior_authorizations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    auth_number TEXT UNIQUE,          -- e.g., "PA2024-78432"
    cpt_code TEXT NOT NULL,           -- e.g., "27447"
    cpt_description TEXT,
    icd10_code TEXT,                  -- e.g., "M17.11"
    icd10_description TEXT,
    status TEXT NOT NULL CHECK(status IN ('approved', 'denied', 'pending', 'expired')),
    denial_reason TEXT,
    valid_from TEXT,                  -- YYYY-MM-DD
    valid_through TEXT,               -- YYYY-MM-DD
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(member_id)
);

-- Calls table
CREATE TABLE IF NOT EXISTS calls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    member_id TEXT NOT NULL,
    cpt_code_queried TEXT,
    call_sid TEXT,                    -- Twilio call SID
    mode TEXT DEFAULT 'webhook' CHECK(mode IN ('webhook', 'streaming', 'simulation')),  -- Phase 2: call mode
    status TEXT NOT NULL CHECK(status IN ('initiated', 'in_progress', 'completed', 'failed')),
    outcome TEXT CHECK(outcome IN ('auth_found', 'auth_not_found', 'error', 'timeout', 'agent_error')),
    extracted_auth_number TEXT,
    extracted_status TEXT,
    extracted_valid_through TEXT,
    transcript TEXT,                  -- JSON array of conversation turns
    duration_seconds INTEGER,
    started_at TEXT,
    ended_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (member_id) REFERENCES members(member_id)
);

-- Call Events table (for detailed logging)
CREATE TABLE IF NOT EXISTS call_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    call_id INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('dtmf_sent', 'speech_detected', 'prompt_heard', 'state_change', 'error')),
    event_data TEXT,                  -- JSON data
    timestamp TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (call_id) REFERENCES calls(id)
);

-- CPT Codes reference table (subset for demo)
CREATE TABLE IF NOT EXISTS cpt_codes (
    code TEXT PRIMARY KEY,
    description TEXT,
    category TEXT
);

-- ICD-10 Codes reference table (subset for demo)
CREATE TABLE IF NOT EXISTS icd10_codes (
    code TEXT PRIMARY KEY,
    description TEXT,
    category TEXT
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_members_member_id ON members(member_id);
CREATE INDEX IF NOT EXISTS idx_prior_auths_member_id ON prior_authorizations(member_id);
CREATE INDEX IF NOT EXISTS idx_prior_auths_cpt_code ON prior_authorizations(cpt_code);
CREATE INDEX IF NOT EXISTS idx_calls_member_id ON calls(member_id);
CREATE INDEX IF NOT EXISTS idx_calls_status ON calls(status);
CREATE INDEX IF NOT EXISTS idx_call_events_call_id ON call_events(call_id);
