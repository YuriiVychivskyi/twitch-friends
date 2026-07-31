const expectedProject = 'twitch-friends-2ea03';
const apiKey = process.env.WXT_PUBLIC_FIREBASE_API_KEY;
const databaseUrlValue = process.env.WXT_PUBLIC_FIREBASE_DATABASE_URL;
const projectId = process.env.WXT_PUBLIC_FIREBASE_PROJECT_ID;

if (!apiKey || !databaseUrlValue || projectId !== expectedProject) {
  throw new Error('Production Firebase environment is missing or targets another project.');
}

const databaseUrl = new URL(databaseUrlValue);

if (
  databaseUrl.protocol !== 'https:' ||
  (!databaseUrl.hostname.endsWith('.firebaseio.com') &&
    !databaseUrl.hostname.endsWith('.firebasedatabase.app')) ||
  (!databaseUrl.hostname.startsWith(`${expectedProject}-`) &&
    databaseUrl.hostname !== `${expectedProject}.firebaseio.com`)
) {
  throw new Error('Production Firebase Database URL is invalid.');
}

const signUpResponse = await fetch(
  `https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${encodeURIComponent(apiKey)}`,
  {
    body: JSON.stringify({ returnSecureToken: true }),
    headers: { 'Content-Type': 'application/json' },
    method: 'POST',
    signal: AbortSignal.timeout(10_000),
  },
);

if (!signUpResponse.ok) {
  throw new Error('Could not create the temporary Firebase smoke-test identity.');
}

const identity = await signUpResponse.json();

if (
  !identity ||
  typeof identity !== 'object' ||
  typeof identity.idToken !== 'string' ||
  typeof identity.localId !== 'string'
) {
  throw new Error('Firebase returned an invalid smoke-test identity.');
}

const headers = {
  Authorization: `Bearer ${identity.idToken}`,
  'Content-Type': 'application/json',
};
const ownNode = new URL(`friendships/${encodeURIComponent(identity.localId)}.json`, databaseUrl);
const fakeFriend = `smoke_${crypto.randomUUID().replaceAll('-', '')}`;
const fakeEdge = new URL(
  `friendships/${encodeURIComponent(identity.localId)}/${fakeFriend}.json`,
  databaseUrl,
);
const foreignNode = new URL(`friendships/${fakeFriend}.json`, databaseUrl);

try {
  const ownRead = await fetch(ownNode, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });
  const fakeWrite = await fetch(fakeEdge, {
    body: 'true',
    headers,
    method: 'PUT',
    signal: AbortSignal.timeout(10_000),
  });
  const foreignRead = await fetch(foreignNode, {
    headers,
    signal: AbortSignal.timeout(10_000),
  });

  if (!ownRead.ok || fakeWrite.ok || foreignRead.ok) {
    throw new Error('Production Realtime Database Rules smoke-check failed.');
  }
} finally {
  await Promise.allSettled([
    fetch(fakeEdge, {
      headers,
      method: 'DELETE',
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:delete?key=${encodeURIComponent(apiKey)}`,
      {
        body: JSON.stringify({ idToken: identity.idToken }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(10_000),
      },
    ),
  ]);
}

console.log('Production Realtime Database Rules smoke-check passed.');
