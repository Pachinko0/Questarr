import { describe, expect, it } from "vitest";
import { assessLibraryTarget } from "../library-path.js";

describe("assessLibraryTarget", () => {
  const libraryRoot = "/library";

  it("rejects the library root itself", () => {
    expect(assessLibraryTarget(libraryRoot, "/library")).toEqual({
      safe: false,
      resolvedTarget: expect.any(String),
      reason: "library-root",
    });
  });

  it("rejects a shared platform directory", () => {
    expect(assessLibraryTarget(libraryRoot, "/library/PC")).toEqual({
      safe: false,
      resolvedTarget: expect.any(String),
      reason: "shared-platform-directory",
    });
  });

  it("accepts a game target below a platform directory", () => {
    expect(assessLibraryTarget(libraryRoot, "/library/PC/Test Game").safe).toBe(true);
  });

  it("reports targets outside the configured library root", () => {
    expect(assessLibraryTarget(libraryRoot, "/other/Test Game")).toEqual({
      safe: false,
      resolvedTarget: expect.any(String),
      reason: "outside-library-root",
    });
  });
});
