# Single-camera sitcom format

This is what Punchline's single-cam format produces and why. The numbers live in [`src/core/formats/singleCamSitcom.ts`](../src/core/formats/singleCamSitcom.ts).

## The page

Single-cam comedies such as *The Office*, *Parks and Recreation*, *30 Rock*, *Abbott Elementary* and *Hacks* are laid out like feature screenplays: mixed-case action, single-spaced dialogue, and no scene letters. That separates them from multi-cam shows, which use double-spaced dialogue, all-caps action and lettered scenes.

- US Letter, 12pt Courier (Punchline uses Courier Prime): 10 characters per inch, 6 lines per inch
- Margins: left 1.5″, right 1″, top and bottom 1″, which gives 54 lines per page
- Page numbers top right (`2.`) from page 2; the title page is unnumbered
- About one page per minute of screen time; a half-hour episode runs 25–35 pages

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

## Structure

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

A new single-cam script in Punchline starts with this skeleton. When you add a New Act, the autocomplete offers the act that comes next. End of Act offers "END OF" plus the current act, or END OF SHOW.

## Elements

- **Scene heading (slugline):** `INT.` or `EXT.` (or `INT./EXT.`, `I/E.`), then the location, a dash, and the time: `INT. HOLLOWAY PAPER CO. - BULLPEN - DAY`. Common times are DAY, NIGHT, CONTINUOUS, LATER and MOMENTS LATER. Mockumentaries often use `TALKING HEAD`.
- **Action:** present tense, what we see and hear. Capitalize a character's name the first time they appear.
- **Character:** the speaker's name in caps. Extensions go in parentheses: `(V.O.)` voice-over, `(O.S.)`/`(O.C.)` off-screen or off-camera, `(PRE-LAP)`.
- **Parenthetical:** a short direction for delivery, such as `(beat)`, `(sotto)`, `(re: the banner)` or `(to Gary)`. Punchline draws the brackets for you.
- **Dialogue:** what is said.
- **Transition:** `CUT TO:`, `SMASH CUT TO:` (the classic comedy button), `MATCH CUT TO:`. Use them sparingly.
- **Shot:** a secondary slugline inside a scene, such as `ANGLE ON`, `CLOSE ON`, `BACK TO SCENE` or `INSERT`.
- **Note:** a note to yourself. It is highlighted in the editor, listed in the Notes tab, and exported to Fountain as `[[note]]`. It is never printed.

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
| Punchline (`.punchline`) | ✓ | ✓ | Full backup, including settings and remembered characters. |
