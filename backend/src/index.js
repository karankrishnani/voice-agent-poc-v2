import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.BACKEND_PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// API Routes (to be implemented)
// app.use('/api/members', membersRouter);
// app.use('/api/prior-auths', priorAuthsRouter);
// app.use('/api/calls', callsRouter);
// app.use('/api/webhooks', webhooksRouter);
// app.use('/api/stats', statsRouter);

// Placeholder routes
app.get('/api/members', (req, res) => {
  res.json({ message: 'Members API - TODO: Implement' });
});

app.get('/api/prior-auths', (req, res) => {
  res.json({ message: 'Prior Auths API - TODO: Implement' });
});

app.get('/api/calls', (req, res) => {
  res.json({ message: 'Calls API - TODO: Implement' });
});

app.get('/api/stats', (req, res) => {
  res.json({
    totalCalls: 0,
    successRate: 0,
    avgDuration: 0,
    message: 'Stats API - TODO: Implement with real data'
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Backend API running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
