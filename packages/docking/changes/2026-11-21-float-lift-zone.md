- Fixed: **a float pressed inside an empty lane's band no longer takes that lane when the drag starts** (the landing
  model gives a lift with no `home`, which is a float's, the lift zone a docked item has; `@n-uf/motion`'s change of the
  same name). `dockDrag` has nothing new to pass: a float's drag has no home spot, and a host passes `home` only for a
  docked item.
