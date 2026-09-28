# Punchline

A screenwriting app for **single-camera TV and film**: half-hour single-cam comedies (the format of *The Office*, *Parks and Recreation* and *Abbott Elementary*), one-hour dramas and feature screenplays. It knows the format, so you just write. It remembers your characters and suggests who speaks next, and it lays out your pages the way a production would print them. Projects and saved drafts keep every iteration of a script together, and cloud sync keeps your projects on every computer you write on.

![Punchline editing a single-cam pilot, with the character suggestions open](docs/screenshot.png)

Punchline runs in the browser, works offline and needs no account. Your scripts are stored on your computer, and, if you turn on cloud sync, in your own free Firebase project too.

## Features

**Writing**

| | |
|---|---|
| **Script elements** | Scene Heading (slugline), Action, Character, Parenthetical, Dialogue, Transition, Shot (secondary slugline), New Act, End of Act, and **Notes** that never print |
| **Enter** | Moves through elements the way Final Draft does: Scene Heading → Action, Character → Dialogue → Character… |
| **Tab** | Cycles the current line through Scene Heading → Action → Character → Transition, with or without text. Shift+Tab goes back. Every other element is in the menu and on Alt+number. |
| **Smart typing** | `int.` becomes a Scene Heading, `smash cut to:` a Transition, `(` in dialogue a Parenthetical, `[[` a Note, `ACT TWO` a New Act |
| **Character memory** | Names are remembered in this script and in the other scripts of the same project (the series' recurring cast). On a new Character line Punchline lists who's likely to talk next, with the other half of the conversation first. |
| **Suggestions** | Scene headings in three steps (INT./EXT. → locations you've used → DAY / NIGHT / CONTINUOUS…), transitions, act names in each format's order, parentheticals, `(V.O.)` / `(O.S.)`. Nothing is picked for you: click a suggestion, or highlight one with ↓ and press Enter. |
| **Scenes** | Navigator listing acts and scenes with page numbers, synopsis and cast. Click to jump, or drag to reorder a scene with everything in it. Optional scene numbers. |
| **Page layout** | Industry margins, acts on new pages with centered bold-underlined headers, live page breaks in the editor, automatic `(CONT'D)`, `(MORE)` when a speech breaks across pages |

**Formats**

| Format | Starts with |
|---|---|
| Single-Cam Sitcom | Cold open, two acts, a tag, END OF SHOW |
| One-Hour Drama | Teaser and five acts, END OF EPISODE |
| Feature Screenplay | FADE IN: … FADE OUT., no act headings |

Change a script's format any time in **Settings**. Multi-camera sitcom format comes in a later version.

**Organizing scripts and drafts**

| | |
|---|---|
| **Projects** | Group a series' episodes, or a film's scripts, into a project. New scripts in a project start with its title and format and share its cast. |
| **Drafts** | Save the script as a named draft (First Draft, Table Read, Network Notes…) with a production revision colour. Restore one (your current pages are kept as a draft first), or start a new script from it. |
| **Compare** | See what changed between any two drafts, or a draft and now: added, removed and changed lines, down to the word. |
| **Revision marks** | Choose a draft and every line changed since it gets a `*` in the right margin, in the editor and in the PDF. |
| **Files** | PDF export (Courier Prime, title page, revision marks). Import and export **Fountain** and **Final Draft (.fdx)**. Copy and paste work as Fountain. **Punchline backups** keep a script with its drafts, or a whole project. |

**Cloud sync**

| | |
|---|---|
| **Your own cloud** | Projects, with their scripts and drafts, sync through your own Firebase project on Google's free Spark plan. Sign in with Google on each computer you write on. Scripts outside a project stay on the device. |
| **Local first** | Writing never waits for the network. Everything is saved on the device first and uploads a few seconds after you stop typing, or when you're back online. |
| **Nothing lost** | If a script changed on two devices before they synced, both versions are kept: the other one becomes a draft named *From another device*, ready to compare. |
| **Private** | Security rules let only a project's members read it; today that's just you. Co-writers come in a later version. |

Setting it up takes about ten minutes, once: follow [docs/CLOUD.md](docs/CLOUD.md).

Press **Ctrl/⌘ + /** in the app for the cheat sheet, which covers every shortcut and the format rules.

## Run it

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
npm run dev        # open http://localhost:5173
```

The first launch opens a short sample pilot that uses every element. Start your own from **Library**: create a project, then a new script in the format you want.

To build a static site you can host anywhere, run `npm run build`; the output goes to `dist/`. `npm run build:single` produces a single self-contained `dist-single/index.html` that you can open straight from disk. `npm run build:demo` builds the same file for an online preview where the host blocks downloads; exporting is switched off there and explains why.

To put it online with GitHub Pages, go to **Settings → Pages**, set **Source** to **GitHub Actions**, then run the **Deploy to GitHub Pages** workflow from the Actions tab. Cloud sync works in the site build (`npm run build`, and GitHub Pages) but not in the single-file builds, because Google sign-in needs a web address to return to.

### Where your work is saved

Projects, scripts and drafts are saved automatically to the browser's IndexedDB on your machine, and projects also sync to the cloud if you've set that up. Without cloud sync, clearing site data deletes them, so back up regularly: **Export → Punchline backup** saves a script with its drafts, and **Library → Back up project** saves a whole project. Importing a backup always adds a copy; it never overwrites. Libraries from version 1 are upgraded in place the first time version 2 opens. If the browser won't allow storage (some private windows), the status bar says so.

## Keyboard

| Key | In… | Does |
|---|---|---|
| Enter | any element | next element (Scene Heading → Action, Character → Dialogue, Dialogue → Character, Transition → Scene Heading, New Act → Scene Heading…) |
| Enter | an empty element | switches it: empty Character → Action, empty Action → Scene Heading |
| Tab / Shift+Tab | any element | next / previous in Scene Heading → Action → Character → Transition (from any other element, Tab goes to Action) |
| ↓ / ↑, then Enter | suggestions showing | highlight a suggestion, use it and move on (or just click it) |
| Esc | suggestions showing | close the list |
| Alt/⌥ + 1…9, 0 | anywhere | Scene Heading, Action, Character, Parenthetical, Dialogue, Transition, Shot, New Act, End of Act, Note (Ctrl/⌘ + number also works where the browser doesn't reserve it for switching tabs) |
| Ctrl/⌘ + B / I / U | text | bold, italic, underline |
| Shift + Enter | text | line break inside an element |
| Ctrl/⌘ + P | anywhere | PDF preview |

## Development

```bash
npm test           # unit tests (Vitest): formats, pagination, diff, import/export, storage
npm run test:e2e   # browser tests (Playwright + Chromium)
npm run test:cloud # cloud sync against the Firebase emulators (needs Java 21+)
npm run typecheck
```

The code is split so that format knowledge is not tied to the UI:

```
src/core/            framework-free TypeScript, fully unit tested
  formats/           script formats: a shared screenplay page plus each format's acts, vocabulary and template
  layout/            word wrap and pagination
  io/                Fountain, Final Draft, PDF
  analysis.ts        scenes, characters, notes, (CONT'D)
  suggestions.ts     autocomplete and character memory
  flow.ts            Enter flow, Tab cycle, smart typing
  diff.ts            draft comparison and revision marks
  backup.ts          .punchline files for scripts and projects
  scenes.ts          scene moves
src/editor/          ProseMirror editor, including plugins for suggestions, page breaks and smart typing
src/ui/              React app shell: navigator, library, drafts, compare, cloud, dialogs
src/storage/         local library of projects, scripts and drafts (IndexedDB)
src/cloud/           cloud sync: sync engine, Firestore backend, sign-in (Firebase loads only once set up)
```

A script format is data. [`src/core/formats/`](src/core/formats/) defines every element's indent, width, capitalisation, spacing, page rules, Enter flow, Tab cycle and suggestion vocabulary. The editor's CSS, the paginator and the PDF writer all read it, which is how new formats are added without touching the editor.

See [docs/formats.md](docs/formats.md) for the format reference, [docs/CLOUD.md](docs/CLOUD.md) for cloud sync, and [docs/ROADMAP.md](docs/ROADMAP.md) for what's next.

## Credits

The editor is set in [Courier Prime](https://quoteunquoteapps.com/courierprime/) (SIL Open Font License, see `src/assets/fonts/OFL.txt`). Fountain is an open screenplay format: [fountain.io](https://fountain.io).
