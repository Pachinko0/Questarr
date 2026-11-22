import "dotenv/config";
import fs from "node:fs/promises";
import path from "node:path";
import { closeDatabase } from "../server/db.js";
import { ensureDatabase } from "../server/migrate.js";
import { storage } from "../server/storage.js";
import { logger } from "../server/logger.js";

const CATEGORY_SUBDIRECTORIES = new Set(["dlc", "update", "extra", "packs"]);

/**
 * Repairs legacy rows whose libraryPath was accidentally recorded as a
 * category directory instead of the game's root directory. Only existing
 * directories are changed; file paths and missing/stale rows are left alone.
 */
async function repairLibraryPaths(): Promise<void> {
  await ensureDatabase();

  let repaired = 0;
  let skipped = 0;
  for (const game of await storage.getAllGames()) {
    if (!game.libraryPath) {
      skipped++;
      continue;
    }

    const basename = path.basename(game.libraryPath).toLowerCase();
    if (!CATEGORY_SUBDIRECTORIES.has(basename)) {
      skipped++;
      continue;
    }

    const stat = await fs.stat(game.libraryPath).catch(() => null);
    if (!stat?.isDirectory()) {
      skipped++;
      continue;
    }

    const repairedPath = path.dirname(path.resolve(game.libraryPath));
    await storage.updateGame(game.id, { libraryPath: repairedPath });
    logger.info(
      { gameId: game.id, title: game.title, from: game.libraryPath, to: repairedPath },
      "Repaired library path (category directory)"
    );
    repaired++;
  }

  logger.info({ repaired, skipped }, "Library-path repair complete");
}

try {
  await repairLibraryPaths();
  process.exitCode = 0;
} catch (error) {
  logger.error({ error }, "Library-path repair failed");
  process.exitCode = 1;
} finally {
  await closeDatabase().catch((error) => logger.warn({ error }, "Failed to close database"));
}
