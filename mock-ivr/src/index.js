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
  <Gather input="dtmf" numDigits="1" action="/menu" method="POST" timeout="15">
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
      res.send(twimlResponse(`
        <Redirect>/prior-auth-menu</Redirect>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services is currently closed. Please call back during business hours.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/voice</Redirect>
      `));
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
  <Gather input="dtmf" numDigits="1" action="/prior-auth-route" method="POST" timeout="15">
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
      res.send(twimlResponse(`
        <Redirect>/collect-member-id</Redirect>
      `));
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
  <Gather input="dtmf speech" action="/collect-dob" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say your 9-digit member ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/collect-member-id</Redirect>
`));
});

// Collect Date of Birth
app.post('/collect-dob', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say the patient's date of birth as 8 digits. Month, day, and 4 digit year.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// Collect CPT Code
app.post('/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || req.body.SpeechResult || '';
  console.log(`Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter the CPT procedure code you're inquiring about.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// Lookup Authorization (mock response based on test data)
// Supports error scenarios via member ID prefixes - see docs/PHASE2-STREAMING.md
app.post('/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  // ============ CPT-BASED TRIGGERS ============

  // CPT codes starting with 99 (E&M codes) - no prior auth required
  if (cptCode && cptCode.startsWith('99')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Procedure code ${cptCode} is an evaluation and management code and does not require prior authorization.
        No authorization is needed for this service.
      </Say>
      <Hangup/>
    `));
    return;
  }

  // ============ ERROR SCENARIOS (prefix-based triggers) ============

  // XXX* prefix: Invalid/Unknown member ID - member not found in system
  if (memberId && memberId.startsWith('XXX')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        I'm sorry, I could not find a member with ID ${memberId.split('').join(' ')}.
        Please verify the member ID and try again.
      </Say>
      <Hangup/>
    `));
    return;
  }

  // EXP* prefix: Expired authorization
  if (memberId && memberId.startsWith('EXP')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2023-12345 for procedure code ${cptCode} has expired.
        The authorization was valid through December 31, 2023.
        A new authorization will need to be submitted.
      </Say>
      <Hangup/>
    `));
    return;
  }

  // ERR* prefix: System error during lookup
  if (memberId && memberId.startsWith('ERR')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        I apologize, but we are experiencing a system error and cannot retrieve authorization information at this time.
        Please try again later or contact member services for assistance.
        Error code: SYS-500.
      </Say>
      <Hangup/>
    `));
    return;
  }

  // MUL* prefix: Multiple authorizations found - agent must select by CPT
  if (memberId && memberId.startsWith('MUL')) {
    if (cptCode === '27447') {
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">
          Please hold while I look up that information.
        </Say>
        <Pause length="2"/>
        <Say voice="Polly.Joanna">
          I found multiple authorizations for this member.
          For procedure code ${cptCode}, knee replacement: Authorization PA2024-MUL01 is approved through June 30, 2024.
        </Say>
        <Hangup/>
      `));
    } else if (cptCode === '29881') {
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">
          Please hold while I look up that information.
        </Say>
        <Pause length="2"/>
        <Say voice="Polly.Joanna">
          I found multiple authorizations for this member.
          For procedure code ${cptCode}, arthroscopy: Authorization PA2024-MUL02 is approved through August 15, 2024.
        </Say>
        <Hangup/>
      `));
    } else {
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">
          Please hold while I look up that information.
        </Say>
        <Pause length="2"/>
        <Say voice="Polly.Joanna">
          I found multiple authorizations for this member, but none match procedure code ${cptCode}.
          Please verify the procedure code and try again.
        </Say>
        <Hangup/>
      `));
    }
    return;
  }

  // PAR* prefix: Partial match - requires additional identity confirmation
  if (memberId && memberId.startsWith('PAR')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        I found a partial match for this member, but I need to verify additional information.
        Can you please confirm the patient's last name?
      </Say>
      <Gather input="speech" action="/confirm-identity?memberId=${memberId}&amp;cptCode=${cptCode}" method="POST" timeout="10" speechTimeout="auto">
        <Say voice="Polly.Joanna">Please say the patient's last name now.</Say>
      </Gather>
      <Say voice="Polly.Joanna">I didn't hear a response. Goodbye.</Say>
      <Hangup/>
    `));
    return;
  }

  // REC* prefix: Recent call - status unchanged from previous inquiry
  if (memberId && memberId.startsWith('REC')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        I see that you recently called about this authorization.
        Authorization PA2024-REC01 for procedure code ${cptCode} is still pending review.
        The status has not changed since your last inquiry on January 25th.
        Please allow 3 to 5 business days for a determination.
      </Say>
      <Hangup/>
    `));
    return;
  }

  // ============ STANDARD SCENARIOS ============

  // ABC* prefix: Approved auth for 27447
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
  // DEF* prefix: Denied auth
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
  // GHI* prefix: Pending auth
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

// Helper endpoint for PAR* partial match identity confirmation
app.post('/confirm-identity', (req, res) => {
  const memberId = req.query.memberId || '';
  const cptCode = req.query.cptCode || '';
  const lastName = req.body.SpeechResult || '';

  console.log(`Identity confirmation - Member: ${memberId}, Last name: ${lastName}`);

  res.type('text/xml');

  // For demo purposes, accept any last name that starts with 'S'
  if (lastName.toLowerCase().startsWith('s')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Thank you for confirming. I found your authorization.
        Authorization PA2024-PAR01 for procedure code ${cptCode} is approved through July 31, 2024.
      </Say>
      <Hangup/>
    `));
  } else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        I'm sorry, the information provided does not match our records.
        Please contact member services for assistance.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// ANTHEM Provider Routes (requires NPI before member ID)
// See docs/PHASE2-STREAMING.md for provider profile details
// ============================================================================

// Anthem Welcome/Main Menu
app.post('/anthem/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/anthem/menu" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Thank you for calling Anthem Blue Cross Blue Shield.
      For claims, press 1. For prior authorization, press 2.
      For member services, press 3. To repeat, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Anthem Main Menu Router
app.post('/anthem/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Claims department is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Redirect>/anthem/prior-auth-menu</Redirect>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/anthem/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/anthem/voice</Redirect>
      `));
  }
});

// Anthem Prior Authorization Menu
app.post('/anthem/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/anthem/prior-auth-route" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      You've reached Anthem prior authorization.
      To check the status of an existing authorization, press 1.
      To submit a new authorization request, press 2.
      To speak with a representative, press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Anthem Prior Auth Router
app.post('/anthem/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      // Anthem requires NPI FIRST, before member ID
      res.send(twimlResponse(`
        <Redirect>/anthem/collect-npi</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">New authorization requests must be submitted through our provider portal. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please hold for a representative.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">All representatives are currently busy. Please try again later.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/anthem/prior-auth-menu</Redirect>
      `));
  }
});

// Anthem: Collect NPI (National Provider Identifier) - FIRST, before member ID
app.post('/anthem/collect-npi', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/anthem/collect-member-id" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Please enter or say your 10-digit National Provider Identifier, also known as your NPI number.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/anthem/collect-npi</Redirect>
`));
});

// Anthem: Collect Member ID (after NPI)
app.post('/anthem/collect-member-id', (req, res) => {
  const npi = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Anthem] Received NPI: ${npi}`);
  const encodedNpi = encodeURIComponent(npi);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/anthem/collect-dob?npi=${encodedNpi}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Thank you. Now please enter or say the patient's 9-digit member ID.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/anthem/collect-member-id?npi=${encodedNpi}</Redirect>
`));
});

// Anthem: Collect Date of Birth
app.post('/anthem/collect-dob', (req, res) => {
  const npi = req.query.npi || '';
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Anthem] Received member ID: ${memberId}, NPI: ${npi}`);
  const encodedNpi = encodeURIComponent(npi);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/anthem/collect-cpt?npi=${encodedNpi}&amp;memberId=${encodedMemberId}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Please enter or say the patient's date of birth as 8 digits. Month, day, and 4 digit year.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/anthem/collect-dob?npi=${encodedNpi}&amp;memberId=${encodedMemberId}</Redirect>
`));
});

// Anthem: Collect CPT Code
app.post('/anthem/collect-cpt', (req, res) => {
  const npi = req.query.npi || '';
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Anthem] Received DOB: ${dob}, Member ID: ${memberId}, NPI: ${npi}`);
  const encodedNpi = encodeURIComponent(npi);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/anthem/lookup-auth?npi=${encodedNpi}&amp;memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Please enter the CPT procedure code you're inquiring about.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/anthem/collect-cpt?npi=${encodedNpi}&amp;memberId=${encodedMemberId}</Redirect>
`));
});

// Anthem: Lookup Authorization (same logic as ABC but includes NPI in flow)
app.post('/anthem/lookup-auth', (req, res) => {
  const npi = (req.query.npi || '').replace(/\s+/g, '');
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`[Anthem] Lookup auth - NPI: ${npi}, Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  // Validate NPI (should be 10 digits)
  if (!npi || npi.length < 10) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        The NPI provided appears to be invalid. Please verify and call again.
      </Say>
      <Hangup/>
    `));
    return;
  }

  // Mock responses based on member ID patterns (same as ABC)
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
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-65234 for procedure code ${cptCode} was denied.
        Reason: Conservative treatment not attempted.
        You may submit an appeal through our provider portal.
      </Say>
      <Hangup/>
    `));
  }
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
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found for this member and procedure code.
        Please verify the information and try again.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// HUMANA Provider Routes (numeric IDs only - DTMF required)
// See docs/PHASE2-STREAMING.md for provider profile details
// Prior Auth = 3 steps in main menu
// ============================================================================

// Humana Welcome/Main Menu
app.post('/humana/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/humana/menu" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Thank you for calling Humana.
      For pharmacy, press 1. For medical claims, press 2.
      For prior authorization, press 3. For member services, press 4.
      To repeat, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Humana Main Menu Router
app.post('/humana/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Pharmacy department is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Medical claims is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Redirect>/humana/prior-auth-menu</Redirect>
      `));
      break;
    case '4':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/humana/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/humana/voice</Redirect>
      `));
  }
});

// Humana Prior Authorization Menu
app.post('/humana/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/humana/prior-auth-route" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      You've reached Humana prior authorization.
      To check authorization status, press 1.
      To submit a new request, press 2.
      For a representative, press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Humana Prior Auth Router
app.post('/humana/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Redirect>/humana/collect-member-id</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please submit new requests through our online portal. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please hold for a representative.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">All representatives are currently busy.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/humana/prior-auth-menu</Redirect>
      `));
  }
});

// Humana: Collect Member ID - DTMF ONLY (no speech)
// Humana requires numeric member IDs entered via keypad
app.post('/humana/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" action="/humana/collect-dob" method="POST" timeout="15" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Please use your keypad to enter your numeric member ID followed by the pound sign.
      Note: Only numeric input is accepted.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/humana/collect-member-id</Redirect>
`));
});

// Humana: Collect Date of Birth - DTMF ONLY
app.post('/humana/collect-dob', (req, res) => {
  const memberId = req.body.Digits || '';
  console.log(`[Humana] Received member ID: ${memberId}`);

  // Validate numeric only
  if (!/^\d+$/.test(memberId)) {
    res.type('text/xml');
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Invalid member ID. Please enter numeric digits only.</Say>
      <Redirect>/humana/collect-member-id</Redirect>
    `));
    return;
  }

  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" action="/humana/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="15" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Please enter the patient's date of birth using your keypad.
      Enter as 8 digits: month, day, and 4 digit year.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/humana/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// Humana: Collect CPT Code - DTMF ONLY
app.post('/humana/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || '';
  console.log(`[Humana] Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" action="/humana/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="15" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Please enter the CPT procedure code using your keypad.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/humana/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// Humana: Lookup Authorization
app.post('/humana/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || '').replace(/\s+/g, '');

  console.log(`[Humana] Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  // Mock responses - Humana uses same data patterns but with numeric IDs
  // For testing, map ABC -> 123, DEF -> 456, GHI -> 789
  if (memberId && (memberId.startsWith('123') || memberId.startsWith('ABC')) && cptCode === '27447') {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-78432 for procedure code ${cptCode} is approved through June 30, 2024.
        Thank you for calling Humana.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && (memberId.startsWith('456') || memberId.startsWith('DEF'))) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-65234 for procedure code ${cptCode} was denied.
        Reason: Conservative treatment not attempted.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && (memberId.startsWith('789') || memberId.startsWith('GHI'))) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-92145 for procedure code ${cptCode} is currently pending review.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found for this member and procedure code.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// BCBS Provider Routes (spells out numbers)
// See docs/PHASE2-STREAMING.md for provider profile details
// Prior Auth = 2 steps in main menu
// Key variation: Authorization numbers are spoken as individual characters
// ============================================================================

// Helper function to spell out a string character by character
function spellOut(str) {
  return str.split('').map(char => {
    if (char === '-') return 'dash';
    if (char === ' ') return '';
    return char;
  }).filter(c => c).join(' ');
}

// BCBS Welcome/Main Menu
app.post('/bcbs/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/bcbs/menu" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Thank you for calling Blue Cross Blue Shield.
      For claims, press 1. For prior authorization, press 2.
      For member services, press 3. To repeat, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// BCBS Main Menu Router
app.post('/bcbs/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Claims department is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Redirect>/bcbs/prior-auth-menu</Redirect>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/bcbs/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/bcbs/voice</Redirect>
      `));
  }
});

// BCBS Prior Authorization Menu
app.post('/bcbs/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/bcbs/prior-auth-route" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      You've reached Blue Cross Blue Shield prior authorization.
      To check authorization status, press 1.
      To submit a new request, press 2.
      For a representative, press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// BCBS Prior Auth Router
app.post('/bcbs/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Redirect>/bcbs/collect-member-id</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please use our online portal. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please hold.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">Representatives are busy.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/bcbs/prior-auth-menu</Redirect>
      `));
  }
});

// BCBS: Collect Member ID
app.post('/bcbs/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/bcbs/collect-dob" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say your member ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/bcbs/collect-member-id</Redirect>
`));
});

// BCBS: Collect Date of Birth
app.post('/bcbs/collect-dob', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[BCBS] Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/bcbs/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say the patient's date of birth.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/bcbs/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// BCBS: Collect CPT Code
app.post('/bcbs/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[BCBS] Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/bcbs/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter the procedure code.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/bcbs/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// BCBS: Lookup Authorization - SPELLS OUT AUTH NUMBERS
app.post('/bcbs/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`[BCBS] Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  // BCBS spells out all authorization numbers character by character
  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    const authNumber = 'PA2024-78432';
    const spelledAuth = spellOut(authNumber);
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization number: <prosody rate="slow">${spelledAuth}</prosody>.
        That's ${spelledAuth}.
        For procedure code ${cptCode}, status is approved, valid through June 30, 2024.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('DEF')) {
    const authNumber = 'PA2024-65234';
    const spelledAuth = spellOut(authNumber);
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization number: <prosody rate="slow">${spelledAuth}</prosody>.
        For procedure code ${cptCode}, status is denied.
        Reason: Conservative treatment not attempted.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('GHI')) {
    const authNumber = 'PA2024-92145';
    const spelledAuth = spellOut(authNumber);
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization number: <prosody rate="slow">${spelledAuth}</prosody>.
        For procedure code ${cptCode}, status is pending review.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found for this member and procedure code.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// TRICARE Provider Routes (nested sub-menus)
// See docs/PHASE2-STREAMING.md for provider profile details
// Prior Auth = 2 steps in main menu
// Key variation: Has nested sub-menu for authorization types before status check
// ============================================================================

// Tricare Welcome/Main Menu
app.post('/tricare/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/tricare/menu" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Thank you for calling TRICARE.
      For claims, press 1. For prior authorization, press 2.
      For enrollment, press 3. For pharmacy, press 4.
      To repeat, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Tricare Main Menu Router
app.post('/tricare/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Claims department is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Redirect>/tricare/prior-auth-menu</Redirect>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Enrollment is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '4':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Pharmacy is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/tricare/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/tricare/voice</Redirect>
      `));
  }
});

// Tricare Prior Authorization Menu - First level
app.post('/tricare/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/tricare/prior-auth-type" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      You've reached TRICARE prior authorization.
      For medical procedures, press 1.
      For behavioral health, press 2.
      For durable medical equipment, press 3.
      To return to the main menu, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Tricare: Authorization Type Sub-menu (nested)
app.post('/tricare/prior-auth-type', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      // Medical procedures - goes to ANOTHER sub-menu
      res.send(twimlResponse(`
        <Redirect>/tricare/medical-auth-menu</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Behavioral health authorization. Please call the behavioral health line.</Say>
        <Hangup/>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">DME authorization. Please use our online portal.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/tricare/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/tricare/prior-auth-menu</Redirect>
      `));
  }
});

// Tricare: Medical Authorization Sub-menu (nested level 2)
app.post('/tricare/medical-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/tricare/medical-auth-route" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Medical procedures authorization.
      To check the status of an existing authorization, press 1.
      To submit a new authorization request, press 2.
      To speak with a representative, press 0.
      To return to the previous menu, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Tricare: Medical Auth Router
app.post('/tricare/medical-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Redirect>/tricare/collect-member-id</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please submit requests through the TRICARE online portal. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please hold for a representative.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">All representatives are currently busy.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/tricare/prior-auth-menu</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/tricare/medical-auth-menu</Redirect>
      `));
  }
});

// Tricare: Collect Member ID (same pattern as ABC)
app.post('/tricare/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/tricare/collect-dob" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say your TRICARE beneficiary ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/tricare/collect-member-id</Redirect>
`));
});

// Tricare: Collect Date of Birth
app.post('/tricare/collect-dob', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Tricare] Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/tricare/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say the beneficiary's date of birth.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/tricare/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// Tricare: Collect CPT Code
app.post('/tricare/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Tricare] Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/tricare/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter the CPT procedure code.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/tricare/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// Tricare: Lookup Authorization
app.post('/tricare/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`[Tricare] Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-78432 for procedure code ${cptCode} is approved through June 30, 2024.
        Thank you for calling TRICARE.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-65234 for procedure code ${cptCode} was denied.
        Reason: Conservative treatment not attempted.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('GHI')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-92145 for procedure code ${cptCode} is currently pending review.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Please hold while I look up that information.
      </Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found for this beneficiary and procedure code.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// UNITED HEALTHCARE Provider Routes (Prior Auth=1, different info order)
// See docs/PHASE2-STREAMING.md for provider profile details
// Key variation: Prior Auth is at menu option 1, info order is member-id, cpt, THEN dob
// ============================================================================

// United Welcome/Main Menu
app.post('/united/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/united/menu" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Thank you for calling United Healthcare.
      For prior authorization and referrals, press 1.
      For claims, press 2. For benefits and eligibility, press 3.
      For member services, press 4. To repeat, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// United Main Menu Router
app.post('/united/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      // Prior Auth at option 1!
      res.send(twimlResponse(`
        <Redirect>/united/prior-auth-menu</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Claims department is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Benefits and eligibility is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '4':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/united/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/united/voice</Redirect>
      `));
  }
});

// United Prior Authorization Menu
app.post('/united/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/united/prior-auth-route" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      United Healthcare prior authorization.
      To check status, press 1. For new requests, press 2.
      For a representative, press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// United Prior Auth Router
app.post('/united/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Redirect>/united/collect-member-id</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please use our provider portal. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please hold.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">Representatives are busy.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/united/prior-auth-menu</Redirect>
      `));
  }
});

// United: Collect Member ID FIRST
app.post('/united/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/united/collect-cpt" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say the member ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/united/collect-member-id</Redirect>
`));
});

// United: Collect CPT Code SECOND (different from standard order!)
app.post('/united/collect-cpt', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[United] Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/united/collect-dob?memberId=${encodedMemberId}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Now enter the CPT procedure code.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/united/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// United: Collect Date of Birth LAST (different order!)
app.post('/united/collect-dob', (req, res) => {
  const memberId = req.query.memberId || '';
  const cptCode = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[United] Received CPT: ${cptCode}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedCpt = encodeURIComponent(cptCode);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/united/lookup-auth?memberId=${encodedMemberId}&amp;cptCode=${encodedCpt}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Finally, enter the patient's date of birth as 8 digits.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/united/collect-dob?memberId=${encodedMemberId}&amp;cptCode=${encodedCpt}</Redirect>
`));
});

// United: Lookup Authorization
app.post('/united/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const cptCode = (req.query.cptCode || '').replace(/\s+/g, '');
  const dob = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`[United] Lookup auth - Member ID: ${memberId}, CPT: ${cptCode}, DOB: ${dob}`);

  res.type('text/xml');

  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-78432 for procedure code ${cptCode} is approved through June 30, 2024.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-65234 for procedure code ${cptCode} was denied. Reason: Conservative treatment not attempted.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('GHI')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-92145 for procedure code ${cptCode} is pending review.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found for this member and procedure code.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// AETNA Provider Routes (Prior Auth=3, voice-first "say or press")
// See docs/PHASE2-STREAMING.md for provider profile details
// Key variation: Emphasizes voice input with "say or press" phrasing
// ============================================================================

// Aetna Welcome/Main Menu
app.post('/aetna/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" numDigits="1" action="/aetna/menu" method="POST" timeout="15" speechTimeout="auto">
    <Say voice="Polly.Joanna">
      Thank you for calling Aetna.
      Say "claims" or press 1. Say "benefits" or press 2.
      Say "prior authorization" or press 3. Say "member services" or press 4.
      Or say "repeat" or press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Aetna Main Menu Router
app.post('/aetna/menu', (req, res) => {
  const digit = req.body.Digits;
  const speech = (req.body.SpeechResult || '').toLowerCase();
  res.type('text/xml');

  // Handle both DTMF and speech
  if (digit === '1' || speech.includes('claim')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Claims is currently closed.</Say>
      <Hangup/>
    `));
  }
  else if (digit === '2' || speech.includes('benefit')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Benefits is currently closed.</Say>
      <Hangup/>
    `));
  }
  else if (digit === '3' || speech.includes('prior') || speech.includes('auth')) {
    res.send(twimlResponse(`
      <Redirect>/aetna/prior-auth-menu</Redirect>
    `));
  }
  else if (digit === '4' || speech.includes('member')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Member services is currently closed.</Say>
      <Hangup/>
    `));
  }
  else if (digit === '9' || speech.includes('repeat')) {
    res.send(twimlResponse(`
      <Redirect>/aetna/voice</Redirect>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">I didn't understand that.</Say>
      <Redirect>/aetna/voice</Redirect>
    `));
  }
});

// Aetna Prior Authorization Menu - Voice-first
app.post('/aetna/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" numDigits="1" action="/aetna/prior-auth-route" method="POST" timeout="15" speechTimeout="auto">
    <Say voice="Polly.Joanna">
      Prior authorization. Say "check status" or press 1.
      Say "new request" or press 2. Say "representative" or press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Aetna Prior Auth Router
app.post('/aetna/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  const speech = (req.body.SpeechResult || '').toLowerCase();
  res.type('text/xml');

  if (digit === '1' || speech.includes('status') || speech.includes('check')) {
    res.send(twimlResponse(`
      <Redirect>/aetna/collect-member-id</Redirect>
    `));
  }
  else if (digit === '2' || speech.includes('new') || speech.includes('request')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please use our online portal. Goodbye.</Say>
      <Hangup/>
    `));
  }
  else if (digit === '0' || speech.includes('representative') || speech.includes('agent')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Play>https://api.twilio.com/cowbell.mp3</Play>
      <Say voice="Polly.Joanna">Representatives are busy.</Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">I didn't understand.</Say>
      <Redirect>/aetna/prior-auth-menu</Redirect>
    `));
  }
});

// Aetna: Collect Member ID - Voice-first
app.post('/aetna/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="speech dtmf" action="/aetna/collect-dob" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please say or enter the member ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/aetna/collect-member-id</Redirect>
`));
});

// Aetna: Collect Date of Birth
app.post('/aetna/collect-dob', (req, res) => {
  const memberId = req.body.SpeechResult || req.body.Digits || '';
  console.log(`[Aetna] Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="speech dtmf" action="/aetna/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Say or enter the patient's date of birth.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/aetna/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// Aetna: Collect CPT Code
app.post('/aetna/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.SpeechResult || req.body.Digits || '';
  console.log(`[Aetna] Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="speech dtmf" action="/aetna/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Say or enter the procedure code.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/aetna/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// Aetna: Lookup Authorization
app.post('/aetna/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.SpeechResult || req.body.Digits || '').replace(/\s+/g, '');

  console.log(`[Aetna] Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Let me check that for you.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-78432 for procedure code ${cptCode} is approved through June 30, 2024.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Let me check that for you.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-65234 for procedure code ${cptCode} was denied.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('GHI')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Let me check that for you.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-92145 for procedure code ${cptCode} is pending.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Let me check that for you.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// CIGNA Provider Routes (Prior Auth=4, long-winded prompts)
// See docs/PHASE2-STREAMING.md for provider profile details
// Key variation: Very verbose prompts with extra details
// ============================================================================

// Cigna Welcome/Main Menu - Long prompts
app.post('/cigna/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/cigna/menu" method="POST" timeout="20">
    <Say voice="Polly.Joanna">
      Thank you for calling Cigna Healthcare, your partner in health and wellness.
      We appreciate your patience. Your call is important to us.
      For information about your medical claims and claim status, please press 1.
      For questions about your benefits, coverage, and eligibility, please press 2.
      For prescription drug benefits and pharmacy services, please press 3.
      For prior authorization and medical necessity reviews, please press 4.
      To speak with a member services representative, please press 5.
      To hear these options again, please press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not receive your selection. Thank you for calling Cigna. Goodbye.</Say>
`));
});

// Cigna Main Menu Router
app.post('/cigna/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. The claims department is currently closed. Please call back during normal business hours, Monday through Friday, 8am to 8pm Eastern time.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. Benefits and eligibility services are currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. Pharmacy services are currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '4':
      // Prior Auth at option 4!
      res.send(twimlResponse(`
        <Redirect>/cigna/prior-auth-menu</Redirect>
      `));
      break;
    case '5':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. Member services is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/cigna/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">I'm sorry, that was not a valid selection. Please try again.</Say>
        <Redirect>/cigna/voice</Redirect>
      `));
  }
});

// Cigna Prior Authorization Menu - Long prompts
app.post('/cigna/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/cigna/prior-auth-route" method="POST" timeout="20">
    <Say voice="Polly.Joanna">
      Thank you for contacting Cigna prior authorization services.
      If you are calling to check the status of an existing prior authorization request, please press 1.
      If you would like to submit a new prior authorization request, please press 2.
      If you need to speak with a clinical review specialist, please press 0.
      To return to the main menu, please press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not receive your selection. Goodbye.</Say>
`));
});

// Cigna Prior Auth Router
app.post('/cigna/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. I'll help you check the status of your authorization.</Say>
        <Redirect>/cigna/collect-member-id</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. To submit a new prior authorization request, please visit our secure provider portal at cigna dot com forward slash providers. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Thank you. Please hold while I connect you with a clinical review specialist. This may take several minutes.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">I apologize, but all of our specialists are currently assisting other callers. Please try again later.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/cigna/voice</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">I'm sorry, that was not a valid selection.</Say>
        <Redirect>/cigna/prior-auth-menu</Redirect>
      `));
  }
});

// Cigna: Collect Member ID - Long prompts
app.post('/cigna/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/cigna/collect-dob" method="POST" timeout="15" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">
      To look up your authorization, I'll need some information.
      Please enter or clearly state the patient's Cigna member identification number.
      This is typically a 9 to 11 character alphanumeric code found on the front of your Cigna ID card.
      When finished, press the pound key.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't receive your input. Let me try again.</Say>
  <Redirect>/cigna/collect-member-id</Redirect>
`));
});

// Cigna: Collect Date of Birth
app.post('/cigna/collect-dob', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Cigna] Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/cigna/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="15" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Thank you. Now, please enter or state the patient's date of birth.
      Please enter as 8 digits: two digits for the month, two digits for the day, and four digits for the year.
      For example, January 15th, 1980 would be entered as 01151980.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't receive your input.</Say>
  <Redirect>/cigna/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// Cigna: Collect CPT Code
app.post('/cigna/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Cigna] Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/cigna/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="15" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">
      Thank you. Finally, please enter or state the 5-digit CPT procedure code for the service you are inquiring about.
      This code identifies the specific medical procedure or service that requires authorization.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">I didn't receive your input.</Say>
  <Redirect>/cigna/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// Cigna: Lookup Authorization - Long responses
app.post('/cigna/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`[Cigna] Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Thank you for your patience. Please hold while I retrieve that information from our system.
      </Say>
      <Pause length="3"/>
      <Say voice="Polly.Joanna">
        I have located the authorization. Authorization number PA2024-78432 for CPT procedure code ${cptCode},
        which is a total knee arthroplasty, has been approved. This authorization is valid through June 30, 2024.
        Is there anything else I can help you with today?
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Thank you for your patience. Please hold while I retrieve that information.
      </Say>
      <Pause length="3"/>
      <Say voice="Polly.Joanna">
        I have located the authorization. Unfortunately, authorization number PA2024-65234 for CPT procedure code ${cptCode}
        has been denied. The denial reason documented in our system is: Conservative treatment options have not been adequately attempted.
        You may submit an appeal through our provider portal.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('GHI')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Thank you for your patience. Please hold while I retrieve that information.
      </Say>
      <Pause length="3"/>
      <Say voice="Polly.Joanna">
        I have located the authorization. Authorization number PA2024-92145 for CPT procedure code ${cptCode}
        is currently pending medical review. Please allow 3 to 5 business days for a determination.
        You will receive written notification once a decision has been made.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">
        Thank you for your patience. Please hold while I search our system.
      </Say>
      <Pause length="3"/>
      <Say voice="Polly.Joanna">
        I was unable to locate a prior authorization matching the information you provided.
        Please verify the member ID and procedure code and try again,
        or contact our provider services department for assistance.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// KAISER Provider Routes (Prior Auth=2, terse prompts)
// See docs/PHASE2-STREAMING.md for provider profile details
// Key variation: Short, efficient prompts
// ============================================================================

// Kaiser Welcome/Main Menu - Terse
app.post('/kaiser/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/kaiser/menu" method="POST" timeout="10">
    <Say voice="Polly.Joanna">
      Kaiser. Claims 1. Auth 2. Member 3.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">No input. Goodbye.</Say>
`));
});

// Kaiser Main Menu Router
app.post('/kaiser/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Claims closed.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Redirect>/kaiser/prior-auth-menu</Redirect>
      `));
      break;
    case '3':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services closed.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid.</Say>
        <Redirect>/kaiser/voice</Redirect>
      `));
  }
});

// Kaiser Prior Authorization Menu - Terse
app.post('/kaiser/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/kaiser/prior-auth-route" method="POST" timeout="10">
    <Say voice="Polly.Joanna">
      Status 1. New 2. Rep 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">No input. Goodbye.</Say>
`));
});

// Kaiser Prior Auth Router
app.post('/kaiser/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Redirect>/kaiser/collect-member-id</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Use portal.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Hold.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">Busy.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid.</Say>
        <Redirect>/kaiser/prior-auth-menu</Redirect>
      `));
  }
});

// Kaiser: Collect Member ID - Terse
app.post('/kaiser/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/kaiser/collect-dob" method="POST" timeout="8" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Member ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No input.</Say>
  <Redirect>/kaiser/collect-member-id</Redirect>
`));
});

// Kaiser: Collect Date of Birth
app.post('/kaiser/collect-dob', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Kaiser] Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/kaiser/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="8" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">DOB.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No input.</Say>
  <Redirect>/kaiser/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// Kaiser: Collect CPT Code
app.post('/kaiser/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Kaiser] Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/kaiser/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="8" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">CPT.</Say>
  </Gather>
  <Say voice="Polly.Joanna">No input.</Say>
  <Redirect>/kaiser/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// Kaiser: Lookup Authorization - Terse
app.post('/kaiser/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`[Kaiser] Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    res.send(twimlResponse(`
      <Pause length="1"/>
      <Say voice="Polly.Joanna">
        PA2024-78432. Approved. Valid June 30, 2024.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Pause length="1"/>
      <Say voice="Polly.Joanna">
        PA2024-65234. Denied.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('GHI')) {
    res.send(twimlResponse(`
      <Pause length="1"/>
      <Say voice="Polly.Joanna">
        PA2024-92145. Pending.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Pause length="1"/>
      <Say voice="Polly.Joanna">
        Not found.
      </Say>
      <Hangup/>
    `));
  }
});

// ============================================================================
// MOLINA Provider Routes (Prior Auth=3, language menu first)
// See docs/PHASE2-STREAMING.md for provider profile details
// Key variation: Language selection menu BEFORE main menu
// ============================================================================

// Molina Welcome - Language Selection FIRST
app.post('/molina/voice', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/molina/language" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Thank you for calling Molina Healthcare.
    </Say>
    <Say voice="Polly.Joanna" language="es-US">
      Para continuar en español, oprima el 2.
    </Say>
    <Say voice="Polly.Joanna">
      For English, press 1. Para español, press 2.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Molina Language Selection
app.post('/molina/language', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  if (digit === '1' || digit === '2') {
    // For POC, both languages go to English menu
    res.send(twimlResponse(`
      <Redirect>/molina/main-menu</Redirect>
    `));
  } else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Invalid selection.</Say>
      <Redirect>/molina/voice</Redirect>
    `));
  }
});

// Molina Main Menu (after language selection)
app.post('/molina/main-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/molina/menu" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Main menu. For claims, press 1. For benefits, press 2.
      For prior authorization, press 3. For member services, press 4.
      To repeat, press 9.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Molina Main Menu Router
app.post('/molina/menu', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Claims is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Benefits is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '3':
      // Prior Auth at option 3!
      res.send(twimlResponse(`
        <Redirect>/molina/prior-auth-menu</Redirect>
      `));
      break;
    case '4':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Member services is currently closed.</Say>
        <Hangup/>
      `));
      break;
    case '9':
      res.send(twimlResponse(`
        <Redirect>/molina/main-menu</Redirect>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/molina/main-menu</Redirect>
      `));
  }
});

// Molina Prior Authorization Menu
app.post('/molina/prior-auth-menu', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf" numDigits="1" action="/molina/prior-auth-route" method="POST" timeout="15">
    <Say voice="Polly.Joanna">
      Prior authorization. To check status, press 1.
      For new requests, press 2. For a representative, press 0.
    </Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input. Goodbye.</Say>
`));
});

// Molina Prior Auth Router
app.post('/molina/prior-auth-route', (req, res) => {
  const digit = req.body.Digits;
  res.type('text/xml');

  switch (digit) {
    case '1':
      res.send(twimlResponse(`
        <Redirect>/molina/collect-member-id</Redirect>
      `));
      break;
    case '2':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please use our provider portal. Goodbye.</Say>
        <Hangup/>
      `));
      break;
    case '0':
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Please hold for a representative.</Say>
        <Play>https://api.twilio.com/cowbell.mp3</Play>
        <Say voice="Polly.Joanna">Representatives are busy.</Say>
        <Hangup/>
      `));
      break;
    default:
      res.send(twimlResponse(`
        <Say voice="Polly.Joanna">Invalid selection.</Say>
        <Redirect>/molina/prior-auth-menu</Redirect>
      `));
  }
});

// Molina: Collect Member ID
app.post('/molina/collect-member-id', (req, res) => {
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/molina/collect-dob" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say your Molina member ID.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/molina/collect-member-id</Redirect>
`));
});

// Molina: Collect Date of Birth
app.post('/molina/collect-dob', (req, res) => {
  const memberId = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Molina] Received member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/molina/collect-cpt?memberId=${encodedMemberId}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter or say the patient's date of birth.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/molina/collect-dob?memberId=${encodedMemberId}</Redirect>
`));
});

// Molina: Collect CPT Code
app.post('/molina/collect-cpt', (req, res) => {
  const memberId = req.query.memberId || '';
  const dob = req.body.Digits || req.body.SpeechResult || '';
  console.log(`[Molina] Received DOB: ${dob}, Member ID: ${memberId}`);
  const encodedMemberId = encodeURIComponent(memberId);
  const encodedDob = encodeURIComponent(dob);
  res.type('text/xml');
  res.send(twimlResponse(`
  <Gather input="dtmf speech" action="/molina/lookup-auth?memberId=${encodedMemberId}&amp;dob=${encodedDob}" method="POST" timeout="10" speechTimeout="auto" finishOnKey="#">
    <Say voice="Polly.Joanna">Please enter the CPT procedure code.</Say>
  </Gather>
  <Say voice="Polly.Joanna">We didn't receive any input.</Say>
  <Redirect>/molina/collect-cpt?memberId=${encodedMemberId}</Redirect>
`));
});

// Molina: Lookup Authorization
app.post('/molina/lookup-auth', (req, res) => {
  const memberId = (req.query.memberId || '').toUpperCase().replace(/\s+/g, '');
  const dob = req.query.dob;
  const cptCode = (req.body.Digits || req.body.SpeechResult || '').replace(/\s+/g, '');

  console.log(`[Molina] Lookup auth - Member ID: ${memberId}, DOB: ${dob}, CPT: ${cptCode}`);

  res.type('text/xml');

  if (memberId && memberId.startsWith('ABC') && cptCode === '27447') {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-78432 for procedure code ${cptCode} is approved through June 30, 2024.
        Thank you for calling Molina.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('DEF')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-65234 for procedure code ${cptCode} was denied.
        Reason: Conservative treatment not attempted.
      </Say>
      <Hangup/>
    `));
  }
  else if (memberId && memberId.startsWith('GHI')) {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        Authorization PA2024-92145 for procedure code ${cptCode} is pending review.
      </Say>
      <Hangup/>
    `));
  }
  else {
    res.send(twimlResponse(`
      <Say voice="Polly.Joanna">Please hold.</Say>
      <Pause length="2"/>
      <Say voice="Polly.Joanna">
        No authorization found for this member and procedure code.
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
  console.log(`\nAvailable providers:`);
  console.log(`  - ABC Insurance (baseline): /voice`);
  console.log(`  - Anthem (requires NPI): /anthem/voice`);
  console.log(`  - Humana (numeric IDs): /humana/voice`);
  console.log(`  - BCBS (spells numbers): /bcbs/voice`);
  console.log(`  - Tricare (nested menus): /tricare/voice`);
  console.log(`  - United (Prior Auth=1, different order): /united/voice`);
  console.log(`  - Aetna (voice-first): /aetna/voice`);
  console.log(`  - Cigna (long prompts): /cigna/voice`);
  console.log(`  - Kaiser (terse prompts): /kaiser/voice`);
  console.log(`  - Molina (language menu first): /molina/voice`);
});
