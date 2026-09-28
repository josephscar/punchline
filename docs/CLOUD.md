# Cloud sync

Punchline can keep your projects in the cloud, so you can write on your laptop and pick up on your desktop. Everything lives in **your own Firebase project**, a Google service with a free plan, and you sign in with your Google account. Nobody else runs a server for Punchline or sees your scripts.

- **What syncs:** projects, with every script and draft inside them.
- **What stays on the device:** scripts outside any project, and your settings (theme, last script opened). To sync a script, move it into a project from the **Library**.
- **Offline:** Punchline keeps working as before. Your work is saved on the device first and uploads when you're back online.
- **Changes on two devices at once:** nothing is lost. If a script was changed on two devices before they synced, the device that syncs last keeps its pages, and the other version is saved as a draft called **From another device** so you can compare the two (Drafts → Compare).
- **A script open on two devices:** changes from the other device appear once you pause typing for a few seconds.

## Is it really free?

Yes, on Firebase's **Spark** plan, which is where new projects start. The Spark plan has no billing account, so you can't be charged; if you ever hit a limit, sync pauses until the next day. The limits at the time of writing (check [firebase.google.com/pricing](https://firebase.google.com/pricing)) are far beyond what writing needs:

| Spark plan limit | What it means for Punchline |
|---|---|
| 1 GiB stored | A 120-page feature is a few hundred KB, so roughly thousands of scripts and drafts |
| 20,000 writes a day | One write per upload. Punchline uploads a few seconds after you stop typing, not on every keystroke |
| 50,000 reads a day | Each device reads your projects when it opens, then only what changed |
| Google sign-in | Free |

## Set it up (about 10 minutes, once)

You need a Google account. Do these steps once; every device you write on then uses the same Firebase project.

### 1. Create a Firebase project

1. Go to [console.firebase.google.com](https://console.firebase.google.com) and click **Create a project** (or **Add project**).
2. Name it, for example `punchline-scripts`. Turn Google Analytics off; Punchline doesn't use it.
3. Click **Create project**. It starts on the free Spark plan. Don't upgrade.

### 2. Turn on Google sign-in

1. In the left menu open **Build → Authentication** and click **Get started**.
2. On the **Sign-in method** tab choose **Google**, switch it on, pick your email as the support email, and **Save**.

### 3. Create the database

1. Open **Build → Firestore Database** and click **Create database**.
2. Pick a location near you (it can't be changed later) and **Start in production mode**.

### 4. Publish Punchline's security rules

The rules make sure only you (and, later, co-writers you add) can read or change your projects.

1. In Punchline, click **Sync** (the cloud button in the top bar) and then **Copy security rules**. (They're also in [`firestore.rules`](../firestore.rules).)
2. In the Firebase console open **Firestore Database → Rules**, replace everything there with what you copied, and click **Publish**.

If you use the command line instead: `npx firebase deploy --only firestore --project <your-project-id>` publishes the rules and indexes from this repository.

### 5. Allow your Punchline site to sign in

Google sign-in only works from web addresses you allow. `localhost` is allowed already, so this step is only for a hosted copy of Punchline.

1. Open **Authentication → Settings → Authorized domains**.
2. Click **Add domain** and enter the address you open Punchline at, without `https://` or a path, for example `yourname.github.io`.

### 6. Register Punchline as a web app

1. Click the gear next to **Project Overview** → **Project settings**.
2. Under **Your apps**, click the web icon (`</>`), name it `Punchline`, and click **Register app**. You don't need Firebase Hosting.
3. Firebase shows a code snippet containing `const firebaseConfig = { … }`. Copy it (the whole snippet is fine).

### 7. Connect Punchline

1. In Punchline, click **Sync** in the top bar, paste the config into **Firebase config**, and click **Connect**.
2. Click **Sign in with Google**.

Your projects upload straight away; the cloud button shows **Synced** when they're done. On each other device, open Punchline, paste the same config, and sign in with the same Google account.

## Skip the pasting: build the config in (optional)

If you host your own copy of Punchline, you can build your Firebase config into it so every device only needs to sign in.

- **GitHub Pages:** in your repository go to **Settings → Secrets and variables → Actions → Variables**, add a repository variable named `FIREBASE_CONFIG`, and paste the config snippet (or the JSON object) as its value. Then run the **Deploy to GitHub Pages** workflow again.
- **Any other build:** set `VITE_FIREBASE_CONFIG` when running `npm run build`, for example in a `.env.local` file:

  ```
  VITE_FIREBASE_CONFIG={"apiKey":"…","authDomain":"…","projectId":"…","appId":"…"}
  ```

The config isn't a secret. It names your Firebase project, and every web app that uses Firebase sends it to the browser. What protects your scripts is Google sign-in plus the security rules from step 4.

## Troubleshooting

| Punchline says | Fix |
|---|---|
| This site isn't allowed to sign in to your Firebase project yet | Add the site's address under Authorized domains (step 5). |
| Google sign-in isn't turned on for your Firebase project | Turn on the Google provider (step 2). |
| Sync problem: Missing or insufficient permissions | Publish the security rules (step 4). |
| Sync problem: … database (default) does not exist | Create the Firestore database (step 3). |
| Firebase rejected the API key | Copy the config again from Project settings → Your apps (step 6). |
| Nothing happens when you click Sign in | Your browser blocked the pop-up. Punchline then opens Google's sign-in page in the same tab instead; if it doesn't, allow pop-ups for the site. |
| Offline | Nothing to do. Your work is saved on this device and uploads when the connection is back. |

To stop syncing, click **Sign out** in the Sync dialog. Everything already on the device stays there. **Use a different Firebase project** disconnects this device from the current one without deleting anything.

## Privacy

Your scripts are stored in your own Firebase project, under your Google account, and nowhere else. The security rules let a project be read or changed only by its members; today that's you alone. Firebase's own terms and privacy policy apply to what's stored there.

## Co-writers (coming later)

Each project in the cloud already lists its members, and the security rules already let members read and write it, while only the owner can add or remove people. Inviting a co-writer from inside Punchline comes in a later version.

## For developers

The cloud code is in [`src/cloud/`](../src/cloud/):

| File | Does |
|---|---|
| `sync.ts` | The sync engine: local-first, revision checks, conflicts saved as drafts |
| `firestore.ts` | Firestore and Firebase Auth backend |
| `fake.ts` | In-memory cloud used by the unit tests |
| `controller.ts` | Loads Firebase when a project is configured, follows sign-in, runs the engine |

Firestore layout: `projects/{id}` holds the title, format, `ownerId`, `memberIds` and a revision number. `projects/{id}/scripts/{id}` and `projects/{id}/drafts/{id}` hold each script and draft as JSON, also with a revision number.

Local development uses the Firebase emulators, which need Java 21 or newer:

```bash
npm run emulators   # Auth and Firestore emulators, in one terminal
npm run dev:cloud   # Punchline wired to the emulators, in another
npm run test:cloud  # starts the emulators and runs the cloud tests (Vitest + Playwright, two simulated devices)
```

With the emulators you sign in as a made-up account from the Sync dialog; no Google account or Firebase project is needed.
