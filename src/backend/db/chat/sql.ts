// Lobby chat - create message
export const CREATE_LOBBY_MESSAGE = `
WITH user_info AS (
  SELECT id, COALESCE(display_name, username) AS display_name
  FROM users
  WHERE id = $1
),
new_message AS (
  INSERT INTO chat (user_id, message, scope, game_id, time_sent)
  SELECT $1, $2, 'lobby', NULL, NOW()
  FROM user_info ui
  RETURNING *
)
SELECT
  new_message.id,
  new_message.user_id,
  new_message.message,
  new_message.time_sent AS created_at,
  ui.display_name AS username,
  users.email
FROM new_message
JOIN users ON users.id = new_message.user_id
CROSS JOIN user_info ui
`;

// Lobby chat - recent messages
export const RECENT_LOBBY_MESSAGES = `
SELECT
  chat.id,
  chat.user_id,
  chat.message,
  chat.time_sent AS created_at,
  COALESCE(users.display_name, users.username) AS username,
  users.email
FROM chat
JOIN users ON users.id = chat.user_id
WHERE chat.scope = 'lobby'
ORDER BY chat.time_sent ASC
LIMIT $1
`;

// Game chat - create message
export const CREATE_GAME_MESSAGE = `
WITH user_info AS (
  SELECT id, COALESCE(display_name, username) AS display_name
  FROM users
  WHERE id = $1
),
new_message AS (
  INSERT INTO chat (user_id, message, scope, game_id, time_sent)
  SELECT $1, $2, 'game', $3, NOW()
  FROM user_info ui
  RETURNING *
)
SELECT
  new_message.id,
  new_message.user_id,
  new_message.message,
  new_message.game_id,
  new_message.time_sent AS created_at,
  ui.display_name AS username,
  users.email
FROM new_message
JOIN users ON users.id = new_message.user_id
CROSS JOIN user_info ui
`;

// Game chat - recent messages
export const RECENT_GAME_MESSAGES = `
SELECT
  chat.id,
  chat.user_id,
  chat.message,
  chat.game_id,
  chat.time_sent AS created_at,
  COALESCE(users.display_name, users.username) AS username,
  users.email
FROM chat
JOIN users ON users.id = chat.user_id
WHERE chat.scope = 'game' AND chat.game_id = $1
ORDER BY chat.time_sent ASC
`;