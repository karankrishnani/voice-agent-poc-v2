/**
 * Mock IVR Provider Profiles
 *
 * Feature 113: Provider configurations for Phase 2 testing.
 *
 * Each provider has a unique IVR flow variation for testing
 * the voice agent's adaptability. See docs/PHASE2-STREAMING.md Phase 8.
 *
 * Provider Profile Schema:
 * - id: Unique identifier
 * - name: Display name
 * - priorAuthOption: DTMF key for prior authorization menu
 * - repeatOption: DTMF key to repeat current menu (usually 9)
 * - menuOrder: Array of menu prompts in order
 * - infoOrder: Array of info requested [member_id, cpt_code, dob, npi]
 * - phrases: Object with prompt templates
 * - keyVariation: Description of what makes this provider unique
 */

const providers = {
  // Standard baseline - straightforward IVR
  abc: {
    id: 'abc',
    name: 'ABC Insurance',
    priorAuthOption: '2',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Standard baseline',
    phrases: {
      welcome: 'Thank you for calling ABC Insurance. Your call may be recorded for quality assurance.',
      main_menu: 'For claims, press 1. For prior authorization, press 2. For member services, press 3. To repeat these options, press 9.',
      prior_auth: 'You have reached the prior authorization department.',
      request_member_id: 'Please enter your member ID followed by the pound sign.',
      request_dob: 'Please enter the patient date of birth as 8 digits, month, day, year.',
      request_cpt: 'Please enter the CPT procedure code.',
      lookup: 'Please hold while we look up your authorization.',
      auth_approved: 'Authorization {auth_number} for procedure code {cpt_code} is approved through {valid_through}.',
      auth_denied: 'Authorization {auth_number} for procedure code {cpt_code} was denied. Reason: {denial_reason}.',
      auth_pending: 'Authorization {auth_number} for procedure code {cpt_code} is currently pending review.',
      auth_not_found: 'No authorization found for the member and procedure code provided.',
      goodbye: 'Thank you for calling. Goodbye.'
    }
  },

  // United Healthcare - Different info order
  uhc: {
    id: 'uhc',
    name: 'United Healthcare',
    priorAuthOption: '1',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'cpt_code', 'dob'],  // CPT before DOB
    keyVariation: 'Info order: member-id, cpt, dob',
    phrases: {
      welcome: 'Welcome to United Healthcare automated services.',
      main_menu: 'For prior authorization status, press 1. For benefits, press 2. For all other inquiries, press 3.',
      prior_auth: 'Prior authorization lookup. Please have your member ID ready.',
      request_member_id: 'Enter the member ID number now.',
      request_cpt: 'Enter the 5 digit CPT code.',
      request_dob: 'Enter the patient date of birth.',
      lookup: 'One moment while we retrieve your information.',
      auth_approved: 'Prior auth {auth_number} approved for CPT {cpt_code} valid until {valid_through}.',
      auth_denied: 'Prior auth {auth_number} denied for CPT {cpt_code}. Denial reason: {denial_reason}.',
      auth_pending: 'Prior auth {auth_number} for CPT {cpt_code} is pending.',
      auth_not_found: 'No matching prior authorization found.',
      goodbye: 'Thank you for using United Healthcare.'
    }
  },

  // Aetna - Voice-first prompts
  aetna: {
    id: 'aetna',
    name: 'Aetna',
    priorAuthOption: '3',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Voice-first ("say or press")',
    phrases: {
      welcome: 'Hello and thank you for calling Aetna.',
      main_menu: 'Say "claims" or press 1. Say "authorization" or press 3. Say "member services" or press 5. Say "repeat" or press 9.',
      prior_auth: 'You said authorization. I can help you check your prior auth status.',
      request_member_id: 'Say your member ID or enter it using your keypad.',
      request_dob: 'Say or enter the date of birth.',
      request_cpt: 'Say or enter the CPT code.',
      lookup: 'Let me look that up for you.',
      auth_approved: 'Good news! Authorization number {auth_number} is approved for {cpt_code} through {valid_through}.',
      auth_denied: 'Authorization {auth_number} was denied for {cpt_code}. The reason was: {denial_reason}.',
      auth_pending: 'Authorization {auth_number} for {cpt_code} is still pending review.',
      auth_not_found: 'I could not find an authorization matching that information.',
      goodbye: 'Thanks for calling Aetna. Have a great day!'
    }
  },

  // Cigna - Long-winded prompts
  cigna: {
    id: 'cigna',
    name: 'Cigna',
    priorAuthOption: '4',
    repeatOption: '9',
    menuOrder: ['welcome', 'disclaimer', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Long-winded prompts',
    phrases: {
      welcome: 'Thank you for calling Cigna Healthcare, where we are committed to helping you and your family achieve better health outcomes. Please listen carefully as our menu options have recently changed.',
      disclaimer: 'This call may be monitored or recorded for quality assurance, training, and compliance purposes. By continuing with this call, you consent to recording.',
      main_menu: 'For information about your pharmacy benefits and prescription drug coverage, please press 1. For questions about your medical claims, referrals, or to speak with a claims representative, please press 2. For information about finding a doctor, specialist, or healthcare facility in your network, please press 3. To check the status of a prior authorization request or to inquire about authorization requirements, please press 4. To speak with a member services representative about your account, benefits, or coverage, please press 5. To hear these options again, please press 9.',
      prior_auth: 'You have selected prior authorization services. Our dedicated prior authorization team is here to assist you with checking the status of existing authorizations.',
      request_member_id: 'To better assist you, please enter your complete member identification number as it appears on your insurance card, followed by the pound or hash key.',
      request_dob: 'For verification purposes, please enter the patient date of birth using eight digits in month, day, year format.',
      request_cpt: 'Please enter the five-digit Current Procedural Terminology code, also known as CPT code, for the procedure in question.',
      lookup: 'Thank you. Please remain on the line while we securely access your authorization records. This may take a moment.',
      auth_approved: 'We are pleased to inform you that prior authorization number {auth_number} for CPT code {cpt_code} has been approved. This authorization is valid through {valid_through}.',
      auth_denied: 'We regret to inform you that prior authorization number {auth_number} for CPT code {cpt_code} was not approved. The determination was based on the following: {denial_reason}.',
      auth_pending: 'Prior authorization number {auth_number} for CPT code {cpt_code} is currently under review. Please allow additional time for processing.',
      auth_not_found: 'We were unable to locate a prior authorization matching the information provided. Please verify your member ID and CPT code.',
      goodbye: 'Thank you for choosing Cigna. We appreciate your membership and wish you good health. Goodbye.'
    }
  },

  // Kaiser - Terse prompts
  kaiser: {
    id: 'kaiser',
    name: 'Kaiser',
    priorAuthOption: '2',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Terse prompts',
    phrases: {
      welcome: 'Kaiser Permanente.',
      main_menu: 'Claims 1. Auth 2. Other 3. Repeat 9.',
      prior_auth: 'Auth lookup.',
      request_member_id: 'Member ID.',
      request_dob: 'Date of birth.',
      request_cpt: 'CPT code.',
      lookup: 'Checking.',
      auth_approved: 'Auth {auth_number} approved through {valid_through}.',
      auth_denied: 'Auth {auth_number} denied. {denial_reason}.',
      auth_pending: 'Auth {auth_number} pending.',
      auth_not_found: 'Not found.',
      goodbye: 'Goodbye.'
    }
  },

  // Molina - Language menu first
  molina: {
    id: 'molina',
    name: 'Molina',
    priorAuthOption: '3',
    repeatOption: '9',
    menuOrder: ['language', 'welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Language menu first',
    phrases: {
      language: 'For English, press 1. Para Espanol, oprima el 2.',
      welcome: 'Thank you for calling Molina Healthcare.',
      main_menu: 'For eligibility, press 1. For claims, press 2. For prior authorization, press 3. Press 9 to repeat.',
      prior_auth: 'Prior authorization department.',
      request_member_id: 'Enter member ID.',
      request_dob: 'Enter date of birth.',
      request_cpt: 'Enter CPT code.',
      lookup: 'Looking up authorization.',
      auth_approved: 'Authorization {auth_number} for {cpt_code} approved until {valid_through}.',
      auth_denied: 'Authorization {auth_number} for {cpt_code} denied. Reason: {denial_reason}.',
      auth_pending: 'Authorization {auth_number} for {cpt_code} is pending.',
      auth_not_found: 'No authorization found for this member and procedure.',
      goodbye: 'Thank you for calling Molina.'
    }
  },

  // Anthem - Requires NPI
  anthem: {
    id: 'anthem',
    name: 'Anthem',
    priorAuthOption: '2',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'npi', 'cpt_code', 'dob'],  // Requires NPI
    keyVariation: 'Requires NPI',
    phrases: {
      welcome: 'Welcome to Anthem Blue Cross Blue Shield.',
      main_menu: 'Benefits 1. Prior auth 2. Claims 3. Repeat 9.',
      prior_auth: 'Prior authorization status.',
      request_member_id: 'Enter the member ID.',
      request_npi: 'Enter the requesting provider NPI number.',
      request_cpt: 'Enter CPT code.',
      request_dob: 'Enter patient date of birth.',
      lookup: 'Searching for authorization.',
      auth_approved: 'Auth {auth_number} approved for {cpt_code}. Valid through {valid_through}.',
      auth_denied: 'Auth {auth_number} denied for {cpt_code}. Reason: {denial_reason}.',
      auth_pending: 'Auth {auth_number} for {cpt_code} pending review.',
      auth_not_found: 'No matching authorization.',
      goodbye: 'Thank you for calling Anthem.'
    }
  },

  // Humana - Numeric IDs only
  humana: {
    id: 'humana',
    name: 'Humana',
    priorAuthOption: '3',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Numeric IDs only',
    phrases: {
      welcome: 'Humana health services.',
      main_menu: 'Press 1 for Medicare. Press 2 for commercial plans. Press 3 for prior authorization. Press 9 to repeat.',
      prior_auth: 'Enter your information using the keypad only.',
      request_member_id: 'Enter your 10 digit member number.',
      request_dob: 'Enter date of birth as MMDDYYYY.',
      request_cpt: 'Enter 5 digit CPT.',
      lookup: 'Please wait.',
      auth_approved: 'Auth number {auth_number} is approved for code {cpt_code}. Expires {valid_through}.',
      auth_denied: 'Auth number {auth_number} denied for code {cpt_code}. Because: {denial_reason}.',
      auth_pending: 'Auth {auth_number} is pending for {cpt_code}.',
      auth_not_found: 'Authorization not on file.',
      goodbye: 'Humana. Goodbye.'
    }
  },

  // BCBS - Spells out numbers
  bcbs: {
    id: 'bcbs',
    name: 'BCBS',
    priorAuthOption: '2',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Spells out numbers',
    phrases: {
      welcome: 'Blue Cross Blue Shield member services.',
      main_menu: 'Claims press one. Authorization press two. Benefits press three. Repeat press nine.',
      prior_auth: 'Authorization status lookup.',
      request_member_id: 'Please enter your member I D.',
      request_dob: 'Enter date of birth.',
      request_cpt: 'Enter C P T code.',
      lookup: 'Retrieving authorization.',
      auth_approved: 'Authorization P A two zero two four dash seven eight four three two for C P T two seven four four seven approved through December thirty first twenty twenty five.',
      auth_denied: 'Authorization P A two zero two four dash seven eight four three two for C P T two seven four four seven denied. Reason: {denial_reason}.',
      auth_pending: 'Authorization P A two zero two four dash seven eight four three two for C P T two seven four four seven pending.',
      auth_not_found: 'No authorization found.',
      goodbye: 'Thank you for calling Blue Cross Blue Shield.'
    }
  },

  // Tricare - Nested sub-menus
  tricare: {
    id: 'tricare',
    name: 'Tricare',
    priorAuthOption: '2',
    repeatOption: '9',
    menuOrder: ['welcome', 'main_menu', 'submenu', 'prior_auth', 'lookup'],
    infoOrder: ['member_id', 'dob', 'cpt_code'],
    keyVariation: 'Nested sub-menus',
    phrases: {
      welcome: 'Thank you for calling Tricare, health care for military families.',
      main_menu: 'For active duty, press 1. For retirees and dependents, press 2. For providers, press 3.',
      submenu: 'For claims status, press 1. For prior authorization, press 2. For referrals, press 3. For eligibility, press 4. To return to main menu, press star.',
      prior_auth: 'Prior authorization inquiry.',
      request_member_id: 'Enter DoD benefits number or sponsor SSN.',
      request_dob: 'Enter patient date of birth.',
      request_cpt: 'Enter procedure code.',
      lookup: 'Accessing Tricare records.',
      auth_approved: 'Prior auth {auth_number} approved for {cpt_code} valid through {valid_through}.',
      auth_denied: 'Prior auth {auth_number} denied for {cpt_code}. Reason: {denial_reason}.',
      auth_pending: 'Prior auth {auth_number} for {cpt_code} is in review.',
      auth_not_found: 'No authorization on record.',
      goodbye: 'Thank you for your service. Goodbye.'
    }
  }
};

/**
 * Get a provider by ID
 * @param {string} id - Provider ID
 * @returns {object|null} Provider profile or null if not found
 */
function getProvider(id) {
  return providers[id] || null;
}

/**
 * Get all provider IDs
 * @returns {string[]} Array of provider IDs
 */
function getProviderIds() {
  return Object.keys(providers);
}

/**
 * Get a random provider
 * @returns {object} Random provider profile
 */
function getRandomProvider() {
  const ids = getProviderIds();
  const randomId = ids[Math.floor(Math.random() * ids.length)];
  return providers[randomId];
}

/**
 * Get provider list for API response
 * @returns {object[]} Array of provider summaries
 */
function getProviderList() {
  return Object.values(providers).map(p => ({
    id: p.id,
    name: p.name,
    priorAuthOption: p.priorAuthOption,
    keyVariation: p.keyVariation
  }));
}

export {
  providers,
  getProvider,
  getProviderIds,
  getRandomProvider,
  getProviderList
};
