import { Socket } from "socket.io";
import * as Games from "../db/games";
import logger from "../lib/logger";
import {
  PLAYER_JOINED,
  GAME_STATE_UPDATE,
  GAME_CHAT_LISTING,
  GLOBAL_ROOM,
} from "../../shared/keys";

/**
 * Room helpers - match the naming used elsewhere (init.ts uses GAME_<id>, WAITING_ROOM_<id>)
 */
export function gameRoom(gameId: number): string {
  return `GAME_${gameId}`;
}

export function waitingRoom(gameId: number): string {
  return `WAITING_ROOM_${gameId}`;
}

export function lobbyRoom(): string {
  return GLOBAL_ROOM;
}

/**
 * original initGameSocket 
 */
export async function initGameSocket(socket: Socket, gameId: number, userId: number) {
  const players = await Games.getPlayers(gameId);
  if (!players.some(player => player.user_id === userId)) {
    logger.warn(`User ${userId} tried to join game ${gameId} without being a player`);
    socket.emit("error", { message: "Not a player in this game" });
    return;
  }

  // Join the canonical game room and set currentGameId so disconnect logic works
  socket.join(gameRoom(gameId));
  socket.data.currentGameId = gameId;
  logger.info(`User ${userId} joined game room ${gameId}`);
}

/**
 * handleJoinGame handler: validates, joins multiple rooms, emits initial state/chat listing,
 * and notifies other players in the room.
 */
export async function handleJoinGame(socket: Socket, gameId: number, userId: number) {
  try {
    // Validate user is a player
    const players = await Games.getPlayers(gameId);
    if (!players.some(p => p.user_id === userId)) {
      logger.warn(`User ${userId} tried to join game ${gameId} without being a player`);
      socket.emit("error", { message: "Not a player in this game" });
      return;
    }

    // Join rooms
    socket.join(gameRoom(gameId));
    socket.join(waitingRoom(gameId));
    socket.join(lobbyRoom());
    socket.data.currentGameId = gameId;

    logger.info(`User ${userId} joined rooms for game ${gameId}`);

    // await initGameSocket(socket, gameId, userId);

    // Emit initial game state to this socket if Games.getGameState exists
    try {
      if (typeof (Games as any).getGameState === "function") {
        const gameState = await (Games as any).getGameState(gameId);
        socket.emit(GAME_STATE_UPDATE, { gameId, gameState });
      }
    } catch (err) {
      logger.info(`Could not emit initial game state for ${gameId}: ${err}`);
    }

    // Emit chat listing if available
    try {
      if (typeof (Games as any).getChatListing === "function") {
        const chatListing = await (Games as any).getChatListing(gameId);
        socket.emit(GAME_CHAT_LISTING, { gameId, chatListing });
      }
    } catch (err) {
      logger.info(`Could not emit chat listing for ${gameId}: ${err}`);
    }

    // Notify other sockets in the game room
    socket.to(gameRoom(gameId)).emit(PLAYER_JOINED, { userId, gameId });
  } catch (err: any) {
    logger.error(`Error in handleJoinGame for game ${gameId} user ${userId}:`, err);
    socket.emit("error", { message: "Failed to join game" });
  }
}