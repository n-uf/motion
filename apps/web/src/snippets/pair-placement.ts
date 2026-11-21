import { positionPopup, BELOW_LEFT } from "@n-uf/placement/popup";
import { masterStack } from "@n-uf/placement/tiling";

const bounds = { x: 0, y: 0, width: 320, height: 240 };

// A menu goes under its button, 6 px apart. Here the button sits near the
// bottom, so below does not fit: the rule flips it above.
const button = { x: 40, y: 200, width: 80, height: 28 };
const menu = positionPopup(button, { width: 160, height: 120 }, bounds, BELOW_LEFT);
console.log(menu.rect, menu.flipped.y); // { x: 40, y: 74, width: 160, height: 120 } true

// Panes that divide an area with no overlap: the first is the master.
const tiles = masterStack(["editor", "terminal", "logs"], bounds, { gap: 8 });
console.log(tiles.get("logs")); // { x: 164, y: 124, width: 156, height: 116 }
