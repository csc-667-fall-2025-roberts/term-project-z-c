import { ChatMessage } from "../../../types/types";
import db from "../connection";
import {
  CREATE_LOBBY_MESSAGE,
  CREATE_GAME_MESSAGE,
  RECENT_LOBBY_MESSAGES,
  RECENT_GAME_MESSAGES,
} from "./sql";

const list = async (limit: number = 50) => {
  return await db.manyOrNone<ChatMessage>(RECENT_LOBBY_MESSAGES, [limit]);
};

const create = async (user_id: number, message: string) => {
  return await db.one<ChatMessage>(CREATE_LOBBY_MESSAGE, [user_id, message]);
};

const listGame = async (game_id: number) => {
  return await db.manyOrNone<ChatMessage>(RECENT_GAME_MESSAGES, [game_id]);
};

const createGame = async (user_id: number, message: string, game_id: number) => {
  return await db.one<ChatMessage>(CREATE_GAME_MESSAGE, [user_id, message, game_id]);
};

export { create, list, createGame, listGame };