import { describe, expect, it } from 'vitest';
import { parseFirebaseConfig } from './config';

describe('Firebase config', () => {
  it('reads the snippet from the Firebase console', () => {
    const snippet = `// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyExample",
  authDomain: "punchline-123.firebaseapp.com",
  projectId: "punchline-123",
  storageBucket: "punchline-123.firebasestorage.app",
  messagingSenderId: "1234",
  appId: "1:1234:web:abcd"
};`;
    expect(parseFirebaseConfig(snippet)).toEqual({
      apiKey: 'AIzaSyExample',
      authDomain: 'punchline-123.firebaseapp.com',
      projectId: 'punchline-123',
      storageBucket: 'punchline-123.firebasestorage.app',
      messagingSenderId: '1234',
      appId: '1:1234:web:abcd',
    });
  });

  it('reads JSON and explains what is missing', () => {
    expect(parseFirebaseConfig('{"apiKey":"k","authDomain":"d","projectId":"p","appId":"a"}').projectId).toBe('p');
    expect(() => parseFirebaseConfig('{"apiKey":"k"}')).toThrow(/authDomain, projectId, appId missing/);
  });
});
