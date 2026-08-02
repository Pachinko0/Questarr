import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../server/db.js";
import { games } from "../shared/schema.js";
import { logger } from "../server/logger.js";

const CATEGORY_SUBDIRS = new Set(["dlc", "update", "extra", "packs"]);

const rows = db.select().from(games).all();
let fixed = 0;
let skipped = 0;

for (const game of rows) {
  if (!game.libraryPath) {
    skipped++;
    continue;
  }
  const base = path.basename(game.libraryPath);
  if (CATEGORY_SUBDIRS.has(base.toLowerCase())) {
    const parent = path.dirname(game.libraryPath);
    db.update(games).set({ libraryPath: parent }).where(eq(games.id, game.id)).run();
    logger.info(
      { game: game.title, from: game.libraryPath, to: parent },
      "Repaired library path (was category subfolder)"
    );
    fixed++;
  } else {
    skipped++;
  }
}

logger.info(`Repair complete: ${fixed} fixed, ${skipped} unchanged.`);
