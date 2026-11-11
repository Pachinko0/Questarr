import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dbMock = vi.hoisted(() => ({
  dialect: "sqlite" as "sqlite" | "postgres",
  databaseStoragePath: "",
  backupDatabase: vi.fn(),
}));

vi.mock("../db.js", () => ({
  get dialect() {
    return dbMock.dialect;
  },
  get databaseStoragePath() {
    return dbMock.databaseStoragePath;
  },
  backupDatabase: dbMock.backupDatabase,
}));

let tempRoot: string;

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "questarr-database-backup-"));
  dbMock.dialect = "sqlite";
  dbMock.databaseStoragePath = path.join(tempRoot, "sqlite.db");
  dbMock.backupDatabase.mockReset();
});

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true });
});

describe("createDatabaseBackup", () => {
  it("creates a backup beside the active SQLite database", async () => {
    const source = path.join(tempRoot, "sqlite.db");
    await fs.writeFile(source, "database contents");
    dbMock.backupDatabase.mockImplementation(async (destination: string) => {
      await fs.copyFile(source, destination);
    });

    vi.resetModules();
    const { createDatabaseBackup } = await import("../database-backup.js");
    const backupPath = await createDatabaseBackup("sqlite-backup");

    expect(path.dirname(backupPath)).toBe(tempRoot);
    expect(path.basename(backupPath)).toMatch(/^sqlite-backup-.*\.db$/);
    expect(await fs.readFile(backupPath, "utf8")).toBe("database contents");
    expect(dbMock.backupDatabase).toHaveBeenCalledWith(backupPath);
  });

  it("rejects unsupported database backends before creating a file", async () => {
    dbMock.dialect = "postgres";
    vi.resetModules();
    const { createDatabaseBackup, DatabaseBackupUnsupportedError } =
      await import("../database-backup.js");

    await expect(createDatabaseBackup("sqlite-backup")).rejects.toBeInstanceOf(
      DatabaseBackupUnsupportedError
    );
    expect(dbMock.backupDatabase).not.toHaveBeenCalled();
  });
});
