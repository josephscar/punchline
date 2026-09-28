import { builtInConfig, EMULATOR, parseFirebaseConfig, type FirebaseConfig } from './config';
import type { FirebaseConnection } from './firestore';
import { SyncEngine, type SyncedLibrary, type SyncHooks } from './sync';
import type { CloudUser, SyncStatus, Unsubscribe } from './types';

/** What the app shows about cloud sync. */
export type CloudState =
  /** No Firebase project configured yet. */
  | { phase: 'setup' }
  | { phase: 'loading' }
  | { phase: 'signed-out'; error?: string }
  | { phase: 'signed-in'; user: CloudUser; status: SyncStatus; detail?: string };

export interface CloudView {
  state: CloudState;
  /** Where the Firebase settings came from: built into this copy of Punchline, or pasted in. */
  configSource: 'built-in' | 'pasted' | null;
  /** The Firebase project in use. */
  projectId: string | null;
}

const CONFIG_PREF = 'firebaseConfig';
const ACCOUNT_PREF = 'cloudAccount';

type FirebaseModule = typeof import('./firestore');

/**
 * Connects Punchline to the user's Firebase project: loads the Firebase SDK
 * (only once a project is configured, so the app stays small otherwise),
 * follows sign-in, and runs the sync engine while someone is signed in.
 */
export class CloudController {
  private fb: FirebaseModule | null = null;
  private conn: FirebaseConnection | null = null;
  private stopWatchingUser: Unsubscribe | null = null;
  private engine: SyncEngine | null = null;
  private view: CloudView = { state: { phase: 'loading' }, configSource: null, projectId: null };
  private disposed = false;
  /** Serialises connect / sign-in changes. */
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private lib: SyncedLibrary,
    private hooks: Omit<SyncHooks, 'onStatus'>,
    private onView: (view: CloudView) => void,
  ) {}

  private emit(patch: Partial<CloudView>) {
    this.view = { ...this.view, ...patch };
    if (!this.disposed) this.onView(this.view);
  }

  private queue<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  /** Connect with the built-in or saved Firebase settings, if there are any. */
  init(): Promise<void> {
    return this.queue(async () => {
      const builtIn = builtInConfig();
      const saved = builtIn ? null : await this.lib.getPref<FirebaseConfig>(CONFIG_PREF);
      const config = builtIn ?? saved ?? null;
      if (!config) return this.emit({ state: { phase: 'setup' }, configSource: null, projectId: null });
      await this.connect(config, builtIn ? 'built-in' : 'pasted');
    });
  }

  private async connect(config: FirebaseConfig, source: CloudView['configSource']) {
    this.emit({ state: { phase: 'loading' }, configSource: source, projectId: config.projectId });
    this.fb ??= await import('./firestore');
    if (this.disposed) return;
    this.conn = this.fb.connectFirebase(config, { emulator: EMULATOR });
    this.stopWatchingUser = this.fb.watchUser(this.conn, (user) => void this.queue(() => this.onUser(user)));
  }

  private async disconnect() {
    await this.stopEngine();
    this.stopWatchingUser?.();
    this.stopWatchingUser = null;
    if (this.conn && this.fb) await this.fb.disconnectFirebase(this.conn).catch(() => undefined);
    this.conn = null;
  }

  private async onUser(user: CloudUser | null) {
    if (this.engine && this.engine.user.uid === user?.uid) return;
    await this.stopEngine();
    if (!user || !this.conn || !this.fb) {
      // Keep a sign-in error on screen.
      if (this.view.state.phase !== 'signed-out') this.emit({ state: { phase: 'signed-out' } });
      return;
    }
    // Sync records describe one account's cloud. After switching accounts,
    // start afresh: this device's projects are uploaded to the new account
    // and nothing is deleted because the old account's projects are missing.
    const previous = await this.lib.getPref<string>(ACCOUNT_PREF);
    if (previous && previous !== user.uid) {
      for (const m of await this.lib.allSyncMeta()) await this.lib.deleteSyncMeta(m.key);
    }
    await this.lib.setPref(ACCOUNT_PREF, user.uid);

    const engine = new SyncEngine(this.lib.base, this.fb.firestoreBackend(this.conn), user, {
      ...this.hooks,
      onStatus: (status, detail) => {
        if (this.engine === engine) this.emit({ state: { phase: 'signed-in', user, status, detail } });
      },
    });
    this.engine = engine;
    this.lib.engine = engine;
    this.emit({ state: { phase: 'signed-in', user, status: 'connecting' } });
    await engine.start();
  }

  private async stopEngine() {
    const engine = this.engine;
    if (!engine) return;
    this.engine = null;
    this.lib.engine = null;
    // Let an upload in progress finish so it isn't cut off half way.
    await engine.idle().catch(() => undefined);
    engine.stop();
  }

  /** Returns an error message to show, or null. `emulatorEmail`: sign in to the emulator as this made-up account. */
  async signIn(emulatorEmail?: string): Promise<string | null> {
    if (!this.conn || !this.fb) return 'Cloud sync isn’t set up yet.';
    try {
      if (EMULATOR && emulatorEmail) await this.fb.signInToEmulator(this.conn, emulatorEmail);
      else await this.fb.signInWithGoogle(this.conn);
      return null;
    } catch (e) {
      const message = this.fb.signInErrorMessage(e);
      if (message) this.emit({ state: { phase: 'signed-out', error: message } });
      return message;
    }
  }

  signOut(): Promise<void> {
    return this.queue(async () => {
      await this.uploadPending();
      await this.stopEngine();
      if (this.conn && this.fb) await this.fb.signOutOfCloud(this.conn);
      this.emit({ state: { phase: 'signed-out' } });
    });
  }

  /** Upload recent edits before signing out (anything left over goes up at the next sign-in). */
  private async uploadPending() {
    if (!this.engine) return;
    await Promise.race([this.engine.syncNow().catch(() => undefined), new Promise((r) => setTimeout(r, 5000))]);
  }

  async syncNow(): Promise<void> {
    await this.engine?.syncNow();
  }

  /** Use the Firebase project described by `text` (JSON or the console's config snippet). Throws if it can't be read. */
  saveConfig(text: string): Promise<void> {
    const config = parseFirebaseConfig(text);
    return this.queue(async () => {
      await this.disconnect();
      await this.lib.setPref(CONFIG_PREF, config);
      await this.connect(config, 'pasted');
    });
  }

  /** Stop syncing with the pasted Firebase project. Everything stays on this device. */
  forgetConfig(): Promise<void> {
    return this.queue(async () => {
      await this.uploadPending();
      if (this.conn && this.fb) await this.fb.signOutOfCloud(this.conn).catch(() => undefined);
      await this.disconnect();
      await this.lib.setPref(CONFIG_PREF, null);
      this.emit({ state: { phase: 'setup' }, configSource: null, projectId: null });
    });
  }

  dispose() {
    this.disposed = true;
    void this.queue(() => this.disconnect());
  }
}
