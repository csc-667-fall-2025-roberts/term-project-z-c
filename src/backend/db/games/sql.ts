export const CREATE_GAME = `
INSERT INTO games (host_id, name, capacity, status, start_time)
VALUES ($1, $2, $3, 'waiting', NOW())
RETURNING *
`;

export const JOIN_GAME = `
INSERT INTO game_participants (game_id, user_id, player_order, is_winner, disconnected)
VALUES ($1, $2, 1, FALSE, FALSE)
`;


export const LIST_GAMES = `
SELECT 
  g.*,
  COUNT(gp.user_id) AS player_count,
  COALESCE(
    json_agg(
      json_build_object(
        'user_id', gp.user_id,
        'username', u.username,
        'email', u.email
      )
    ) FILTER (WHERE gp.user_id IS NOT NULL),
    '[]'
  ) AS players
FROM games g
LEFT JOIN "game_participants" gp ON g.id=gp.game_id
LEFT JOIN users u ON u.id=gp.user_id
WHERE g.status=$1
GROUP BY g.id
ORDER BY g.start_time DESC
LIMIT $2
`;

export const GAMES_BY_USER = `
SELECT games.* FROM "game_participants", games
WHERE "game_participants".game_id=games.id AND user_id=$1
`;

export const GAME_BY_ID = `
  SELECT * FROM games WHERE id=$1
`;
