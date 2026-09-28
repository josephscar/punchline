/**
 * Where Punchline's Firebase settings come from, in order:
 *   1. the local emulator, when built with VITE_FIREBASE_EMULATOR=true (development and tests);
 *   2. VITE_FIREBASE_CONFIG at build time (e.g. a GitHub Pages deploy);
 *   3. the config you paste into Punchline (Cloud → Set up), kept in this browser.
 *
 * These values identify your Firebase project; they are not secrets. Access to
 * the data is controlled by Google sign-in and firestore.rules.
 */

export interface FirebaseConfig {
  apiKey: string;
  authDomain: string;
  projectId: string;
  appId: string;
  storageBucket?: string;
  messagingSenderId?: string;
  measurementId?: string;
}

export const EMULATOR = import.meta.env.VITE_FIREBASE_EMULATOR === 'true';

export const EMULATOR_CONFIG: FirebaseConfig = {
  apiKey: 'demo-api-key',
  authDomain: 'demo-punchline.firebaseapp.com',
  projectId: 'demo-punchline',
  appId: 'demo-app',
};

const KEYS: (keyof FirebaseConfig)[] = ['apiKey', 'authDomain', 'projectId', 'appId', 'storageBucket', 'messagingSenderId', 'measurementId'];

/**
 * Read a Firebase web config: JSON, or the `const firebaseConfig = { … }`
 * snippet the Firebase console shows. Throws with a readable message.
 */
export function parseFirebaseConfig(text: string): FirebaseConfig {
  const out: Record<string, string> = {};
  try {
    const json = JSON.parse(text);
    for (const k of KEYS) if (typeof json[k] === 'string') out[k] = json[k];
  } catch {
    for (const k of KEYS) {
      const m = new RegExp(`["']?${k}["']?\\s*:\\s*["']([^"']+)["']`).exec(text);
      if (m) out[k] = m[1];
    }
  }
  const missing = (['apiKey', 'authDomain', 'projectId', 'appId'] as const).filter((k) => !out[k]);
  if (missing.length) throw new Error(`That doesn’t look like a Firebase web config: ${missing.join(', ')} missing.`);
  return out as unknown as FirebaseConfig;
}

export function builtInConfig(): FirebaseConfig | null {
  if (EMULATOR) return EMULATOR_CONFIG;
  const raw = import.meta.env.VITE_FIREBASE_CONFIG as string | undefined;
  if (!raw) return null;
  try {
    return parseFirebaseConfig(raw);
  } catch {
    return null;
  }
}
