import express from "express";
import { Server } from "socket.io";
import { Games } from "../db";
import logger from "../lib/logger";
import { broadcastPlayerReady } from "../sockets/pre-game-sockets";
import { GameState } from "../../types/types";

const router = express.Router();

router.get("/:id", async (req, res, next) => {
  try {
    const { id } = req.params;
    const gameId = parseInt(id, 10);

    // validate gameId
    if (Number.isNaN(gameId)) {
      logger.warn(`Invalid game id in readyup route: ${id}`);
      return res.status(400).render("errors/400", { url: req.originalUrl });
    }

    const sessionUser = req.session?.user;
    if (!sessionUser) {
      logger.warn("No session user found for readyup route");
      return res.redirect("/login");
    }
    const { id: userId, username } = sessionUser;

    // Use getById which should return null when not found (avoid QueryResultError)
    const game = await Games.getById(gameId);
    logger.info("Readyup data:", game);

    if (!game) {
      return res.status(404).render("errors/404", { url: req.originalUrl });
    }

    if (game.state === GameState.ENDED) {
      logger.info(`User ${userId} tried to access ended game ${gameId}, redirecting to lobby`);
      return res.redirect("/lobby");
    }

    const isPlayerInGame = await Games.checkPlayerInGame(gameId, userId);
    if (!isPlayerInGame) {
      await Games.join(gameId, userId);
      logger.info(`User ${userId} automatically joined game ${gameId}`);

      const io = req.app.get("io") as Server;
      const { broadcastJoin } = await import("../sockets/pre-game-sockets");
      broadcastJoin(io, gameId, userId, username);
    }

    res.render("readyup/readyup", { ...game });
  } catch (err: any) {
    // If the underlying DB method throws a QueryResultError for "no data",
    // treat it as not found and redirect/render accordingly.
    if (err?.name === "QueryResultError") {
      logger.warn(`QueryResultError while loading readyup ${req.params.id}: ${err.message}`);
      return res.redirect("/lobby");
    }
    next(err);
  }
});

router.post("/:game_id/toggle", async (req, res) => {
  try {
    const gameId = parseInt(req.params.game_id, 10);
    if (Number.isNaN(gameId)) {
      return res.status(400).json({ error: "Invalid game id" });
    }

    const sessionUser = req.session?.user;
    if (!sessionUser) {
      return res.status(401).json({ error: "Not authenticated" });
    }
    const { id: userId } = sessionUser;

    const isReady = await Games.togglePlayerReady(gameId, userId);

    const io = req.app.get("io") as Server;
    broadcastPlayerReady(io, gameId, userId, isReady);

    res.status(200).json({ isReady });
  } catch (error: any) {
    logger.error("Error toggling ready status:", error);
    res.status(500).json({ error: error.message });
  }
});

router.get("/:game_id/players", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    if (Number.isNaN(gameId)) {
      return response.status(400).json({ error: "Invalid game id" });
    }

    // Ensure the game exists (avoid QueryResultError from Games.get)
    const game = await Games.getById(gameId);
    if (!game) {
      return response.status(404).json({ error: "Game not found" });
    }

    const players = await Games.getPlayers(gameId);

    const sessionUser = request.session?.user;
    if (!sessionUser) {
      return response.status(401).json({ error: "Not authenticated" });
    }
    const { id: userId } = sessionUser;

    const isPlayerInGame = await Games.checkPlayerInGame(gameId, userId);
    if (!isPlayerInGame) {
      return response.status(403).json({ error: "User is not in game" });
    }

    response.json({ players, currentUserId: userId, capacity: game.capacity });
  } catch (error: any) {
    // Convert QueryResultError -> 404/lobby-friendly response
    if (error?.name === "QueryResultError") {
      logger.warn(`QueryResultError while getting readyup players for ${request.params.game_id}: ${error.message}`);
      return response.status(404).json({ error: "Game not found" });
    }

    logger.error("could not get readyup players:", error);
    response.status(500).json({ error: error.message });
  }
});

export default router;