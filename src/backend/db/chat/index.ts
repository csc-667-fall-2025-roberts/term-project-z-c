import { ChatMessage } from "../../../types/types";
import db from "../connection";
import {
  CREATE_LOBBY_MESSAGE,
  CREATE_GAME_MESSAGE,
  CREATE_WAITING_ROOM_MESSAGE,
  RECENT_LOBBY_MESSAGES,
  RECENT_GAME_MESSAGES,
  RECENT_WAITING_ROOM_MESSAGES,
} from "./sql";

// GLOBAL/LEGACY (used by /chat/)
const list = async (limit: number = 50) => {
  return db.manyOrNone<ChatMessage>(RECENT_LOBBY_MESSAGES, [limit]);
};

const create = async (user_id: number, message: string) => {
  return db.one<ChatMessage>(CREATE_LOBBY_MESSAGE, [user_id, message]);
};

// LOBBY
const listLobby = async (limit: number = 50) => {
  return db.manyOrNone<ChatMessage>(RECENT_LOBBY_MESSAGES, [limit]);
};

const createLobby = async (user_id: number, message: string) => {
  return db.one<ChatMessage>(CREATE_LOBBY_MESSAGE, [user_id, message]);
};

// WAITING ROOM / READY-UP
const listWaitingRoom = async (game_id: number) => {
  return db.manyOrNone<ChatMessage>(RECENT_WAITING_ROOM_MESSAGES, [game_id]);
};

const createWaitingRoom = async (user_id: number, message: string, game_id: number) => {
  return db.one<ChatMessage>(CREATE_WAITING_ROOM_MESSAGE, [user_id, message, game_id]);
};

// GAME
const listGame = async (game_id: number) => {
  return db.manyOrNone<ChatMessage>(RECENT_GAME_MESSAGES, [game_id]);
};

const createGame = async (user_id: number, message: string, game_id: number) => {
  return db.one<ChatMessage>(CREATE_GAME_MESSAGE, [user_id, message, game_id]);
};

export {
  create,
  list,
  listLobby,
  createLobby,
  listWaitingRoom,
  createWaitingRoom,
  createGame,
  listGame,
};