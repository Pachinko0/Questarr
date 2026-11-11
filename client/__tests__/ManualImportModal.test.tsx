/** @vitest-environment jsdom */
import React from "react";
import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ManualImportModal from "../src/components/ManualImportModal";
import type { Game } from "@shared/schema";

const {
  mockApiRequest,
  mockFileBrowser,
  mockToast,
  mockInvalidateQueries,
  mockImportConfig,
  mockGames,
} = vi.hoisted(() => ({
  mockApiRequest: vi.fn(),
  mockFileBrowser: vi.fn(),
  mockToast: vi.fn(),
  mockInvalidateQueries: vi.fn(),
  mockImportConfig: {
    current: { transferMode: "move", libraryRoot: "/library" },
  },
  mockGames: {
    current: [{ id: "game-1", title: "Test Game", hidden: false }],
  },
}));

vi.mock("@/lib/queryClient", () => ({
  apiRequest: mockApiRequest,
  queryClient: { invalidateQueries: mockInvalidateQueries },
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock("@tanstack/react-query", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-query")>();
  return {
    ...actual,
    useQuery: ({ queryKey }: { queryKey: string[] }) => {
      if (queryKey[0] === "/api/games") return { data: mockGames.current };
      if (queryKey[0] === "/api/platform-folders") return { data: ["PC", "SNES"] };
      if (queryKey[0] === "/api/imports/config") return { data: mockImportConfig.current };
      return { data: undefined };
    },
    useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

vi.mock("../src/components/FileBrowser", () => ({
  FileBrowser: (props: Record<string, unknown>) => {
    mockFileBrowser(props);
    return null;
  },
}));

function getFileBrowserProps(): Record<string, unknown> {
  const props = mockFileBrowser.mock.calls.at(-1)?.[0];
  if (!props) throw new Error("FileBrowser was not rendered");
  return props as Record<string, unknown>;
}

function makeGame(): Game {
  return {
    id: "game-1",
    title: "Test Game",
    userId: "user-1",
    hidden: false,
  } as Game;
}

describe("ManualImportModal selection modes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockImportConfig.current = { transferMode: "move", libraryRoot: "/library" };
    mockApiRequest.mockResolvedValue({ ok: true, json: vi.fn().mockResolvedValue({}) });
  });

  it("uses file mode and keeps platform assignment hidden for Game Details", async () => {
    render(
      <ManualImportModal
        open
        onOpenChange={vi.fn()}
        game={makeGame()}
        defaultCategory="dlc"
        contentId={2001}
      />
    );

    await waitFor(() => expect(mockFileBrowser).toHaveBeenCalled());
    const props = getFileBrowserProps();

    expect(props.mode).toBe("file");
    expect(props.multiple).toBeUndefined();
    expect(props.onMultiSelect).toBeUndefined();
    expect(screen.queryByText("Platform folder")).not.toBeInTheDocument();

    (props.onSelect as (path: string) => void)("/downloads/expansion.bin");

    expect(await screen.findByLabelText("Category for expansion.bin")).toBeDisabled();
    expect(screen.getByText("Test Game")).toBeInTheDocument();
  });

  it("keeps folder scanning and platform assignment in standalone mode", async () => {
    render(<ManualImportModal open onOpenChange={vi.fn()} />);

    await waitFor(() => expect(mockFileBrowser).toHaveBeenCalled());
    const props = getFileBrowserProps();

    expect(props.mode).toBeUndefined();
    expect(props.multiple).toBe(true);
    expect(typeof props.onMultiSelect).toBe("function");
    expect(typeof props.onSelect).toBe("function");

    (props.onMultiSelect as (paths: string[]) => void)([
      "/downloads/game.bin",
      "/downloads/update.bin",
    ]);

    expect(await screen.findAllByLabelText(/Platform folder/)).toHaveLength(2);
    expect(screen.getByLabelText("Category for game.bin")).toBeInTheDocument();
    expect(screen.getByLabelText("Category for update.bin")).toBeInTheDocument();
  });
});
