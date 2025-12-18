// gameChat.ts
import socketIo from "socket.io-client";
import type { ChatMessage } from "../types/types";
import * as chatKeys from "../shared/keys";

const socket = socketIo();

const listing = document.querySelector<HTMLDivElement>("#game-message-listing")!;
const input = document.querySelector<HTMLInputElement>("#game-message-submit input")!;
const button = document.querySelector<HTMLButtonElement>("#game-message-submit button")!;
const messageTemplate = document.querySelector<HTMLTemplateElement>("#template-game-chat-message")!;

// game id from page, e.g. <body data-game-id="1">
const gameId = Number(document.body.dataset.gameId);

// same user-id helper if you like
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

socket.on(chatKeys.GAME_CHAT_LISTING, ({ messages }: { messages: ChatMessage[] }) => {
  messages.forEach(appendMessage);
});

socket.on(chatKeys.GAME_CHAT_MESSAGE, (message: ChatMessage) => {
  appendMessage(message);
});

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

// initial load
socket.on("connect", () => {
  fetch(`/chat/${gameId}/game`, {
    method: "get",
    credentials: "include",
  });
  socket.emit("JOIN_GAME_ROOM", { gameId });
});