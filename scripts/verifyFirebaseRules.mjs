import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const rulesPath = 'firebase/rules/database.rules.json';
const expectedProject = 'twitch-friends-2ea03';
const [rules, expectedHash, firebaseConfigSource, firebaseRcSource] = await Promise.all([
  readFile(rulesPath),
  readFile('firebase/rules/database.rules.sha256', 'utf8'),
  readFile('firebase.json', 'utf8'),
  readFile('.firebaserc', 'utf8'),
]);
const actualHash = createHash('sha256').update(rules).digest('hex');
const firebaseConfig = JSON.parse(firebaseConfigSource);
const firebaseRc = JSON.parse(firebaseRcSource);

if (actualHash !== expectedHash.trim()) {
  throw new Error(`Realtime Database Rules hash changed: ${actualHash}`);
}

if (firebaseConfig.database?.rules !== rulesPath) {
  throw new Error('firebase.json does not reference the verified Realtime Database Rules file.');
}

if (firebaseRc.projects?.production !== expectedProject) {
  throw new Error('The Firebase production project does not match the release target.');
}

console.log(`Verified Realtime Database Rules ${actualHash} for ${expectedProject}.`);
