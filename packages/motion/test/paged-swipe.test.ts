import { describe, expect, it } from "vitest";
import { createFakeClock } from "../src/clock";
import {
  createPagedSwipe,
  NO_MODIFIERS,
  PAGED_SWIPE_DEFAULTS,
  PAGED_SWIPE_IDLE,
  pagedSwipeDeadline,
  pagedSwipeReducer,
  swipeProgress,
  type Modifiers,
  type PagedSwipeConfig,
  type PagedSwipeInput,
  type PagedSwipeState,
} from "../src/gestures";

describe("paged swipe", () => {
  const BOTH = { type: "context", hasPrev: true, hasNext: true, size: 1000 } as const;
  const wheel = (dx: number, dy: number, t: number, extra: { modifiers?: Partial<Modifiers>; canScrollFurther?: boolean } = {}): PagedSwipeInput => ({
    type: "wheel",
    dx,
    dy,
    t,
    modifiers: { ...NO_MODIFIERS, ...extra.modifiers },
    ...(extra.canScrollFurther ? { canScrollFurther: true } : {}),
  });
  const run = (events: readonly PagedSwipeInput[], config: PagedSwipeConfig = PAGED_SWIPE_DEFAULTS, from: PagedSwipeState = PAGED_SWIPE_IDLE): PagedSwipeState =>
    events.reduce((s, e) => pagedSwipeReducer(s, e, config), from);

  it("a wheel run arms, tracks past the threshold, commits on going idle past the commit share, then locks out its momentum", () => {
    const armed = run([BOTH, wheel(10, 1, 0)]);
    expect(armed.phase).toBe("armed");
    const tracking = run([wheel(20, 0, 16), wheel(400, 0, 32)], undefined, armed);
    expect(tracking).toMatchObject({ phase: "tracking", target: "next" });
    expect(tracking.progress).toBeCloseTo(0.43, 5);
    // Still within the idle time: tracking goes on.
    expect(run([{ type: "tick", t: 151 }], undefined, tracking).phase).toBe("tracking");
    const settling = run([{ type: "tick", t: 152 }], undefined, tracking);
    expect(settling).toMatchObject({ phase: "settling", outcome: "commit", target: "next" });
    const lockout = run([{ type: "settled" }], undefined, settling);
    expect(lockout).toMatchObject({ phase: "lockout", until: 152 + 350 });
    // Momentum during the lockout is swallowed; after it, the same run is still claimed and cannot arm.
    expect(run([wheel(30, 0, 300)], undefined, lockout).phase).toBe("lockout");
    const after = run([wheel(30, 0, 300), wheel(30, 0, 510)], undefined, lockout);
    expect(after).toMatchObject({ phase: "idle", claimed: true });
    expect(run([wheel(30, 0, 600)], undefined, after).phase).toBe("idle");
    // Once the wheel has rested idleMs, a new run arms.
    expect(run([wheel(30, 0, 700)], undefined, after).phase).toBe("tracking");
  });

  it("one large sample tracks at once; progress is travel over the page size", () => {
    const s = run([BOTH, wheel(-250, 0, 0)]);
    expect(s).toMatchObject({ phase: "tracking", target: "prev" });
    expect(s.progress).toBeCloseTo(-0.25, 5);
  });

  it("refuses to arm, claiming the run for scrolling, on each arming rule", () => {
    const refused = (s: PagedSwipeState): boolean => s.phase === "idle" && s.claimed;
    expect(refused(run([BOTH, wheel(10, 5, 0)]))).toBe(true); // not more than twice the cross movement
    expect(refused(run([BOTH, wheel(10, 0, 0, { modifiers: { ctrl: true } })]))).toBe(true); // a pinch
    expect(refused(run([BOTH, wheel(10, 0, 0, { canScrollFurther: true })]))).toBe(true); // something scrolls further
    expect(refused(run([{ ...BOTH, hasNext: false }, wheel(10, 0, 0)]))).toBe(true); // no page that way
    const meta: PagedSwipeConfig = { ...PAGED_SWIPE_DEFAULTS, modifier: "meta" };
    expect(refused(run([BOTH, wheel(10, 0, 0)], meta))).toBe(true); // the modifier isn't held
    expect(run([BOTH, wheel(10, 0, 0, { modifiers: { meta: true } })], meta).phase).toBe("armed");
    // Blocked (a drag owns the pointer): nothing arms.
    expect(run([BOTH, { type: "block", on: true }, wheel(30, 0, 0)]).phase).toBe("idle");
    // A claimed run stays claimed while the wheel keeps going, then a rest frees it.
    const claimed = run([BOTH, wheel(10, 8, 0), wheel(30, 0, 50), wheel(30, 0, 160)]);
    expect(refused(claimed)).toBe(true);
    expect(run([wheel(30, 0, 290)], undefined, claimed).phase).toBe("tracking");
  });

  it("an armed wheel run that drifts across the swipe as a whole gives up", () => {
    const s = run([BOTH, wheel(10, 4, 0), wheel(-9, 4, 16)]);
    expect(s).toMatchObject({ phase: "idle", claimed: true });
  });

  it("holds progress at 0 towards a side with no page, unless wrapping, and within −1 to 1", () => {
    const onlyNext = { hasPrev: false, hasNext: true, size: 1000, blocked: false };
    expect(swipeProgress(-300, 1000, onlyNext, false)).toBe(0);
    expect(swipeProgress(-300, 1000, onlyNext, true)).toBe(-0.3);
    expect(swipeProgress(3000, 1000, onlyNext, false)).toBe(1);
    expect(swipeProgress(-3000, 1000, { ...onlyNext, hasPrev: true }, false)).toBe(-1);
  });

  it("a fast swipe commits below the commit share; a slow short one snaps back", () => {
    const fast = run([BOTH, wheel(30, 0, 0), wheel(30, 0, 20), wheel(60, 0, 40), { type: "tick", t: 200 }]);
    expect(fast).toMatchObject({ phase: "settling", outcome: "commit", target: "next" });
    const slow = run([BOTH, wheel(10, 0, 0), wheel(10, 0, 100), wheel(10, 0, 200), wheel(10, 0, 300), { type: "tick", t: 500 }]);
    expect(slow).toMatchObject({ phase: "settling", outcome: "cancel", target: null });
  });

  it("the peak speed starts over when the travel crosses zero: a fast fling out and a slow pull back doesn't commit the way back", () => {
    const s = run([BOTH, wheel(30, 0, 0), wheel(60, 0, 20), wheel(-20, 0, 120), wheel(-20, 0, 220), wheel(-20, 0, 320), wheel(-40, 0, 420), { type: "tick", t: 600 }]);
    expect(s).toMatchObject({ phase: "settling", outcome: "cancel" });
  });

  it("a finger swipe: jitter waits, moving left tracks towards next, lifting commits; moving across gives the touch to the page", () => {
    const start = run([BOTH, { type: "touch-start", x: 500, y: 300, t: 0 }]);
    expect(start.phase).toBe("armed");
    expect(run([{ type: "touch-move", x: 490, y: 305, t: 16 }], undefined, start).phase).toBe("armed");
    const tracking = run([{ type: "touch-move", x: 100, y: 310, t: 200 }], undefined, start);
    expect(tracking).toMatchObject({ phase: "tracking", input: "touch", target: "next" });
    expect(tracking.progress).toBeCloseTo(0.4, 5);
    expect(run([{ type: "touch-end", t: 220 }], undefined, tracking)).toMatchObject({ phase: "settling", outcome: "commit", target: "next" });
    expect(run([{ type: "touch-move", x: 495, y: 200, t: 50 }], undefined, start)).toMatchObject({ phase: "idle", claimed: false });
    expect(run([{ type: "touch-end", t: 50 }], undefined, start).phase).toBe("idle");
  });

  it("gives way when blocked or cancelled mid-swipe: the pages go back", () => {
    const tracking = run([BOTH, wheel(100, 0, 0)]);
    expect(run([{ type: "block", on: true }], undefined, tracking)).toMatchObject({ phase: "settling", outcome: "cancel", target: null });
    expect(run([{ type: "cancel" }], undefined, tracking)).toMatchObject({ phase: "settling", outcome: "cancel" });
    expect(run([BOTH, wheel(10, 0, 0), { type: "block", on: true }]).phase).toBe("idle");
    expect(run([BOTH, wheel(10, 0, 0), { type: "cancel" }]).phase).toBe("idle");
    // A cancelled settle goes straight back to idle, no lockout.
    expect(run([{ type: "cancel" }, { type: "settled" }], undefined, tracking).phase).toBe("idle");
  });

  it("cancel while settling goes back to idle, so a host that never sends settled (gone mid-transition) can't leave it stuck", () => {
    const committing = run([BOTH, wheel(400, 0, 0), { type: "tick", t: 120 }]);
    expect(committing).toMatchObject({ phase: "settling", outcome: "commit" });
    const after = run([{ type: "cancel" }], undefined, committing);
    expect(after).toMatchObject({ phase: "idle", progress: 0, target: null });
    expect(after.context).toEqual(committing.context);
    // It swipes again at once.
    expect(run([wheel(400, 0, 400)], undefined, after).phase).toBe("tracking");
  });

  it("swipes on y when configured so", () => {
    const y: PagedSwipeConfig = { ...PAGED_SWIPE_DEFAULTS, along: "y" };
    expect(run([BOTH, wheel(0, 60, 0)], y)).toMatchObject({ phase: "tracking", target: "next" });
    expect(run([BOTH, wheel(60, 0, 0)], y)).toMatchObject({ phase: "idle", claimed: true });
  });

  it("asks for its idle and lockout ticks, and ends a wheel run on its own on a clock", () => {
    const armed = run([BOTH, wheel(10, 0, 40)]);
    expect(pagedSwipeDeadline(armed)?.at).toBe(160);
    expect(pagedSwipeDeadline(run([BOTH, { type: "touch-start", x: 0, y: 0, t: 0 }]))).toBeNull();
    const clock = createFakeClock();
    const swipe = createPagedSwipe({ clock });
    swipe.send(BOTH);
    swipe.send(wheel(400, 0, clock.now()));
    expect(swipe.state.phase).toBe("tracking");
    clock.tick(120);
    expect(swipe.state).toMatchObject({ phase: "settling", outcome: "commit" });
    swipe.send({ type: "settled" });
    expect(pagedSwipeDeadline(swipe.state)?.at).toBe(470);
    clock.tick(350);
    expect(swipe.state.phase).toBe("idle");
    expect(clock.pendingTimers).toBe(0);
  });
});
