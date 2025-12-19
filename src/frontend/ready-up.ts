// src/frontend/readyup.ts (replace your existing ready-up client file)
import socketIO from "socket.io-client";
import * as EVENTS from "../shared/keys";
import type { GamePlayer, ChatMessage } from "../types/types";

const gameId = parseInt((document.getElementById("game-id") as HTMLInputElement).value);
const socket = socketIO({ query: { gameId: gameId.toString() } });

let currentUserId: number;
let capacity: number;
let players: GamePlayer[] = [];

const playersList = document.querySelector<HTMLUListElement>("#playersGrid")!;
const readyButton = document.querySelector<HTMLButtonElement>("#readyButton")!;
const startGameButton = document.querySelector<HTMLButtonElement>("#startGameButton")!;
const readyCountSpan = document.querySelector<HTMLSpanElement>("#readyCount")!;
const totalPlayers = document.querySelector<HTMLSpanElement>("#totalPlayers")!;
const progressFill = document.querySelector<HTMLDivElement>("#progressFill")!;

const gameChatListing = document.querySelector<HTMLDivElement>("#game-message-listing")!;
const gameChatInput = document.querySelector<HTMLInputElement>("#game-message-submit input")!;
const gameChatButton = document.querySelector<HTMLButtonElement>("#game-message-submit button")!;
const gameChatTemplate = document.querySelector<HTMLTemplateElement>("#template-game-chat-message")!;

const cancelLobbyButton = document.querySelector<HTMLButtonElement>("#cancelLobbyButton")!;
const cancelHelpText = document.querySelector<HTMLParagraphElement>("#cancelHelpText")!;
const cancelModal = document.querySelector<HTMLDivElement>("#cancelLobbyModal")!;
const cancelConfirm = document.querySelector<HTMLButtonElement>("#cancelLobbyConfirm")!;
const cancelDismiss = document.querySelector<HTMLButtonElement>("#cancelLobbyDismiss")!;
const gameNameInput = document.querySelector<HTMLInputElement>("#game-name")!;
const modalGameName = document.querySelector<HTMLElement>("#modal-game-name");

if (modalGameName && gameNameInput) {
  modalGameName.textContent = gameNameInput.value || "this lobby";
}

// Safer loadPlayers: handle non-OK responses and errors by redirecting to /lobby
const loadPlayers = async () => {
  try {
    const response = await fetch(`/readyup/${gameId}/players`, {
      method: "get",
      credentials: "include",
    });

    if (!response.ok) {
      console.warn("readyup players fetch not ok:", response.status, await response.text());
      alert("This lobby no longer exists. Redirecting to lobby.");
      window.location.href = "/lobby";
      return;
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.players)) {
      console.warn("Invalid players data:", data);
      alert("This lobby no longer exists. Redirecting to lobby.");
      window.location.href = "/lobby";
      return;
    }

    players = data.players;
    currentUserId = data.currentUserId;
    capacity = data.capacity;

    console.log("Loaded players:", players, "Current user ID:", currentUserId, "Capacity:", capacity);

    renderedPlayers();
    updateReadyStatus();
  } catch (err) {
    console.error("Error loading players (likely game deleted):", err);
    alert("This lobby no longer exists. Redirecting to lobby.");
    window.location.href = "/lobby";
  }
};

const renderedPlayers = () => {
  const cards: string[] = [];

  players.forEach((player) => {
    const isCurrentUser = player.user_id === currentUserId;
    const isHost = player.position === 1;
    const name = player.display_name || player.username;

    const initials = name.substring(0, 2).toUpperCase();
    cards.push(`
          <div class="player-card ${isHost ? "host" : ""} ${player.is_ready ? "ready" : ""} ${isCurrentUser ? "current-user" : ""}">  
            <div class="player-avatar">
             <div class="avatar-circle">${isCurrentUser ? "You" : initials} </div>
             </div>
             <div class= "player-info">
                 <div class="player-name">${name} ${isHost ? "(Host)" : ""}</div>
                <div class="player-status">${player.is_ready ? "Ready" : "Waiting.."} </div>
             </div>   
             <div class="ready-indicator ${player.is_ready ? "ready" : ""}">
               ${player.is_ready ? '<span class="checkmark">✓</span>' : '<div class="dot"></div><div class="dot"></div><div class="dot"></div>'}
             </div>
    </div>
  `);
  });

  for (let i = players.length; i < capacity; i++) {
    cards.push(`
        <div class="player-card empty">
            <div class="player-avatar">
                <div class="avatar-circle empty"> ? </div>
            </div>
            <div class="player-info">
                <div class="player-name">Waiting for Player...</div>
                <div class="player-status">-</div>
            </div>
        </div>
    `);
  }

  playersList.innerHTML = cards.join("");
};

const updateReadyStatus = () => {
  const readyCount = players.filter((p) => p.is_ready).length;
  const percentage = players.length > 0 ? (readyCount / players.length) * 100 : 0;

  readyCountSpan.textContent = readyCount.toString();
  totalPlayers.textContent = players.length.toString();
  progressFill.style.width = `${percentage}%`;

  const me = players.find((p) => p.user_id === currentUserId);
  const isHost = me?.position === 1;

  console.log("updateReadyStatus: me =", me, "currentUserId =", currentUserId);

  if (me) {
    console.log("updateReaadyStatus: me.is_ready =", me.is_ready);
    if (me.is_ready) {
      readyButton.classList.add("ready");
      readyButton.querySelector(".btn-text")!.textContent = "Not Ready";
    } else {
      readyButton.classList.remove("ready");
      readyButton.querySelector(".btn-text")!.textContent = "I'm Ready!";
    }
  }

  const canStartGame = isHost && readyCount >= 2 && players.length >= 2;
  startGameButton.style.display = canStartGame ? "block" : "none";
  cancelLobbyButton.style.display = isHost ? "inline-flex" : "none";
  if (cancelHelpText) {
    cancelHelpText.style.display = isHost ? "block" : "none";
  }
};

const appendGameMessage = ({ username, created_at, message, user_id }: ChatMessage) => {
  const clone = gameChatTemplate.content.cloneNode(true) as DocumentFragment;
  const messageElement = clone.querySelector(".chat-message") as HTMLElement;

  const timeSpan = clone.querySelector(".message-time")!;
  const time = new Date(created_at);
  timeSpan.textContent = isNaN(time.getTime()) ? "Invalid date" : time.toLocaleString();

  const usernameSpan = clone.querySelector(".message-username")!;
  const msgSpan = clone.querySelector(".message-text")!;
  msgSpan.textContent = message;

  if (user_id === currentUserId) {
    messageElement.classList.add("own-message");
    usernameSpan.textContent = "You";
  } else {
    messageElement.classList.add("other-message");
    usernameSpan.textContent = username;
  }

  gameChatListing.appendChild(clone);
  gameChatListing.scrollTop = gameChatListing.scrollHeight;
};

const sendGameMessage = () => {
  const text = gameChatInput.value.trim();
  if (!text) return;

  fetch(`/chat/${gameId}/waiting`, {
    method: "post",
    body: JSON.stringify({ message: text }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  gameChatInput.value = "";
};

const loadGameChat = async () => {
  try {
    const response = await fetch(`/chat/${gameId}/waiting`, {
      method: "get",
      credentials: "include",
    });
    if (!response.ok) return;
    const data = await response.json();
    data.messages.forEach(appendGameMessage);
  } catch (err) {
    console.warn("Failed to load chat", err);
  }
};

// SOCKET HANDLERS
socket.on(EVENTS.PLAYER_JOINED, (data: { gameId: number; userId: number; username: string }) => {
  console.log(EVENTS.PLAYER_JOINED, data);
  loadPlayers();
});

socket.on(EVENTS.PLAYER_LEFT, (data: { gameId: number; userId: number; username: string }) => {
  console.log(EVENTS.PLAYER_LEFT, data);
  loadPlayers();
});

socket.on(EVENTS.PLAYER_READY, (data: { gameId: number; userId: number; isReady: boolean }) => {
  console.log(EVENTS.PLAYER_READY, data);
  const player = players.find((p) => p.user_id === data.userId);
  if (player) {
    player.is_ready = data.isReady;
    renderedPlayers();
    updateReadyStatus();
  } else {
    // If we don't have that player in memory, refresh the list
    loadPlayers();
  }
});

socket.on(EVENTS.GAME_START, (data: { gameId: number; starterId: number; topCard: any }) => {
  console.log("Received GAME_START event:", EVENTS.GAME_START, data);
  window.location.href = `/games/${gameId}`;
});

socket.on(EVENTS.WAITING_ROOM_CHAT_MESSAGE, (message: ChatMessage) => {
  console.log(EVENTS.WAITING_ROOM_CHAT_MESSAGE, message);
  appendGameMessage(message);
});

// Listen for literal and shared-key cancel events (defensive)
socket.on("LOBBY_CANCELLED", ({ gameId: cancelledGameId }: { gameId: number }) => {
  console.log("Lobby cancelled (literal):", cancelledGameId);
  alert("The host has cancelled the lobby. You'll be returned to the lobby.");
  window.location.href = "/lobby";
});

socket.on(EVENTS.GAME_LOBBY_CANCELLED as any, ({ gameId: cancelledGameId }: { gameId: number }) => {
  console.log("Lobby cancelled (shared key):", cancelledGameId);
  alert("The host has cancelled the lobby. You'll be returned to the lobby.");
  window.location.href = "/lobby";
});

// PLAYER DISCONNECT
socket.on("PLAYER_DISCONNECTED", ({ userId, gameId }: { userId: number; gameId: number }) => {
  console.log("PLAYER_DISCONNECTED", { userId, gameId });
  appendGameMessage({
    id: 0,
    username: "System",
    email: "",
    created_at: new Date(),
    message: `Player ${userId} has disconnected from the waiting room.`,
    user_id: 0,
  });
  loadPlayers();
});

// GAME_ENDED
socket.on("GAME_ENDED", ({ gameId, reason }: { gameId: number; reason: string }) => {
  console.log(">>> [ready-up] GAME_ENDED EVENT <<<", { gameId, reason });
  const endMessage =
    reason === "host_timeout"
      ? "The host disconnected for 2 minutes. This lobby has been closed."
      : "The game/lobby has been closed by the host.";
  alert(endMessage);
  window.location.href = "/lobby";
});

// Join waiting room on connect
socket.on("connect", () => {
  console.log("Socket connected, joining waiting room...");
  socket.emit("JOIN_WAITING_ROOM", { gameId });
});

// READY / START / CANCEL handlers 
const toggleReady = async () => {
  try {
    const response = await fetch(`/readyup/${gameId}/toggle`, {
      method: "post",
      credentials: "include",
    });

    if(!response.ok) {
      throw new Error(`Failed to toggle ready status: ${response.statusText}`);
    }

    const data = await response.json();
    console.log("Toggled ready status:", data.isReady);

    const me = players.find((p) => p.user_id === currentUserId);
    if (me) {
      me.is_ready = data.isReady;
      renderedPlayers();
      updateReadyStatus();
    } else {
      // refresh if we couldn't find current user
      loadPlayers();
    }
  }
  catch (error) {
    console.error("Error toggling ready status:", error);
  }
};

readyButton.addEventListener("click", async (event) => {
  event.preventDefault();
  toggleReady();
});

startGameButton.addEventListener("click", async (event) => {
  event.preventDefault();

  disableButton("Starting...");

  try {
    const response = await fetch(`/games/${gameId}/start`, {
      method: "post",
      credentials: "include",
    });

    if (response.ok) {
      console.log("Game started successfully");
      window.location.href = `/games/${gameId}`;
    } else {
      console.error("Failed to start game");
      enableButton("Start Game");
    }
  } catch (error) {
    console.error("Error starting game:", error);
    enableButton("Start Game");
  }

  function disableButton(buttonText: string) {
    startGameButton.disabled = true;
    startGameButton.querySelector(".btn-text")!.textContent = buttonText;
  }

  function enableButton(buttonText: string) {
    startGameButton.disabled = false;
    startGameButton.querySelector(".btn-text")!.textContent = buttonText;
  }
});

/* ========== Cancel lobby modal logic ========== */

const showCancelModal = () => {
  cancelModal.style.display = "flex";
};

const hideCancelModal = () => {
  cancelModal.style.display = "none";
};

cancelLobbyButton.addEventListener("click", (event) => {
  event.preventDefault();
  showCancelModal();
});

cancelDismiss.addEventListener("click", (event) => {
  event.preventDefault();
  hideCancelModal();
});

cancelModal.addEventListener("click", (event) => {
  if (event.target === cancelModal) {
    hideCancelModal();
  }
});

cancelConfirm.addEventListener("click", async (event) => {
  event.preventDefault();

  cancelConfirm.disabled = true;
  cancelConfirm.textContent = "Cancelling…";

  try {
    const response = await fetch(`/games/${gameId}/cancel`, {
      method: "post",
      credentials: "include",
    });

    if (response.ok) {
      window.location.href = "/lobby";
      return;
    }

    alert("Failed to cancel lobby.");
  } catch (error) {
    console.error("Error cancelling lobby:", error);
    alert("Error cancelling lobby.");
  } finally {
    cancelConfirm.disabled = false;
    cancelConfirm.textContent = "Yes, cancel lobby";
    hideCancelModal();
  }
});

/* ========== Game chat events ========== */

gameChatButton.addEventListener("click", (event) => {
  event.preventDefault();
  sendGameMessage();
});

gameChatInput.addEventListener("keydown", (event) => {
  if (event.key === "Enter") {
    event.preventDefault();
    sendGameMessage();
  }
});

// Initial load
loadPlayers();
loadGameChat();