import type { MigrationBuilder } from "node-pg-migrate";

export const shorthands = {};

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("games", {
    is_private: {
      type: "boolean",
      notNull: true,
      default: false,
    },
  });

  pgm.addColumn("games", {
    password_hash: {
      type: "text",
      notNull: false,
    },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumn("games", "password_hash");
  pgm.dropColumn("games", "is_private");
}