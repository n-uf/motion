- Fixed: **a float pressed inside an empty lane's band no longer takes that lane when the drag starts.** A lift is a
  float's when it has no `home` option and no lane has a spot marked home (new optional `LandingSpot.home`; docking marks a
  docked item's, so a docked item lifted without `home` stays docked). A float lift now has the lift zone a docked item has, `margins.lift` (16 px)
  around the press: within it no lane takes the pointer, and the frame is judged as if the regions had no lanes, so a nudge
  moves the float, a float over a blocked or refused place is refused as on any frame, and no lane's path counts. The zone is
  left once, past `lift` from the press, and never re-entered, so sliding back through the press point while a lane is held
  changes nothing. After the zone the lanes act by their gates as before.