import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, '..', 'data', 'database.sqlite');
const db = new Database(dbPath);

console.log('Seeding database with test data...');

// Seed Members
const members = [
  { member_id: 'ABC123456', first_name: 'John', last_name: 'Smith', date_of_birth: '1965-03-15', payer_name: 'Blue Cross Blue Shield' },
  { member_id: 'DEF789012', first_name: 'Sarah', last_name: 'Johnson', date_of_birth: '1978-07-22', payer_name: 'Aetna' },
  { member_id: 'GHI345678', first_name: 'Michael', last_name: 'Williams', date_of_birth: '1982-11-08', payer_name: 'United Healthcare' },
  { member_id: 'JKL901234', first_name: 'Emily', last_name: 'Brown', date_of_birth: '1990-01-30', payer_name: 'Cigna' },
  { member_id: 'MNO567890', first_name: 'Robert', last_name: 'Davis', date_of_birth: '1955-09-12', payer_name: 'Humana' },
];

const insertMember = db.prepare(`
  INSERT OR REPLACE INTO members (member_id, first_name, last_name, date_of_birth, payer_name)
  VALUES (@member_id, @first_name, @last_name, @date_of_birth, @payer_name)
`);

for (const member of members) {
  insertMember.run(member);
}
console.log(`Inserted ${members.length} members`);

// Seed Prior Authorizations
const priorAuths = [
  {
    member_id: 'ABC123456',
    auth_number: 'PA2024-78432',
    cpt_code: '27447',
    cpt_description: 'Total knee replacement',
    icd10_code: 'M17.11',
    icd10_description: 'Primary osteoarthritis, right knee',
    status: 'approved',
    valid_from: '2024-01-15',
    valid_through: '2024-06-30'
  },
  {
    member_id: 'DEF789012',
    auth_number: 'PA2024-65234',
    cpt_code: '29881',
    cpt_description: 'Arthroscopy, knee, surgical',
    icd10_code: 'M23.41',
    icd10_description: 'Loose body in knee, right knee',
    status: 'denied',
    denial_reason: 'Conservative treatment not attempted'
  },
  {
    member_id: 'GHI345678',
    auth_number: 'PA2024-92145',
    cpt_code: '63030',
    cpt_description: 'Lumbar laminotomy',
    icd10_code: 'M51.16',
    icd10_description: 'Intervertebral disc disorders with radiculopathy, lumbar region',
    status: 'pending'
  },
  {
    member_id: 'JKL901234',
    auth_number: 'PA2024-41876',
    cpt_code: '27130',
    cpt_description: 'Total hip arthroplasty',
    icd10_code: 'M16.11',
    icd10_description: 'Primary osteoarthritis, right hip',
    status: 'approved',
    valid_from: '2024-02-01',
    valid_through: '2024-08-01'
  },
  {
    member_id: 'ABC123456',
    auth_number: 'PA2023-12345',
    cpt_code: '99213',
    cpt_description: 'Office visit, established patient',
    status: 'expired',
    valid_from: '2023-01-01',
    valid_through: '2023-12-31'
  },
];

const insertAuth = db.prepare(`
  INSERT OR REPLACE INTO prior_authorizations
  (member_id, auth_number, cpt_code, cpt_description, icd10_code, icd10_description, status, denial_reason, valid_from, valid_through)
  VALUES (@member_id, @auth_number, @cpt_code, @cpt_description, @icd10_code, @icd10_description, @status, @denial_reason, @valid_from, @valid_through)
`);

for (const auth of priorAuths) {
  insertAuth.run({
    member_id: auth.member_id,
    auth_number: auth.auth_number,
    cpt_code: auth.cpt_code,
    cpt_description: auth.cpt_description || null,
    icd10_code: auth.icd10_code || null,
    icd10_description: auth.icd10_description || null,
    status: auth.status,
    denial_reason: auth.denial_reason || null,
    valid_from: auth.valid_from || null,
    valid_through: auth.valid_through || null
  });
}
console.log(`Inserted ${priorAuths.length} prior authorizations`);

// Seed common CPT codes
const cptCodes = [
  { code: '27447', description: 'Arthroplasty, knee, condyle and plateau; medial AND lateral compartments with or without patella resurfacing (total knee arthroplasty)', category: 'Orthopedic' },
  { code: '29881', description: 'Arthroscopy, knee, surgical; with meniscectomy including any meniscal shaving', category: 'Orthopedic' },
  { code: '63030', description: 'Laminotomy with decompression of nerve root, including partial facetectomy, foraminotomy and/or excision of herniated intervertebral disc; 1 interspace, lumbar', category: 'Spine' },
  { code: '27130', description: 'Arthroplasty, acetabular and proximal femoral prosthetic replacement (total hip arthroplasty)', category: 'Orthopedic' },
  { code: '99213', description: 'Office or other outpatient visit, established patient, low complexity', category: 'E&M' },
  { code: '70553', description: 'MRI brain with and without contrast', category: 'Radiology' },
  { code: '43239', description: 'EGD with biopsy', category: 'Gastroenterology' },
];

const insertCpt = db.prepare(`
  INSERT OR REPLACE INTO cpt_codes (code, description, category)
  VALUES (@code, @description, @category)
`);

for (const cpt of cptCodes) {
  insertCpt.run(cpt);
}
console.log(`Inserted ${cptCodes.length} CPT codes`);

// Seed common ICD-10 codes
const icd10Codes = [
  { code: 'M17.11', description: 'Primary osteoarthritis, right knee', category: 'Musculoskeletal' },
  { code: 'M17.12', description: 'Primary osteoarthritis, left knee', category: 'Musculoskeletal' },
  { code: 'M16.11', description: 'Primary osteoarthritis, right hip', category: 'Musculoskeletal' },
  { code: 'M16.12', description: 'Primary osteoarthritis, left hip', category: 'Musculoskeletal' },
  { code: 'M51.16', description: 'Intervertebral disc disorders with radiculopathy, lumbar region', category: 'Musculoskeletal' },
  { code: 'M23.41', description: 'Loose body in knee, right knee', category: 'Musculoskeletal' },
  { code: 'G89.29', description: 'Other chronic pain', category: 'Nervous System' },
];

const insertIcd10 = db.prepare(`
  INSERT OR REPLACE INTO icd10_codes (code, description, category)
  VALUES (@code, @description, @category)
`);

for (const icd10 of icd10Codes) {
  insertIcd10.run(icd10);
}
console.log(`Inserted ${icd10Codes.length} ICD-10 codes`);

console.log('Database seeding complete!');
db.close();
