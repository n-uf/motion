# 0001: The hand rule

The landing stays at the hand: while a lane holds, the landing is the nearest landing in its lane to the pointer, and it lies within a bound that grows only where the lane's landings lie far apart.

## Context

A drag over a lane shows where a drop would land. Two checks each had their own number for how far that landing may lie from the pointer: the landing rows bounded it by 48 px (56 px on the single frame before a hop), and the libraries' reference said "within half the difference of its and its neighbor's lengths, plus the 6 px margin". The two disagreed over a docked item much longer than the held one, so the rows and a host's own checks could not both hold.

The geometry decides it. Placement cuts between two adjacent spots halfway between their landings, and a landing model changes spot 6 px (`spot`) past the cut. So the landing the model holds is never further from the pointer than half the gap between the two landings the pointer lies between, plus 6 px. Over a docked item much longer than the held one, no landing lies inside it: the nearest are flush before it and flush after it, so that gap is about the item's length less the held one's, plus a gutter, and the landing may trail the pointer by half of it.

Two ways to make that bound shorter were weighed:

- **Takeover spots.** A spot that lands the held item at a docked neighbor's place, the neighbor giving way, would put a landing inside the long item. It cannot help where the neighbor has nowhere to give way to: at the end of a bar a neighbor can't move off the bar, so no spot exists there and the gap stays.
- **A pointer deep over a much longer docked item holds no lane.** The held lane would be let go once the pointer is further than the bound from every landing, and the drag would fall to open space or the float. Rejected as a product change: it makes passing a long toolbar a visible interruption of the drag, where the landing trailing the hand by half a toolbar is not.

An earlier statement of the bound used the neighbor's length (`(neighbor - item) / 2 + 6`). A trace over real kit numbers showed it about a gutter short: the flush landings sit a gutter away from the neighbor, and an end zone can shift the neighbor, so the gap between the landings is not the neighbor's length less the item's. The rule is stated on the landings themselves.

## Decision

While a lane holds, the landing is the nearest landing in its lane to the pointer, and it lies within

`max(48, g / 2 + 6)` px of the pointer,

and within `max(56, g / 2 + 6)` px on the single frame before a hop (the next frame holds another spot of the same lane).

`g` is the gap along the lane between the facing edges of the two adjacent landings the pointer lies between. For a sliding spot its landing is taken at the end of its range that faces the next spot. Over a landing, or over free room inside a sliding range, `g` is 0: the bound is the floor, and over a sliding range the landing is at the hand (distance 0 up to the grab offset).

"Nearest" is measured along the lane, a sliding spot at the point of its range the hand holds. Landings that overlap one another (spots a pitch apart) are one place, cut at the grab; and a hop that reflows the window may wait for a slow `step` or for the landing to trail past `trail` (40 px), so a frame of a hand faster than `step` (0.375 px/ms) is not compared with the nearest.

The landing rows check exactly this: a row's `moving.hand` takes the spots from `lanes()` over its scene in the held spot's layout, and `handBound(g)` gives the bound.

## Consequences

- The rows that bounded the landing by a fixed 48 px (56 px before a hop) use the hand rule instead, and the libraries' reference and guide state it in one wording. The floor is the old number, so every row that passed still passes; only a lane with landings far apart (a long docked neighbor) gets a larger bound.
- A host that checks the landing can check the same rule on its own frames: `handBound` and the landing rows are exported from `@n-uf/placement/scene/cases`.
- A landing model that held a landing further than half the gap plus 6 px from the pointer, or one that held a landing past the nearest, would fail the rows.
- The cost: over a long docked item the landing trails the pointer by up to half the gap. The drag stays in its lane, and the landing hops once, 6 px past the cut.
- Guarded by `test/cases-landing-hand.test.ts` (a long neighbor where the fixed 48/56 bound fails and the hand rule passes, in both stretch modes; a landing past the bound; a landing that is not the nearest; the kit trace where the neighbor-length form falls 2.85 px short) and by the landing rows in `test/cases-landing.test.ts`.

## Date

2026-11-20, with the next release after 26.11.50 (the version is filled in when the release ships).
