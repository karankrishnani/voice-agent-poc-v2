import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = process.env.DATABASE_PATH || path.join(dataDir, 'database.sqlite');
const db = new Database(dbPath);

console.log('Initializing database...');

// Read and execute schema
const schemaPath = path.join(__dirname, '..', 'src', 'db', 'schema.sql');
const schema = fs.readFileSync(schemaPath, 'utf-8');

// Split by semicolon and execute each statement
const statements = schema.split(';').filter(s => s.trim());
for (const statement of statements) {
  if (statement.trim()) {
    db.exec(statement);
  }
}

console.log('Database schema created successfully!');
console.log(`Database location: ${dbPath}`);

db.close();
