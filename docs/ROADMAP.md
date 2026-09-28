# Roadmap

## Version 1: single-cam sitcom

The first release covered writing one format well: the editor, the element flow, character memory, suggestions, pagination, the scene navigator and the Fountain, Final Draft and PDF files.

## Version 2: more formats, and organizing iterations

- **Formats:** One-Hour Drama (teaser and five acts) and Feature Screenplay (FADE IN: to FADE OUT., no acts), built on a shared screenplay page. A format picker for new scripts and a **Format** setting to switch an existing script.
- **Tab cycles element types:** Tab cycles the current line through Scene Heading → Action → Character → Transition, and Shift+Tab goes back; other elements are in the menu and on Alt+number. Suggestions are never chosen automatically; click one, or highlight it with the arrow keys and press Enter.
- **Projects:** group a series' episodes, or a film's scripts. New scripts in a project start with its title and format, and character suggestions come from the whole project.
- **Drafts:** save named iterations with a revision colour and a note; restore one (the current pages are kept as a draft first), or start a new script from it.
- **Compare:** added, removed and changed lines between any two drafts, down to the word.
- **Revision marks:** `*` beside every line changed since a chosen draft, in the editor and the PDF.
- **Backups:** `.punchline` files now hold a script with its drafts, or a whole project; importing always adds a copy. Version 1 libraries upgrade in place.

## Version 3 (this release): projects in the cloud

- **Cloud sync** through the writer's own Firebase project on the free Spark plan: no Punchline server and nothing to pay. Sign in with Google; set up by pasting the Firebase config into the app, or build it in (`VITE_FIREBASE_CONFIG`, or a `FIREBASE_CONFIG` variable for GitHub Pages). See [CLOUD.md](CLOUD.md).
- **Local first:** the device's library stays the source of truth, so writing works offline exactly as before. Projects and everything in them upload a few seconds after changes; changes from other devices apply when the open script isn't being typed in.
- **No lost work:** every write carries the revision it was based on. When a script changed on two devices, the last to sync keeps its pages and the other version becomes a draft (*From another device*).
- **Ready for co-writers:** each cloud project has an owner and a member list, and the security rules already let members read and write while only the owner changes membership. The invite UI is the next step.
- Tested against the Firebase emulators, including two simulated devices in the browser.

### Considered and not chosen

- **A dedicated GitHub repository as the store.** Plausible (the GitHub contents API can read and write files, and history comes free), but a browser app would need each writer to create a personal access token with write access and paste it in, API rate limits make live sync awkward, and there's no push notification of changes from other devices. Firebase gives sign-in, live updates and offline handling for free.

## Version 4: next

### Co-writers

- Invite a co-writer to a project by email, see who's in it, leave or remove people
- Show who changed a script last, and presence ("Sam is editing Act Two")

### Multi-camera sitcom format

*Friends*, *The Neighborhood*, *Frasier*. The engine needs:

- Double-spaced dialogue (`lineSpacing` on `ElementStyle`), all-caps action, underlined scene headings
- Scene letters (A, B, C…) with each scene on a new page (`sceneLetters`, `newPagePerScene`)
- Character entrances and exits underlined in action
- Multi-cam vocabulary: `(ENTERING)`, `(EXITING)`, `(TO AUDIENCE)`

### Production

- Locked scene numbers (`12A`) so new scenes don't renumber the old ones
- Revision headers on changed pages ("Blue Rev. 10/01/26") and page locking (`12A.` pages)
- Dual dialogue (two characters side by side), which Fountain marks with `^`

### Writing

- Find and replace, including "rename location everywhere"
- Scene cards / beat-board view of the navigator
- Script reports: pages per act, scenes per location, lines per character
- Spellcheck that knows your character names

### Storage

- Save projects as real files or folders on disk (File System Access API), or a desktop build with Tauri
- Read-only share links for a script (a table read, a producer)
