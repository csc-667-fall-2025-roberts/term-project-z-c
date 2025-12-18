export const CREATE_MESSAGE = `
WITH user_info AS (
  SELECT id, COALESCE(display_name, username) AS display_name
  FROM users
  WHERE id = $1
),
new_message AS (
  INSERT INTO chat (user_id, username, message, game_id, time_sent)
  SELECT $1, ui.display_name, $2, NULL, NOW()
  FROM user_info ui
  RETURNING *
)
SELECT
  new_message.id,
  new_message.user_id,
  new_message.message,
  new_message.time_sent AS created_at,
  new_message.username,
  users.email
FROM new_message
JOIN users ON users.id = new_message.user_id
`;

export const RECENT_MESSAGES = `
SELECT
  chat.id,
  chat.user_id,
  chat.message,
  chat.time_sent as created_at,
  COALESCE(users.display_name, users.username) as username,
  users.email
FROM chat, users
WHERE users.id=chat.user_id
ORDER BY chat.time_sent ASC
LIMIT $1
`;
