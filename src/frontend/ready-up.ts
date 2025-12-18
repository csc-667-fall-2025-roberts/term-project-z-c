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

const loadPlayers = async () => {
    const response = await fetch(`/readyup/${gameId}/players`, { method: "get", credentials: "include" });
    const data = await response.json();

    players = data.players;
    currentUserId = data.currentUserId;
    capacity = data.capacity;

    renderedPlayers();
    updateReadyStatus();
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

    if (me) {
        if (me.is_ready) {
            readyButton.classList.add("ready");
            readyButton.querySelector(".btn-text")!.textContent = "Not Ready";
        } else {
            readyButton.classList.remove("ready");
            readyButton.querySelector(".btn-text")!.textContent = "I'm Ready!";
        }
    }

    // Show start game button if: host + at least 2 players ready (including host)
    const canStartGame = isHost && readyCount >= 2 && players.length >= 2;
    startGameButton.style.display = canStartGame ? "block" : "none";
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

    fetch(`/chat/${gameId}/game`, {
        method: "post",
        body: JSON.stringify({ message: text }),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
    });

    gameChatInput.value = "";
};

const loadGameChat = async () => {
    const response = await fetch(`/chat/${gameId}/game`, {
        method: "get",
        credentials: "include",
    });
    const data = await response.json();
    data.messages.forEach(appendGameMessage);
};

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
    }
});

socket.on(EVENTS.GAME_START, (data: { gameId: number; starterId: number; topCard: any }) => {
    console.log("Received GAME_START event:", EVENTS.GAME_START, data);

    window.location.href = `/games/${gameId}`;
});

socket.on(EVENTS.GAME_CHAT_MESSAGE, (message: ChatMessage) => {
    console.log(EVENTS.GAME_CHAT_MESSAGE, message);
    appendGameMessage(message);
});

const toggleReady = () => {
    fetch(`/readyup/${gameId}/toggle`, {
        method: "post",
        credentials: "include",
    });
};

readyButton.addEventListener("click", (event) => {
    event.preventDefault();

    toggleReady();
});

startGameButton.addEventListener("click", async (event) => {
    event.preventDefault();

    disableButtor("Starting...");

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

    function disableButtor(buttonText: string) {
        startGameButton.disabled = true;
        startGameButton.querySelector(".btn-text")!.textContent = buttonText;
    }

    function enableButton(buttonText: string) {
        startGameButton.disabled = false;
        startGameButton.querySelector(".btn-text")!.textContent = buttonText;
    }
});

gameChatButton.addEventListener("click", (event) => {
    event.preventDefault();
    sendGameMessage();
});

gameChatInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        sendGameMessage();
    }
});

socket.on("connect", () => {
    console.log("Socket connected for gameId:", gameId);
    socket.emit("JOIN_GAME_ROOM", { gameId });
    loadPlayers();
    loadGameChat();
});