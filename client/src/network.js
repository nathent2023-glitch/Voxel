// client/src/network.js
// Multiplayer networking helper for noa-engine.
// This file is intentionally very verbose and commented so you can trace
// exactly how "ghost" players are created, updated, and removed.

import { io } from "socket.io-client";
import { CreateBox } from "@babylonjs/core/Meshes/Builders/boxBuilder";
import { Color3 } from "@babylonjs/core/Maths/math.color";

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
// Placeholder Render URL - replace this AFTER your Render server is live.
// Example: "https://your-server-name.onrender.com"
const SERVER_URL = "https://YOUR_RENDER_SERVICE.onrender.com";

// How often (in ms) we send our position to the server.
// 50ms = 20 updates per second.
const SEND_INTERVAL_MS = 50;

// -----------------------------------------------------------------------------
// GHOST STORAGE
// -----------------------------------------------------------------------------
// We keep a map of "ghosts" keyed by the remote socket id.
// Each entry contains:
// - mesh: the Babylon mesh that visually represents the remote player
// - lastPos: last position we set on that mesh (for optional smoothing)
const ghosts = new Map();

// -----------------------------------------------------------------------------
// PUBLIC API
// -----------------------------------------------------------------------------
// Call this once after you create your `noa` instance.
// It returns the socket instance so you can debug or listen to other events.
export function initNetwork(noa) {
  // Create a Socket.IO client and connect to the Render server.
  const socket = io(SERVER_URL, {
    transports: ["websocket"], // prefer websockets (lower latency)
  });

  // We store our own id once the server tells us.
  let myId = null;

  // ---------------------------------------------------------------------------
  // SOCKET EVENTS (SERVER -> CLIENT)
  // ---------------------------------------------------------------------------
  socket.on("player:id", (payload) => {
    // The server assigns us a unique socket id.
    myId = payload.id;
  });

  socket.on("player:move", (payload) => {
    // A remote player moved. We need to render/update their ghost.
    // payload = { id, x, y, z }
    if (!payload || payload.id == null) return;

    // Don't render a ghost for ourselves.
    if (payload.id === myId) return;

    // Create the ghost the first time we hear about this id.
    if (!ghosts.has(payload.id)) {
      const mesh = createGhostMesh(noa, payload.id);
      ghosts.set(payload.id, {
        mesh,
        lastPos: { x: payload.x, y: payload.y, z: payload.z },
      });
    }

    // Update the ghost's position every time we get movement data.
    const ghost = ghosts.get(payload.id);
    moveGhostMesh(noa, ghost.mesh, payload.x, payload.y, payload.z);
    ghost.lastPos = { x: payload.x, y: payload.y, z: payload.z };
  });

  socket.on("player:disconnect", (payload) => {
    // A remote player left. Remove their ghost mesh.
    if (!payload || payload.id == null) return;
    removeGhostMesh(payload.id);
  });

  // ---------------------------------------------------------------------------
  // CLIENT -> SERVER POSITION UPDATES
  // ---------------------------------------------------------------------------
  // Every 50ms, read our local player position and send it to the server.
  // This keeps all other clients updated with our latest location.
  setInterval(() => {
    if (!noa || !noa.playerEntity) return;

    // noa.ents.getPosition returns the GLOBAL position [x, y, z].
    const pos = noa.ents.getPosition(noa.playerEntity);
    if (!pos) return;

    socket.emit("player:move", {
      x: pos[0],
      y: pos[1],
      z: pos[2],
    });
  }, SEND_INTERVAL_MS);

  return socket;
}

// -----------------------------------------------------------------------------
// GHOST MESH HELPERS
// -----------------------------------------------------------------------------

function createGhostMesh(noa, id) {
  // Create a simple box mesh to represent the remote player.
  // We add it directly to the Babylon scene managed by noa.
  const scene = noa.rendering.getScene();
  const mesh = CreateBox(`ghost-${id}`, {}, scene);

  // Match the player's physical size (roughly).
  // These values should line up with your player width/height.
  mesh.scaling.x = 0.6;
  mesh.scaling.z = 0.6;
  mesh.scaling.y = 1.8;

  // Use noa's standard material helper so the mesh fits the world lighting.
  const mat = noa.rendering.makeStandardMaterial(`ghost-mat-${id}`);
  mat.diffuseColor = new Color3(0.2, 0.9, 0.9); // bright cyan
  mat.alpha = 0.6; // transparent so ghosts look "spectral"
  mesh.material = mat;

  // IMPORTANT: tell noa about the mesh so it is included in its render system.
  // `false` means "dynamic mesh" (moves often).
  noa.rendering.addMeshToScene(mesh, false);

  return mesh;
}

function moveGhostMesh(noa, mesh, x, y, z) {
  // noa uses an internal local coordinate system when the world "rebases".
  // To keep meshes stable, convert global -> local before setting the mesh position.
  const local = noa.globalToLocal([x, y, z], null, []);

  // We want the box's feet on the ground, so raise by half the height.
  // (Because the box is centered on its origin.)
  const halfHeight = 1.8 / 2;

  // Set the mesh position in local space.
  mesh.position.x = local[0];
  mesh.position.y = local[1] + halfHeight;
  mesh.position.z = local[2];
}

function removeGhostMesh(id) {
  const ghost = ghosts.get(id);
  if (!ghost) return;

  // Dispose the mesh to free GPU resources.
  ghost.mesh.dispose();
  ghosts.delete(id);
}
