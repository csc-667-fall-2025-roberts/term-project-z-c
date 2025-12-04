import { PgType, type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable(
    "game_participants",
    {
      game_id: {
        type: "int",
        notNull: true,
        references: "games",
        onDelete: "CASCADE",
      },
      user_id: {
        type: "int",
        notNull: true,
        references: "users",
        onDelete: "CASCADE",
      },
      player_order: {
        type: "int",
        notNull: true,
      },
      is_winner: {
        type: "boolean",
        notNull: true,
        default: false,
      },
      disconnected: {
        type: "boolean",
        notNull: true,
        default: false,
      },
    },
    {
      constraints: {
        primaryKey: ["game_id", "user_id"],
      },
    }
  );

  // Ensure each player_order is unique within a game
  pgm.addConstraint(
    "game_participants",
    "unique_player_order_per_game",
    {
      unique: ["game_id", "player_order"],
    }
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("game_participants");
}
