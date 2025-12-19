import express from "express";
import { Server } from "socket.io";
import bcrypt from "bcryptjs";
import { GAME_CREATE, GAME_LISTING } from "../../shared/keys";
import { Games, Cards } from "../db";
import logger from "../lib/logger";
import { StartGame, getCurrentTurn, endGame } from "../services/gameService";
import { playACard, drawCards, endTurn } from "../services/moveService";
import { GameState } from "../../types/types";
import { startDisconnectTimer } from "../lib/disconnectManager";

import {
  broadcastJoin,
  broadcastGameStart,
  broadcastGameStateUpdate,
} from "../sockets/pre-game-sockets";
import {
  broadcastTurnChange,
  broadcastCardPlay,
  broadcastDraw,
  broadcastHandUpdate,
  broadcastGameEnd,
  broadcastSkip,
  broadcastReverse,
  broadcastColorChosen,
} from "../sockets/gameplay-socket";

const router = express.Router();

router.get("/", async (request, response) => {
  const sessionId = request.session.id;
  const userId = request.session.user!.id;

  response.status(202).send();

  const allGames = await Games.list();
  const userGames = await Games.getByUser(userId);

  const userGameIds = new Set(userGames.map((g) => g.id));
  const myGames = allGames.filter((g) => userGameIds.has(g.id));
  const availableGames = allGames.filter((g) => !userGameIds.has(g.id));

  const io = request.app.get("io") as Server;

  io.to(sessionId).emit(GAME_LISTING, { myGames, availableGames });
});

router.post("/", async (request, response) => {
  try {
    const { id } = request.session.user!;
    const { name, max_players, is_private, password } = request.body;

    const maxPlayers = max_players ? parseInt(max_players, 10) : 4;
    const isPrivate = is_private === "on" || is_private === "true";

    let passwordHash: string | null = null;
    if (isPrivate) {
      if (!password || !password.trim()) {
        return response
          .status(400)
          .send("Password is required for private games");
      }
      passwordHash = await bcrypt.hash(password.trim(), 10);
    }

    logger.info(
      `Create game request ${name}, ${maxPlayers}, private=${isPrivate} by ${id}`
    );

    const game = await Games.create(id, name, maxPlayers, isPrivate, passwordHash);
    logger.info(`Game created: ${game.id}`);

    const io = request.app.get("io") as Server;
    io.emit(GAME_CREATE, { ...game });

    response.redirect(`/readyup/${game.id}`);
  } catch (error: any) {
    logger.error("Error creating game:", error);
    response.redirect("/lobby");
  }
});

// Join or redirect based on game state
router.get("/:id/join-or-redirect", async (request, response) => {
  const gameId = parseInt(request.params.id, 10);
  if (Number.isNaN(gameId)) return response.redirect("/lobby");

  const userId = request.session.user!.id;

  try {
    const game = await Games.getById(gameId);

    if (!game) {
      logger.warn(`Game ${gameId} not found, redirecting to lobby`);
      return response.redirect("/lobby");
    }

    // Check if user is a participant
    const participant = await Games.getPlayerInGame(gameId, userId);

    if (!participant) {
      logger.warn(`User ${userId} is not part of game ${gameId}`);
      return response.status(403).send("You are not part of this game.");
    }

    // If game ended, go to lobby 
    if (game.state === GameState.ENDED) {
      logger.info(`Game ${gameId} ended, redirecting user ${userId} to lobby`);
      return response.redirect("/lobby");
    }

    // If game started, go to game room
    if (game.state === GameState.IN_PROGRESS) {
      logger.info(`User ${userId} rejoining in-progress game ${gameId}`);
      return response.redirect(`/games/${gameId}`);
    }

    // Otherwise (WAITING or LOBBY), go to ready-up
    logger.info(`User ${userId} joining waiting room for game ${gameId}`);
    return response.redirect(`/readyup/${gameId}`);
  } catch (error: any) {
    logger.error("Error in join-or-redirect:", error);
    return response.status(500).send("Failed to join game");
  }
});

// --- IMPORTANT: more specific route must come BEFORE the generic "/:id" route ---
// Waiting page route (renders waiting.ejs)
router.get("/waiting/:game_id", async (req, res) => {
  const gameId = parseInt(req.params.game_id, 10);
  if (Number.isNaN(gameId)) {
    return res.redirect("/lobby");
  }
  res.render("games/waiting", { gameId });
});

// Game page (generic by id). Keep this AFTER the waiting route.
router.get("/:id", async (request, response) => {
  const gameId = parseInt(request.params.id, 10);
  if (Number.isNaN(gameId)) {
    logger.warn("Invalid game id in URL");
    return response.redirect("/lobby");
  }

  const user = request.session.user!;

  const game = await Games.get(gameId);
  if (!game || game.state === GameState.ENDED) {
    logger.info(`User ${user.id} tried to access ended/missing game ${gameId}, redirecting to lobby`);
    return response.redirect("/lobby");
  }
  const card_data = await Cards.getHand(gameId, user.id);
  const myCards = card_data.map((c) => ({
    id: c.id,
    color: c.color,
    value: c.value,
  }));

  response.render("games/game", {
    ...game,
    currentUserid: user.id,
    currentUserName: user.username,
    myCards,
  });
});

router.post("/:game_id/join", async (request, response) => {
  try {
    const { id, username } = request.session.user!;
    const { game_id } = request.params;
    const gameId = parseInt(game_id, 10);

    if (Number.isNaN(gameId)) return response.status(400).json({ error: "Invalid game id" });

    logger.info(`User ${id} attempting to join game ${gameId}`);

    const game = await Games.get(gameId);

    if (!game) {
      logger.warn(`Game ${gameId} not found, redirecting to lobby`);
      return response.status(404).json({ error: "Game not found" });
    }

    logger.info(`Game ${gameId} state: ${game.state}, is_private: ${game.is_private}, host: ${game.host_id}`);

    if (game.state === GameState.ENDED) {
      logger.info(`User ${id} tried to join ended game ${gameId}, redirecting to lobby`);
      return response.status(400).json({ error: "Game already ended" });
    }

    const existing = await Games.getPlayerInGame(gameId, id);

    if (existing) {
      await Games.reconnectPlayer(gameId, id);
      logger.info(`User ${id} reconnected to game ${gameId}`);
    } else {
      if (game.is_private) {
        const { password } = request.body;

        logger.info(`Private game join attempt by user ${id}, password provided: ${!!password}`);

        if (!password || !password.trim()) {
          return response
            .status(400)
            .json({ error: "Password is required to join this game" });
        }

        const ok = await bcrypt.compare(password.trim(), game.password_hash || "");
        if (!ok) {
          logger.warn(`User ${id} provided incorrect password for game ${gameId}`);
          return response.status(401).json({ error: "Incorrect password" });
        }
      }

      await Games.join(gameId, id);
      logger.info(`User ${id} joined game ${gameId}`);
    }

    const io = request.app.get("io") as Server;
    broadcastJoin(io, gameId, id, username);

    return response.status(200).json({ ok: true, gameId });
  } catch (error: any) {
    logger.error("Error joining game:", error);
    return response.status(500).json({ error: "Failed to join game" });
  }
});

router.post("/:game_id/leave", async (request, response) => {
  try {
    const { id } = request.session.user!;
    const { game_id } = request.params;
    const gameId = parseInt(game_id, 10);

    if (Number.isNaN(gameId)) {
      return response.redirect("/lobby");
    }

    const game = await Games.getById(gameId);
    if (!game) {
      return response.redirect("/lobby");
    }
    
    const io = request.app.get("io") as Server;
    const sessionId = request.session.id;

    // Start timer to allow rejoin within 2 minutes (soft-leave).
    // startDisconnectTimer will mark the player disconnected in DB and schedule hard removal if they don't return.
    await startDisconnectTimer(io, gameId, id, sessionId);
    logger.info(`User ${id} disconnected from game ${gameId}, started disconnect timer`);

    // Notify waiting room that the player left (preserves previous behavior)
    io.to(`WAITING_ROOM_${gameId}`).emit("PLAYER_LEFT", { userId: id, gameId });

    // After soft-leave, evaluate host/ending logic using connected players only
    const remainingConnected = await Games.getConnectedPlayers(gameId);

    if (remainingConnected.length === 0) {
      await Games.updateState(gameId, GameState.ENDED);
      logger.info(`Game ${gameId} ended (no connected players remaining)`);
      io.to(`GAME_${gameId}`).emit("GAME_ENDED", { gameId, reason: "no_connected_players" });
      io.to(`WAITING_ROOM_${gameId}`).emit("GAME_ENDED", { gameId, reason: "no_connected_players" });
    } else if (game.host_id === id) {
      const newHost = remainingConnected[0];
      await Games.updateHost(gameId, newHost.user_id);
      io.to(`WAITING_ROOM_${gameId}`).emit("HOST_CHANGED", { 
        gameId, 
        newHostId: newHost.user_id 
      });
      logger.info(`Game ${gameId} host changed to user ${newHost.user_id}`);
    }

    // Redirect user to waiting page so they see the rejoin screen
    response.redirect(`/games/waiting/${gameId}`);
  } catch (error: any) {
    logger.error("Error leaving game:", error);
    response.redirect("/lobby");
  }
});

// Cancel lobby (host only, before game starts)
router.post("/:game_id/cancel", async (request, response) => {
  try {
    const { id: userId } = request.session.user!;
    const { game_id } = request.params;
    const gameId = parseInt(game_id, 10);

    if (Number.isNaN(gameId)) return response.status(400).send("Invalid game id");

    const game = await Games.getById(gameId);

    if (!game) {
      logger.warn(`Game ${gameId} not found for cancel`);
      return response.status(404).send("Game not found");
    }

    if (game.host_id !== userId) {
      logger.warn(`User ${userId} tried to cancel game ${gameId} but is not host`);
      return response.status(403).send("Only the host can cancel this lobby");
    }

    // Only allow cancel if game hasn't started
    if (game.state !== GameState.LOBBY) {
      logger.warn(`User ${userId} tried to cancel game ${gameId} but it's already started or ended`);
      return response.status(400).send("Cannot cancel a game that has already started");
    }

    const io = request.app.get("io") as Server;
    
    // Notify all players in waiting room BEFORE deleting the game
    io.to(`WAITING_ROOM_${gameId}`).emit("LOBBY_CANCELLED", { gameId });
    
    // Notify lobby that this game is gone
    io.to("LOBBY").emit("GAME_REMOVED", { gameId });

    // Delete the game and all related data
    await Games.deleteGame(gameId);
    logger.info(`Game ${gameId} cancelled and deleted by host ${userId}`);

    return response.sendStatus(200);
  } catch (error: any) {
    logger.error("Error cancelling lobby:", error);
    return response.status(500).send("Failed to cancel lobby");
  }
});

router.post("/:game_id/start", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    const result = await StartGame(gameId);

    const io = request.app.get("io") as Server;
    const topCard = await Cards.getTopCard(gameId);

    broadcastGameStateUpdate(io, gameId, GameState.IN_PROGRESS);
    broadcastGameStart(io, gameId, result.firstPlayerId, {
      id: topCard!.id,
      color: topCard!.color,
      value: topCard!.value,
    });

    const turnInfo = await getCurrentTurn(gameId);
    broadcastTurnChange(
      io,
      gameId,
      turnInfo.currentPlayerId,
      turnInfo.direction,
      turnInfo.playerOrder
    );

    response.redirect(`/games/${gameId}`);
  } catch (error: any) {
    logger.error("Error starting game:", error);
    response.redirect(`/games/${request.params.game_id}`);
  }
});

router.get("/:game_id/turn", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    const turnInfo = await getCurrentTurn(gameId);
    response.status(200).json(turnInfo);
  } catch (error: any) {
    logger.error("Error getting current Turns:", error);
    response.status(500).json({ error: error.message });
  }
});

router.post("/:game_id/end", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    const user = request.session.user!;

    const game = await Games.getById(gameId);
    if (!game) {
      return response.status(404).send("Game not found");
    }

    if (game.host_id !== user.id) {
      return response.status(403).send("Only the host can end the game");
    }

    await Games.updateState(gameId, GameState.ENDED);

    const io = request.app.get("io") as Server;
    io.to(`GAME_${gameId}`).emit("GAME_ENDED", { gameId, reason: "host_ended" });
    io.to(`WAITING_ROOM_${gameId}`).emit("GAME_ENDED", { gameId, reason: "host_ended" });

    broadcastGameStateUpdate(io, gameId, GameState.ENDED);

    logger.info(`Game ${gameId} ended by host ${user.id}`);

    response.redirect("/lobby");
  } catch (error: any) {
    logger.error("Error ending game:", error);
    response.status(500).send("Failed to end game");
  }
});

router.post("/:game_id/finish", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    const { winnerId } = request.body;

    await endGame(gameId, winnerId);

    const io = request.app.get("io") as Server;
    const players = await Games.getPlayers(gameId);
    const winner = players.find((p) => p.user_id === winnerId);

    broadcastGameEnd(io, gameId, winnerId, winner?.username || "Unknown");
    broadcastGameStateUpdate(io, gameId, GameState.ENDED);

    response.status(200).json({ message: "Game ended successfully" });
  } catch (error: any) {
    logger.error("Error ending game:", error);
    response.status(500).json({ error: error.message });
  }
});

router.post("/:game_id/play", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    const { id: userId, username } = request.session.user!;
    const { cardId, chosenColor } = request.body;

    const playerHand = await Cards.getHand(gameId, userId);
    const card = playerHand.find((c) => c.id === cardId);

    const result = await playACard(gameId, userId, cardId, chosenColor);

    if (!result.success) {
      return response.status(400).json({ error: result.message });
    }

    const io = request.app.get("io") as Server;

    broadcastCardPlay(io, gameId, userId, username, {
      id: card!.id,
      color: chosenColor || card!.color,
      value: card!.value,
    });

    const turnInfo = await getCurrentTurn(gameId);

    if (card!.value === "skip") {
      const players = await Games.getPlayers(gameId);
      const skipped = players.find((p) => p.user_id === turnInfo.currentPlayerId);
      broadcastSkip(
        io,
        gameId,
        turnInfo.currentPlayerId,
        skipped?.username || "Unknown"
      );
    }
    if (card!.value === "reverse") {
      broadcastReverse(io, gameId, turnInfo.direction);
    }
    if (
      (card!.value === "wild" || card!.value === "wild_draw_four") &&
      chosenColor
    ) {
      broadcastColorChosen(io, gameId, userId, username, chosenColor);
    }

    const handCounts = await Cards.getHandCount(gameId);
    broadcastHandUpdate(io, gameId, handCounts);

    if (result.winner) {
      broadcastGameEnd(io, gameId, result.winner, username);
      broadcastGameStateUpdate(io, gameId, GameState.ENDED);
      return response.status(200).json({
        message: result.message,
        winner: result.winner,
      });
    }

    broadcastTurnChange(
      io,
      gameId,
      turnInfo.currentPlayerId,
      turnInfo.direction,
      turnInfo.playerOrder
    );

    response.status(200).json({ message: "Card played successfully" });
  } catch (error: any) {
    logger.error("Error playing card:", error);
    response.status(500).json({ error: error.message });
  }
});

router.post("/:game_id/draw", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    const { id: userId, username } = request.session.user!;
    const { count } = request.body;

    const result = await drawCards(gameId, userId, count || 1);

    const io = request.app.get("io") as Server;
    broadcastDraw(io, gameId, userId, username, count || 1);

    const handCounts = await Cards.getHandCount(gameId);
    broadcastHandUpdate(io, gameId, handCounts);

    response.status(200).json({
      message: "Cards were drawn successfully",
      cardIds: result.cardIds,
    });
  } catch (error: any) {
    logger.error("Error drawing your cards:", error);
    response.status(500).json({ error: error.message });
  }
});

router.post("/:game_id/end-turn", async (request, response) => {
  try {
    const gameId = parseInt(request.params.game_id, 10);
    const { id: userId } = request.session.user!;

    await endTurn(gameId, userId);

    const io = request.app.get("io") as Server;
    const turnInfo = await getCurrentTurn(gameId);
    broadcastTurnChange(
      io,
      gameId,
      turnInfo.currentPlayerId,
      turnInfo.direction,
      turnInfo.playerOrder
    );

    response.status(200).json({ message: "Turn ended" });
  } catch (error: any) {
    logger.error("Error ending turn:", error);
    response.status(500).json({ error: error.message });
  }
});

router.get("/:game_id/player_hand", async (request, response) => {
  const gameId = parseInt(request.params.game_id, 10);
  const { id: userId } = request.session.user!;
  const card_data = await Cards.getHand(gameId, userId);
  const myCards = card_data.map((c) => ({
    id: c.id,
    color: c.color,
    value: c.value,
  }));
  response.status(200).json({ hand: myCards });
});

export default router;