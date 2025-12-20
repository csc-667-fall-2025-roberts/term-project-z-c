import { Server } from "socket.io";
import { Games } from "../db";
import { GameState } from "../../types/types";
import logger from "../lib/logger";

type TimerKey = string;
const disconnectTimers = new Map<TimerKey, NodeJS.Timeout>();
// disconnectManager.ts
const DISCONNECT_TIMEOUT = 5 * 60 * 1000; // 5 minutes
const TIMEOUT_MS = DISCONNECT_TIMEOUT;


function key(gameId: number, userId: number) {
  return `${gameId}:${userId}`;
}

/**
 * Start the disconnect timer for a player.
 * - Marks them disconnected in DB immediately.
 * - When timer expires, removes them and possibly ends game.
 * - io is optional, used to emit game-end / rejoin-expired events.
 */
export async function startDisconnectTimer(io: Server | null, gameId: number, userId: number, sessionId?: string) {
  const k = key(gameId, userId);

  // clear existing timer (defensive)
  if (disconnectTimers.has(k)) {
    clearTimeout(disconnectTimers.get(k)!);
    disconnectTimers.delete(k);
  }

  // mark disconnected in DB (soft leave)
  await Games.markPlayerDisconnected(gameId, userId);

  const t = setTimeout(async () => {
    disconnectTimers.delete(k);
    logger.info(`Rejoin timer expired for user ${userId} in game ${gameId}`);

    // hard remove player
    await Games.removePlayer(gameId, userId);

    // check remaining connected players
    const connected = await Games.getConnectedPlayers(gameId);
    if (connected.length === 0) {
      await Games.updateState(gameId, GameState.ENDED);
      logger.info(`Game ${gameId} ended (no connected players remaining)`);
      // notify rooms
      if (io) {
        io.to(`GAME_${gameId}`).emit("GAME_ENDED", { gameId, reason: "no_connected_players" });
        io.to(`WAITING_ROOM_${gameId}`).emit("GAME_ENDED", { gameId, reason: "no_connected_players" });
      }
    }

    // notify the user (if sessionId known) that rejoin window expired
    if (io && sessionId) {
      io.to(sessionId).emit("REJOIN_EXPIRED", { gameId });
    }
  }, TIMEOUT_MS);

  disconnectTimers.set(k, t);

  // optionally announce to waiting room that player disconnected & timer started
  if (io) {
    io.to(`WAITING_ROOM_${gameId}`).emit("PLAYER_DISCONNECTED", { userId, gameId, timeoutMs: TIMEOUT_MS });
  }
}

/**
 * Cancel the disconnect timer if player reconnects.
 * Also marks them connected (reconnectPlayer in DB).
 */
export async function cancelDisconnectTimer(io: Server | null, gameId: number, userId: number, sessionId?: string) {
  const k = key(gameId, userId);
  if (disconnectTimers.has(k)) {
    clearTimeout(disconnectTimers.get(k)!);
    disconnectTimers.delete(k);
    logger.info(`Cancelled rejoin timer for user ${userId} in game ${gameId}`);

    await Games.reconnectPlayer(gameId, userId);

    // notify waiting room / user that player rejoined
    if (io) {
      io.to(`WAITING_ROOM_${gameId}`).emit("PLAYER_RECONNECTED", { userId, gameId });
      if (sessionId) io.to(sessionId).emit("REJOIN_CANCELLED", { gameId });
    }
  } else {
    // no timer -> just ensure DB state is connected
    await Games.reconnectPlayer(gameId, userId);
  }
}

/**
 * Force-expire (useful for server shutdowns or admin actions).
 */
export function forceClearAllTimers() {
  for (const t of disconnectTimers.values()) clearTimeout(t);
  disconnectTimers.clear();
}