import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
const PORT = process.env.MOCK_IVR_PORT || 3002;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', service: 'mock-ivr', timestamp: new Date().toISOString() });
});

// TwiML response helper
function twimlResponse(content) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
${content}
</Response>`;
}

// Welcome/Main Menu
app.post('/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/menu" method="POST">
    <Say voice="Polly.Joanna">
      Thank you for calling ABC Insurance. Para español, oprima el dos.
      For claims, press 1. For prior authorization, press 2.
      For member services, press 3. To repeat this menu, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Main Menu Router
app.post('/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Claims department is currently closed. Please call back during business hours.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.redirect(307, '/prior-auth-menu');
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services is currently closed. Please call back during business hours.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.redirect(307, '/voice');
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/voice</Redirect>
      `));
  }
});

// Prior Authorization Menu
app.post('/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/prior-auth-route" method="POST">
    <Say voice="Polly.Joanna">
      You've reached prior authorization.
      To check the status of an existing authorization, press 1.
      To submit a new authorization request, press 2.
      To speak with a representative, press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Prior Auth Router
app.post('/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.redirect(307, '/collect-member-id');
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">New authorization requests must be submitted through our online portal. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please hold while we transfer you to a representative.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">All representatives are currently busy. Please try again later.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/prior-auth-menu</Redirect>
      `));
  }
});

// Collect Member ID
app.post('/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" numDigits="9" action="/collect-dob" method="POST" timeout="10">
    <Say voice="Polly.Joanna">Please enter or say your 9-digit member ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/collect-member-id</Redirect>
`));
});

// Collect Date of Birth
app.post('/collect-dob', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult;
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" numDigits="8" action="/collect-cpt?memberId=${memberId}" method="POST" timeout="10">
    <Say voice="Polly.Joanna">Please enter or say the patient's date of birth as 8 digits. Month, day, and 4 digit year.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/collect-dob?memberId=${memberId}</Redirect>
`));
});

// Collect CPT Code
app.post('/collect-cpt', (req, res) => {
  const memberId = req.query.memberId;
  const dob = req.body.Digits || req.body.SpeechResult;
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" numDigits="5" action="/lookup-auth?memberId=${memberId}&amp;dob=${dob}" method="POST" timeout="10">
    <Say voice="Polly.Joanna">Please enter the CPT procedure code you're inquiring about.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/collect-cpt?memberId=${memberId}</Redirect>
`));
});

// Lookup Authorization (mock response based on test data)
app.post('/lookup-auth', (req, res) => {
  const memberId = req.query.memberId;
  const dob = req.query.dob;
  const cptCode = req.body.Digits || req.body.SpeechResult;

  res.type('text/xml');

  // Mock responses based on member ID patterns
  // In production, this would query the actual database

  // ABC123456 has approved auth for 27447
  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-78432 for procedure code ${cptCode} is approved through June 30, 2024.
        Is there anything else I can help you with today?
      </Say>
      <Hangup/>
    `));
  }
  // DEF789012 has denied auth
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-65234 for procedure code ${cptCode} was denied.
        Reason: Conservative treatment not attempted.
        You may submit an appeal through our online portal.
      </Say>
      <Hangup/>
    `));
  }
  // GHI345678 has pending auth
  else if (memberId && memberId.startsWith('GHI')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-92145 for procedure code ${cptCode} is currently pending review.
        Please allow 3 to 5 business days for a determination.
      </Say>
      <Hangup/>
    `));
  }
  // Not found for other cases
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found for this member and procedure code.
        Please verify the information and try again, or contact member services for assistance.
      </Say>
      <Hangup/>
    `));
  }
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  res.type('text/xml');
  res.send(twimlResponse(`
    <Say voice="Polly.Joanna">We're experiencing technical difficulties. Please try again later.</Say>
    <Hangup/>
  `));
});

// Start server
app.listen(PORT, () => {
  console.log(`Mock IVR running on http://localhost:${PORT}`);
  console.log(`TwiML endpoint: http://localhost:${PORT}/voice`);
  console.log(`Health check: http://localhost:${PORT}/health`);
});
