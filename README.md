# term-project-z-c (Uno Online)

A browser-based implementation of the classic card game **Uno**, built as the CSC-667 Fall 2025 term project. The application provides a playable Uno experience with a web UI and server-managed game logic. It is written primarily in TypeScript, uses EJS for HTML templating, and CSS for styling.

---

## Table of Contents

* Overview
* Features
* Uno Rules (as implemented)
* How to Play
* Installation & Running Locally
* Architecture & Tech Stack
* Project Structure
* Development Notes
* Testing
* Known Limitations
* License
* Acknowledgements

---

## Overview

This project implements **Uno**, a turn-based multiplayer card game where players attempt to be the first to discard all cards in their hand. The application includes:

* Core Uno game logic (turn order, valid moves, action cards)
* A browser-based user interface
* Server-managed game state

The project was created using GitHub Classroom for CSC-667 (Fall 2025).

---

## Features

* Standard Uno gameplay loop (play or draw on your turn)
* Visual display of player hands and the discard pile
* Turn management, including direction changes
* Support for standard Uno action cards:

  * Skip
  * Reverse
  * Draw Two
  * Wild
  * Wild Draw Four
* Server-side validation of moves to maintain consistent game state
* Local multiplayer by connecting multiple clients to the same running server

---

## Uno Rules (as implemented)

This project follows standard Uno rules unless otherwise specified in the source code.

### Core Rules

* Each player starts with a fixed number of cards (commonly 7).
* On a turn, a player may play a card that matches the **color**, **number**, or **symbol** of the top card on the discard pile.
* If a player cannot (or chooses not to) play a card, they draw one card from the draw pile.
* The first player to discard all cards wins the round.

### Action Cards

* **Skip:** The next player loses their turn.
* **Reverse:** Reverses the direction of play.
* **Draw Two:** The next player draws two cards and loses their turn.
* **Wild:** The current player chooses the next color.
* **Wild Draw Four:** The current player chooses the next color; the next player draws four cards and loses their turn.

### UNO Call

* When a player is reduced to one card, they must call **UNO**.
* The UI provides feedback when a player reaches one card. Any penalties for failing to call UNO depend on the current implementation in the code.

### Draw Pile

* When the draw pile is exhausted, the discard pile (excluding the top card) is reshuffled to form a new draw pile.

---

## How to Play

* The game board displays:

  * Your hand
  * The discard pile
  * The draw pile
  * The current player’s turn
* To play a card, select a legal card from your hand on your turn.
* To draw a card, select the draw pile when you choose not to (or cannot) play.
* When playing a Wild card, you will be prompted to select a color.

### Multiplayer

* Multiple players can join by opening multiple browser windows or tabs connected to the same running server.
* Exact join or room behavior depends on the server implementation.

---

## Installation & Running Locally

### Prerequisites

* Node.js (version specified in `package.json`, if any)
* npm or yarn
* Git

### Steps

1. Clone the repository:

   ```bash
   git clone https://github.com/csc-667-fall-2025-roberts/term-project-z-c.git
   cd term-project-z-c
   ```
2. Install dependencies:

   ```bash
   npm install
   # or
   yarn
   ```
3. Build the project (if required):

   ```bash
   npm run build
   ```
4. Start the server:

   ```bash
   npm start
   # or, if available
   npm run dev
   ```
5. Open a browser and navigate to the local URL printed by the server (commonly `http://localhost:3000`).

Refer to `package.json` for the authoritative list of available scripts.

---

## Architecture & Tech Stack

* **Language:** TypeScript
* **Server:** Node.js
* **Templating:** EJS
* **Styling:** CSS

### Design Overview

* The server maintains the authoritative game state (deck, hands, discard pile, turn order).
* Clients send actions (play card, draw card), which the server validates before updating state.
* EJS templates render the initial HTML views, with client-side scripts handling interaction.

---

## Project Structure

A typical layout for this repository includes:

* `src/` — Server and shared TypeScript source files
* `views/` — EJS templates
* `public/` — Static assets (CSS, client-side scripts)
* `dist/` or `build/` — Compiled output (if applicable)
* `package.json`
* `tsconfig.json`
* `README.md`

Refer to the repository root for the exact structure used.

---

## Development Notes

* Build and run scripts are defined in `package.json`.
* The server enforces turn order and move validity.
* UI updates reflect the current server state after actions are processed.

---

## Testing

* Manual testing can be done by opening multiple browser windows connected to the same server.
* Automated tests (if present) can be run using the test script defined in `package.json`.

---

## Known Limitations

* The project is intended for educational use and may not handle all edge cases found in the official Uno rules.
* Network robustness (disconnects, reconnections) depends on the current server implementation.

---

## License

This project does not specify a license and is intended for educational use as part of a university course.

---

## Team

This project was created by:

* **Sam Kazemi**
* **Nefzger Omondi**
* **Fatma Almosawi**

## Acknowledgements

* Created for CSC-667 Fall 2025 using GitHub Classroom.
* **Uno** is a trademark of Mattel. This project is an educational reimplementation and is not affiliated with or endorsed by Mattel.
