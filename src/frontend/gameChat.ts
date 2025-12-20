// src/frontend/gameChat.ts
import socketIo from "socket.io-client";
import type { ChatMessage } from "../types/types";
import * as chatKeys from "../shared/keys";

const socket = socketIo();

const listing = document.querySelector<HTMLDivElement>("#game-message-listing")!;
const input = document.querySelector<HTMLInputElement>("#game-message-submit input")!;
const button = document.querySelector<HTMLButtonElement>("#game-message-submit button")!;
const messageTemplate = document.querySelector<HTMLTemplateElement>("#template-game-chat-message")!;

// Get game ID from data attribute
const gameId = Number(document.body.dataset.gameId);

// Get current user ID from page 
const getUserIdFromPage = (): number => {
  const userInfoText = document.querySelector(".user-info")?.textContent || "";
  const match = userInfoText.match(/ID: (\d+)/);
  return match ? parseInt(match[1]) : 0;
};

const currentUserId = getUserIdFromPage();

const appendMessage = ({ username, created_at, message, user_id }: ChatMessage) => {
  const clone = messageTemplate.content.cloneNode(true) as DocumentFragment;
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

  listing.appendChild(clone);
  listing.scrollTop = listing.scrollHeight;
};

// ===== Socket Event Listeners =====

socket.on("connect", () => {
  console.log("[gameChat] Socket connected, joining game room...", { gameId });

  // Load existing chat history
  fetch(`/chat/${gameId}/game`, {
    method: "get",
    credentials: "include",
  });

  // Join the game room
  socket.emit("JOIN_GAME_ROOM", { gameId });
});

socket.on("disconnect", () => {
  console.log("[gameChat] Socket disconnected");
});

socket.on(chatKeys.GAME_CHAT_LISTING, ({ messages }: { messages: ChatMessage[] }) => {
  console.log("[gameChat] GAME_CHAT_LISTING", messages);
  messages.forEach(appendMessage);
});

socket.on(chatKeys.GAME_CHAT_MESSAGE, (message: ChatMessage) => {
  console.log("[gameChat] GAME_CHAT_MESSAGE", message);
  appendMessage(message);
});

// ===== Player Disconnected Event =====
socket.on("PLAYER_DISCONNECTED", ({ userId, gameId }: { userId: number; gameId: number }) => {
  console.log(">>> [gameChat] PLAYER_DISCONNECTED EVENT <<<", { userId, gameId });

  appendMessage({
    id: 0,
    username: "System",
    email: "",
    created_at: new Date(),
    message: `Player ${userId} has disconnected from the game.`,
    user_id: 0,
  });
});

// ===== Game Ended Event =====
socket.on("GAME_ENDED", ({ gameId, reason }: { gameId: number; reason: string }) => {
  console.log(">>> [gameChat] GAME_ENDED EVENT <<<", { gameId, reason });

  const endMessage =
    reason === "host_timeout"
      ? "The host disconnected for 2 minutes. The game has been ended."
      : "The game has ended.";

  appendMessage({
    id: 0,
    username: "System",
    email: "",
    created_at: new Date(),
    message: endMessage,
    user_id: 0,
  });

  // Redirect after 3 seconds
  setTimeout(() => {
    alert(endMessage + " Redirecting to lobby...");
    window.location.href = "/lobby";
  }, 3000);
});

// ===== Send Message =====
const sendMessage = () => {
  const text = input.value.trim();
  if (!text) return;

  fetch(`/chat/${gameId}/game`, {
    method: "post",
    body: JSON.stringify({ message: text }),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  input.value = "";
};

button.addEventListener("click", (event) => {
  event.preventDefault();
  sendMessage();
});

input.addEventListener("keydown", (event) => {
  if (event.key === "Enter") sendMessage();
});