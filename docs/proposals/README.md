# Proposals

A proposal describes a library feature before it is built: what it is, how it behaves in every case we know of, where it breaks, and what was decided. Each proposal is one file, `NNNN-short-name.md`, numbered in the order it was written. Numbers are never reused.

## Status

| Status | Meaning |
|---|---|
| Draft | Being written or discussed. Nothing is built. |
| Accepted | Agreed. Building, or queued for a named release. |
| Shipped | Released. The file names the version. Accepted rules move into a decision record in [`../decisions/`](../decisions/). |
| Parked | Designed far enough to judge, then deliberately not built. The file says why and what would make it worth revisiting. |
| Withdrawn | Dropped for good. The file says why. |

A Parked proposal is the backlog: a feature someone may want later, with the reasoning kept so the same discussion doesn't start from zero.

## Index

| # | Proposal | Status | Since |
|---|---|---|---|
| 0001 | [Cluster drag](0001-cluster-drag.md) | Parked | 2026-11-19 |

## Writing one

Copy the sections of an existing proposal:
- Summary;
- Terms;
- Motivation;
- Behavior, with cases;
- Edge cases and flaws;
- Options considered;
- Contract impact;
- Decision and status;
- Revisit when;
- Links.

Keep it about the library: no application names, no product data, nothing that belongs to a private host.
