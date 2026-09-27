# Roadmap

## Version 1: single-cam sitcom

The first release covered writing one format well: the editor, the element flow, character memory, suggestions, pagination, the scene navigator and the Fountain, Final Draft and PDF files.

## Version 2 (this release): more formats, and organizing iterations

- **Formats:** One-Hour Drama (teaser and five acts) and Feature Screenplay (FADE IN: to FADE OUT., no acts), built on a shared screenplay page. A format picker for new scripts and a **Format** setting to switch an existing script.
- **Tab cycles element types:** Tab always changes the current line to the next element type, and Shift+Tab to the previous one. Suggestions are never chosen automatically; click one, or highlight it with the arrow keys and press Enter.
- **Projects:** group a series' episodes, or a film's scripts. New scripts in a project start with its title and format, and character suggestions come from the whole project.
- **Drafts:** save named iterations with a revision colour and a note; restore one (the current pages are kept as a draft first), or start a new script from it.
- **Compare:** added, removed and changed lines between any two drafts, down to the word.
- **Revision marks:** `*` beside every line changed since a chosen draft, in the editor and the PDF.
- **Backups:** `.punchline` files now hold a script with its drafts, or a whole project; importing always adds a copy. Version 1 libraries upgrade in place.

## Version 3: next

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

### Storage and sharing

- Save projects as real files or folders on disk (File System Access API), or a desktop build with Tauri
- Sharing and collaboration (needs a backend; out of scope until the local-first features are done)
