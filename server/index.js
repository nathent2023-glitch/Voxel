// server/index.js
// Simple multiplayer relay server for noa-engine clients using Express + Socket.IO.
// This file is intentionally very commented to make the flow obvious.

const express = require("express");
const http = require("http");
const cors = require("cors");
const { Server } = require("socket.io");

// -----------------------------------------------------------------------------
// CONFIG
// -----------------------------------------------------------------------------
// Render provides PORT as an environment variable. Use it if present,
// otherwise default to 3000 for local development.
const PORT = process.env.PORT || 3000;

// IMPORTANT: Replace this with your real GitHub Pages URL once it is live.
// Example: "https://your-username.github.io/your-repo/"
// NOTE: GitHub Pages origin does NOT include a trailing slash in the browser,
// so your origin will look like: "https://your-username.github.io"
const GITHUB_PAGES_ORIGIN = "https://YOUR_GH_USER.github.io";

// -----------------------------------------------------------------------------
// APP + HTTP SERVER
// -----------------------------------------------------------------------------
const app = express();
const httpServer = http.createServer(app);

// -----------------------------------------------------------------------------
// CORS (for REST endpoints if you add any later)
// -----------------------------------------------------------------------------
app.use(
  cors({
    origin: GITHUB_PAGES_ORIGIN,
    methods: ["GET", "POST"],
  })
);

// Basic health check endpoint (useful on Render to verify it is running).
app.get("/", (req, res) => {
  res.json({ ok: true, status: "voxel-server-running" });
});

// -----------------------------------------------------------------------------
// SOCKET.IO SERVER
// -----------------------------------------------------------------------------
const io = new Server(httpServer, {
  // Socket.IO has its own CORS handling (separate from express).
  cors: {
    origin: GITHUB_PAGES_ORIGIN,
    methods: ["GET", "POST"],
  },
});

// A simple in-memory map of connected players.
// Key: socket.id, Value: last known position { x, y, z }.
const players = new Map();

io.on("connection", (socket) => {
  console.log(`[socket] connected: ${socket.id}`);

  // Store an initial position (optional; we just keep a placeholder).
  players.set(socket.id, { x: 0, y: 0, z: 0 });

  // Tell the newly connected client its own id.
  socket.emit("player:id", { id: socket.id });

  // Tell the newly connected client about everyone already connected.
  // This lets the client spawn "ghosts" for existing players.
  for (const [id, pos] of players.entries()) {
    if (id === socket.id) continue;
    socket.emit("player:move", { id, x: pos.x, y: pos.y, z: pos.z });
  }

  // When this client moves, broadcast its position to everyone else.
  socket.on("player:move", (data) => {
    // Validate payload quickly to avoid crashing on bad data.
    if (
      !data ||
      typeof data.x !== "number" ||
      typeof data.y !== "number" ||
      typeof data.z !== "number"
    ) {
      return;
    }

    // Save the latest position for this socket.
    players.set(socket.id, { x: data.x, y: data.y, z: data.z });

    // Broadcast to everyone EXCEPT the sender.
    socket.broadcast.emit("player:move", {
      id: socket.id,
      x: data.x,
      y: data.y,
      z: data.z,
    });
  });

  socket.on("disconnect", () => {
    console.log(`[socket] disconnected: ${socket.id}`);

    // Remove from server memory and tell others to despawn the ghost.
    players.delete(socket.id);
    socket.broadcast.emit("player:disconnect", { id: socket.id });
  });
});

// -----------------------------------------------------------------------------
// START
// -----------------------------------------------------------------------------
httpServer.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
