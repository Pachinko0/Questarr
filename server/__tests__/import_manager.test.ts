import { beforeEach, describe, expect, it, vi } from "vitest";
import path from "path";

const { fsMock, downloadersMock } = vi.hoisted(() => ({
  fsMock: {
    ensureDir: vi.fn().mockResolvedValue(undefined),
    move: vi.fn().mockResolvedValue(undefined),
    copy: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    pathExists: vi.fn().mockResolvedValue(true),
    stat: vi.fn().mockResolvedValue({ isDirectory: () => false }),
    readdir: vi.fn().mockResolvedValue([]),
  },
  downloadersMock: {
    removeDownload: vi.fn().mockResolvedValue({ success: true, message: "ok" }),
  },
}));

vi.mock("fs-extra", () => ({
  default: fsMock,
}));

vi.mock("../downloaders.js", () => ({
  DownloaderManager: downloadersMock,
}));

import { ImportManager } from "../services/ImportManager.js";
import { makeImportConfig } from "./helpers/import-test-helpers.js";

describe("ImportManager", () => {
  const storage = {
    getGameDownload: vi.fn(),
    getGame: vi.fn(),
    getImportConfig: vi.fn(),
    getDownloader: vi.fn(),
    updateGameDownloadStatus: vi.fn(),
    updateGameStatus: vi.fn(),
    updateGame: vi.fn(),
    addGameFilesBatch: vi.fn().mockResolvedValue([]),
    addNotification: vi.fn().mockResolvedValue(undefined),
  };

  const pathService = {
    translatePath: vi.fn(),
  };

  const platformService = {
    getSourcePlatform: vi.fn(),
  };

  const archiveService = {
    isArchive: vi.fn(),
    extract: vi.fn(),
  };

  const baseConfig = makeImportConfig({ overwriteExisting: true });

  beforeEach(() => {
    vi.clearAllMocks();
    fsMock.pathExists.mockResolvedValue(true);
    fsMock.stat.mockResolvedValue({ isDirectory: () => false });
    pathService.translatePath.mockResolvedValue("/data/downloads/file.iso");
    archiveService.isArchive.mockReturnValue(false);
    storage.getImportConfig.mockResolvedValue(baseConfig);
    storage.addNotification.mockResolvedValue(undefined);
    downloadersMock.removeDownload.mockResolvedValue({ success: true, message: "ok" });
  });

  it("preserves an exact single-file library path", async () => {
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    const game = { id: "g1", userId: "u1", libraryPath: null };
    const filePath = "/data/library/switch/Test Game.nsp";

    await manager.setLibraryPathOnce(game as never, filePath);

    expect(storage.updateGame).toHaveBeenCalledWith("g1", {
      libraryPath: path.resolve(filePath),
    });
    expect(game.libraryPath).toBe(path.resolve(filePath));
  });

  it("does not replace an existing library path", async () => {
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.setLibraryPathOnce(
      { id: "g1", userId: "u1", libraryPath: "/data/library/switch/Existing.nsp" } as never,
      "/data/library/switch/Replacement.nsp"
    );

    expect(storage.updateGame).not.toHaveBeenCalled();
  });

  it("does not replace a path persisted by an earlier import using a stale game object", async () => {
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    const game = { id: "g1", userId: "u1", libraryPath: null };
    storage.getGame.mockResolvedValue({
      ...game,
      libraryPath: "/data/library/switch/Existing.nsp",
    });

    await manager.setLibraryPathOnce(game as never, "/data/library/switch/Replacement.nsp");

    expect(storage.updateGame).not.toHaveBeenCalled();
    expect(game.libraryPath).toBe("/data/library/switch/Existing.nsp");
  });

  it("records the exact placed file when sorted imports use a game directory", async () => {
    const sourcePath = "/data/downloads/Test Game.nsp";
    const gameDir = path.resolve("/data/library/switch/Test Game");
    const placedFile = path.join(gameDir, "Test Game.nsp");
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ sortExtras: true }));
    fsMock.stat.mockResolvedValue({ isDirectory: () => false, size: 123 });
    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const planSpy = vi.spyOn(PCImportStrategy.prototype, "planImport").mockResolvedValue({
      needsReview: false,
      originalPath: sourcePath,
      proposedPath: gameDir,
      strategy: "pc",
      fileCategories: [{ name: "Test Game.nsp", category: "main" }],
    });
    const executeSpy = vi.spyOn(PCImportStrategy.prototype, "executeImport").mockResolvedValue({
      destDir: gameDir,
      filesPlaced: [placedFile],
      modeUsed: "move",
      conflictsResolved: [],
    });
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    try {
      const result = await manager.manualImportFile(
        sourcePath,
        { id: "g1", userId: "u1", title: "Test Game" } as never,
        "main",
        "switch"
      );

      expect(result).toEqual({ destDir: gameDir, newPath: placedFile, fileSize: 123 });
    } finally {
      planSpy.mockRestore();
      executeSpy.mockRestore();
    }
  });

  it("places a manually assigned DLC file in the DLC category directory", async () => {
    const sourcePath = "/data/downloads/Test Game DLC.nsp";
    const gameRoot = path.resolve("/data/library/switch/Test Game");
    const placedFile = path.join(gameRoot, "dlc", "Test Game DLC.nsp");
    storage.getImportConfig.mockResolvedValue(
      makeImportConfig({
        libraryRoot: "/data/library",
        sortExtras: false,
        transferMode: "copy",
      })
    );
    fsMock.stat.mockResolvedValue({ isDirectory: () => false, size: 456 });
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    const result = await manager.manualImportFile(
      sourcePath,
      { id: "g1", userId: "u1", title: "Test Game" } as never,
      "dlc",
      "switch"
    );

    expect(fsMock.copy).toHaveBeenCalledWith(sourcePath, placedFile, { overwrite: true });
    expect(result).toEqual({ destDir: gameRoot, newPath: placedFile, fileSize: 456 });
  });

  it("always moves Scan Disk imports even when another transfer mode is configured", async () => {
    const sourcePath = path.resolve("/data/library/switch/Test Game/Misplaced DLC.nsp");
    const gameRoot = path.resolve("/data/library/switch/Test Game");
    const placedFile = path.join(gameRoot, "dlc", "Misplaced DLC.nsp");
    storage.getImportConfig.mockResolvedValue(
      makeImportConfig({ libraryRoot: "/data/library", transferMode: "copy" })
    );
    fsMock.stat.mockResolvedValue({ isDirectory: () => false, size: 789 });
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    const result = await manager.manualImportFile(
      sourcePath,
      { id: "g1", userId: "u1", title: "Test Game" } as never,
      "dlc",
      undefined,
      gameRoot,
      "symlink"
    );

    expect(fsMock.move).toHaveBeenCalledWith(sourcePath, placedFile, { overwrite: true });
    expect(fsMock.copy).not.toHaveBeenCalled();
    expect(result).toEqual({ destDir: gameRoot, newPath: placedFile, fileSize: 789 });
  });

  it("returns early when download cannot be found", async () => {
    storage.getGameDownload.mockResolvedValue(undefined);
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(storage.updateGameDownloadStatus).not.toHaveBeenCalled();
  });

  it("marks download as error when game is missing", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
    });
    storage.getGame.mockResolvedValue(undefined);

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "error");
  });

  it("marks download completed when post-processing is disabled", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue({ ...baseConfig, enablePostProcessing: false });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "completed");
  });

  it("records files placed by an ordinary automatic import when sortExtras is disabled", async () => {
    const game = {
      id: "g1",
      title: "Test Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
      libraryPath: null,
    };
    const placedFile = path.resolve("/data/library/pc/Test Game.iso");
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "Test Game",
    });
    storage.getGame.mockResolvedValue(game);
    storage.getDownloader.mockResolvedValue({ id: "d1", name: "qBit", url: "http://qbit" });
    storage.getImportConfig.mockResolvedValue(
      makeImportConfig({
        libraryRoot: "/data/library",
        sortExtras: false,
        transferMode: "copy",
      })
    );
    fsMock.stat.mockResolvedValue({ isDirectory: () => false, size: 321 });
    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const planSpy = vi.spyOn(PCImportStrategy.prototype, "planImport").mockResolvedValue({
      needsReview: false,
      originalPath: "/data/downloads/file.iso",
      proposedPath: placedFile,
      strategy: "pc",
    });
    const executeSpy = vi.spyOn(PCImportStrategy.prototype, "executeImport").mockResolvedValue({
      destDir: placedFile,
      filesPlaced: [placedFile],
      modeUsed: "copy",
      conflictsResolved: [],
    });
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    try {
      await manager.processImport("dl-1", "/remote/path");

      expect(storage.addGameFilesBatch).toHaveBeenCalledWith([
        expect.objectContaining({
          gameId: "g1",
          downloadId: "dl-1",
          category: "main",
          filePath: placedFile,
          storedName: "Test Game.iso",
          fileSize: 321,
        }),
      ]);
      const importedStatusCall = storage.updateGameDownloadStatus.mock.calls.findIndex(
        ([, status]) => status === "imported"
      );
      expect(importedStatusCall).toBeGreaterThanOrEqual(0);
      expect(storage.addGameFilesBatch.mock.invocationCallOrder[0]).toBeLessThan(
        storage.updateGameDownloadStatus.mock.invocationCallOrder[importedStatusCall]
      );
    } finally {
      planSpy.mockRestore();
      executeSpy.mockRestore();
    }
  });

  it("flags manual review when download path is not accessible", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getDownloader.mockResolvedValue({ id: "d1", name: "qBit", url: "http://qbit:8080" });
    fsMock.pathExists.mockResolvedValue(false);

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    // MAX_PATH_RETRY = 5: first 4 calls set status back to "downloading"; 5th triggers manual_review_required
    for (let i = 0; i < 5; i++) {
      await manager.processImport("dl-1", "/remote/path");
    }

    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "manual_review_required");
  });

  it("marks download as error when processing throws", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    pathService.translatePath.mockRejectedValue(new Error("translate failure"));

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "unpacking");
    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "error");
  });

  it("throws when confirmImport download is missing", async () => {
    storage.getGameDownload.mockResolvedValue(undefined);
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await expect(
      manager.confirmImport("dl-1", { strategy: "pc" } as never) // NOSONAR
    ).rejects.toThrow("Download dl-1 not found");
  });

  it("throws when confirmImport is called without a plan", async () => {
    storage.getGameDownload.mockResolvedValue({ id: "dl-1", gameId: "g1" });
    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await expect(manager.confirmImport("dl-1")).rejects.toThrow("Confirmation requires a plan");
  });

  it("blocks confirmImport when proposed path is outside library root", async () => {
    storage.getGameDownload.mockResolvedValue({ id: "dl-1", gameId: "g1", downloaderId: "d1" });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue({ ...baseConfig, libraryRoot: "/safe/root" });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await expect(
      manager.confirmImport("dl-1", {
        strategy: "pc",
        originalPath: "/src/game",
        proposedPath: "/other/root/game",
        needsReview: false,
      })
    ).rejects.toThrow("Proposed path is outside configured library root");
  });

  it("executes confirmImport for pc strategy and updates statuses", async () => {
    storage.getGameDownload.mockResolvedValue({ id: "dl-1", gameId: "g1", downloaderId: "d1" });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue({ ...baseConfig, libraryRoot: "/safe/root" });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.confirmImport("dl-1", {
      strategy: "pc",
      originalPath: "/downloads/source-folder",
      proposedPath: "/safe/root/PC/My Game",
      needsReview: false,
      transferMode: "move",
    });

    expect(fsMock.ensureDir).toHaveBeenCalled();
    expect(fsMock.move).toHaveBeenCalledWith("/downloads/source-folder", "/safe/root/PC/My Game", {
      overwrite: true,
    });
    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "imported");
    expect(storage.updateGameStatus).toHaveBeenCalledWith("g1", { status: "owned" });
  });

  it("extracts archives before import when autoUnpack is enabled", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "Game.zip",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Archive Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue({ ...baseConfig, autoUnpack: true });
    archiveService.isArchive.mockReturnValue(true);
    archiveService.extract.mockResolvedValue(["/data/downloads/file_extracted/game.rom"]);
    pathService.translatePath.mockResolvedValue("/data/downloads/file.zip");

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(archiveService.extract).toHaveBeenCalledWith(
      "/data/downloads/file.zip",
      "/data/downloads/file.zip_extracted"
    );
  });

  it("import config libraryRoot is used as the library root for PC imports", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "PC Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ libraryRoot: "/games/pc" }));

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(fsMock.ensureDir).toHaveBeenCalledWith("/games/pc");
  });

  // ─── confirmImport error paths ───────────────────────────────────────────────

  it("confirmImport: originalPath provided but executeImport throws → sets error and re-throws", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ libraryRoot: "/safe/root" }));

    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    vi.spyOn(PCImportStrategy.prototype, "executeImport").mockRejectedValue(
      new Error("Source file not found")
    );

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await expect(
      manager.confirmImport("dl-1", {
        strategy: "pc",
        originalPath: "/downloads/source-folder",
        proposedPath: "/safe/root/PC/My Game",
        needsReview: false,
        transferMode: "move",
      })
    ).rejects.toThrow("Source file not found");

    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "error");
  });

  it("confirmImport: game not found for download → throws with descriptive message", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g-missing",
      downloaderId: "d1",
    });
    storage.getGame.mockResolvedValue(undefined);

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await expect(
      manager.confirmImport("dl-1", {
        strategy: "pc",
        originalPath: "/downloads/source",
        proposedPath: "/data/PC/My Game",
        needsReview: false,
      })
    ).rejects.toThrow("Game not found for download dl-1");
  });

  // ─── processImport additional paths ─────────────────────────────────────────

  it("processImport: archive extracted but folder empty → import proceeds without crash", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "Game.zip",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Archive Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ autoUnpack: true }));
    archiveService.isArchive.mockReturnValue(true);
    archiveService.extract.mockResolvedValue([]);
    pathService.translatePath.mockResolvedValue("/data/downloads/file.zip");

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(archiveService.extract).toHaveBeenCalledWith(
      "/data/downloads/file.zip",
      "/data/downloads/file.zip_extracted"
    );
    expect(storage.updateGameDownloadStatus).toHaveBeenCalled();
  });

  // ─── confirmImport override plan paths ──────────────────────────────────────

  it("confirmImport: overridePlan.originalPath provided → strategy receives the override path", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ libraryRoot: "/safe/root" }));
    fsMock.pathExists.mockResolvedValue(true);

    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const execSpy = vi.spyOn(PCImportStrategy.prototype, "executeImport").mockResolvedValue({
      destDir: "/safe/root/PC/My Game",
      filesPlaced: ["/safe/root/PC/My Game/game.exe"],
      modeUsed: "move",
      conflictsResolved: [],
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.confirmImport("dl-1", {
      strategy: "pc",
      originalPath: "/override/source/path",
      proposedPath: "/safe/root/PC/My Game",
      needsReview: false,
      transferMode: "move",
    });

    expect(execSpy).toHaveBeenCalledWith(
      expect.objectContaining({ originalPath: "/override/source/path" }),
      "move"
    );

    execSpy.mockRestore();
  });

  it("confirmImport: overridePlan.proposedPath provided → strategy receives the override proposedPath", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ libraryRoot: "/safe/root" }));

    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const execSpy = vi.spyOn(PCImportStrategy.prototype, "executeImport").mockResolvedValue({
      destDir: "/safe/root/PC/Custom Folder",
      filesPlaced: ["/safe/root/PC/Custom Folder/game.exe"],
      modeUsed: "move",
      conflictsResolved: [],
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.confirmImport("dl-1", {
      strategy: "pc",
      originalPath: "/downloads/game",
      proposedPath: "/safe/root/PC/Custom Folder",
      needsReview: false,
      transferMode: "move",
    });

    expect(execSpy).toHaveBeenCalledWith(
      expect.objectContaining({ proposedPath: "/safe/root/PC/Custom Folder" }),
      "move"
    );

    execSpy.mockRestore();
  });

  it("confirmImport: overridePlan.unpack = true → archiveService.extract is called", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ libraryRoot: "/safe/root" }));
    archiveService.isArchive.mockReturnValue(true);
    archiveService.extract.mockResolvedValue(["/safe/root/PC/My Game/game.exe"]);

    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const execSpy = vi.spyOn(PCImportStrategy.prototype, "executeImport").mockResolvedValue({
      destDir: "/safe/root/PC/My Game",
      filesPlaced: ["/safe/root/PC/My Game/game.exe"],
      modeUsed: "move",
      conflictsResolved: [],
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.confirmImport("dl-1", {
      strategy: "pc",
      originalPath: "/downloads/game.zip",
      proposedPath: "/safe/root/PC/My Game",
      needsReview: false,
      transferMode: "move",
      unpack: true,
    });

    expect(archiveService.extract).toHaveBeenCalledWith(
      "/downloads/game.zip",
      "/downloads/game.zip_extracted"
    );

    execSpy.mockRestore();
  });

  it("confirmImport: overridePlan.unpack = false → archiveService.extract is NOT called", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(makeImportConfig({ libraryRoot: "/safe/root" }));
    archiveService.isArchive.mockReturnValue(true);

    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const execSpy = vi.spyOn(PCImportStrategy.prototype, "executeImport").mockResolvedValue({
      destDir: "/safe/root/PC/My Game",
      filesPlaced: ["/safe/root/PC/My Game/game.exe"],
      modeUsed: "move",
      conflictsResolved: [],
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.confirmImport("dl-1", {
      strategy: "pc",
      originalPath: "/downloads/game.zip",
      proposedPath: "/safe/root/PC/My Game",
      needsReview: false,
      transferMode: "move",
      unpack: false,
    });

    expect(archiveService.extract).not.toHaveBeenCalled();

    execSpy.mockRestore();
  });

  // ─── extractRemoteHost edge cases (via resolveLocalPath → processImport) ────

  it("extractRemoteHost: URL with port → hostname extracted without port", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getDownloader.mockResolvedValue({
      id: "d1",
      name: "NAS",
      url: "http://nas.local:8080",
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/downloads/game.zip");

    expect(pathService.translatePath).toHaveBeenCalledWith("/downloads/game.zip", "nas.local");
  });

  it("extractRemoteHost: downloader URL without a scheme still yields a host", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getDownloader.mockResolvedValue({
      id: "d1",
      name: "NAS",
      url: "nas.local/downloads",
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/downloads/game.zip");

    expect(pathService.translatePath).toHaveBeenCalledWith("/downloads/game.zip", "nas.local");
  });

  // ─── processImport: path goes through path mapping ──────────────────────────

  it("processImport: remote path is translated via PathMappingService before strategy receives it", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getDownloader.mockResolvedValue({
      id: "d1",
      name: "Downloader",
      url: "http://remote:9091",
    });
    pathService.translatePath.mockResolvedValue("/local/downloads/game.zip");

    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const planSpy = vi.spyOn(PCImportStrategy.prototype, "planImport").mockResolvedValue({
      needsReview: false,
      originalPath: "/local/downloads/game.zip",
      proposedPath: "/data/PC/Game",
      strategy: "pc",
    });
    const execSpy = vi.spyOn(PCImportStrategy.prototype, "executeImport").mockResolvedValue({
      destDir: "/data/PC/Game",
      filesPlaced: ["/data/PC/Game/game.exe"],
      modeUsed: "move",
      conflictsResolved: [],
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/downloads/game.zip");

    expect(planSpy).toHaveBeenCalledWith(
      "/local/downloads/game.zip",
      expect.anything(),
      expect.anything(),
      expect.anything(),
      "PC"
    );

    planSpy.mockRestore();
    execSpy.mockRestore();
  });

  // ─── processImport: needsReview → manual_review_required ────────────────────

  it("processImport: strategy returns needsReview true → status set to manual_review_required", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadTitle: "",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });

    const { PCImportStrategy } = await import("../services/ImportStrategies.js");
    const planSpy = vi.spyOn(PCImportStrategy.prototype, "planImport").mockResolvedValue({
      needsReview: true,
      reviewReason: "Multiple files found, cannot determine primary",
      originalPath: "/data/downloads/file.iso",
      proposedPath: undefined,
      strategy: "pc",
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );

    await manager.processImport("dl-1", "/remote/path");

    expect(storage.updateGameDownloadStatus).toHaveBeenCalledWith("dl-1", "manual_review_required");

    planSpy.mockRestore();
  });

  // ─── autoDeleteAfterImport ────────────────────────────────────────────────────

  function setupSuccessfulImport(transferMode: string, autoDeleteAfterImport = true) {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadHash: "abc123",
      downloadTitle: "Game",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getDownloader.mockResolvedValue({ id: "d1", name: "qBit", url: "http://localhost" });
    storage.getImportConfig.mockResolvedValue(
      makeImportConfig({
        transferMode: transferMode as never, // NOSONAR
        autoDeleteAfterImport,
        overwriteExisting: true,
      })
    );
  }

  it("autoDeleteAfterImport: calls removeDownload for copy mode", async () => {
    setupSuccessfulImport("copy");

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    await manager.processImport("dl-1", "/remote/path");

    expect(downloadersMock.removeDownload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "d1" }),
      "abc123",
      true
    );
  });

  it("autoDeleteAfterImport: calls removeDownload for move mode", async () => {
    setupSuccessfulImport("move");

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    await manager.processImport("dl-1", "/remote/path");

    expect(downloadersMock.removeDownload).toHaveBeenCalledWith(
      expect.objectContaining({ id: "d1" }),
      "abc123",
      true
    );
  });

  it("autoDeleteAfterImport: does NOT call removeDownload for hardlink mode", async () => {
    setupSuccessfulImport("hardlink");

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    await manager.processImport("dl-1", "/remote/path");

    expect(downloadersMock.removeDownload).not.toHaveBeenCalled();
  });

  it("autoDeleteAfterImport: does NOT call removeDownload for symlink mode", async () => {
    setupSuccessfulImport("symlink");

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    await manager.processImport("dl-1", "/remote/path");

    expect(downloadersMock.removeDownload).not.toHaveBeenCalled();
  });

  it("autoDeleteAfterImport: does NOT call removeDownload when import fails", async () => {
    storage.getGameDownload.mockResolvedValue({
      id: "dl-1",
      gameId: "g1",
      downloaderId: "d1",
      downloadHash: "abc123",
      downloadTitle: "Game",
    });
    storage.getGame.mockResolvedValue({
      id: "g1",
      title: "My Game",
      userId: "u1",
      status: "wanted",
      platforms: [6],
    });
    storage.getImportConfig.mockResolvedValue(
      makeImportConfig({ transferMode: "copy", autoDeleteAfterImport: true })
    );
    fsMock.pathExists.mockResolvedValue(false); // force retry/path-inaccessible path

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    await manager.processImport("dl-1", "/remote/path");

    expect(downloadersMock.removeDownload).not.toHaveBeenCalled();
  });

  it("autoDeleteAfterImport: creates notification when removeDownload fails", async () => {
    setupSuccessfulImport("copy");
    downloadersMock.removeDownload.mockResolvedValue({
      success: false,
      message: "Torrent not found",
    });

    const manager = new ImportManager(
      storage as never, // NOSONAR
      pathService as never, // NOSONAR
      platformService as never, // NOSONAR
      archiveService as never // NOSONAR
    );
    await manager.processImport("dl-1", "/remote/path");

    expect(storage.addNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "warning",
        title: "Auto-delete failed",
      })
    );
  });
});
