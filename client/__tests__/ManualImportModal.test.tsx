/** @vitest-environment jsdom */
import React from "react";
import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import ManualImportModal from "../src/components/ManualImportModal";
import { getQueryFn } from "../src/lib/queryClient";

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("../src/components/FileBrowser", () => ({
  FileBrowser: ({ open, onSelect }: { open: boolean; onSelect: (path: string) => void }) =>
    open ? (
      <button type="button" onClick={() => onSelect("/imports")}>
        Select import folder
      </button>
    ) : null,
}));

function jsonResponse(data: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: vi.fn().mockResolvedValue(data),
    text: vi.fn().mockResolvedValue(JSON.stringify(data)),
  } as unknown as Response;
}

describe("ManualImportModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/import/manual/scan")) {
        return Promise.resolve(
          jsonResponse({
            files: [
              { name: "game.iso", path: "/imports/game.iso", size: 1024, isDirectory: false },
            ],
          })
        );
      }
      if (url.includes("/api/imports/config")) {
        return Promise.resolve(jsonResponse({ libraryRoot: "/library", transferMode: "hardlink" }));
      }
      return Promise.resolve(jsonResponse([]));
    }) as typeof fetch;
  });

  it("scans a selected folder and defaults to the configured transfer mode", async () => {
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { queryFn: getQueryFn({ on401: "throw" }), retry: false },
        mutations: { retry: false },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <ManualImportModal open onOpenChange={vi.fn()} />
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByRole("button", { name: "Select import folder" }));

    expect(await screen.findByText("game.iso")).toBeInTheDocument();
    expect(screen.getByLabelText("Transfer mode")).toHaveValue("hardlink");
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining("/api/import/manual/scan"),
        expect.objectContaining({ method: "POST", body: JSON.stringify({ path: "/imports" }) })
      );
    });
  });
});
