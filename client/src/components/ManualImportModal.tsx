import { useState, useEffect, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Loader2, Upload, Search, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileBrowser } from "./FileBrowser";
import type { Game, ImportConfig, ImportTransferMode } from "@shared/schema";

interface ScannedFile {
  name: string;
  path: string;
  size: number;
  isDirectory: boolean;
}

interface ManualImportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  game?: Game;
  defaultCategory?: string;
}

interface ImportAssignment {
  file: ScannedFile;
  gameId: string;
  gameTitle: string;
  category: string;
  platformDir: string;
}

interface ImportResult {
  filePath: string;
  success: boolean;
  error?: string;
}

export default function ManualImportModal({
  open,
  onOpenChange,
  game,
  defaultCategory,
}: ManualImportModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"scan" | "assign">("scan");
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [assignments, setAssignments] = useState<ImportAssignment[]>([]);
  const [transferMode, setTransferMode] = useState<ImportTransferMode | "">("");
  const hasSelectedFiles = useRef(false);

  const isSingleFile = !!game;

  useEffect(() => {
    if (open) {
      setFileBrowserOpen(true);
      hasSelectedFiles.current = false;
    }
  }, [open]);

  const handleFileBrowserChange = (open: boolean) => {
    setFileBrowserOpen(open);
    if (!open && !hasSelectedFiles.current && step === "scan" && scannedFiles.length === 0) {
      onOpenChange(false);
    }
  };

  const { data: userGames = [] } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    enabled: open && !isSingleFile,
  });

  const { data: platformFolders = [] } = useQuery<string[]>({
    queryKey: ["/api/platform-folders"],
    enabled: open && !isSingleFile,
  });

  const { data: importConfig } = useQuery<ImportConfig>({
    queryKey: ["/api/imports/config"],
    enabled: open,
  });

  const libraryShortcuts = useMemo(() => {
    if (!importConfig?.libraryRoot) return undefined;
    return [{ label: "Library", path: importConfig.libraryRoot }];
  }, [importConfig]);

  useEffect(() => {
    if (open && importConfig?.transferMode && !transferMode) {
      setTransferMode(importConfig.transferMode);
    }
  }, [importConfig?.transferMode, open, transferMode]);

  const handleMultiFileSelect = (paths: string[]) => {
    hasSelectedFiles.current = true;
    setFileBrowserOpen(false);
    const files: ScannedFile[] = paths.map((p) => ({
      name: p.split("/").pop() || p.split("\\").pop() || p,
      path: p,
      size: 0,
      isDirectory: false,
    }));
    setScannedFiles(files);
    setAssignments(
      files.map((f) => ({
        file: f,
        gameId: game?.id ?? "",
        gameTitle: game?.title ?? "",
        category: defaultCategory || "main",
        platformDir: "",
      }))
    );
    setStep("assign");
  };

  const scanMutation = useMutation({
    mutationFn: async (scanPath: string) => {
      const res = await apiRequest("POST", "/api/import/manual/scan", { path: scanPath });
      return res.json();
    },
    onSuccess: (data) => {
      const files: ScannedFile[] = data.files || [];
      setScannedFiles(files);
      setAssignments(
        files.map((f: ScannedFile) => ({
          file: f,
          gameId: "",
          gameTitle: "",
          category: "main",
          platformDir: "",
        }))
      );
      setStep(files.length > 0 ? "assign" : "scan");
      if (files.length === 0) {
        toast({ description: "No supported files found in that location" });
      }
    },
    onError: () => {
      toast({ description: "Failed to scan path", variant: "destructive" });
    },
  });

  const handleFolderSelect = (path: string) => {
    hasSelectedFiles.current = true;
    setFileBrowserOpen(false);
    setStep("scan");
    scanMutation.mutate(path);
  };

  const importToastRef = useRef<ReturnType<typeof toast> | null>(null);

  const executeMutation = useMutation({
    mutationFn: async () => {
      const validAssignments = assignments.filter((a) => a.gameId);
      if (validAssignments.length === 0) throw new Error("No files have a game assigned");

      const results: ImportResult[] = [];
      for (let i = 0; i < validAssignments.length; i++) {
        const a = validAssignments[i];
        try {
          const body: Record<string, string> = {
            filePath: a.file.path,
            category: a.category,
          };
          if (a.platformDir) body.platformDir = a.platformDir;
          if (transferMode) body.transferMode = transferMode;
          const res = await apiRequest("POST", `/api/games/${a.gameId}/manual-import`, body);
          const data = await res.json();
          if (data.success) {
            results.push({ filePath: a.file.path, success: true });
          } else {
            results.push({
              filePath: a.file.path,
              success: false,
              error: data.error || "Import failed",
            });
          }
        } catch (err) {
          results.push({ filePath: a.file.path, success: false, error: (err as Error).message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      const affectedGameIds = new Set(
        assignments.filter((assignment) => assignment.gameId).map((assignment) => assignment.gameId)
      );
      for (const gameId of affectedGameIds) {
        queryClient.invalidateQueries({ queryKey: [`/api/games/${gameId}/content`] });
      }
      const successCount = results.filter((r) => r.success).length;
      if (importToastRef.current) {
        importToastRef.current.update({
          id: importToastRef.current.id,
          description: `Imported ${successCount} of ${results.length} files`,
        });
        importToastRef.current = null;
      }
    },
    onMutate: () => {
      const count = assignments.filter((a) => a.gameId).length;
      importToastRef.current = toast({
        description: `Importing ${count} file${count !== 1 ? "s" : ""}...`,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      if (importToastRef.current) {
        importToastRef.current.dismiss();
        importToastRef.current = null;
      }
      toast({ description: err.message, variant: "destructive" });
    },
  });

  const updateAssignment = (index: number, updates: Partial<ImportAssignment>) => {
    setAssignments((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], ...updates };
      return next;
    });
  };

  const handleGameSearch = (query: string, index: number) => {
    const matching = userGames.find((g) => g.title.toLowerCase().includes(query.toLowerCase()));
    if (matching) {
      updateAssignment(index, { gameId: matching.id, gameTitle: matching.title });
    }
  };

  const reset = () => {
    setStep("scan");
    setScannedFiles([]);
    setAssignments([]);
    setTransferMode("");
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (!o) reset();
      }}
    >
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual Import</DialogTitle>
          <DialogDescription>
            {step === "scan" && "Scanning folder..."}
            {step === "assign" &&
              (isSingleFile
                ? "Confirm import details"
                : `Assign ${scannedFiles.length} file(s) to games`)}
          </DialogDescription>
        </DialogHeader>

        {step === "scan" && scannedFiles.length === 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "scan" && scannedFiles.length > 0 && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "assign" && (
          <>
            <div className="flex items-center gap-3 pb-2">
              <Label
                htmlFor="manual-import-transfer-mode"
                className="text-xs text-muted-foreground whitespace-nowrap"
              >
                Transfer mode
              </Label>
              <select
                id="manual-import-transfer-mode"
                value={transferMode}
                onChange={(e) => setTransferMode(e.target.value as ImportTransferMode)}
                className="h-8 text-xs rounded-md border border-input bg-background px-2"
              >
                <option value="">Select mode...</option>
                <option value="move">Move</option>
                <option value="copy">Copy</option>
                <option value="hardlink">Hardlink</option>
                <option value="symlink">Symlink</option>
              </select>
              <p className="text-xs text-muted-foreground">
                {transferMode === "move" && "Moves the source into the library."}
                {transferMode === "copy" && "Copies the file and keeps the source."}
                {transferMode === "hardlink" &&
                  "Creates a hardlink when both paths are on the same filesystem."}
                {transferMode === "symlink" && "Creates a symbolic link to the source file."}
                {!transferMode && "Choose how files should be placed in the library."}
              </p>
            </div>
            <ScrollArea className="flex-1 border rounded-md">
              <div className="divide-y">
                {assignments.map((a, i) => (
                  <div key={i} className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{a.file.name}</p>
                        <p className="text-xs text-muted-foreground">{a.file.path}</p>
                      </div>
                      <select
                        value={a.category}
                        onChange={(e) => updateAssignment(i, { category: e.target.value })}
                        className="h-8 text-xs rounded-md border border-input bg-background px-2 ml-2"
                      >
                        <option value="main">Main Game</option>
                        <option value="dlc">DLC</option>
                        <option value="update">Update</option>
                        <option value="packs">Packs/Addons</option>
                        <option value="extra">Extra</option>
                      </select>
                    </div>

                    {isSingleFile ? (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Game</Label>
                          <p className="text-sm font-medium">{game!.title}</p>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                            <Input
                              placeholder="Search game..."
                              value={a.gameTitle}
                              onChange={(e) => {
                                updateAssignment(i, { gameTitle: e.target.value, gameId: "" });
                                handleGameSearch(e.target.value, i);
                              }}
                              className="pl-8 h-8 text-sm"
                            />
                          </div>
                          {a.gameId && (
                            <Badge variant="secondary" className="h-8">
                              <Check className="w-3 h-3 mr-1" />
                              Matched
                            </Badge>
                          )}
                        </div>
                        <select
                          value={a.platformDir}
                          onChange={(e) => updateAssignment(i, { platformDir: e.target.value })}
                          className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                        >
                          <option value="">Auto-detect</option>
                          {platformFolders.map((pf) => (
                            <option key={pf} value={pf}>
                              {pf}
                            </option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={reset}>
                Back
              </Button>
              <Button
                onClick={() => executeMutation.mutate()}
                disabled={
                  !transferMode || !assignments.some((a) => a.gameId) || executeMutation.isPending
                }
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                {isSingleFile
                  ? "Import"
                  : `Import ${assignments.filter((a) => a.gameId).length} file(s)`}
              </Button>
            </div>
          </>
        )}

        <FileBrowser
          open={fileBrowserOpen}
          onOpenChange={handleFileBrowserChange}
          onSelect={isSingleFile ? (p) => handleMultiFileSelect([p]) : handleFolderSelect}
          onMultiSelect={isSingleFile ? undefined : handleMultiFileSelect}
          root="/"
          title="Select Files or Folder"
          shortcuts={libraryShortcuts}
          multiple={!isSingleFile}
          mode={isSingleFile ? "file" : undefined}
        />
      </DialogContent>
    </Dialog>
  );
}
