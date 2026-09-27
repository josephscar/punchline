import { parseFountain } from './io/fountain';
import { scriptFromParsed } from './script';
import type { Script } from './types';

/** A short, original cold open that shows off every element. Loaded on first run. */
export const SAMPLE_FOUNTAIN = `Title: PAPER TRAIL
Episode: "Pilot"
Credit: Written by
Author: Your Name Here
Draft date: First Draft
Contact:
    you@example.com

[[Welcome to Punchline! This sample pilot shows single-cam sitcom format. Notes like this one are for you only — they never print. Press Ctrl/⌘ + / for the cheat sheet, or open the Library to start your own.]]

> **_COLD OPEN_** <

INT. HOLLOWAY PAPER CO. - BULLPEN - DAY

A drab open-plan office. DANA PRICE (30s, relentlessly upbeat) tapes a hand-painted banner across a cubicle: WELCOME BACK, GARY!

GARY OKAFOR (50s, has seen things) enters, clutching a coffee.

GARY
Why is there a banner?

DANA
(beaming)
Because you're back!

GARY
I went to lunch.

DANA
It was a *long* lunch.

She checks her watch. Then checks it again.

DANA
(sotto)
Three hours, Gary.

[[Runner: the banner keeps falling down — pay it off in the tag.]]

MARCUS (O.S.)
Is that cake? Tell me that's cake.

MARCUS WEBB (20s, intern, all elbows) pops up from behind the copier.

SMASH CUT TO:

INT. HOLLOWAY PAPER CO. - BREAK ROOM - CONTINUOUS

ANGLE ON

The microwave. A single burrito rotates, slowly, sadly.

MARCUS
It's not cake.

GARY
It was never cake.

> **_END OF COLD OPEN_** <

===

> **_ACT ONE_** <

EXT. HOLLOWAY PAPER CO. - PARKING LOT - MORNING

Dana sprints across the lot, **late** for the first time in her _life_.

DANA (V.O.)
Rule number one of paper sales: never be late.

She trips over a curb. Recovers. Keeps sprinting.

DANA (V.O.)
Rule number two: see rule number one.

> **_END OF ACT ONE_** <
`;

export function createSampleScript(): Script {
  const script = scriptFromParsed(parseFountain(SAMPLE_FOUNTAIN));
  script.settings.sceneNumbers = false;
  return script;
}
