import type { Game, GamePlayer } from "../../../types/types";
import { GameState } from "../../../types/types";
import db from "../connection";
import {
  CREATE_GAME,
  GAME_BY_ID,
  GET_GAME_BY_ID,        
  GAMES_BY_USER,
  JOIN_GAME,
  LIST_GAMES,
  GET_PLAYERS,
  SET_PLAYER_POSITION,
  START_GAME,
  UPDATE_GAME,
  UPDATE_GAME_STATE,     
  LEAVE_GAME,
  GET_PLAYER_COUNT,
  CHECK_PLAYER_IN_GAME,
  GET_PLAYER_IN_GAME,    
  RECONNECT_PLAYER,      
  TOGGLE_PLAYER_READY,
  GET_CURRENT_TURN_PLAYER,
  MARK_PLAYER_DISCONNECTED,
  GET_CONNECTED_PLAYERS,
} from "./sql";

const create = async (
  user_id: number,
  name: string | undefined,
  capacity: number = 4,
  is_private: boolean = false,
  password_hash: string | null = null
) =>
  await db.one<Game>(CREATE_GAME, [
    user_id,
    name,
    capacity,
    is_private,
    password_hash,
  ]);

const join = async (game_id: number, user_id: number) =>
  await db.none(JOIN_GAME, [game_id, user_id]);

// List games by state
const list = async (state: GameState = GameState.LOBBY, limit: number = 50) =>
  await db.manyOrNone<Game>(LIST_GAMES, [state, limit]);

// Get games by user
const getByUser = async (user_id: number) =>
  await db.manyOrNone<Game>(GAMES_BY_USER, [user_id]);

// Get game by ID
const get = async (game_id: number) =>
  await db.one<Game>(GAME_BY_ID, [game_id]);

// Get players in a game
const getPlayers = async (game_id: number) =>
  await db.manyOrNone<GamePlayer>(GET_PLAYERS, [game_id]);

// Set player position
const setPlayerPosition = async (game_id: number, player_order: number, user_id: number) =>
  await db.none(SET_PLAYER_POSITION, [game_id, player_order, user_id]);

// Start game
const startGame = async (game_id: number) =>
  await db.none(START_GAME, [game_id]);

// Update game
const updateGame = async (game_id: number, state?: GameState, winner_id?: number, is_ready?: boolean) =>
  await db.one<Game>(UPDATE_GAME, [game_id, state, winner_id, is_ready]);

// Leave game
const leaveGame = async (game_id: number, user_id: number) =>
  await db.none(LEAVE_GAME, [game_id, user_id]);

// Get player count
const getPlayerCount = async (game_id: number) => {
  const result = await db.one<{ count: number }>(GET_PLAYER_COUNT, [game_id]);
  return result.count;
};

const checkPlayerInGame = async (game_id: number, user_id: number) => {
  const result = await db.one<{ is_player: boolean }>(CHECK_PLAYER_IN_GAME, [game_id, user_id]);
  return result.is_player;
};

const togglePlayerReady = async (game_id: number, user_id: number) => {
  const result = await db.one<{ is_ready: boolean }>(TOGGLE_PLAYER_READY, [game_id, user_id]);
  return result.is_ready;
};

const getCurrentPlayer = async (game_id: number) => {
  const result = await db.one<{ user_id: number; player_order: number }>(GET_CURRENT_TURN_PLAYER, [game_id]);
  return result;
};

// UPDATED: Complete cascade delete
const deleteGame = async (game_id: number) => {
  await db.tx(async (t) => {
    // Delete chat messages for this game
    await t.none(`DELETE FROM "chat" WHERE game_id = $1`, [game_id]);
    
    // Delete all cards for this game
    await t.none(`DELETE FROM "cards" WHERE game_id = $1`, [game_id]);
    
    // Delete game participants
    await t.none(`DELETE FROM "gameParticipants" WHERE game_id = $1`, [game_id]);
    
    // Delete the game itself
    await t.none(`DELETE FROM games WHERE id = $1`, [game_id]);
  });
};

const getById = async (game_id: number) => {
  try {
    return await db.one<Game>(GAME_BY_ID, [game_id]);
  } catch (error) {
    return null;
  }
};

const updateState = async (game_id: number, state: GameState) =>
  await db.none(UPDATE_GAME_STATE, [game_id, state]);

const getPlayerInGame = async (game_id: number, user_id: number) => {
  const result = await db.oneOrNone<{ user_id: number }>(
    GET_PLAYER_IN_GAME,
    [game_id, user_id]
  );
  return result !== null;
};

const reconnectPlayer = async (game_id: number, user_id: number) =>
  await db.none(RECONNECT_PLAYER, [game_id, user_id]);

// Remove a player from a game (used when they leave/cancel)
const removePlayer = async (game_id: number, user_id: number) =>
  await db.none(
    `DELETE FROM "gameParticipants" 
     WHERE game_id = $1 AND user_id = $2`,
    [game_id, user_id]
  );

// Update the host of a game (used when current host leaves)
const updateHost = async (game_id: number, newHostId: number) =>
  await db.none(
    `UPDATE games 
     SET host_id = $1 
     WHERE id = $2`,
    [newHostId, game_id]
  );

  // Mark player as disconnected in a game
const markPlayerDisconnected = async (game_id: number, user_id: number) =>
  await db.none(MARK_PLAYER_DISCONNECTED, [game_id, user_id]);

// Get only connected players
const getConnectedPlayers = async (game_id: number) =>
  await db.manyOrNone<GamePlayer>(GET_CONNECTED_PLAYERS, [game_id]);

export {
  create,
  get,
  getById,
  getByUser,
  join,
  list,
  getPlayers,
  setPlayerPosition,
  startGame,
  updateGame,
  updateState,
  leaveGame,
  getPlayerCount,
  checkPlayerInGame,
  getPlayerInGame,
  reconnectPlayer,
  togglePlayerReady,
  getCurrentPlayer,
  deleteGame,
  removePlayer,
  updateHost,
  markPlayerDisconnected,
  getConnectedPlayers,
};