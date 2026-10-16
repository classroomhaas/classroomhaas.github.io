import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });

  const PORT = 3000;

  // Multiplayer State
  const rooms = new Map();

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);

    socket.on("create-lobby", ({ playerName, tankType, skin, mapType, gameMode }) => {
      const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
      socket.join(roomId);
      
      const lobby = {
        id: roomId,
        hostId: socket.id,
        status: 'waiting',
        isPublic: false,
        settings: { mapType, gameMode },
        players: new Map([[socket.id, {
          id: socket.id,
          name: playerName,
          tankType,
          skin: skin || 'DEFAULT',
          team: 'RED',
          isReady: true
        }]])
      };
      
      rooms.set(roomId, lobby);
      socket.emit("lobby-created", { roomId, lobby: { ...lobby, players: Array.from(lobby.players.values()) } });
      console.log(`Lobby ${roomId} created by ${playerName}`);
    });

    socket.on("join-lobby", ({ roomId, playerName, tankType, skin }) => {
      if (!rooms.has(roomId)) {
        socket.emit("error", "Lobby not found");
        return;
      }
      
      const lobby = rooms.get(roomId);
      if (lobby.status !== 'waiting') {
        socket.emit("error", "Game already in progress");
        return;
      }

      socket.join(roomId);
      
      const players = Array.from(lobby.players.values());
      const redCount = players.filter((p: any) => p.team === 'RED').length;
      const blueCount = players.filter((p: any) => p.team === 'BLUE').length;
      const team = redCount <= blueCount ? 'RED' : 'BLUE';

      const newPlayer = {
        id: socket.id,
        name: playerName,
        tankType,
        skin: skin || 'DEFAULT',
        team,
        isReady: false
      };
      
      lobby.players.set(socket.id, newPlayer);
      socket.emit("lobby-joined", { roomId, lobby });
      io.to(roomId).emit("lobby-update", { ...lobby, players: Array.from(lobby.players.values()) });
      console.log(`Player ${playerName} joined lobby ${roomId}`);
    });

    socket.on("update-lobby-settings", ({ roomId, settings }) => {
      const lobby = rooms.get(roomId);
      if (lobby && lobby.hostId === socket.id) {
        if (settings.isPublic !== undefined) lobby.isPublic = settings.isPublic;
        if (settings.gameMode || settings.mapType) {
          lobby.settings = { ...lobby.settings, ...settings };
        }
        io.to(roomId).emit("lobby-update", { ...lobby, players: Array.from(lobby.players.values()) });
      }
    });

    socket.on("change-player-team", ({ roomId, playerId }) => {
      const lobby = rooms.get(roomId);
      if (lobby && lobby.hostId === socket.id) {
        const player = lobby.players.get(playerId);
        if (player) {
          player.team = player.team === 'RED' ? 'BLUE' : 'RED';
          io.to(roomId).emit("lobby-update", { ...lobby, players: Array.from(lobby.players.values()) });
        }
      }
    });

    socket.on("kick-player", ({ roomId, playerId }) => {
      const lobby = rooms.get(roomId);
      if (lobby && lobby.hostId === socket.id && playerId !== socket.id) {
        const kickedSocket = io.sockets.sockets.get(playerId);
        if (kickedSocket) {
          kickedSocket.leave(roomId);
          kickedSocket.emit("kicked");
        }
        lobby.players.delete(playerId);
        io.to(roomId).emit("lobby-update", { ...lobby, players: Array.from(lobby.players.values()) });
      }
    });

    socket.on("toggle-ready", ({ roomId }) => {
      const lobby = rooms.get(roomId);
      if (lobby && lobby.players.has(socket.id)) {
        const player = lobby.players.get(socket.id);
        player.isReady = !player.isReady;
        io.to(roomId).emit("lobby-update", { ...lobby, players: Array.from(lobby.players.values()) });
      }
    });

    socket.on("start-game", ({ roomId }) => {
      const lobby = rooms.get(roomId);
      if (lobby && lobby.hostId === socket.id) {
        const allReady = Array.from(lobby.players.values()).every((p: any) => p.isReady);
        if (allReady) {
          lobby.status = 'playing';
          const settings = lobby.settings;
          
          if (lobby.isPublic) {
            // Public matchmaking: move everyone to a shared public room
            const publicRoomId = `PUBLIC_${settings.gameMode}_${settings.mapType}`;
            io.to(roomId).emit("game-starting", { ...settings, roomId: publicRoomId });
          } else {
            // Private match: stay in the current room
            io.to(roomId).emit("game-starting", settings);
          }
        }
      }
    });

    socket.on("join-room", ({ roomId, playerName, tankType, skin, team: requestedTeam }) => {
      const actualRoomId = roomId || "PUBLIC_ARENA";
      socket.join(actualRoomId);
      
      if (!rooms.has(actualRoomId)) {
        rooms.set(actualRoomId, { players: new Map() });
      }
      
      const room = rooms.get(actualRoomId);
      
      // Team Balancing Logic
      let finalTeam = requestedTeam;
      if (requestedTeam) {
        const players = Array.from(room.players.values());
        const redCount = players.filter((p: any) => p.team === 'RED').length;
        const blueCount = players.filter((p: any) => p.team === 'BLUE').length;

        if (redCount === blueCount) {
          finalTeam = Math.random() > 0.5 ? 'RED' : 'BLUE';
        } else {
          finalTeam = redCount < blueCount ? 'RED' : 'BLUE';
        }
      }

      const newPlayer = {
        id: socket.id,
        name: playerName,
        tankType,
        skin: skin || 'DEFAULT',
        team: finalTeam,
        pos: { x: Math.random() * 2000 + 250, y: Math.random() * 2000 + 250 },
        turretAngle: 0,
        health: 100,
        score: 0,
        activePowerUps: {},
        dashEndTime: 0
      };
      room.players.set(socket.id, newPlayer);

      // Send the assigned team back to the player
      socket.emit('team-assigned', finalTeam);

      // Notify others and send current players to the new player
      io.to(actualRoomId).emit("player-joined", Array.from(room.players.values()));
      console.log(`Player ${playerName} joined room ${actualRoomId} on team ${finalTeam}`);
    });

    socket.on("update-player", ({ roomId, data }) => {
      const actualRoomId = roomId || "PUBLIC_ARENA";
      const room = rooms.get(actualRoomId);
      if (room && room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        Object.assign(player, data);
        socket.to(actualRoomId).emit("player-updated", player);
      }
    });

    socket.on("hit", ({ roomId, targetId, damage, shooterId }) => {
      const actualRoomId = roomId || "PUBLIC_ARENA";
      const room = rooms.get(actualRoomId);
      if (room && room.players.has(targetId)) {
        const target = room.players.get(targetId);
        if (target.health <= 0) return;
        
        target.health -= damage;
        
        if (target.health <= 0) {
          target.health = 0;
          if (room.players.has(shooterId)) {
            const shooter = room.players.get(shooterId);
            shooter.score += 10;
            io.to(actualRoomId).emit("player-updated", shooter);
          }
        }
        io.to(actualRoomId).emit("player-updated", target);
      }
    });

    socket.on("shoot", ({ roomId, bullet }) => {
      const actualRoomId = roomId || "PUBLIC_ARENA";
      socket.to(actualRoomId).emit("bullet-fired", { ...bullet, ownerId: socket.id });
    });
    
    socket.on("chat-message", ({ roomId, text, team }) => {
      const actualRoomId = roomId || "PUBLIC_ARENA";
      const room = rooms.get(actualRoomId);
      if (room && room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        const message = {
          id: Math.random().toString(36).substr(2, 9),
          senderId: socket.id,
          senderName: player.name,
          text: text.substring(0, 100), // Max 100 characters
          timestamp: Date.now(),
          team: team
        };
        
        if (team) {
          // Send only to team
          const teamPlayers = Array.from(room.players.values()).filter((p: any) => p.team === team);
          teamPlayers.forEach((p: any) => {
            io.to(p.id).emit("chat-message", message);
          });
        } else {
          // Send to everyone in room
          io.to(actualRoomId).emit("chat-message", message);
        }
      }
    });

    socket.on("disconnect", () => {
      rooms.forEach((room, roomId) => {
        if (room.players.has(socket.id)) {
          room.players.delete(socket.id);
          io.to(roomId).emit("player-left", socket.id);
        }
      });
      console.log("User disconnected:", socket.id);
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
