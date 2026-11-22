import React, { useState, useEffect, useCallback } from "react";
import {
  Folder,
  File,
  ChevronRight,
  CornerLeftUp,
  Loader2,
  HardDrive,
  Clock,
  Home,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";

interface FileStats {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
}

interface BrowseResponse {
  path: string;
  parent: string;
  items: FileStats[];
}

const MAX_RECENT_PATHS = 10;

function getStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function getHistoryScope(
  root: string | undefined,
  title: string,
  historyKey: string | undefined
): string {
  return `${root ?? "library"}|${historyKey ?? title}`;
}

function getHistoryKey(
  kind: "last" | "recent",
  root: string | undefined,
  title: string,
  historyKey: string | undefined
): string {
  return `fileBrowser.${kind}.${encodeURIComponent(getHistoryScope(root, title, historyKey))}`;
}

function parseStoredPaths(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
      .slice(0, MAX_RECENT_PATHS);
  } catch {
    return [];
  }
}

function readRecentPaths(
  root: string | undefined,
  title: string,
  historyKey: string | undefined
): string[] {
  const storage = getStorage();
  if (!storage) return [];

  const scoped = parseStoredPaths(
    storage.getItem(getHistoryKey("recent", root, title, historyKey))
  );
  if (scoped.length > 0) return scoped;

  // Migrate the original unscoped keys from the fork so existing browser
  // history remains available after the scoped keys are introduced.
  return parseStoredPaths(storage.getItem("fileBrowserRecentPaths"));
}

function readLastPath(
  root: string | undefined,
  title: string,
  historyKey: string | undefined
): string | null {
  const storage = getStorage();
  if (!storage) return null;

  const scoped = storage.getItem(getHistoryKey("last", root, title, historyKey));
  if (scoped && scoped.trim().length > 0) return scoped;
  const legacy = storage.getItem("fileBrowserLastPath");
  if (legacy && legacy.trim().length > 0) return legacy;
  return null;
}

function rememberPath(
  root: string | undefined,
  title: string,
  historyKey: string | undefined,
  path: string
): string[] {
  const storage = getStorage();
  if (!storage || !path) return readRecentPaths(root, title, historyKey);

  const next = [
    path,
    ...readRecentPaths(root, title, historyKey).filter((item) => item !== path),
  ].slice(0, MAX_RECENT_PATHS);
  try {
    storage.setItem(getHistoryKey("last", root, title, historyKey), path);
    storage.setItem(getHistoryKey("recent", root, title, historyKey), JSON.stringify(next));
    // Keep the old fork's keys in sync so downgrades or another unscoped
    // browser instance retain the same last location and recent list.
    storage.setItem("fileBrowserLastPath", path);
    storage.setItem("fileBrowserRecentPaths", JSON.stringify(next));
  } catch {
    // Browsers can disable or quota-limit localStorage; selection still works.
  }
  return next;
}

interface FileBrowserProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect?: (path: string) => void;
  onMultiSelect?: (paths: string[]) => void;
  initialPath?: string;
  title?: string;
  /** Override the server-side browse root (e.g. "/" to browse the full filesystem). Defaults to library root. */
  root?: string;
  /** When "file", files can be selected individually. Folder mode selects the current directory. */
  mode?: "file" | "folder";
  /** When true, files in the current directory can be selected together. */
  multiple?: boolean;
  /** Quick-navigation locations shown above the path bar. */
  shortcuts?: Array<{ label: string; path: string }>;
  /** Separates persisted history when multiple browsers share the same title/root. */
  historyKey?: string;
}

export function FileBrowser({
  open,
  onOpenChange,
  onSelect,
  onMultiSelect,
  initialPath = "/",
  title = "Select Directory",
  root,
  mode = "folder",
  multiple = false,
  shortcuts,
  historyKey,
}: Readonly<FileBrowserProps>) {
  const [currentPath, setCurrentPath] = useState(() =>
    open ? (readLastPath(root, title, historyKey) ?? initialPath) : initialPath
  );
  const [recentPaths, setRecentPaths] = useState<string[]>(() =>
    readRecentPaths(root, title, historyKey)
  );
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(() => new Set());
  const [data, setData] = useState<BrowseResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const loadPath = useCallback(
    async (p: string, attemptFallback: boolean = true) => {
      setLoading(true);
      setError(null);
      try {
        const url =
          root !== undefined
            ? `/api/system/browse?path=${encodeURIComponent(p)}&root=${encodeURIComponent(root)}`
            : `/api/system/browse?path=${encodeURIComponent(p)}`;
        const res = await apiRequest("GET", url);
        if (!res.ok) throw new Error(`Server error: ${res.status}`);
        const data = await res.json();
        setData(data);
      } catch {
        if (attemptFallback && root !== undefined) {
          // Fall back to browsing without the explicit root (uses library root)
          try {
            const fallbackUrl = `/api/system/browse?path=${encodeURIComponent(p)}`;
            const res = await apiRequest("GET", fallbackUrl);
            if (!res.ok) throw new Error(`Server error: ${res.status}`);
            const data = await res.json();
            setData(data);
            return;
          } catch (e) {
            console.debug("[FileBrowser] Fallback browse failed:", e);
          }
        }
        // Path doesn't exist on this machine; reset to root rather than showing an error
        if (attemptFallback && p !== "/") {
          setCurrentPath("/");
          return;
        }
        setError("Failed to load directory");
      } finally {
        setLoading(false);
      }
    },
    [root]
  );

  useEffect(() => {
    if (open) {
      setCurrentPath(readLastPath(root, title, historyKey) ?? initialPath);
      setRecentPaths(readRecentPaths(root, title, historyKey));
      setSelectedFile(null);
      setSelectedFiles(new Set());
    }
  }, [open, initialPath, root, title, historyKey]);

  useEffect(() => {
    if (open) {
      loadPath(currentPath);
      setSelectedFile(null);
      setSelectedFiles(new Set());
    }
  }, [open, currentPath, loadPath]);

  const handleNavigate = (path: string) => {
    setCurrentPath(path);
  };

  const handleUp = () => {
    if (data?.parent) {
      setCurrentPath(data.parent);
    }
  };

  let scrollContent: React.ReactNode;
  if (loading) {
    scrollContent = (
      <div className="flex items-center justify-center h-40">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  } else if (error) {
    scrollContent = (
      <div className="flex items-center justify-center h-40 text-destructive">{error}</div>
    );
  } else {
    scrollContent = (
      <div className="p-1 space-y-1">
        {data?.items.length === 0 && (
          <div className="text-center text-sm text-muted-foreground py-4">Empty directory</div>
        )}
        {data?.items.map((item) =>
          item.isDirectory ? (
            <button
              key={item.path}
              type="button"
              className="flex items-center gap-2 p-2 rounded-sm cursor-pointer hover:bg-accent w-full text-left"
              onClick={() => handleNavigate(item.path)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleNavigate(item.path);
                }
              }}
            >
              <Folder className="h-4 w-4 text-blue-500" />
              <span className="text-sm flex-1 truncate">{item.name}</span>
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </button>
          ) : (
            <button
              type="button"
              key={item.path}
              className={`flex items-center gap-2 p-2 rounded-sm w-full text-left ${
                multiple || mode === "file"
                  ? "cursor-pointer hover:bg-accent"
                  : "opacity-50 cursor-default"
              }`}
              onClick={() => {
                if (multiple) {
                  setSelectedFiles((current) => {
                    const next = new Set(current);
                    if (next.has(item.path)) next.delete(item.path);
                    else next.add(item.path);
                    return next;
                  });
                } else if (mode === "file") {
                  setSelectedFile(item.path);
                }
              }}
              disabled={!multiple && mode !== "file"}
            >
              {multiple && (
                <input
                  type="checkbox"
                  aria-label={`Select ${item.name}`}
                  checked={selectedFiles.has(item.path)}
                  onChange={() => {
                    setSelectedFiles((current) => {
                      const next = new Set(current);
                      if (next.has(item.path)) next.delete(item.path);
                      else next.add(item.path);
                      return next;
                    });
                  }}
                  onClick={(event) => event.stopPropagation()}
                  className="h-4 w-4"
                />
              )}
              <File className="h-4 w-4 text-gray-500" />
              <span className="text-sm flex-1 truncate">{item.name}</span>
              {mode === "file" && !multiple && selectedFile === item.path && (
                <span className="text-xs font-semibold text-primary">Selected</span>
              )}
            </button>
          )
        )}
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl h-[500px] flex flex-col">
        <DialogHeader className="pb-2">
          <DialogTitle>{title}</DialogTitle>
          <div className="flex items-center justify-between gap-2">
            <DialogDescription className="m-0">
              {multiple
                ? "Navigate and select files"
                : mode === "file"
                  ? "Navigate and select a file"
                  : "Navigate and select a directory"}
            </DialogDescription>
            <div className="flex items-center gap-1.5">
              {shortcuts?.map((shortcut) => (
                <Button
                  key={shortcut.path}
                  variant="outline"
                  size="sm"
                  disabled={currentPath === shortcut.path}
                  onClick={() => setCurrentPath(shortcut.path)}
                  title={shortcut.path}
                  className="h-7 text-xs"
                >
                  {shortcut.label}
                </Button>
              ))}
              {currentPath !== "/" && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPath("/")}
                  className="h-7 w-7 p-0"
                  title="Root"
                  aria-label="Navigate to root"
                >
                  <Home className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex items-center gap-2 p-2 bg-muted rounded-md mb-2">
          <HardDrive className="h-4 w-4 text-muted-foreground" />
          <div className="text-sm font-mono truncate flex-1" title={currentPath}>
            {currentPath}
          </div>
          <Button
            variant="ghost"
            size="sm"
            aria-label="Navigate up"
            disabled={!data?.parent || currentPath === "/"}
            onClick={handleUp}
          >
            <CornerLeftUp className="h-4 w-4" />
          </Button>
        </div>

        {recentPaths.length > 0 && (
          <div className="mb-2 flex items-center gap-1.5 overflow-x-auto pb-0.5">
            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
            {recentPaths.slice(0, 5).map((path) => (
              <button
                key={path}
                type="button"
                className="max-w-[160px] shrink-0 truncate rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                onClick={() => setCurrentPath(path)}
                title={path}
              >
                {path.split(/[\\/]/).filter(Boolean).pop() || "/"}
              </button>
            ))}
          </div>
        )}

        <ScrollArea className="flex-1 border rounded-md">{scrollContent}</ScrollArea>

        <div className="flex justify-end pt-4 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              if (loading || !data || error) return;
              const selectedPath =
                mode === "file" && !multiple && selectedFile ? selectedFile : currentPath;
              setRecentPaths(rememberPath(root, title, historyKey, currentPath));
              onSelect?.(selectedPath);
              onOpenChange(false);
            }}
            disabled={
              loading || !data || !!error || (mode === "file" && !multiple && !selectedFile)
            }
          >
            {mode === "file" && !multiple ? "Select File" : "Select Current"}
          </Button>
          {multiple && onMultiSelect && (
            <Button
              disabled={loading || !data || !!error || selectedFiles.size === 0}
              onClick={() => {
                if (loading || !data || error || selectedFiles.size === 0) return;
                setRecentPaths(rememberPath(root, title, historyKey, currentPath));
                onMultiSelect(Array.from(selectedFiles));
                onOpenChange(false);
              }}
            >
              Select {selectedFiles.size} File{selectedFiles.size === 1 ? "" : "s"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
