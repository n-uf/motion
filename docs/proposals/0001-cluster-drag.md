# 0001 · Cluster drag

**Status:** Parked (2026-11-19). **Package:** `@n-uf/docking`, with the held-preview drawing in hosts. **Depends on:** the stretch model with room consumption, and stretch positions (planned for 26.11.49).

## Summary

Toolbar groups docked flush against each other in one toolbar area could be dragged together, as one cluster, instead of one group at a time. A setting would choose between the two. We designed it, worked through its cases, and parked it. Lifting one group out of a cluster had no clean gesture. Every fix added a hidden rule or a new handle, and single-group moves are the everyday case.

## Terms

| Term | Meaning |
|---|---|
| toolbar group | One toolbar: a set of related controls led by one grip (glossary term). |
| cluster | Toolbar groups docked flush against each other in one toolbar area: no free room between neighbors (`space` 0), or floats touching edge to edge. Derived from the layout, never stored. A lone group is a cluster of one. |
| toolbar area | A bar or a side rail (glossary term). |

## Motivation

A user who builds a tidy set of toolbars side by side may want to move the whole set at once: to the other end of a rail, to another bar, or out to float.

## Behavior, as designed

- **Setting:** `dragUnit: "cluster" | "group"`. "cluster" means any grip in a cluster lifts the whole cluster; "group" means a grip moves only its own group (today's behavior). The default was to be "cluster", to be confirmed by a lab try.
- **Held unit:** on the lift, the members become one composite held item: their forms laid end to end with the area's gap, accepted only where every member is accepted. Spots, guides, the distance bound, the empty-lane and partly-fits rules, the form morph and the landing model all run unchanged on it. On release it expands back in order, flush.
- **No fit:** a lane that can't take every member offers no spot: no mark and no "Can't go here".
- **Floating:** it floats as touching floats in order, so it stays a cluster by layout.

### Cases

| # | Situation | Result |
|---|---|---|
| K1 | Press any member's grip, move along the lane | The whole cluster moves, at the hand: within `max(48, g / 2 + 6)` px of the pointer (`max(56, g / 2 + 6)` on the frame before a hop; `g` is the gap between the two landings the pointer lies between) |
| K2 | A held cluster passes another toolbar group in the lane | One order step: the passed group jumps over the whole cluster (cluster length plus gap). The cluster never splits during a drag |
| K3 | Move along, then nudge back a little, short of the start | The cluster settles where it is drawn. Within the lift zone of the press point it lands home |
| K4 | A held group (or cluster) stops at a cluster's edge | The guide is a box (with a striped end if room partly fits). The drop consumes the room, and the whole cluster shifts by `max(0, length + gap − room)` |
| K5 | A held group goes past a cluster's first member | The guide is a line between two members. It slips in and joins the cluster; only the members after it shift |
| K6 | The cluster doesn't fit a lane | No spot, no mark, no refusal |
| K7 | Shift during a cluster drag | Floats the cluster, as touching floats |

## Edge cases and flaws

1. **Lifting one group out of a cluster (the blocking flaw).** With "cluster" as the default, pressing a member's grip lifts everything. The options considered for taking one group:
   - **(a) Direction decides** (first movement: across the lane at least twice the movement along takes one group, otherwise the cluster). Flaw: you can't move a single group *along* the rail out of its cluster. You have to pull it out and dock it again, which is two moves for an everyday action.
   - **(b) Hold decides** (a long press, about 500 ms, switches between cluster and group). Flaw: slower, and invisible until learned.
   - **(c) Grip decides** (each member's grip takes one group; a separate cluster handle, or a hover outline, takes the cluster). Flaw: needs a new visual and costs space on a narrow rail; hosts must adopt it.
   - **(d) Setting only** (`dragUnit`). Flaw: you get one behavior or the other, never both.
2. **Should passing a toolbar split the cluster, while nudging back keeps it?** Rejected as too subtle. A held cluster stays one item until release (K2, K3).
3. **Cluster membership with free positions:** "under one pitch" stops meaning anything once a 20 px gap is a deliberate place. Hence the `space` 0 definition.

## Contract impact (if revived)

- `dragUnit` in the preview plan.
- `DockRegions.held = { items: [{ id, offset }] }` (docking's regions): the host's preview must draw every held member at its offset. A host drawing only the pressed group would show half a cluster.
- Hosts commit as for any spot.

## Decision and status

Parked on 2026-11-19 by the product owner, after the four options were weighed: "That's probably the best option." A grip moves only its own toolbar group. Nothing of this proposal is built, and 26.11.49 ships without it.

## Revisit when

- Users regularly move several toolbar groups one after another to the same place, and find it tedious.
- A gesture appears that takes one group or the whole cluster without a hidden rule or a new handle.
- Hosts add a cluster handle visual for another reason, which would make option (c) cheap.

## Links

- Glossary: toolbar group, toolbar area, grip.
- The stretch model and room consumption (26.11.49), which K4 relies on.
- Stretch positions (26.11.49), which the cluster definition relies on.
