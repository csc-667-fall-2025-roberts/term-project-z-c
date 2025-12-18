import express from "express";
import { CHAT_LISTING, CHAT_MESSAGE, GAME_CHAT_MESSAGE, GLOBAL_ROOM } from "../../shared/keys";
import { Chat } from "../db";

const router = express.Router();

router.get("/", async (request, response) => {
  const { id } = request.session;
  const messages = await Chat.list();

  const io = request.app.get("io");
  io.to(id).emit(CHAT_LISTING, { messages });
  response.status(202).send();
});

router.post("/", async (request, response) => {
  const { id } = request.session.user!;
  const { message } = request.body;

  const result = await Chat.create(id, message);

  const io = request.app.get("io");
  io.to(GLOBAL_ROOM).emit(CHAT_MESSAGE, result);
  response.status(202).send();
});

router.get("/:gameId/game", async (request, response) => {
  const gameId = Number(request.params.gameId);
  const messages = await Chat.listGame(gameId);

  response.status(200).json({ messages });
});

router.post("/:gameId/game", async (request, response) => {
  const { id } = request.session.user!;
  const gameId = Number(request.params.gameId);
  const { message } = request.body;

  const result = await Chat.createGame(id, message, gameId);

  const io = request.app.get("io");
  io.to(`game:${gameId}`).emit(GAME_CHAT_MESSAGE, result);
  response.status(202).send();
});

export default router;