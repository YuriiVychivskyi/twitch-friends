import { readFileSync } from 'node:fs';

import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, set } from 'firebase/database';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, describe, it } from 'vitest';

const projectId = 'demo-twitch-friends';

let testEnvironment: RulesTestEnvironment;

beforeAll(async () => {
  testEnvironment = await initializeTestEnvironment({
    projectId,
    database: {
      rules: readFileSync('firebase/rules/database.rules.json', 'utf8'),
    },
    firestore: {
      rules: readFileSync('firebase/rules/firestore.rules', 'utf8'),
    },
  });
});

afterAll(async () => {
  await testEnvironment.cleanup();
});

describe('fail-closed Firebase rules', () => {
  it('denies unauthenticated Firestore access', async () => {
    const context = testEnvironment.unauthenticatedContext();
    const reference = doc(context.firestore(), 'private/example');

    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { value: 'blocked' }));
  });

  it('denies authenticated Firestore access', async () => {
    const context = testEnvironment.authenticatedContext('alice');
    const reference = doc(context.firestore(), 'private/alice');

    await assertFails(getDoc(reference));
    await assertFails(setDoc(reference, { value: 'blocked' }));
  });

  it('denies unauthenticated Realtime Database access', async () => {
    const context = testEnvironment.unauthenticatedContext();
    const reference = ref(context.database(), 'private/example');

    await assertFails(get(reference));
    await assertFails(set(reference, { value: 'blocked' }));
  });

  it('denies authenticated Realtime Database access', async () => {
    const context = testEnvironment.authenticatedContext('alice');
    const reference = ref(context.database(), 'private/alice');

    await assertFails(get(reference));
    await assertFails(set(reference, { value: 'blocked' }));
  });
});
