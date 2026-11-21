# 0002: A held frame's marks follow the edge as drawn

*Decision [0003](0003-one-layout-per-state.md) replaced `lanes(…, { spot })`, which the Context below describes as it was: a held frame's marks now come from `dockDrag(...).after(state)`, and this rule holds for them.*

A lane's marks follow its edge as drawn in the layout they are drawn in. Only its hit rect stays as seen.

## Context

While a spot is held, `@n-uf/docking`'s `lanes(…, { spot })` draws every lane's marks in that spot's own layout: the layout the drop commits. A lane's marks are first clipped to its rect over that layout (`laneRectOver`, `packages/docking/src/lanes.ts`), so a mark never lies where the lane takes no pointer.

For a lane empty as seen, that clip was read from the layout as seen: at a corner the band stopped at the side of every edge drawn across it as seen. The clip was added when other lanes' marks were not yet drawn in the held layout: a held box on an empty top bar ran over the ends of the side rails as they were seen, and stopping it at the rails kept the two from overlapping.

Every lane's marks are now drawn in the held layout. There the clip as seen only leaves a hole. Take both side rails holding a toolbar and a toolbar dragged into the empty top bar: the held layout, like the committed one, cuts the full-width bars before the sides (`solve`), so the bar runs the whole width and the rails start below it. The held bar's box still stopped at the rails as seen (x 30 to 1050 on a 1080 px window), and the rails' marks start below the bar, so the two corner squares were drawn by no lane while held. On release, and in the next drag, the bar's guide ran the full width (x 0 to 1080). The held frame and the commit disagreed by the two corners.

Two ways were weighed:

- **Keep the clip as seen and draw the corners from the rails.** The rails as committed start below the bar; drawing them up into it would show a corner owned by the bar as the rails'. Rejected: marks would re-decide a corner `solve` has already given.
- **Clip in the layout the marks are drawn in.** Where the edge is drawn there, its marks lie inside the edge as drawn; where it is not, the band stops at the edges drawn across it there. Taken.

## Decision

A lane's rect over a layout `over`:

- where the lane's edge is drawn in `over`, it is that edge's rect in `over`, unclipped;
- otherwise (an empty edge in `over`) the band its drops are drawn at, clipped at the drawn edges across it in `over`, not in the layout as seen;
- a virtual lane is unchanged.

The hit rect is this rect over the layout as seen (`over` is the layout as seen), so the lane the pointer is in is unchanged. Corners between edges drawn in a layout go to whichever edge `solve` gives them; marks never re-decide a corner.

This replaces the marks half of the earlier rule "the corner clip is read from the layout as seen for the hit rect and the marks alike". Its hit rect half stays.

The rule stated so a test can pin it:

- For every lane and each of its spots, along the lane's axis the hull of the lane's marks while that spot is held and the spot's landing is the lane's edge rect in the spot's committed layout (`target.after(…)`), within the edge's padding and 1 px.
- On every frame, as seen and held, a corner where two drawn lanes' edges meet is covered by the marks of the edge that owns it in that frame's layout, and by no other lane's.

## Consequences

- Visibly: with both side rails holding a toolbar, the box of a toolbar held in the empty top bar runs the window's full width, the corners included, as it does once dropped. The corners are drawn once, by the bar.
- An empty lane's guide before entry (the Near lane's, drawn in the layout that creates it) is worked out the same way, so it takes the corners its after-entry layout gives it.
- The hit rect is unchanged: as seen, a pointer on a drawn rail's end is still in the rail's lane, not the empty bar's.
- Guarded by `packages/docking/test/lanes-held-commit.test.ts` (the hull property and the corner owner over the lab windows, the windows of two hosts and the corner fixtures, rails holding items and empty, under the landing model's "near" and "all"; the 1080 px window with both rails holding a toolbar), the hull and corner clauses of `packages/docking/test/one-layout-sweep.test.ts`, and `packages/docking/test/lanes-marks-inside.test.ts`.

## Date

2026-11-20, not yet released: it ships with the one-layout change ([0003](0003-one-layout-per-state.md): a held frame draws, while its room is open, the layout its release commits, `dockDrag(...).after(state)`, which replaces `lanes(…, { spot })`), in the release after 26.11.54. The release is named here when it ships.
