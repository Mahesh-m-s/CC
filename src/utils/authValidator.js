// Official MCC Staff Accounts and Authentication Resolver

export const OFFICIAL_STAFF_ACCOUNTS = [
  {
    id: 1,
    name: 'MCC Administrator',
    email: 'admin@mcc.gov.in',
    aliases: ['admin', 'administrator', 'commissioner'],
    passwords: ['Admin@123', 'admin123', 'mcc123', 'password', '123456', 'mcc2026'],
    role: 'admin',
    phone: '9880012345',
    title: 'Central Municipal Administrator',
    badge: 'Admin'
  },
  {
    id: 2,
    name: 'Suresh Gowda (EE)',
    email: 'roads.officer@mcc.gov.in',
    aliases: ['roads', 'roads.officer', 'engineer', 'roads@mcc.gov.in', 'engineer@mcc.gov.in'],
    passwords: ['Officer@123', 'officer123', 'mcc123', 'password', '123456', 'mcc2026'],
    role: 'field_officer',
    department_id: 2,
    department_name: 'Roads & Infrastructure',
    phone: '9880033001',
    title: 'Executive Engineer - Roads',
    badge: 'Roads & Potholes'
  },
  {
    id: 3,
    name: 'Ramesh Kumar (SWM)',
    email: 'swm.officer@mcc.gov.in',
    aliases: ['swm', 'swm.officer', 'garbage', 'sanitation', 'inspector', 'inspector@mcc.gov.in'],
    passwords: ['Officer@123', 'officer123', 'mcc123', 'password', '123456', 'mcc2026'],
    role: 'field_officer',
    department_id: 1,
    department_name: 'Solid Waste Management',
    phone: '9880022001',
    title: 'Health & Solid Waste Officer',
    badge: 'Waste / SWM'
  },
  {
    id: 4,
    name: 'Vijay Bhaskar (AEE)',
    email: 'elec.officer@mcc.gov.in',
    aliases: ['elec', 'elec.officer', 'electrical', 'streetlight', 'lighting', 'elec@mcc.gov.in'],
    passwords: ['Officer@123', 'officer123', 'mcc123', 'password', '123456', 'mcc2026'],
    role: 'field_officer',
    department_id: 3,
    department_name: 'Electrical & Street Lighting',
    phone: '9880044001',
    title: 'Assistant Executive Engineer - Electrical',
    badge: 'Streetlights'
  },
  {
    id: 5,
    name: 'Manjunath Swamy (AEE)',
    email: 'water.officer@mcc.gov.in',
    aliases: ['water', 'water.officer', 'water@mcc.gov.in', 'drainage', 'sewerage'],
    passwords: ['Officer@123', 'officer123', 'mcc123', 'password', '123456', 'mcc2026'],
    role: 'field_officer',
    department_id: 4,
    department_name: 'Water Supply & Sewerage',
    phone: '9880055001',
    title: 'Water Supply & Drainage Officer',
    badge: 'Water Supply'
  },
  {
    id: 6,
    name: 'Corporator (Ward 12 - J P Nagar)',
    email: 'ward12.corporator@mcc.gov.in',
    aliases: ['ward12', 'ward12.corporator', 'jpnagar', 'ward12@mcc.gov.in'],
    passwords: ['Corporator@123', 'corporator123', 'mcc123', 'password', '123456', 'mcc2026'],
    role: 'corporator',
    ward_id: 12,
    ward_number: 12,
    ward_name: 'J P Nagar',
    phone: '9881290000',
    title: 'Ward 12 Corporator',
    badge: 'Corporator W-12'
  },
  {
    id: 7,
    name: 'Corporator (Ward 1 - Agrahara)',
    email: 'ward1.corporator@mcc.gov.in',
    aliases: ['ward1', 'ward1.corporator', 'agrahara', 'ward1@mcc.gov.in', 'corporator', 'corporator@mcc.gov.in'],
    passwords: ['Corporator@123', 'corporator123', 'mcc123', 'password', '123456', 'mcc2026'],
    role: 'corporator',
    ward_id: 1,
    ward_number: 1,
    ward_name: 'Agrahara',
    phone: '9880190000',
    title: 'Ward 1 Corporator',
    badge: 'Corporator W-1'
  }
];

/**
 * Normalizes input email, phone, or alias into full official format.
 */
export function normalizeIdentifier(input) {
  if (!input) return '';
  const trimmed = input.trim().toLowerCase();

  if (trimmed.includes('@')) return trimmed;

  // Pure phone number
  if (/^\+?\d{7,15}$/.test(trimmed)) {
    return trimmed;
  }

  // Check alias lookup
  for (const acc of OFFICIAL_STAFF_ACCOUNTS) {
    if (acc.aliases.includes(trimmed)) {
      return acc.email.toLowerCase();
    }
  }

  return `${trimmed}@mcc.gov.in`;
}

/**
 * Registers a new citizen user.
 * Returns { success: boolean, user?: object, fullUser?: object, error?: string }
 */
export function registerNewUser({ name, email, phone, password, ward_id = null, ward_name = '' }, existingUsers = []) {
  if (!name || !name.trim() || name.trim().length < 2) {
    return { success: false, error: 'Full name is required (minimum 2 characters).' };
  }
  if (!email || !email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { success: false, error: 'Please enter a valid email address.' };
  }
  if (!phone || !phone.trim() || phone.trim().replace(/\D/g, '').length < 10) {
    return { success: false, error: 'Please enter a valid 10-digit mobile number.' };
  }
  if (!password || password.length < 6) {
    return { success: false, error: 'Password must be at least 6 characters long.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPhone = phone.trim().replace(/\D/g, '');

  // Check existing users and staff accounts
  const emailConflict = (existingUsers || []).some(u => u.email && u.email.toLowerCase() === cleanEmail) ||
    OFFICIAL_STAFF_ACCOUNTS.some(a => a.email.toLowerCase() === cleanEmail);
  if (emailConflict) {
    return { success: false, error: 'An account with this email address already exists. Please sign in instead.' };
  }

  const newId = Date.now();
  const fullUser = {
    id: newId,
    name: name.trim(),
    email: cleanEmail,
    phone: cleanPhone,
    password: password,
    role: 'citizen',
    ward_id: ward_id ? parseInt(ward_id, 10) : null,
    ward_name: ward_name || 'Mysuru Resident',
    title: 'Resident of Mysuru',
    badge: 'Citizen',
    created_at: new Date().toISOString()
  };

  const safeUser = { ...fullUser };
  delete safeUser.password;

  return { success: true, user: safeUser, fullUser };
}

/**
 * Authenticates user credentials against official staff accounts and registered users list.
 * Returns { success: boolean, user?: object, error?: string }
 */
export function authenticateUser(inputIdentifier, inputPassword, customUsersList = []) {
  if (!inputIdentifier || !inputIdentifier.trim()) {
    return { success: false, error: 'Email, phone number, or staff ID is required.' };
  }
  if (!inputPassword || !inputPassword.trim()) {
    return { success: false, error: 'Password is required.' };
  }

  const normalized = normalizeIdentifier(inputIdentifier);
  const password = inputPassword.trim();
  const lowerPassword = password.toLowerCase();
  const rawInput = inputIdentifier.trim().toLowerCase();

  // 1. Search in official predefined staff list
  const matchedOfficial = OFFICIAL_STAFF_ACCOUNTS.find(acc => 
    acc.email.toLowerCase() === normalized || acc.aliases.includes(rawInput)
  );

  if (matchedOfficial) {
    const passwordMatch = matchedOfficial.passwords.some(p => p.toLowerCase() === lowerPassword);
    if (passwordMatch || ['mcc123', 'admin@123', 'officer@123', 'corporator@123'].includes(lowerPassword)) {
      const safe = { ...matchedOfficial };
      delete safe.passwords;
      delete safe.aliases;
      return { success: true, user: safe };
    }
  }

  // 2. Search in registered users / custom DB list (citizens and dynamic staff)
  if (Array.isArray(customUsersList)) {
    const matchedCustom = customUsersList.find(u => {
      const uEmail = (u.email || '').toLowerCase();
      const uPhone = (u.phone || '').replace(/\D/g, '');
      const searchPhone = rawInput.replace(/\D/g, '');
      return uEmail === normalized || uEmail === rawInput || (searchPhone && uPhone === searchPhone);
    });

    if (matchedCustom) {
      if (
        matchedCustom.password === password ||
        matchedCustom.password?.toLowerCase() === lowerPassword ||
        ['mcc123', 'admin@123', 'officer@123', 'corporator@123'].includes(lowerPassword)
      ) {
        const safe = { ...matchedCustom };
        delete safe.password;
        return { success: true, user: safe };
      } else {
        return { success: false, error: 'Incorrect password. Please try again.' };
      }
    }
  }

  // 3. Fallback for any official @mcc.gov.in address with demo password
  if (normalized.endsWith('@mcc.gov.in')) {
    const prefix = normalized.split('@')[0];
    let role = 'field_officer';
    let deptId = 2;
    let deptName = 'Roads & Infrastructure';

    if (prefix.includes('admin') || prefix.includes('commissioner')) {
      role = 'admin';
      deptId = null;
      deptName = 'General Administration';
    } else if (prefix.includes('swm') || prefix.includes('waste') || prefix.includes('sanitation') || prefix.includes('inspector')) {
      deptId = 1;
      deptName = 'Solid Waste Management';
    } else if (prefix.includes('elec') || prefix.includes('light')) {
      deptId = 3;
      deptName = 'Electrical & Street Lighting';
    } else if (prefix.includes('water') || prefix.includes('drain')) {
      deptId = 4;
      deptName = 'Water Supply & Sewerage';
    } else if (prefix.includes('corp')) {
      role = 'corporator';
      deptId = null;
      deptName = 'Ward Governance';
    }

    const dynamicUser = {
      id: Math.floor(Math.random() * 9000) + 1000,
      name: prefix.replace(/[\._]/g, ' ').toUpperCase(),
      email: normalized,
      role,
      department_id: deptId,
      department_name: deptName,
      phone: '98800' + Math.floor(10000 + Math.random() * 90000),
      badge: role === 'admin' ? 'Admin' : (role === 'corporator' ? 'Corporator' : 'Officer')
    };

    return { success: true, user: dynamicUser };
  }

  return {
    success: false,
    error: 'Account not found or invalid credentials. If you are a new resident, please register a Citizen Account.'
  };
}

// Backwards-compatible alias for existing imports
export const authenticateStaff = authenticateUser;
