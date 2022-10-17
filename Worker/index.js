addEventListener('fetch', event => {
  event.respondWith(handleRequestAsync(event.request));
});

async function handleRequestAsync(request) {
  const path = new URL(request.url).pathname;
  const method = request.method;
  if (method === 'GET' && path === '/generatesecrets')
  {
    return new Response(await generateSecretsAsync());
  }

  const corsHeaders = {
    'Access-Control-Allow-Origin': CLIENT_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,OPTIONS',
    'Access-Control-Max-Age': '86400'
  };

  if (method === 'OPTIONS') return handleOptions(request, corsHeaders);
  if (method !== 'GET') return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  
  if (path.startsWith('/encrypt/' + ENCRYPTION_URL + '/'))
  {
    const plainText = path.slice(ENCRYPTION_URL.length + 10);
    if (!validateUsername(plainText)) return new Response('Bad Request', { status: 400, headers: corsHeaders });
    const cipherText = await encryptAsync(plainText);
    return new Response(cipherText, { headers: corsHeaders });
  }
  else if (path.startsWith('/homework/'))
  {
    const token = path.slice(10);
    const username = await decryptAsync(token);
    if (!validateUsername(username)) return new Response('Not Found', { status: 404, headers: corsHeaders });
    const email = username + '@' + STUDENT_EMAIL_DOMAIN;

    return new Response(await getHomeworksAsync(email), { headers: corsHeaders });
  }
  else
  {
    return new Response('Not Found', { status: 404, headers: corsHeaders });
  }
};

function validateUsername(username) {
  return username && username.length <= 50 && /^[A-Za-z0-9._'-]+$/.test(username);
}

async function getHomeworksAsync(email) {
  const headers = { Authorization: `Bearer ${await getGoogleAuthToken(email)}` };

  const coursesUrl = 'https://classroom.googleapis.com/v1/courses?studentId=me&courseStates=ACTIVE&pageSize=1000&fields=courses(id,name)';
  const coursesResponse = await fetch(coursesUrl, { headers });
  const courses = (await coursesResponse.json()).courses.filter(c => COURSES_SUFFIX === '*' || c.name.endsWith(COURSES_SUFFIX));

  const requests = [];
  for (const course of courses) {
    const courseworkUrl = `https://classroom.googleapis.com/v1/courses/${course.id}/courseWork?orderBy=dueDate%20desc&pageSize=25&fields=courseWork(title,dueDate,description)`;
    requests.push(fetch(courseworkUrl, { headers }).then(resp => resp.json()));
  }
  const courseworkListResults = await Promise.all(requests);
  const today = new Date().setHours(0,0,0,0);
  const oneWeek = 6.048e+8;
  const homeworks = [];
  for (let i = 0; i < courseworkListResults.length; i++) {
    const courseworkItems = courseworkListResults[i].courseWork;
    if (!courseworkItems) continue;
    for (const hw of courseworkItems) {
      if (!hw.dueDate || !hw.dueDate.year || !hw.dueDate.month || !hw.dueDate.year) continue;
      var date = new Date(hw.dueDate.year, hw.dueDate.month - 1, hw.dueDate.day);
      if (date > today + 3 * oneWeek) continue;
      if (date < today - oneWeek) break;
      homeworks.push({ title: hw.title.trim(), description: hw.description?.trim() ?? '', dueDate: date, subject: getSubject(courses[i].name) });
    }
  }

  return JSON.stringify(homeworks.sort((a, b) => (a.dueDate - b.dueDate)));
};

function getSubject(cls) {
  let i;
  for (i = cls.length; i >= 0; i--) {
    const code = cls.charCodeAt(i);
    if (code >= 65 && code <= 90) break;
  }
  if (i < 0 || i + 2 > cls.Length) return cls;
  switch (cls.substr(i, 2))
  {
    case 'Ad': return 'Graphics';
    case 'Ar': return 'Art';
    case 'As': return 'ASPIRE';
    case 'Aw': return 'ASDAN';
    case 'Bn': return 'Business';
    case 'By': return 'Biology';
    case 'Cc': return 'Child Development';
    case 'Ch': return 'Chemistry';
    case 'Cp': return 'Computing';
    case 'Dr': return 'Drama';
    case 'Dt': return 'Design & Technology';
    case 'Ec': return 'Economics';
    case 'En': return 'English';
    case 'Fm': return 'Further Maths';
    case 'Fo': return 'Food & Nutrition';
    case 'Fr': return 'French';
    case 'Gg': return 'Geography';
    case 'Go': return 'Politics';
    case 'Hc': return 'Health & Social Care';
    case 'Hi': return 'History';
    case 'It': return 'IT';
    case 'Ma': return 'Maths';
    case 'Mu': return 'Music';
    case 'Pa': return 'Performing Arts';
    case 'Pc': return 'Physics';
    case 'Pe': return 'PE';
    case 'Pg': return 'GCSE PE';
    case 'Pt': return 'Photography';
    case 'Py': return 'Psychology';
    case 'Rr': return 'Reading';
    case 'Rs': return 'Religious Studies';
    case 'Sc': return 'Science';
    case 'So': return 'Sociology';
    case 'Ss': return 'Sport Science';
    case 'St': return 'Statistics';
    case 'Tx': return 'Textiles';
    case 'Wa': return 'Wellbeing Active';
    case 'Wi': return 'Wellbeing Inspire';
    default: return cls;
  };
}

function handleOptions(request, corsHeaders) {
  let headers = request.headers;
  if (!headers.get('Origin') || !headers.get('Access-Control-Request-Method') || !headers.get('Access-Control-Request-Headers')) {
    return new Response(null, { headers: { Allow: 'GET, OPTIONS' } });
  }
  let respHeaders = { ...corsHeaders, 'Access-Control-Allow-Headers': request.headers.get('Access-Control-Request-Headers') };
  return new Response(null, { headers: respHeaders });
}

async function getGoogleAuthToken(email) {
  const objectToBase64url = obj => arrayBufferToBase64Url(new TextEncoder().encode(JSON.stringify(obj)));
  const arrayBufferToBase64Url = buffer => byteArrayToBase64(new Uint8Array(buffer));

  async function sign(content, signingKey) {
    const bytes = asciiToByteArray(content);
    const keyData = asciiToByteArray(atob(signingKey));
    const key = await crypto.subtle.importKey('pkcs8', keyData, { name: 'RSASSA-PKCS1-V1_5', hash: { name: 'SHA-256' } }, false, ['sign']);
    const signature = await crypto.subtle.sign({ name: 'RSASSA-PKCS1-V1_5' }, key, bytes);
    return arrayBufferToBase64Url(signature);
  }
  const assertiontime = Math.round(Date.now() / 1000);
  const claimset = objectToBase64url({
    iss: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: 'https://www.googleapis.com/auth/classroom.courses.readonly https://www.googleapis.com/auth/classroom.coursework.me.readonly',
    aud: 'https://oauth2.googleapis.com/token',
    exp: assertiontime + 3600,
    iat: assertiontime,
    sub: email
  });
  const jwtHeader = objectToBase64url({ alg: 'RS256', typ: 'JWT' });
  const jwtUnsigned = jwtHeader + '.' + claimset;
  const signedJwt = jwtUnsigned + '.' + await sign(jwtUnsigned, GOOGLE_PRIVATE_KEY);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Cache-Control': 'no-cache', 'Host': 'oauth2.googleapis.com' },
    body: 'grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=' + signedJwt
  });
  const json = await response.json();
  return json.access_token;
}

async function generateSecretsAsync() {
  const key = await crypto.subtle.generateKey({ name: 'AES-CBC', length: 256 }, true, ['encrypt', 'decrypt']);
  const jwk = await crypto.subtle.exportKey('jwk', key);
  const iv = byteArrayToBase64(crypto.getRandomValues(new Uint8Array(16)));
  const secret = byteArrayToBase64(crypto.getRandomValues(new Uint8Array(24)));
  return `ENCRYPTION_URL: ${secret}\nENCRYPTION_KEY: ${jwk.k}\nENCRYPTION_IV: ${iv}`;
}

async function importKeyAsync(str) {
  const jwk = { kty: 'oct', k: str, alg: 'A256CBC', ext: true };
  return crypto.subtle.importKey('jwk', jwk, { name: 'AES-CBC' }, false, ['encrypt', 'decrypt']);
}

async function encryptAsync(str) {
  const key = await importKeyAsync(ENCRYPTION_KEY);
  const iv = base64ToByteArray(ENCRYPTION_IV);
  const bytes = asciiToByteArray(str);
  const cipherBytes = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-CBC', iv }, key, bytes));
  return byteArrayToBase64(cipherBytes);
};

async function decryptAsync(str) {
  const key = await importKeyAsync(ENCRYPTION_KEY);
  const iv = base64ToByteArray(ENCRYPTION_IV);
  try {
    const bytes = base64ToByteArray(str);
    const plainBytes = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-CBC', iv }, key, bytes));
    return byteArrayToAscii(plainBytes);
  } catch {
    return null;
  }
};

function asciiToByteArray(str) {
  return new Uint8Array(str.split('').map(c => c.charCodeAt(0)));
}

function byteArrayToAscii(bytes) {
  return String.fromCharCode.apply(null, bytes);
}

function base64ToByteArray(str) {
  if (str.length % 4 === 2) str += '==';
  else if (str.length % 4 === 3) str += '=';
  const chars = atob(str.replace(/_/g, '/').replace(/\-/g, '+'));
  return asciiToByteArray(chars);
}

function byteArrayToBase64(bytes) {
  const chars = byteArrayToAscii(bytes);
  return btoa(chars).replace(/\//g, '_').replace(/\+/g, '-').replace(/=/g, '');
}
