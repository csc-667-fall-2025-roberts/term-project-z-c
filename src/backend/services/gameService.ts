import * as GameCards from "../db/cards";
import * as Games from "../db/games";
import * as Moves from "../db/moves";
import type { GamePlayer, GameCard } from "../../types/types";
import { GameState } from "../../types/types";
import { Server } from "socket.io";
import logger from "../lib/logger";
import { broadcastGameStateUpdate } from "../sockets/pre-game-sockets";


export async function getAvailableGames() {
  // Get games where state = 'waiting'
  const waitingGames = await Games.list();
  return waitingGames;
}

const Cards_Per_Player = 7;

//fisher-yates shuffle
function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--){
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result; 
}

export async function StartGame(gameId: number): Promise<{firstPlayerId: number}> {
  const game = await Games.get(gameId);

  if(game.state !== GameState.LOBBY){
    throw new Error("Game has already been started or ended");
  }

  const players = await Games.getPlayers(gameId);

  if(players.length < 2){
    throw new Error("Not enough players");
  }

  const playerIds = players.map((p: GamePlayer) => p.user_id);

  await GameCards.createDeck(gameId);

  const shuffledPlayers = shuffle(playerIds);

  for (let i = 0; i < shuffledPlayers.length; i++){
    const playerId = shuffledPlayers[i];
    await GameCards.drawCards(gameId, playerId, Cards_Per_Player);
    await Games.setPlayerPosition(gameId, i+1, playerId);
  }

  let attempts = 0;
  let validStarter = false;

  while(!validStarter && attempts < 20){
    await GameCards.drawCards(gameId, 0, 1);
    const topCards = await GameCards.getHand(gameId, 0);

    if(topCards.length > 0){
      const starterCard = topCards[0];
      const isValidStarter = starterCard.color !== "wild" &&
                            !["skip", "reverse", "draw_two", "wild_draw_four"].includes(starterCard.value);

      if(isValidStarter){
        await GameCards.playCard(starterCard.id, gameId, 0);
        validStarter = true;
      }
    }
    attempts++;
  }

  if(!validStarter){
    const topCards = await GameCards.getHand(gameId, 0);
    if(topCards.length > 0){
      await GameCards.playCard(topCards[0].id, gameId, 0);
    }
  }

  await Games.startGame(gameId);

  return {firstPlayerId: shuffledPlayers[0]};
}

export async function getCurrentTurn(gameId: number): Promise<{
  currentPlayerId: number;
  playerOrder: number;
  direction: number; 
}> {
  const players = await Games.getPlayers(gameId);
  const moveCount = await Moves.getMoveCount(gameId);
  const direction = await Moves.getTurnDirection(gameId);

  if (players.length === 0) {
    throw new Error("No players in the game");
  }

  const sortedPlayers = players.sort((a, b) => a.position - b.position); 
  const playerCount = sortedPlayers.length;

  let currentTurnIndex = moveCount % playerCount;

  if (direction === -1 && moveCount > 0) {
    currentTurnIndex = (playerCount - currentTurnIndex) % playerCount;
  }

  const currentPlayer = sortedPlayers[currentTurnIndex];

  return {
    currentPlayerId: currentPlayer.user_id, 
    playerOrder: currentPlayer.position, 
    direction
  };
}

export async function endGame(gameId: number, winnerId?: number): Promise<void> {
  const game = await Games.get(gameId);

  if(game.state === GameState.ENDED){
    throw new Error("Game has already ended");
  }

  await Games.updateGame(gameId, GameState.ENDED, winnerId, true);
}

/**
 * End a game and clean up:
 *  - Set state to ENDED
 *  - Remove all participants
 *  - Delete the game record
 *  - Broadcast GAME_ENDED / GAME_STATE_UPDATE
 */
export async function endGameAndCleanup(
  io: Server, 
  gameId: number, 
  reason: string = "host_timeout"
): Promise<void> {
  try {
    const game = await Games.getById(gameId);
    if (!game) {
      logger.info(`endGameAndCleanup: game ${gameId} already deleted`);
      return;
    }

    // 1) Mark game as ENDED (if not already)
    if (game.state !== GameState.ENDED) {
      await Games.updateState(gameId, GameState.ENDED);
    }

    // 2) Notify clients that the game has ended (both waiting room and in-game)
    io.to(`GAME_${gameId}`).emit("GAME_ENDED", { gameId, reason });
    io.to(`WAITING_ROOM_${gameId}`).emit("GAME_ENDED", { gameId, reason });
    broadcastGameStateUpdate(io, gameId, GameState.ENDED);

    // 3) Remove all players from gameParticipants
    const players = await Games.getPlayers(gameId);
    for (const p of players) {
      await Games.removePlayer(gameId, p.user_id);
    }

    // 4) Actually delete the game record
    await Games.deleteGame(gameId);

    logger.info(`Game ${gameId} fully cleaned up and deleted (reason=${reason})`);
  } catch (err: any) {
    logger.error(`endGameAndCleanup failed for game ${gameId}:`, err);
  }
}

export async function getGameState(gameId: number): Promise<{
  playerHands: any[];
  currentPlayer: any;
  players: GamePlayer[];
  topDiscardCard: GameCard | null;
}> {
  const players = await Games.getPlayers(gameId);

  const playerHands = await Promise.all(
    players.map(async (player) => ({
      user_id: player.user_id,
      username: player.username,
      cards: await GameCards.getHand(gameId, player.user_id),
      cardCount: (await GameCards.getHand(gameId, player.user_id)).length
    }))
  );

  const currentTurnInfo = await getCurrentTurn(gameId);

  const discardPile = await GameCards.getHand(gameId, 0);
  const topDiscardCard = discardPile.length > 0 ? discardPile[discardPile.length - 1] : null;

  return {
    playerHands,
    currentPlayer: currentTurnInfo,
    players,
    topDiscardCard
  };
}