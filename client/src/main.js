// client/src/main.js
// Minimal entry so Vite has something to build.
// Replace this with your real game bootstrap file.

import { initNetwork } from "./network.js";

// NOTE: When you create your noa Engine instance, call initNetwork(noa).
// For now, we simply expose the function so you can manually call it
// from the console while wiring up your game.
window.initNetwork = initNetwork;

const app = document.getElementById("app");
app.textContent =
  "Client bundle built. Wire up your noa game and call initNetwork(noa).";
