# Old vs new

A library change must leave every existing output as it was, except the behavior it means to change. `pnpm old-vs-new
<base>` makes that a fixed step with output a reviewer reads, instead of a recorder written by hand for each change.

```sh
pnpm old-vs-new <base>                                   # <base> against this checkout
pnpm old-vs-new <base> --head <rev>                      # against a commit instead
pnpm old-vs-new <base> --only docking,placement          # some packages (docking, placement, motion)
pnpm old-vs-new <base> --expect .changes-expect/<slug>.json
```

A run takes about a minute: it makes a temporary detached worktree at `<base>` (under the OS temp dir, with `pnpm
install --offline --frozen-lockfile`), runs the recorders there and at the head, diffs them and removes the worktree
(`git worktree remove`, never forced). The head is this checkout as it is, uncommitted changes included; `--head <rev>`
records that commit in a worktree of its own.

## What it prints

Per package and per output kind, `same N / changed M` (a case present on one side only counts as changed), then the
first two changed cases of each kind with the path, the old value and the new one; `summary.txt` lists every changed
case. The full diff and both recordings are in `.old-vs-new/<base>..<head>/` (git-ignored): `<package>.diff.json`,
`summary.txt`, `base/` and `head/`.

Beside it, so a quiet result can't hide a recorder that stopped recording:
- a kind with cases a side recorded as `absent` or `threw` shows `[base absent 3, threw 0]` after its counts;
- **recorder or corpus changed**: `git diff --stat` of the recorders (files they had at the base) and the corpus files,
  base to head. The corpus files are not a list kept here: each recording lists every module the recorder loaded and the
  test helpers and rows those import (not the library's own `src`), with the `fixtures` folder beside each. A change
  there bends what is compared; check it is meant.

Exit 0: nothing changed. Exit 1: something did. Exit 2: the run itself failed (a recorder crashed, an install failed), or
the head recording has any `absent` or `threw` case or lacks an output kind of the table below: it proves nothing.

## The expect file

A change that means to move outputs lists them in `.changes-expect/<slug>.json`, a list of
`{ "package", "kind", "case", "reason" }`. Each of the first three is a glob (`*` any run, `?` one character); package
and kind may list alternatives as `a|b`. The guard against an entry that excuses too much:
- `reason`, `package`, `kind` and `case` are required on every entry;
- a `case` glob made only of `*` and `?` (`*`, `?*`, `??`) is refused unless the entry says `"all": true`; name the
  cases the change reaches instead (`*asked*`, `random*`), or say why it is all of them;
- an `"all": true` entry must name one package and one kind, with no `*`, `?` or `|` in them: it can excuse the whole of
  one kind of one package and nothing more.

With `--expect` the run exits 0 only if every changed case is covered by an entry and every entry matched at least one
change; it prints, per entry, `covered n of N changed; a+b cases in kind` (the kind's total cases, per package) and the
reason, so a blanket entry shows against what it could have excused. A change nothing covers, or
an entry that matched nothing, is the review's question. See `.changes-expect/split-pair-lengths.json` (run as
`pnpm old-vs-new ce7b796c --head 30b8ad4c --expect ...`) and `.changes-expect/lengths-rename.json` (a rename: the one
`contract` case).

## The recorders

`packages/<pkg>/record/<pkg>.record.ts`, run by vitest through the package's own `record/vitest.config.ts`; the normal
test run never reads them. Each writes canonical JSON (keys sorted, numbers rounded to 1e-6) of the package's public
outputs over a fixed corpus, built from the checkout's own test helpers (the sweep windows, the stack fixtures, the
conformance and landing rows) and seeded random sets. A case id is stable: the diff matches cases, and arrays inside a
case, by id. `record/canon.ts` has the shared pieces.

| Package | Output kinds |
|---|---|
| docking | `contract`, `solve`, `targets`, `drops` (each target's drop), `refusals`, `stops`, `lanes`, `dividers`, `resize` (what `resizeBetween` and `resetBetween` write), `case-layout` and `case-solve` (the conformance rows), `after-rest`, `landing-frames`, `guides` and `after` / `release-after` (a drag's frames) |
| placement | `contract`, `fit`, `fit-previous` (refitted from its previous fit), `dividers`, `resize`, `gaps`, `cut`, `float-fit`, `layout-split`, `split-edits`, `pane-region`, `pane-targets`, `order-layout`, `order-targets` |
| motion | `landing-frames` (the landing model over every landing row), `layout-frames` (`createLayoutMotion` on the fake clock), `animator` |

### Old commits

The recorders live at the head and are copied into the base checkout, so they meet code that may lack an export, a test
helper or a field. Every library call goes through `attempt` and every module through `load` (`record/canon.ts`): an
export or helper that isn't there records `{ "absent": "..." }`, a call that throws records `{ "threw": "..." }`, and
the run goes on. A name that changed between commits is found by a probe, not assumed: an item's asked lengths are
written under `lengths` or `length`, whichever the commit's code reads (`askedName`), and the name is recorded as the
`contract` case `asked-lengths name`, so a rename shows as exactly that one change (a probe that finds neither name fails
the run). A new recorder or a new corpus case shows as `absent` against a base without it; that is what the base had.
At the head, `absent` and `threw` are errors (exit 2).

### What the corpus doesn't cover

- The drags are sampled: 48 windows spread over the sweep, 4 paths each, 6 frames a path, at the sweep's two hand
  speeds (the full sweep is `test/one-layout-sweep.test.ts`).
- The conformance rows are played as gestures on the reference host and read at their end, not frame by frame.
- Not recorded: the stored form (its keys are a contract of their own, covered by the store tests), the popup positioner,
  the gesture recognizer, the frame loop's timing, the DOM helpers and the lab.
- States are the repository's own fixtures and a seeded set; a bug that needs a state none of them has isn't seen.
