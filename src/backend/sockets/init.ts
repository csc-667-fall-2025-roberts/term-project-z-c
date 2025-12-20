import { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { GLOBAL_ROOM } from "../../shared/keys";
import { sessionMiddleware } from "../config/session";
import { startDisconnectTimer, cancelDisconnectTimer } from "../lib/disconnectManager"; 
import { Games } from "../db";
import logger from "../lib/logger";
import { User, GameState } from "../../types/types";
import { initGameSocket, handleJoinGame } from "./game-socket";
import db from "../db/connection";

const hostTimeouts = new Map<number, NodeJS.Timeout>();

export const initSockets = (httpServer: HTTPServer) => {
  const io = new Server(httpServer);

  io.engine.use(sessionMiddleware);

  io.on("connection", (socket) => {
    // @ts-ignore
    const session = socket.request.session as { id: string; user: User };
    logger.info(`socket for user session ${session.id} established`);

    if (!session || !session.user) {
      logger.warn("Unauthorized socket connection attempt; disconnecting");
      socket.disconnect(true);
      return;
    }
    socket.join(session.id);
    socket.join(GLOBAL_ROOM);

    socket.data.userId = session.user.id;
    socket.data.currentGameId = null;

    const handshakeGameId = socket.handshake.query.gameId as string;
    if (handshakeGameId) {
      initGameSocket(socket, parseInt(handshakeGameId), session.user.id);
    }

    // client-driven join that validates and sends initial state
    socket.on("JOIN_GAME", async ({ gameId }: { gameId: number | string }) => {
      try {
        const id = typeof gameId === "string" ? parseInt(gameId, 10) : gameId;
        if (Number.isNaN(id)) {
          logger.warn(`Invalid JOIN_GAME gameId from user ${session.user.id}: ${gameId}`);
          return;
        }

        // Call shared handler that validates player, joins rooms, and emits initial state
        await handleJoinGame(socket, id, session.user.id);

        // Ensure disconnect logic can see the current game
        socket.data.currentGameId = id;

        // Cancel any pending disconnect timer for this player/game
        await cancelDisconnectTimer(io, id, session.user.id, session.id);
      } catch (err) {
        logger.error("Error handling JOIN_GAME:", err);
        socket.emit("error", { message: "Failed to join game" });
      }
    });

    socket.on("JOIN_LOBBY", () => {
      socket.join("LOBBY_CHAT");
      logger.info(`User ${session.user.id} joined lobby chat`);
    });

    socket.on("LEAVE_LOBBY", () => {
      socket.leave("LOBBY_CHAT");
      logger.info(`User ${session.user.id} left lobby chat`);
    });

    socket.on("JOIN_WAITING_ROOM", async ({ gameId }: { gameId: number }) => {
      const game = await Games.getById(gameId);
      if (!game || game.state === GameState.ENDED) {
        logger.info(`User ${session.user.id} tried to join ended/missing waiting room ${gameId}`);
        return;
      }

      const roomName = `WAITING_ROOM_${gameId}`;
      socket.join(roomName);
      socket.data.currentGameId = gameId;

      await db.none(
        `UPDATE "gameParticipants"
         SET disconnected = FALSE
         WHERE game_id = $1 AND user_id = $2`,
        [gameId, session.user.id]
      );

      logger.info(`User ${session.user.id} joined waiting room ${gameId}`);
      io.to(roomName).emit("PLAYER_JOINED", { userId: session.user.id, gameId });

      try {
        if (game.host_id === session.user.id) {
          const existingTimeout = hostTimeouts.get(gameId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            hostTimeouts.delete(gameId);
            logger.info(
              `Cleared host timeout for game ${gameId} (host rejoined in waiting room)`
            );
          }
        }
      } catch (err) {
        logger.error(
          `Error clearing host timeout in waiting room for game ${gameId}:`,
          err
        );
      }
    });

    socket.on("LEAVE_WAITING_ROOM", ({ gameId }: { gameId: number }) => {
      const roomName = `WAITING_ROOM_${gameId}`;
      socket.leave(roomName);
      logger.info(`User ${session.user.id} left waiting room ${gameId}`);
    });

    socket.on("JOIN_GAME_ROOM", async ({ gameId }: { gameId: number }) => {
      const game = await Games.getById(gameId);
      if (!game || game.state === GameState.ENDED) {
        logger.info(`User ${session.user.id} tried to join ended/missing game room ${gameId}`);
        return;
      }

      const roomName = `GAME_${gameId}`;
      socket.join(roomName);
      socket.data.currentGameId = gameId;

      await db.none(
        `UPDATE "gameParticipants"
         SET disconnected = FALSE
         WHERE game_id = $1 AND user_id = $2`,
        [gameId, session.user.id]
      );

      logger.info(`User ${session.user.id} joined game room ${gameId}`);
      io.to(roomName).emit("PLAYER_JOINED", { userId: session.user.id, gameId });

      try {
        if (game.host_id === session.user.id) {
          const existingTimeout = hostTimeouts.get(gameId);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
            hostTimeouts.delete(gameId);
            logger.info(
              `Cleared host timeout for game ${gameId} (host rejoined in game room)`
            );
          }
        }
      } catch (err) {
        logger.error(
          `Error clearing host timeout in game room for game ${gameId}:`,
          err
        );
      }
    });

    socket.on("LEAVE_GAME_ROOM", ({ gameId }: { gameId: number }) => {
      const roomName = `GAME_${gameId}`;
      socket.leave(roomName);
      logger.info(`User ${session.user.id} left game room ${gameId}`);
    });

    socket.on("disconnect", async () => {
      const userId = socket.data.userId as number | undefined;
      const gameId = socket.data.currentGameId as number | null;

      logger.info(`socket for user ${session.user.username} disconnected`);
      logger.info(`DISCONNECT DATA: userId=${userId}, gameId=${gameId}`);

      if (!userId || !gameId) {
        if (!userId) {
          logger.warn(`Missing userId or gameId on disconnect. userId=${userId}, gameId=${gameId}`);
        }
        return;
      }

      try {
        // Start the disconnect timer (soft leave with 2-minute rejoin window)
        await startDisconnectTimer(io, gameId, userId, session.id);
      } catch (err) {
        logger.error(
          `Error starting disconnect timer for user ${userId} in game ${gameId}:`,
          err
        );
      }

      try {
        const game = await Games.getById(gameId);
        if (!game) return;

        if (game.state === GameState.ENDED) {
          return;
        }

        if (game.host_id !== userId) {
          return;
        }

        // Schedule auto-end game if still in LOBBY state
        if (game.state !== GameState.LOBBY) {
          logger.info(
            `Host ${userId} disconnected from game ${gameId} (state=${game.state}); no auto-end scheduled`
          );
          return;
        }

        // Clear any existing timeout first to avoid duplicates
        const existingTimeout = hostTimeouts.get(gameId);
        if (existingTimeout) {
          clearTimeout(existingTimeout);
          hostTimeouts.delete(gameId);
        }

        const timeoutId = setTimeout(async () => {
          try {
            const latest = await Games.getById(gameId);
            if (!latest || latest.state === GameState.ENDED) {
              hostTimeouts.delete(gameId);
              return;
            }

            // Safety re-check: only auto-end if still in LOBBY
            if (latest.state !== GameState.LOBBY) {
              logger.info(
                `Skipped auto-ending game ${gameId}: state changed to ${latest.state}`
              );
              hostTimeouts.delete(gameId);
              return;
            }

            await Games.updateState(gameId, GameState.ENDED);
            logger.warn(
              `Game ${gameId} (lobby) ended automatically after host ${userId} was gone for 2 minutes`
            );

            io.to(`GAME_${gameId}`).emit("GAME_ENDED", {
              gameId,
              reason: "host_timeout",
            });
            io.to(`WAITING_ROOM_${gameId}`).emit("GAME_ENDED", {
              gameId,
              reason: "host_timeout",
            });
          } catch (err) {
            logger.error(
              `Error auto-ending game ${gameId} after host timeout:`,
              err
            );
          } finally {
            hostTimeouts.delete(gameId);
          }
        }, 2 * 60 * 1000);

        hostTimeouts.set(gameId, timeoutId);
        logger.warn(
          `Host ${userId} disconnected from game ${gameId} (state=lobby); will auto-end in 2 minutes if not back`
        );
      } catch (err) {
        logger.error(
          `Error handling host disconnect timeout for game ${gameId}:`,
          err
        );
      }
    });

    socket.on("close", () => {
      logger.info(`socket for user ${session.user.username} closed`);
    });
  });

  return io;
};