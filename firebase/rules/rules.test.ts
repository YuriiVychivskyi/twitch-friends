import { readFileSync } from 'node:fs';

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { get, ref, remove, set } from 'firebase/database';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest';

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

beforeEach(async () => {
  await testEnvironment.clearDatabase();
  await testEnvironment.clearFirestore();
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

  it('allows users to manage only their own friendship edges', async () => {
    const alice = testEnvironment.authenticatedContext('alice');

    await assertSucceeds(set(ref(alice.database(), 'friendships/alice/bob'), true));
    await assertSucceeds(get(ref(alice.database(), 'friendships/alice')));
    await assertFails(set(ref(alice.database(), 'friendships/bob/alice'), true));
    await assertFails(set(ref(alice.database(), 'friendships/alice/bob'), false));
  });

  it('denies self-friendships', async () => {
    const alice = testEnvironment.authenticatedContext('alice');

    await assertFails(set(ref(alice.database(), 'friendships/alice/alice'), true));
  });
  it('denies presence for one-sided friendship edges', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), 'friendships/alice/bob'), true);
    });

    const alice = testEnvironment.authenticatedContext('alice');
    const presence = {
      ciphertext: 'encryptedPayload',
      expiresAt: Date.now() + 60_000,
      iv: 'abcdefghijklmnop',
      version: 1,
    };
    await assertFails(set(ref(alice.database(), 'presence/bob/alice'), presence));
  });

  it('allows encrypted presence only between mutual friends', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), 'friendships/alice/bob'), true);
      await set(ref(context.database(), 'friendships/bob/alice'), true);
    });

    const alice = testEnvironment.authenticatedContext('alice');
    const bob = testEnvironment.authenticatedContext('bob');
    const charlie = testEnvironment.authenticatedContext('charlie');
    const presence = {
      ciphertext: 'encryptedPayload',
      expiresAt: Date.now() + 60_000,
      iv: 'abcdefghijklmnop',
      version: 1,
    };

    const reference = ref(alice.database(), 'presence/bob/alice');

    await assertSucceeds(set(reference, presence));
    await assertSucceeds(get(ref(bob.database(), 'presence/bob')));
    await assertFails(get(ref(alice.database(), 'presence/bob')));
    await assertFails(get(ref(charlie.database(), 'presence/bob')));
    await assertSucceeds(remove(reference));
  });

  it('allows recipients to clear their presence inbox', async () => {
    await testEnvironment.withSecurityRulesDisabled(async (context) => {
      await set(ref(context.database(), 'presence/bob/alice'), {
        ciphertext: 'encryptedPayload',
        expiresAt: Date.now() + 60_000,
        iv: 'abcdefghijklmnop',
        version: 1,
      });
    });

    const bob = testEnvironment.authenticatedContext('bob');
    const alice = testEnvironment.authenticatedContext('alice');

    await assertSucceeds(remove(ref(bob.database(), 'presence/bob')));
    await assertFails(remove(ref(alice.database(), 'presence/bob')));
  });
});
