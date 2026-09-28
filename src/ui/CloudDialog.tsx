import { useEffect, useState } from 'react';
import rules from '../../firestore.rules?raw';
import { EMULATOR } from '../cloud/config';
import type { CloudView } from '../cloud/controller';
import { Modal } from './Dialogs';
import { icons } from './icons';

export const SETUP_GUIDE_URL = 'https://github.com/josephscar/writing-software/blob/main/docs/CLOUD.md';

interface Props {
  open: boolean;
  view: CloudView;
  /** Projects synced, and scripts kept only on this device. */
  counts: { projects: number; localScripts: number };
  onSignIn: (emulatorEmail?: string) => Promise<string | null>;
  onSignOut: () => Promise<void>;
  onSyncNow: () => Promise<void>;
  onSaveConfig: (text: string) => Promise<void>;
  onForgetConfig: () => Promise<void>;
  onClose: () => void;
}

/** Plain-language status line for the signed-in state. */
export function describeStatus(view: CloudView): { text: string; tone: 'ok' | 'busy' | 'warn' | 'error' } {
  const { state } = view;
  if (state.phase === 'setup') return { text: 'Not set up', tone: 'warn' };
  if (state.phase === 'loading') return { text: 'Connecting…', tone: 'busy' };
  if (state.phase === 'signed-out') return { text: 'Signed out', tone: 'warn' };
  switch (state.status) {
    case 'synced':
      return { text: 'Everything’s up to date.', tone: 'ok' };
    case 'syncing':
    case 'connecting':
      return { text: 'Syncing…', tone: 'busy' };
    case 'offline':
      return { text: 'Offline. Your work is saved on this device and uploads when you’re back online.', tone: 'warn' };
    default:
      return { text: `Sync problem: ${state.detail ?? 'unknown error'}`, tone: 'error' };
  }
}

/** A next step for errors people hit while setting up their Firebase project. */
function errorHint(detail: string | undefined): string | null {
  const d = (detail ?? '').toLowerCase();
  if (d.includes('permission')) return 'Check that Punchline’s security rules are published in your Firebase project (Firestore Database → Rules). Copy them below.';
  if (d.includes('does not exist') || d.includes('not_found') || d.includes('not found'))
    return 'Create the Firestore database in the Firebase console (Build → Firestore Database → Create database).';
  return null;
}

export function CloudDialog(props: Props) {
  const { view, counts } = props;
  const { state } = view;
  const [configText, setConfigText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [changing, setChanging] = useState(false);
  const [testEmail, setTestEmail] = useState('writer@example.com');

  useEffect(() => {
    if (!props.open) return;
    setError(null);
    setBusy(false);
    setCopied(false);
    setChanging(false);
  }, [props.open]);

  const run = async (task: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const copyRules = async () => {
    try {
      await navigator.clipboard.writeText(rules);
      setCopied(true);
    } catch {
      setError('Couldn’t copy. The rules are in firestore.rules in Punchline’s source.');
    }
  };

  const guide = (
    <a href={SETUP_GUIDE_URL} target="_blank" rel="noreferrer">
      step-by-step setup guide
    </a>
  );

  const rulesButton = (
    <button className="btn btn-quiet small" onClick={copyRules}>
      {icons.copy()} {copied ? 'Copied' : 'Copy security rules'}
    </button>
  );

  const differentProject = view.configSource === 'pasted' && (
    <p className="cloud-small">
      Firebase project <code>{view.projectId}</code> ·{' '}
      {changing ? (
        <span className="confirm-inline">
          Stop using it on this device? Your work stays here.{' '}
          <button className="link-btn" onClick={() => run(props.onForgetConfig)}>
            Disconnect
          </button>{' '}
          <button className="link-btn" onClick={() => setChanging(false)}>
            Cancel
          </button>
        </span>
      ) : (
        <button className="link-btn" onClick={() => setChanging(true)}>
          Use a different Firebase project
        </button>
      )}
    </p>
  );

  let body;
  if (state.phase === 'setup') {
    body = (
      <form
        className="form-grid"
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => props.onSaveConfig(configText));
        }}
      >
        <p className="cloud-lead">
          Keep your projects in your own Firebase project, free on Google’s Spark plan, and open them on any computer you sign in on.
        </p>
        <ol className="cloud-steps">
          <li>
            Create a project at{' '}
            <a href="https://console.firebase.google.com" target="_blank" rel="noreferrer">
              console.firebase.google.com
            </a>
            .
          </li>
          <li>Turn on Google sign-in (Authentication → Sign-in method).</li>
          <li>Create a Firestore database and publish Punchline’s security rules. {rulesButton}</li>
          <li>Add a web app (Project settings → Your apps) and paste its config here.</li>
        </ol>
        <p className="field-hint">Stuck? Follow the {guide}.</p>
        <label className="field">
          <span className="field-label">Firebase config</span>
          <textarea
            rows={6}
            spellCheck={false}
            className="mono"
            placeholder={'const firebaseConfig = {\n  apiKey: "…",\n  authDomain: "…",\n  projectId: "…",\n  appId: "…"\n};'}
            value={configText}
            onChange={(e) => setConfigText(e.target.value)}
          />
          <span className="field-hint">These values name your project; they aren’t passwords. Only you can read your scripts once you sign in.</span>
        </label>
        <div className="cloud-actions">
          <button type="submit" className="btn btn-primary" disabled={busy || !configText.trim()}>
            Connect
          </button>
        </div>
      </form>
    );
  } else if (state.phase === 'loading') {
    body = <p className="cloud-lead">Connecting to Firebase…</p>;
  } else if (state.phase === 'signed-out') {
    const message = error ?? state.error;
    body = (
      <div className="form-grid">
        <p className="cloud-lead">Sign in to keep your projects in the cloud and pick up where you left off on any device.</p>
        <div>
          <button className="btn btn-primary" disabled={busy} onClick={() => run(() => props.onSignIn())}>
            {icons.cloud()} Sign in with Google
          </button>
        </div>
        {EMULATOR && (
          <form
            className="emulator-sign-in"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => props.onSignIn(testEmail));
            }}
          >
            <label className="field">
              <span className="field-label">Emulator: sign in as</span>
              <input aria-label="Emulator account" value={testEmail} onChange={(e) => setTestEmail(e.target.value)} />
            </label>
            <button className="btn btn-quiet" type="submit" disabled={busy}>
              Sign in to emulator
            </button>
          </form>
        )}
        {message && <p className="cloud-error">{message}</p>}
        <p className="field-hint">Scripts inside a project sync. Scripts outside any project stay on this device.</p>
        {differentProject}
      </div>
    );
  } else {
    const status = describeStatus(view);
    const hint = state.status === 'error' ? errorHint(state.detail) : null;
    body = (
      <div className="form-grid">
        <div className="cloud-account">
          {state.user.photoUrl ? (
            <img className="avatar" src={state.user.photoUrl} alt="" referrerPolicy="no-referrer" />
          ) : (
            <span className="avatar" aria-hidden="true">
              {(state.user.name || state.user.email || '?').slice(0, 1).toUpperCase()}
            </span>
          )}
          <span className="cloud-who">
            <b>{state.user.name}</b>
            {state.user.email && state.user.email !== state.user.name && <span>{state.user.email}</span>}
          </span>
          <button className="btn btn-quiet small" disabled={busy} onClick={() => run(props.onSignOut)}>
            Sign out
          </button>
        </div>
        <p className={`cloud-status tone-${status.tone}`} role="status">
          {status.tone === 'ok' ? icons.cloudCheck() : status.tone === 'busy' ? icons.cloudUp() : status.tone === 'error' ? icons.cloudAlert() : icons.cloudOff()}
          <span>{status.text}</span>
        </p>
        {hint && (
          <p className="field-hint">
            {hint} {hint.includes('rules') && rulesButton}
          </p>
        )}
        {error && <p className="cloud-error">{error}</p>}
        <ul className="cloud-facts">
          <li>
            {icons.cloud()} {counts.projects === 1 ? '1 project syncs' : `${counts.projects} projects sync`}, with their scripts and drafts.
          </li>
          <li>
            {icons.device()}{' '}
            {counts.localScripts === 0
              ? 'Every script is in a project.'
              : `${counts.localScripts === 1 ? '1 script is' : `${counts.localScripts} scripts are`} outside any project, so only on this device. Move them into a project from the Library to sync them.`}
          </li>
        </ul>
        <div>
          <button className="btn btn-quiet" disabled={busy} onClick={() => run(props.onSyncNow)}>
            {icons.cloudUp()} Sync now
          </button>
        </div>
        {differentProject}
      </div>
    );
  }

  return (
    <Modal open={props.open} title="Cloud sync" onClose={props.onClose}>
      {body}
      {error && (state.phase === 'setup' || state.phase === 'loading') && <p className="cloud-error">{error}</p>}
    </Modal>
  );
}

/** Top-bar button showing the sync state at a glance. */
export function CloudButton(props: { view: CloudView; onClick: () => void }) {
  const { state } = props.view;
  let icon = icons.cloudOff();
  let label = 'Sync';
  let tone = '';
  if (state.phase === 'signed-out') label = 'Sign in';
  if (state.phase === 'loading') {
    icon = icons.cloud();
    label = 'Connecting…';
  }
  if (state.phase === 'signed-in') {
    if (state.status === 'synced') {
      icon = icons.cloudCheck();
      label = 'Synced';
    } else if (state.status === 'syncing' || state.status === 'connecting') {
      icon = icons.cloudUp();
      label = 'Syncing…';
      tone = ' is-busy';
    } else if (state.status === 'offline') {
      icon = icons.cloudOff();
      label = 'Offline';
    } else {
      icon = icons.cloudAlert();
      label = 'Sync problem';
      tone = ' is-error';
    }
  }
  return (
    <button className={`btn btn-quiet cloud-btn${tone}`} onClick={props.onClick} title={`Cloud sync: ${label}`} aria-label={`Cloud sync: ${label}`}>
      {icon}
      <span className="hide-md">{label}</span>
    </button>
  );
}
