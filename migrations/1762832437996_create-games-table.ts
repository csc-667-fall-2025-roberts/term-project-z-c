import { PgType, type MigrationBuilder } from 'node-pg-migrate';

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createTable("games", {
    id: "id",

    host_id: {
      type: "int",
      notNull: true,
      references: "users",
      onDelete: "CASCADE",
    },

    start_time: {
      type: "timestamp",
      notNull: true,
      default: pgm.func("NOW()"),
    },

    is_ready: {
      type: "boolean",
      notNull: true,
      default: false,
    },

    capacity: {
      type: "int",
      notNull: true,
      check: "capacity >= 2 AND capacity <= 10",
    },

    winner_id: {
      type: "int",
      references: "users",
      onDelete: "CASCADE",
    },

    status: {
      type: "varchar(255)",
      notNull: true,
      check: "status IN ('waiting', 'in_progress', 'ended')",
    },
  });

  pgm.createIndex("games", "host_id");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("games");
}
