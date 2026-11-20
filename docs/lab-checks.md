# Lab checks: presets, the headless run and the pre-render

How the lab's Document window page checks itself, as a format other labs can match field for field. There are two layers:
- **Presets with assertions** catch the rules we can name.
- **The pre-render** gives a reviewer (a person or a model) every preset's state and key frames, to find what no assertion names.

## Presets

A preset is one case of the page: a state to set up, and a check of what must hold there, playing a scripted gesture where the case needs one.

```ts
interface Preset {
  /** Stable, unique, kebab-case; never reused for another case. */
  readonly id: string;
  /** One line: what the case is. */
  readonly title: string;
  /** What must hold, in plain words: what a person checks by eye. */
  readonly expected: string;
  /** Not built yet: a failure shows as "not built" and counts as pending, not failed. */
  readonly pending?: boolean;
  /** The rule this case needs and the code doesn't have yet (shows red until it does), or none. */
  readonly lacks?: string;
  /** Put the page in the case's state: the window, its items, its settings. */
  setup(page: Page): void;
  /** Check it on the live page, playing its gesture if it has one. */
  check(page: Page): Verdict;
}

interface Verdict {
  readonly pass: boolean;
  /** What was found, in plain words ("Zoom lands 3 px from the pointer"); shown beside the case. */
  readonly now: string;
}
```

- A reported bug becomes a preset first, `pending` until it's fixed, then green for good.
- A preset's check runs on the page as a person sees it, not on a model of it.
- Checks that hold on every frame of a gesture sample every frame.

## The headless run

Each lab exposes one object on `window` (here `window.__docwin`) with:
- `presets()`: the list of `{ id, title, expected }`;
- `preset(id)`: set it up and check it;
- `reset()`;
- `checkAll()`: run every preset and give back one result each.

```ts
interface CaseResult {
  readonly id: string;
  readonly title: string;
  /** The verdict's `now`, or why it was skipped. */
  readonly now: string;
  readonly lacks: string | null;
  readonly pass: boolean;
  readonly pending?: boolean;
}
```

A check is one script: a headless Playwright browser opens the page with cleared storage, waits for the object, calls `checkAll()`, and prints the counts and the failing ids, plus any page errors:

```
docwin: 276 presets, 276 pass, 0 pending, 0 fail
errors: none
```

A model reads only the failures, so a check costs a script run, not a browser session.

## The pre-render

One headless run renders every preset to a report folder: its state after `setup`, and key frames of its gesture (the start, every frame where the held item changes place, and the release). A reviewer reads the dumps first and opens an image only where a dump looks wrong.

```
report/<run>/
  index.json                     # the run: build, page, viewport, and one entry per preset
  <preset-id>/
    state.png  state.json        # after setup
    frame-<n>.png  frame-<n>.json  # key frames of its gesture, in order
```

`index.json`:

```json
{
  "build": "<commit>",
  "page": "<route>",
  "viewport": { "width": 1600, "height": 1000, "scale": 1 },
  "presets": [{ "id": "…", "title": "…", "expected": "…", "frames": 7, "verdict": { "pass": true, "now": "…" } }]
}
```

Each `*.json` dump (window px, origin at the window's top left):

```json
{
  "t": 1240,
  "mark": "release",
  "pointer": { "x": 15, "y": 241 },
  "held": { "id": "zoom", "rect": { "x": 0, "y": 196, "width": 30, "height": 102 }, "placed": "rail-left/start/tools|$" },
  "landing": { "x": 0, "y": 196, "width": 30, "height": 102 },
  "region": "lane",
  "lane": "rail-left",
  "spot": "rail-left/start/tools|$",
  "pending": null,
  "cantGo": null,
  "guides": [{ "id": "rail-left/box/^|tools", "kind": "box", "lane": "rail-left", "rect": { "x": 2, "y": 34, "width": 26, "height": 78 } }],
  "items": [{ "id": "tools", "edge": "rail-left", "form": "icons", "rect": { "x": 0, "y": 117, "width": 30, "height": 158 } }],
  "errors": []
}
```

- `mark` names a key frame: `state`, `start`, `hop` (the held item changed place), or `release`.
- `pending` and `cantGo` say what the host shows at the pointer: the lane being entered, and the "Can't go here" tag.
- A dump holds no screenshot data and no page markup, only the facts a reviewer compares with the picture.
