# Roadmap

## Version 1 (this release): single-cam sitcom

The first release covers writing one format well: the editor, the element flow, character memory, autocomplete, pagination, the navigator and the Fountain, Final Draft and PDF files. See the [README](../README.md).

## Version 2: more formats, and organizing drafts

### New script formats

The format engine is data-driven: a `ScriptFormat` declares each element's indent, width, spacing and flow, and the editor, paginator and PDF writer all read it. Most new formats are therefore new definition files in `src/core/formats/`, plus a few new layout capabilities:

| Format | What's new for the engine |
|---|---|
| **Multi-cam sitcom** (*Friends*, *The Neighborhood*) | Double-spaced dialogue (`lineSpacing`), all-caps action, underlined scene headings, scene letters (A, B, C…), each scene on a new page, character entrances and exits underlined |
| **One-hour drama** | Teaser plus four to six acts, same page geometry as single-cam |
| **Feature screenplay** | No act headers; `FADE IN:` / `FADE OUT.` bookends |
| **Stage play / audio drama** (later) | Centered character names, different margins |

Work items:

- Add `lineSpacing`, `underline` on sluglines, `sceneLetters` and `newPagePerScene` to `ElementStyle` / `ScriptFormat`, and teach `layoutScript` and `formatCss` to honour them.
- A format picker in **Scripts → New**, and **Convert to…** to reflow a script into another format. The elements are the same; only the layout changes.
- Dual dialogue (two characters side by side), which Fountain marks with `^`.
- Per-format autocomplete vocabulary (multi-cam shows use `(ENTERING)` and `(EXITING)`, for example).

### File organization and script iterations

Today the library is a flat list of scripts. Version 2 adds structure:

```
Project (a series, or a feature)
├── Series bible: recurring characters, standing sets/locations
├── Episode 101 "Pilot"
│   ├── Draft 1 (White)       ← a snapshot you can go back to
│   ├── Draft 2 (Blue)
│   └── Current working draft
└── Episode 102 …
```

- **Projects** group episodes and share a series bible. Character memory and standing locations move from "all my scripts" to the project, so every episode of the series gets the cast and sets suggested.
- **Drafts (iterations):** **Save as new draft** snapshots the script with a label ("Table read", "Network notes") and a date. Drafts can be browsed, restored, duplicated into a branch, or deleted.
- **Compare drafts:** a side-by-side or inline diff of any two drafts, down to the element.
- **Production revisions:** revision colours (White, Blue, Pink, Yellow, Green, Goldenrod…), `*` marks in the right margin on changed lines, and locked scene numbers (`12A`) so new scenes don't renumber the old ones.
- **Storage:** IndexedDB stores `projects`, `scripts` and `drafts` (full snapshots are fine at script sizes). `Script` gains `projectId`. A schema migration moves v1 scripts into a default project. Optionally, save to real files on disk with the File System Access API, or wrap the app with Tauri for a desktop build.

### Also on the list

- Find and replace (including "rename location everywhere")
- Scene cards / beat-board view of the navigator
- Script reports: pages per act, scenes per location, lines per character
- Spellcheck that knows your character names
- Sharing and collaboration (needs a backend; out of scope until the local-first features are done)
