import express from "express";
import {
  CHAT_LISTING,
  CHAT_MESSAGE,
  LOBBY_CHAT_MESSAGE,
  WAITING_ROOM_CHAT_MESSAGE,
  GAME_CHAT_MESSAGE,
  GLOBAL_ROOM,
} from "../../shared/keys";
import { Chat } from "../db";

const router = express.Router();

// ===== GLOBAL / LEGACY CHAT (used by src/frontend/chat.ts) =====
router.get("/", async (request, response) => {
  const { id } = request.session;
  const messages = await Chat.list();

  const io = request.app.get("io");
  io.to(id).emit(CHAT_LISTING, { messages });
  response.sendStatus(202);
});

router.post("/", async (request, response) => {
  console.log("HIT POST /chat, body =", request.body);
  const { id } = request.session.user!;
  const { message } = request.body;

  if (typeof message !== "string" || !message.trim()) {
    console.log("POST /chat rejected: invalid message", request.body);
    return response.status(400).send("Message is required");
  }

  const result = await Chat.create(id, message.trim());

  const io = request.app.get("io");
  io.to(GLOBAL_ROOM).emit(CHAT_MESSAGE, result);
  response.sendStatus(202);
});

// ===== LOBBY CHAT (for lobby page, via HTTP) =====
router.get("/lobby", async (request, response) => {
  const messages = await Chat.listLobby();
  response.status(200).json({ messages });
});

router.post("/lobby", async (request, response) => {
  console.log("HIT POST /chat/lobby, body =", request.body);
  const { id } = request.session.user!;
  const { message } = request.body;

  if (typeof message !== "string" || !message.trim()) {
    console.log("POST /chat/lobby rejected: invalid message", request.body);
    return response.status(400).send("Message is required");
  }

  const result = await Chat.createLobby(id, message.trim());

  const io = request.app.get("io");
  io.to("LOBBY_CHAT").emit(LOBBY_CHAT_MESSAGE, result);
  response.sendStatus(202);
});

// ===== WAITING ROOM / READY-UP CHAT =====
router.get("/:gameId/waiting", async (request, response) => {
  const gameId = Number(request.params.gameId);
  const messages = await Chat.listWaitingRoom(gameId);

  response.status(200).json({ messages });
});

router.post("/:gameId/waiting", async (request, response) => {
  console.log(`HIT POST /chat/${request.params.gameId}/waiting, body =`, request.body);
  const { id } = request.session.user!;
  const gameId = Number(request.params.gameId);
  const { message } = request.body;

  if (typeof message !== "string" || !message.trim()) {
    console.log("POST /chat/:gameId/waiting rejected: invalid message", request.body);
    return response.status(400).send("Message is required");
  }

  const result = await Chat.createWaitingRoom(id, message.trim(), gameId);

  const io = request.app.get("io");
  io.to(`WAITING_ROOM_${gameId}`).emit(WAITING_ROOM_CHAT_MESSAGE, result);
  response.sendStatus(202);
});

// ===== GAME CHAT =====
router.get("/:gameId/game", async (request, response) => {
  const gameId = Number(request.params.gameId);
  const messages = await Chat.listGame(gameId);

  response.status(200).json({ messages });
});

router.post("/:gameId/game", async (request, response) => {
  console.log(`HIT POST /chat/${request.params.gameId}/game, body =`, request.body);
  const { id } = request.session.user!;
  const gameId = Number(request.params.gameId);
  const { message } = request.body;

  if (typeof message !== "string" || !message.trim()) {
    console.log("POST /chat/:gameId/game rejected: invalid message", request.body);
    return response.status(400).send("Message is required");
  }

  const result = await Chat.createGame(id, message.trim(), gameId);

  const io = request.app.get("io");
  io.to(`GAME_${gameId}`).emit(GAME_CHAT_MESSAGE, result);
  response.sendStatus(202);
});

export default router;