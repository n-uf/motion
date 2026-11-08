# Signals: the choice and the benchmark

**Choice: alien-signals' core (`alien-signals/system`) under vusyk's own API.**
One small MIT runtime dependency; everything else in the package is ours.

## Candidates

| | what it is |
|---|---|
| hand-written | A push-pull graph written for this package (kept as `bench/handwritten-signals.ts`, not shipped). |
| alien-signals 3.2.1 | Its public `signal`/`computed`/`effect`. |
| @preact/signals-core 1.14.5 | Its public API. |
| **vusyk** (shipped) | `src/signals/signals.ts`: alien-signals' published core, `createReactiveSystem`, with vusyk's surface on top. |

## Why

1. **It has to work under the injected clock.** Effects must be able to run in
   a frame loop phase, once per frame however many writes land before it.
   - The hand-written graph and the shipped surface hand each effect's run to
     a `schedule` callback; `loop.scheduler(phase)` dedupes it.
   - alien-signals' public `effect` runs synchronously and has no scheduler,
     but its core is published for exactly this (`createReactiveSystem` with a
     `notify` hook: "Creating Your Own Surface API" in its README). Deferring
     an effect is a `notify` that queues it for the scheduler.
   - @preact/signals-core has no hook to defer an effect's re-run. The only
     way to get frame batching is a read/write split that still recomputes on
     every write, not once per frame. It's out on this point alone.
2. **Speed.** On best times, the shipped surface matches alien-signals' own
   API (same core) and beats the hand-written graph in all five cases, by 1.3
   to 3.7 times (churn: building and disposing nodes, 3.7 times). The
   hand-written graph was also the most sensitive to V8 warm-up: it
   deoptimised its hot path repeatedly ("wrong map", "not a Smi"), and writes
   that landed in a deopt ran 10 to 50 times slower.
3. **Size doesn't decide it.** 1.5 to 2.1 kB gzipped across the four. The
   shipped surface is the largest, about 0.55 kB more than the hand-written
   graph: alien's core plus our API on top.
4. **Depth doesn't either.** How long a chain of computeds a first read
   survives depends on the JIT state when the stack runs out; the
   hand-written graph measured 1750 in one run and 4250 in another. The
   shipped surface and preact both reached 4500; alien's own API, with the
   leanest getters, 8000. Layout graphs are tens of levels deep.
5. **Maturity.** alien-signals' algorithm is the one Vue 3.6 and xstate
   ported; the hand-written graph would be ours to harden.

What the dependency costs: a pin on alien-signals' core API (`^3.2.1`; its
flags are mirrored as numbers in `signals.ts`, since they are a const enum in
its types) and a check of its changelog on each major.

What the surface adds over alien-signals' own API: `.value`/`peek()`,
`equals`, computed errors kept and rethrown until a source changes, effect
`schedule`, and an effect loop that throws instead of hanging. Kept from
alien-signals: an effect's own writes don't re-run it (as in Vue).

## Numbers

Measured 2026-11-07, Node 26.12 on the operator's laptop (Apple Silicon),
which was running other sessions' dev servers at the time. Medians swung by
up to 10 times from load, so the best times carry the comparison.

### Timing (`node bench/run.mjs`)

µs per write (per build-and-dispose for churn): **best** (median).

| case | vusyk | hand-written | alien-signals | preact |
|---|---|---|---|---|
| fan-out: 1 signal → 2000 computeds → 2000 effects | **320** (719) | 496 (2204) | 344 (759) | 342 (597) |
| deep chain: 1 signal → 1000 computeds in a row → 1 effect | **108** (152) | 163 (269) | 105 (154) | 130 (174) |
| layered grid: 20 signals, 100 layers × 20 computeds reading 2 each, 20 effects | **314** (3821) | 478 (1294) | 435 (2691) | 392 (600) |
| pruned: 2000 computeds that don't change, 2000 effects that must not run | **253** (551) | 332 (1134) | 265 (381) | 236 (402) |
| churn: build and dispose 1000 signal → computed → effect triples | **469** (1110) | 1723 (6203) | 286 (413) | 410 (1135) |

### Size and depth (`node bench/compare.mjs`)

The same four primitives (signal, computed, effect, batch) bundled and
minified; depth is the longest chain of computeds a first read survives.

| | minified | gzip | brotli | depth |
|---|---|---|---|---|
| vusyk | 5487 | 2092 | 1929 | 4500 |
| hand-written | 4274 | 1537 | 1400 | 4250 (1750 in an earlier run) |
| alien-signals | 4602 | 1735 | 1636 | 8000 |
| preact-signals-core | 4566 | 1676 | 1560 | 4500 |

### How it's measured

- `bench/cases.ts` holds the graphs; every library sits behind the same
  three-function adapter, and each case checks its effect counts once before
  timing.
- `bench/run.mjs` bundles the cases once per library and runs each bundle in
  its own Node process: 300 ms warm-up, then up to 1 s or 5000 samples per
  case, best and median per operation.
- A first version ran all libraries through one vitest bench file. That
  shares the graph-building closures between libraries, so each library ran
  on JIT feedback the others had left, and the hand-written graph looked up
  to 28 times slower on the grid than it was on its own (0.39 ms best per
  write alone, 21 ms in the shared harness). Separate bundles in separate
  processes remove that.
