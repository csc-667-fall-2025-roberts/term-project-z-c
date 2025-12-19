import { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { GLOBAL_ROOM } from "../../shared/keys";
import { sessionMiddleware } from "../config/session";
import { Games } from "../db";
import logger from "../lib/logger";
import { User } from "../../types/types";
import { initGameSocket } from "./game-socket";

export const initSockets = (httpServer: HTTPServer) => {
  const io = new Server(httpServer);

  io.engine.use(sessionMiddleware);

  io.on("connection", (socket) => {
    // @ts-ignore
    const session = socket.request.session as { id: string; user: User };
    logger.info(`socket for user session ${session.id} established`);

    socket.join(session.id);
    socket.join(GLOBAL_ROOM);

    const gameId = socket.handshake.query.gameId as string;
    if (gameId) {
      initGameSocket(socket, parseInt(gameId), session.user.id);
    }

    // ===== LOBBY CHAT =====
    socket.on("JOIN_LOBBY", () => {
      socket.join("LOBBY_CHAT");
      logger.info(`User ${session.user.id} joined lobby chat`);
    });

    socket.on("LEAVE_LOBBY", () => {
      socket.leave("LOBBY_CHAT");
      logger.info(`User ${session.user.id} left lobby chat`);
    });

    // ===== WAITING ROOM CHAT =====
    socket.on("JOIN_WAITING_ROOM", ({ gameId }: { gameId: number }) => {
      const roomName = `WAITING_ROOM_${gameId}`;
      socket.join(roomName);
      logger.info(`User ${session.user.id} joined waiting room ${gameId}`);
    });

    socket.on("LEAVE_WAITING_ROOM", ({ gameId }: { gameId: number }) => {
      const roomName = `WAITING_ROOM_${gameId}`;
      socket.leave(roomName);
      logger.info(`User ${session.user.id} left waiting room ${gameId}`);
    });

    // ===== GAME CHAT =====
    socket.on("JOIN_GAME_ROOM", ({ gameId }: { gameId: number }) => {
      const roomName = `GAME_${gameId}`;
      socket.join(roomName);
      logger.info(`User ${session.user.id} joined game room ${gameId}`);
    });

    socket.on("LEAVE_GAME_ROOM", ({ gameId }: { gameId: number }) => {
      const roomName = `GAME_${gameId}`;
      socket.leave(roomName);
      logger.info(`User ${session.user.id} left game room ${gameId}`);
    });

    socket.on("close", () => {
      logger.info(`socket for user ${session.user.username} closed`);
    });
  });

  return io;
};