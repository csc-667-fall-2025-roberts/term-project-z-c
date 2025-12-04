import type { Game } from "../../../types/types";
import { GameState } from "../../../types/types";

import db from "../connection";
import { CREATE_GAME, GAME_BY_ID, GAMES_BY_USER, JOIN_GAME, LIST_GAMES } from "./sql";

/**
 * Create a new game and automatically add the host as a participant
 */
const create = async (user_id: number, name?: string, maxPlayers: number = 4) => {
  // 1️⃣ Create the game in the games table
  const game = await db.one<Game>(CREATE_GAME, [user_id, name, maxPlayers]);

  // 2️⃣ Add the host as the first participant
  await db.none(JOIN_GAME, [game.id, user_id]);

  return game;
};

/**
 * Join an existing game
 */
const join = async (game_id: number, user_id: number) =>
  await db.none(JOIN_GAME, [game_id, user_id]);

/**
 * List games for the lobby with player count and details
 */
const list = async (state: GameState = GameState.LOBBY, limit: number = 50) =>
  await db.manyOrNone<Game>(LIST_GAMES, [state, limit]);

/**
 * Get all games a user has joined
 */
const getByUser = async (user_id: number) => await db.manyOrNone<Game>(GAMES_BY_USER, [user_id]);

/**
 * Get a game by ID
 */
const get = async (game_id: number) => await db.one<Game>(GAME_BY_ID, [game_id]);

export { create, get, getByUser, join, list };
