# Script formats

This is what Punchline's formats produce and why. The numbers live in [`src/core/formats/`](../src/core/formats/): `screenplay.ts` holds the page and elements the formats share, and each format file adds its structure, vocabulary and starting template.

| Format | Structure | Typical length |
|---|---|---|
| Single-Cam Sitcom | COLD OPEN, ACT ONE, ACT TWO (sometimes THREE), TAG, END OF SHOW | 25–35 pages |
| One-Hour Drama | TEASER, ACT ONE … ACT FIVE (network shows use four to six), END OF EPISODE | 50–65 pages |
| Feature Screenplay | FADE IN: … FADE OUT., no act headings | 90–120 pages |

## The page

All three formats use the screenplay page. Single-camera TV (*The Office*, *Parks and Recreation*, *Abbott Elementary*, *Grey's Anatomy*) is laid out like a feature screenplay: mixed-case action, single-spaced dialogue, and no scene letters. That separates it from multi-cam shows, which use double-spaced dialogue, all-caps action and lettered scenes (planned for a later version).

- US Letter, 12pt Courier (Punchline uses Courier Prime): 10 characters per inch, 6 lines per inch
- Margins: left 1.5″, right 1″, top and bottom 1″, which gives 54 lines per page
- Page numbers top right (`2.`) from page 2; the title page is unnumbered
- About one page per minute of screen time

| Element | Starts at | Width | Style | Blank lines above |
|---|---|---|---|---|
| Scene Heading | 1.5″ | 6.0″ | CAPS | 1 |
| Action | 1.5″ | 6.0″ | | 1 |
| Character | 3.7″ | 3.8″ | CAPS | 1 |
| Parenthetical | 3.1″ | 2.4″ | wrapped lines hang 1 character in | 0 |
| Dialogue | 2.5″ | 3.5″ | | 0 |
| Transition | flush right at 7.5″ | | CAPS | 1 |
| Shot | 1.5″ | 6.0″ | CAPS | 1 |
| New Act | centered | | CAPS, **bold**, <u>underlined</u>, new page | — |
| End of Act | centered | | CAPS, **bold**, <u>underlined</u> | 1 |
| Note | never printed | | | |

## Single-cam sitcom structure

```
COLD OPEN            (or TEASER)
  …
END OF COLD OPEN

ACT ONE              ← every act starts on a new page
  …
END OF ACT ONE

ACT TWO
  …
END OF ACT TWO       (some shows have three or four acts)

TAG
  …
END OF SHOW
```

A new single-cam script in Punchline starts with this skeleton. When you add a New Act, the suggestions offer the act that comes next. End of Act offers "END OF" plus the current act, or END OF SHOW.

## One-hour drama structure

A new drama starts with a TEASER and ACT ONE to ACT FIVE, each on a new page, each closed by END OF … and the last by END OF EPISODE. Streaming dramas often drop act breaks; delete them, or start from a blank page.

## Feature structure

A feature has no act headings. It opens with `FADE IN:` at the left margin (as Action) and ends with `FADE OUT.` flush right (a Transition). The New Act and End of Act elements are left out of the menu and the Tab cycle for features; any already in the script still print.

## Elements

- **Scene heading (slugline):** `INT.` or `EXT.` (or `INT./EXT.`, `I/E.`), then the location, a dash, and the time: `INT. HOLLOWAY PAPER CO. - BULLPEN - DAY`. Common times are DAY, NIGHT, CONTINUOUS, LATER and MOMENTS LATER. Mockumentaries often use `TALKING HEAD`.
- **Action:** present tense, what we see and hear. Capitalize a character's name the first time they appear.
- **Character:** the speaker's name in caps. Extensions go in parentheses: `(V.O.)` voice-over, `(O.S.)`/`(O.C.)` off-screen or off-camera, `(PRE-LAP)`.
- **Parenthetical:** a short direction for delivery, such as `(beat)`, `(sotto)`, `(re: the banner)` or `(to Gary)`. Punchline draws the brackets for you.
- **Dialogue:** what is said.
- **Transition:** `CUT TO:`, `SMASH CUT TO:` (the classic comedy button), `MATCH CUT TO:`. Use them sparingly.
- **Shot:** a secondary slugline inside a scene, such as `ANGLE ON`, `CLOSE ON`, `BACK TO SCENE` or `INSERT`.
- **Note:** a note to yourself. It is highlighted in the editor, listed in the Notes tab, and exported to Fountain as `[[note]]`. It is never printed.

## Drafts and revision marks

A draft is a frozen copy of a script's pages. Drafts can carry one of the production revision colours studios print changed pages on, in order: White, Blue, Pink, Yellow, Green, Goldenrod, Buff, Salmon, Cherry, Tan. With **Revision marks** set to a draft, every line added or changed since that draft gets an asterisk (`*`) in the right margin, 0.6″ past the text column, both in the editor and in the PDF. Notes are never marked because they never print.

## Page-break rules

The paginator (`src/core/layout/paginate.ts`) follows the conventions of professional screenwriting software:

- Blank lines that would fall at the top of a page are dropped.
- A scene heading, shot or act header is never left alone at the bottom of a page; it moves to the next page with its first element.
- Action splits between pages only between sentences, with at least two lines on each side. Otherwise it moves whole.
- Dialogue splits after a sentence where it can, with `(MORE)` at the bottom and `NAME (CONT'D)` at the top of the next page. A speech that can't keep at least two lines on each page moves whole, character name included.
- `(CONT'D)` is added automatically when a character speaks again in the same scene with only action in between. You can turn this off in Settings.

## Files

| Format | Import | Export | Notes |
|---|---|---|---|
| Fountain (`.fountain`) | ✓ | ✓ | Acts become `> **_ACT ONE_** <` after a `===` page break. Notes become `[[…]]`. Bold, italic and underline are kept. |
| Final Draft (`.fdx`) | ✓ | ✓ | Uses Final Draft's TV element names, New Act and End of Act. Notes are not written, because Final Draft attaches notes to ranges of text. |
| PDF | | ✓ | Print-ready, with Courier Prime embedded and an optional title page. |
| Punchline (`.punchline`) | ✓ | ✓ | A script with all its drafts, settings and remembered characters, or a whole project. Imports always create copies. |
