import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:5173', 'http://127.0.0.1:3000'],
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Database setup
let db;

async function initDatabase() {
  const SQL = await initSqlJs();

  // Ensure data directory exists
  const dataDir = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const dbPath = path.join(dataDir, 'database.sqlite');

  // Load existing database or create new one
  if (fs.existsSync(dbPath)) {
    const buffer = fs.readFileSync(dbPath);
    db = new SQL.Database(buffer);
    console.log('Loaded existing database');
  } else {
    db = new SQL.Database();
    console.log('Created new database');

    // Create schema
    const schemaPath = path.join(__dirname, 'db', 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.run(schema);

    // Seed initial data
    seedDatabase();
  }

  // Save database periodically
  setInterval(() => {
    saveDatabase();
  }, 30000); // Every 30 seconds
}

function saveDatabase() {
  if (!db) return;
  const dataDir = path.join(__dirname, '..', 'data');
  const dbPath = path.join(dataDir, 'database.sqlite');
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function seedDatabase() {
  console.log('Seeding database with test data...');

  // Seed Members
  const members = [
    { member_id: 'ABC123456', first_name: 'John', last_name: 'Smith', date_of_birth: '1965-03-15', payer_name: 'Blue Cross Blue Shield' },
    { member_id: 'DEF789012', first_name: 'Sarah', last_name: 'Johnson', date_of_birth: '1978-07-22', payer_name: 'Aetna' },
    { member_id: 'GHI345678', first_name: 'Michael', last_name: 'Williams', date_of_birth: '1982-11-08', payer_name: 'United Healthcare' },
    { member_id: 'JKL901234', first_name: 'Emily', last_name: 'Brown', date_of_birth: '1990-01-30', payer_name: 'Cigna' },
    { member_id: 'MNO567890', first_name: 'Robert', last_name: 'Davis', date_of_birth: '1955-09-12', payer_name: 'Humana' },
  ];

  for (const m of members) {
    db.run(`INSERT OR REPLACE INTO members (member_id, first_name, last_name, date_of_birth, payer_name)
            VALUES (?, ?, ?, ?, ?)`,
           [m.member_id, m.first_name, m.last_name, m.date_of_birth, m.payer_name]);
  }
  console.log(`Inserted ${members.length} members`);

  // Seed Prior Authorizations
  const priorAuths = [
    { member_id: 'ABC123456', auth_number: 'PA2024-78432', cpt_code: '27447', cpt_description: 'Total knee replacement', icd10_code: 'M17.11', icd10_description: 'Primary osteoarthritis, right knee', status: 'approved', valid_from: '2024-01-15', valid_through: '2024-06-30' },
    { member_id: 'DEF789012', auth_number: 'PA2024-65234', cpt_code: '29881', cpt_description: 'Arthroscopy, knee, surgical', icd10_code: 'M23.41', icd10_description: 'Loose body in knee, right knee', status: 'denied', denial_reason: 'Conservative treatment not attempted' },
    { member_id: 'GHI345678', auth_number: 'PA2024-92145', cpt_code: '63030', cpt_description: 'Lumbar laminotomy', icd10_code: 'M51.16', icd10_description: 'Intervertebral disc disorders with radiculopathy, lumbar region', status: 'pending' },
    { member_id: 'JKL901234', auth_number: 'PA2024-41876', cpt_code: '27130', cpt_description: 'Total hip arthroplasty', icd10_code: 'M16.11', icd10_description: 'Primary osteoarthritis, right hip', status: 'approved', valid_from: '2024-02-01', valid_through: '2024-08-01' },
    { member_id: 'ABC123456', auth_number: 'PA2023-12345', cpt_code: '99213', cpt_description: 'Office visit, established patient', status: 'expired', valid_from: '2023-01-01', valid_through: '2023-12-31' },
  ];

  for (const a of priorAuths) {
    db.run(`INSERT OR REPLACE INTO prior_authorizations
            (member_id, auth_number, cpt_code, cpt_description, icd10_code, icd10_description, status, denial_reason, valid_from, valid_through)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           [a.member_id, a.auth_number, a.cpt_code, a.cpt_description || null, a.icd10_code || null,
            a.icd10_description || null, a.status, a.denial_reason || null, a.valid_from || null, a.valid_through || null]);
  }
  console.log(`Inserted ${priorAuths.length} prior authorizations`);

  // Seed CPT codes
  const cptCodes = [
    { code: '27447', description: 'Total knee arthroplasty', category: 'Orthopedic' },
    { code: '29881', description: 'Arthroscopy, knee, surgical', category: 'Orthopedic' },
    { code: '63030', description: 'Lumbar laminotomy', category: 'Spine' },
    { code: '27130', description: 'Total hip arthroplasty', category: 'Orthopedic' },
    { code: '99213', description: 'Office visit, established patient', category: 'E&M' },
  ];

  for (const c of cptCodes) {
    db.run(`INSERT OR REPLACE INTO cpt_codes (code, description, category) VALUES (?, ?, ?)`,
           [c.code, c.description, c.category]);
  }
  console.log(`Inserted ${cptCodes.length} CPT codes`);

  // Seed ICD-10 codes
  const icd10Codes = [
    { code: 'M17.11', description: 'Primary osteoarthritis, right knee', category: 'Musculoskeletal' },
    { code: 'M16.11', description: 'Primary osteoarthritis, right hip', category: 'Musculoskeletal' },
    { code: 'M51.16', description: 'Intervertebral disc disorders with radiculopathy, lumbar region', category: 'Musculoskeletal' },
    { code: 'M23.41', description: 'Loose body in knee, right knee', category: 'Musculoskeletal' },
  ];

  for (const i of icd10Codes) {
    db.run(`INSERT OR REPLACE INTO icd10_codes (code, description, category) VALUES (?, ?, ?)`,
           [i.code, i.description, i.category]);
  }
  console.log(`Inserted ${icd10Codes.length} ICD-10 codes`);

  saveDatabase();
  console.log('Database seeding complete!');
}

// Helper function to convert sql.js results to array of objects
function queryAll(sql, params = []) {
  const result = db.exec(sql, params);
  if (result.length === 0) return [];

  const columns = result[0].columns;
  const values = result[0].values;

  return values.map(row => {
    const obj = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    return obj;
  });
}

function queryOne(sql, params = []) {
  const results = queryAll(sql, params);
  return results.length > 0 ? results[0] : null;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// ============ MEMBERS API ============

// GET /api/members - List all members
app.get('/api/members', (req, res) => {
  try {
    const members = queryAll('SELECT * FROM members ORDER BY created_at DESC');
    res.json(members);
  } catch (error) {
    console.error('Error fetching members:', error);
    res.status(500).json({ error: 'Failed to fetch members' });
  }
});

// GET /api/members/:id - Get single member
app.get('/api/members/:id', (req, res) => {
  try {
    const member = queryOne('SELECT * FROM members WHERE member_id = ?', [req.params.id]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }
    res.json(member);
  } catch (error) {
    console.error('Error fetching member:', error);
    res.status(500).json({ error: 'Failed to fetch member' });
  }
});

// POST /api/members - Create new member
app.post('/api/members', (req, res) => {
  try {
    const { member_id, first_name, last_name, date_of_birth, payer_name } = req.body;

    if (!member_id || !first_name || !last_name || !date_of_birth) {
      return res.status(400).json({ error: 'Missing required fields: member_id, first_name, last_name, date_of_birth' });
    }

    db.run(`INSERT INTO members (member_id, first_name, last_name, date_of_birth, payer_name)
            VALUES (?, ?, ?, ?, ?)`,
           [member_id, first_name, last_name, date_of_birth, payer_name || null]);

    saveDatabase();

    const newMember = queryOne('SELECT * FROM members WHERE member_id = ?', [member_id]);
    res.status(201).json(newMember);
  } catch (error) {
    console.error('Error creating member:', error);
    if (error.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Member ID already exists' });
    }
    res.status(500).json({ error: 'Failed to create member' });
  }
});

// PUT /api/members/:id - Update member
app.put('/api/members/:id', (req, res) => {
  try {
    const { first_name, last_name, date_of_birth, payer_name } = req.body;

    const existing = queryOne('SELECT * FROM members WHERE member_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Member not found' });
    }

    db.run(`UPDATE members SET
            first_name = COALESCE(?, first_name),
            last_name = COALESCE(?, last_name),
            date_of_birth = COALESCE(?, date_of_birth),
            payer_name = COALESCE(?, payer_name),
            updated_at = datetime('now')
            WHERE member_id = ?`,
           [first_name, last_name, date_of_birth, payer_name, req.params.id]);

    saveDatabase();

    const updated = queryOne('SELECT * FROM members WHERE member_id = ?', [req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Error updating member:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
});

// DELETE /api/members/:id - Delete member
app.delete('/api/members/:id', (req, res) => {
  try {
    const existing = queryOne('SELECT * FROM members WHERE member_id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Member not found' });
    }

    db.run('DELETE FROM members WHERE member_id = ?', [req.params.id]);
    saveDatabase();

    res.json({ message: 'Member deleted successfully' });
  } catch (error) {
    console.error('Error deleting member:', error);
    res.status(500).json({ error: 'Failed to delete member' });
  }
});

// ============ PRIOR AUTHORIZATIONS API ============

// GET /api/prior-auths - List all prior authorizations
app.get('/api/prior-auths', (req, res) => {
  try {
    const { member_id, status } = req.query;
    let sql = 'SELECT * FROM prior_authorizations';
    const conditions = [];
    const params = [];

    if (member_id) {
      conditions.push('member_id = ?');
      params.push(member_id);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    const auths = queryAll(sql, params);
    res.json(auths);
  } catch (error) {
    console.error('Error fetching prior auths:', error);
    res.status(500).json({ error: 'Failed to fetch prior authorizations' });
  }
});

// GET /api/prior-auths/:id - Get single authorization
app.get('/api/prior-auths/:id', (req, res) => {
  try {
    const auth = queryOne('SELECT * FROM prior_authorizations WHERE id = ? OR auth_number = ?',
                          [req.params.id, req.params.id]);
    if (!auth) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }
    res.json(auth);
  } catch (error) {
    console.error('Error fetching prior auth:', error);
    res.status(500).json({ error: 'Failed to fetch prior authorization' });
  }
});

// POST /api/prior-auths - Create new prior authorization
app.post('/api/prior-auths', (req, res) => {
  try {
    const { member_id, auth_number, cpt_code, cpt_description, icd10_code, icd10_description,
            status, denial_reason, valid_from, valid_through } = req.body;

    if (!member_id || !cpt_code || !status) {
      return res.status(400).json({ error: 'Missing required fields: member_id, cpt_code, status' });
    }

    const generatedAuthNumber = auth_number || `PA${Date.now()}-${Math.floor(Math.random() * 10000)}`;

    db.run(`INSERT INTO prior_authorizations
            (member_id, auth_number, cpt_code, cpt_description, icd10_code, icd10_description, status, denial_reason, valid_from, valid_through)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
           [member_id, generatedAuthNumber, cpt_code, cpt_description || null, icd10_code || null,
            icd10_description || null, status, denial_reason || null, valid_from || null, valid_through || null]);

    saveDatabase();

    const newAuth = queryOne('SELECT * FROM prior_authorizations WHERE auth_number = ?', [generatedAuthNumber]);
    res.status(201).json(newAuth);
  } catch (error) {
    console.error('Error creating prior auth:', error);
    res.status(500).json({ error: 'Failed to create prior authorization' });
  }
});

// PUT /api/prior-auths/:id - Update prior authorization
app.put('/api/prior-auths/:id', (req, res) => {
  try {
    const { status, denial_reason, valid_from, valid_through } = req.body;

    const existing = queryOne('SELECT * FROM prior_authorizations WHERE id = ? OR auth_number = ?',
                              [req.params.id, req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    // Build dynamic update - sql.js doesn't support undefined
    const updates = [];
    const params = [];

    if (status !== undefined) {
      updates.push('status = ?');
      params.push(status);
    }
    if (denial_reason !== undefined) {
      updates.push('denial_reason = ?');
      params.push(denial_reason);
    }
    if (valid_from !== undefined) {
      updates.push('valid_from = ?');
      params.push(valid_from);
    }
    if (valid_through !== undefined) {
      updates.push('valid_through = ?');
      params.push(valid_through);
    }

    if (updates.length > 0) {
      updates.push("updated_at = datetime('now')");
      const sql = `UPDATE prior_authorizations SET ${updates.join(', ')} WHERE id = ? OR auth_number = ?`;
      params.push(req.params.id, req.params.id);
      db.run(sql, params);
      saveDatabase();
    }

    const updated = queryOne('SELECT * FROM prior_authorizations WHERE id = ? OR auth_number = ?',
                             [req.params.id, req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Error updating prior auth:', error);
    res.status(500).json({ error: 'Failed to update prior authorization' });
  }
});

// DELETE /api/prior-auths/:id - Delete prior authorization
app.delete('/api/prior-auths/:id', (req, res) => {
  try {
    const existing = queryOne('SELECT * FROM prior_authorizations WHERE id = ? OR auth_number = ?',
                              [req.params.id, req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Prior authorization not found' });
    }

    db.run('DELETE FROM prior_authorizations WHERE id = ? OR auth_number = ?', [req.params.id, req.params.id]);
    saveDatabase();

    res.json({ message: 'Prior authorization deleted successfully' });
  } catch (error) {
    console.error('Error deleting prior auth:', error);
    res.status(500).json({ error: 'Failed to delete prior authorization' });
  }
});

// ============ CALLS API ============

// GET /api/calls - List all calls
app.get('/api/calls', (req, res) => {
  try {
    const { member_id, status } = req.query;
    let sql = 'SELECT * FROM calls';
    const conditions = [];
    const params = [];

    if (member_id) {
      conditions.push('member_id = ?');
      params.push(member_id);
    }
    if (status) {
      conditions.push('status = ?');
      params.push(status);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY created_at DESC';

    const calls = queryAll(sql, params);
    res.json(calls);
  } catch (error) {
    console.error('Error fetching calls:', error);
    res.status(500).json({ error: 'Failed to fetch calls' });
  }
});

// GET /api/calls/:id - Get single call with details
app.get('/api/calls/:id', (req, res) => {
  try {
    const call = queryOne('SELECT * FROM calls WHERE id = ? OR call_sid = ?', [req.params.id, req.params.id]);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    // Get call events
    const events = queryAll('SELECT * FROM call_events WHERE call_id = ? ORDER BY timestamp', [call.id]);

    res.json({ ...call, events });
  } catch (error) {
    console.error('Error fetching call:', error);
    res.status(500).json({ error: 'Failed to fetch call' });
  }
});

// GET /api/calls/:id/status - Get call status
app.get('/api/calls/:id/status', (req, res) => {
  try {
    const call = queryOne('SELECT id, status, outcome, duration_seconds FROM calls WHERE id = ? OR call_sid = ?',
                          [req.params.id, req.params.id]);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }
    res.json(call);
  } catch (error) {
    console.error('Error fetching call status:', error);
    res.status(500).json({ error: 'Failed to fetch call status' });
  }
});

// POST /api/calls - Initiate new call
app.post('/api/calls', (req, res) => {
  try {
    const { member_id, cpt_code_queried } = req.body;

    if (!member_id) {
      return res.status(400).json({ error: 'Missing required field: member_id' });
    }

    // Verify member exists
    const member = queryOne('SELECT * FROM members WHERE member_id = ?', [member_id]);
    if (!member) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const callSid = `CALL_${uuidv4()}`;

    db.run(`INSERT INTO calls (member_id, cpt_code_queried, call_sid, status, started_at)
            VALUES (?, ?, ?, 'initiated', datetime('now'))`,
           [member_id, cpt_code_queried || null, callSid]);

    saveDatabase();

    const newCall = queryOne('SELECT * FROM calls WHERE call_sid = ?', [callSid]);
    res.status(201).json(newCall);
  } catch (error) {
    console.error('Error creating call:', error);
    res.status(500).json({ error: 'Failed to initiate call' });
  }
});

// PUT /api/calls/:id - Update call
app.put('/api/calls/:id', (req, res) => {
  try {
    const { status, outcome, extracted_auth_number, extracted_status, extracted_valid_through,
            transcript, duration_seconds } = req.body;

    const existing = queryOne('SELECT * FROM calls WHERE id = ? OR call_sid = ?', [req.params.id, req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Call not found' });
    }

    let endedAt = null;
    if (status === 'completed' || status === 'failed') {
      endedAt = new Date().toISOString();
    }

    db.run(`UPDATE calls SET
            status = COALESCE(?, status),
            outcome = COALESCE(?, outcome),
            extracted_auth_number = COALESCE(?, extracted_auth_number),
            extracted_status = COALESCE(?, extracted_status),
            extracted_valid_through = COALESCE(?, extracted_valid_through),
            transcript = COALESCE(?, transcript),
            duration_seconds = COALESCE(?, duration_seconds),
            ended_at = COALESCE(?, ended_at)
            WHERE id = ? OR call_sid = ?`,
           [status, outcome, extracted_auth_number, extracted_status, extracted_valid_through,
            transcript, duration_seconds, endedAt, req.params.id, req.params.id]);

    saveDatabase();

    const updated = queryOne('SELECT * FROM calls WHERE id = ? OR call_sid = ?', [req.params.id, req.params.id]);
    res.json(updated);
  } catch (error) {
    console.error('Error updating call:', error);
    res.status(500).json({ error: 'Failed to update call' });
  }
});

// POST /api/calls/:id/events - Add call event
app.post('/api/calls/:id/events', (req, res) => {
  try {
    const { event_type, event_data } = req.body;

    const call = queryOne('SELECT id FROM calls WHERE id = ? OR call_sid = ?', [req.params.id, req.params.id]);
    if (!call) {
      return res.status(404).json({ error: 'Call not found' });
    }

    db.run(`INSERT INTO call_events (call_id, event_type, event_data)
            VALUES (?, ?, ?)`,
           [call.id, event_type, JSON.stringify(event_data)]);

    saveDatabase();

    res.status(201).json({ message: 'Event added successfully' });
  } catch (error) {
    console.error('Error adding call event:', error);
    res.status(500).json({ error: 'Failed to add call event' });
  }
});

// ============ STATS API ============

// GET /api/stats - Get call statistics
app.get('/api/stats', (req, res) => {
  try {
    const totalCalls = queryOne('SELECT COUNT(*) as count FROM calls');
    const completedCalls = queryOne("SELECT COUNT(*) as count FROM calls WHERE status = 'completed'");
    const failedCalls = queryOne("SELECT COUNT(*) as count FROM calls WHERE status = 'failed'");
    const avgDuration = queryOne("SELECT AVG(duration_seconds) as avg FROM calls WHERE duration_seconds IS NOT NULL");

    const authFound = queryOne("SELECT COUNT(*) as count FROM calls WHERE outcome = 'auth_found'");
    const authNotFound = queryOne("SELECT COUNT(*) as count FROM calls WHERE outcome = 'auth_not_found'");

    const totalCallsCount = totalCalls?.count || 0;
    const completedCount = completedCalls?.count || 0;
    const successRate = totalCallsCount > 0 ? (completedCount / totalCallsCount * 100).toFixed(1) : 0;

    res.json({
      totalCalls: totalCallsCount,
      completedCalls: completedCount,
      failedCalls: failedCalls?.count || 0,
      successRate: parseFloat(successRate),
      avgDuration: avgDuration?.avg ? Math.round(avgDuration.avg) : 0,
      authFound: authFound?.count || 0,
      authNotFound: authNotFound?.count || 0
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

// ============ REFERENCE DATA API ============

// GET /api/cpt-codes - List CPT codes
app.get('/api/cpt-codes', (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT * FROM cpt_codes';
    let params = [];

    if (q) {
      sql += ' WHERE code LIKE ? OR description LIKE ?';
      params = [`%${q}%`, `%${q}%`];
    }
    sql += ' ORDER BY code';

    const codes = queryAll(sql, params);
    res.json(codes);
  } catch (error) {
    console.error('Error fetching CPT codes:', error);
    res.status(500).json({ error: 'Failed to fetch CPT codes' });
  }
});

// GET /api/icd10-codes - List ICD-10 codes
app.get('/api/icd10-codes', (req, res) => {
  try {
    const { q } = req.query;
    let sql = 'SELECT * FROM icd10_codes';
    let params = [];

    if (q) {
      sql += ' WHERE code LIKE ? OR description LIKE ?';
      params = [`%${q}%`, `%${q}%`];
    }
    sql += ' ORDER BY code';

    const codes = queryAll(sql, params);
    res.json(codes);
  } catch (error) {
    console.error('Error fetching ICD-10 codes:', error);
    res.status(500).json({ error: 'Failed to fetch ICD-10 codes' });
  }
});

// ============ TWILIO WEBHOOKS ============

// POST /api/webhooks/twilio - Handle Twilio call status updates
app.post('/api/webhooks/twilio', (req, res) => {
  try {
    const { CallSid, CallStatus, CallDuration } = req.body;

    console.log(`Twilio webhook: CallSid=${CallSid}, Status=${CallStatus}`);

    if (CallSid) {
      let status = 'in_progress';
      if (CallStatus === 'completed') status = 'completed';
      else if (CallStatus === 'failed' || CallStatus === 'busy' || CallStatus === 'no-answer') status = 'failed';

      db.run(`UPDATE calls SET
              status = ?,
              duration_seconds = COALESCE(?, duration_seconds),
              ended_at = CASE WHEN ? IN ('completed', 'failed') THEN datetime('now') ELSE ended_at END
              WHERE call_sid = ?`,
             [status, CallDuration ? parseInt(CallDuration) : null, status, CallSid]);
      saveDatabase();
    }

    res.status(200).send('OK');
  } catch (error) {
    console.error('Error handling Twilio webhook:', error);
    res.status(500).send('Error');
  }
});

// POST /api/seed - Reset and seed database
app.post('/api/seed', (req, res) => {
  try {
    // Clear existing data
    db.run('DELETE FROM call_events');
    db.run('DELETE FROM calls');
    db.run('DELETE FROM prior_authorizations');
    db.run('DELETE FROM members');
    db.run('DELETE FROM cpt_codes');
    db.run('DELETE FROM icd10_codes');

    // Re-seed
    seedDatabase();

    res.json({ message: 'Database reseeded successfully' });
  } catch (error) {
    console.error('Error seeding database:', error);
    res.status(500).json({ error: 'Failed to seed database' });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server after database is initialized
initDatabase().then(() => {
  app.listen(PORT, () => {
    console.log(`Backend API running on http://localhost:${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
  process.exit(1);
});

// Handle shutdown
process.on('SIGINT', () => {
  console.log('Shutting down...');
  saveDatabase();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('Shutting down...');
  saveDatabase();
  process.exit(0);
});
