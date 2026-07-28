import React, { useState, useMemo } from "react";
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
import { Loader2, FolderOpen, Upload, Search, Check, X, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { FileBrowser } from "./FileBrowser";
import type { Game } from "@shared/schema";

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

export default function ManualImportModal({ open, onOpenChange, game, defaultCategory }: ManualImportModalProps) {
  const { toast } = useToast();
  const [step, setStep] = useState<"browse" | "scan" | "assign" | "importing" | "done">("browse");
  const [folderBrowserOpen, setFolderBrowserOpen] = useState(false);
  const [fileBrowserOpen, setFileBrowserOpen] = useState(false);
  const [scanPath, setScanPath] = useState("");
  const [scannedFiles, setScannedFiles] = useState<ScannedFile[]>([]);
  const [assignments, setAssignments] = useState<ImportAssignment[]>([]);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0 });
  const [importResults, setImportResults] = useState<ImportResult[]>([]);

  const isSingleFile = !!game;

  const { data: userGames = [] } = useQuery<Game[]>({
    queryKey: ["/api/games"],
    enabled: open && !isSingleFile,
  });

  const { data: platformFolders = [] } = useQuery<string[]>({
    queryKey: ["/api/platform-folders"],
    enabled: open,
  });

  const handleFolderSelect = (path: string) => {
    setScanPath(path);
    setFolderBrowserOpen(false);
    setStep("scan");
  };

  const handleFileSelect = (path: string) => {
    setFileBrowserOpen(false);
    const name = path.split("/").pop() || path.split("\\").pop() || path;
    const file: ScannedFile = { name, path, size: 0, isDirectory: false };
    setScannedFiles([file]);
    setAssignments([{
      file,
      gameId: game!.id,
      gameTitle: game!.title,
      category: defaultCategory || "main",
      platformDir: "",
    }]);
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
      setStep(files.length > 0 ? "assign" : "done");
      if (files.length === 0) {
        toast({ description: "No supported files found in that location" });
      }
    },
    onError: () => {
      toast({ description: "Failed to scan path", variant: "destructive" });
    },
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      const validAssignments = assignments.filter((a) => a.gameId);
      if (validAssignments.length === 0) throw new Error("No files have a game assigned");

      const results: ImportResult[] = [];
      for (let i = 0; i < validAssignments.length; i++) {
        setImportProgress({ current: i + 1, total: validAssignments.length });
        const a = validAssignments[i];
        try {
          const body: Record<string, string> = {
            filePath: a.file.path,
            category: a.category,
          };
          if (a.platformDir) body.platformDir = a.platformDir;
          const res = await apiRequest("POST", `/api/games/${a.gameId}/manual-import`, body);
          const data = await res.json();
          if (data.success) {
            results.push({ filePath: a.file.path, success: true });
          } else {
            results.push({ filePath: a.file.path, success: false, error: data.error || "Import failed" });
          }
        } catch (err) {
          results.push({ filePath: a.file.path, success: false, error: (err as Error).message });
        }
      }
      return results;
    },
    onSuccess: (results) => {
      setImportResults(results);
      setStep("done");
      queryClient.invalidateQueries({ queryKey: ["/api/games"] });
      const successCount = results.filter((r) => r.success).length;
      toast({ description: `Imported ${successCount} of ${results.length} files` });
    },
    onMutate: () => {
      const count = assignments.filter((a) => a.gameId).length;
      toast({ description: `Importing ${count} file${count !== 1 ? "s" : ""}...` });
    },
    onError: (err: Error) => {
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
    const matching = userGames.find(
      (g) => g.title.toLowerCase().includes(query.toLowerCase())
    );
    if (matching) {
      updateAssignment(index, { gameId: matching.id, gameTitle: matching.title });
    }
  };

  const reset = () => {
    setStep("browse");
    setScanPath("");
    setScannedFiles([]);
    setAssignments([]);
    setImportResults([]);
    setImportProgress({ current: 0, total: 0 });
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-w-3xl max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Manual Import</DialogTitle>
          <DialogDescription>
            {step === "browse" && (isSingleFile ? "Select a file to import" : "Select a folder containing game files to import")}
            {step === "scan" && "Scanning folder..."}
            {step === "assign" && (isSingleFile ? "Confirm import details" : `Assign ${scannedFiles.length} file(s) to games`)}
            {step === "importing" && `Importing ${importProgress.current} of ${importProgress.total}...`}
            {step === "done" && "Import complete"}
          </DialogDescription>
        </DialogHeader>

        {step === "browse" && (
          <div className="flex flex-col items-center justify-center py-12 gap-4">
            <FolderOpen className="w-12 h-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {isSingleFile ? "Choose a file to import" : "Choose a folder to scan for game files"}
            </p>
            {isSingleFile ? (
              <Button onClick={() => setFileBrowserOpen(true)} className="gap-2">
                <Upload className="w-4 h-4" />
                Select File
              </Button>
            ) : (
              <Button onClick={() => setFolderBrowserOpen(true)} className="gap-2">
                <FolderOpen className="w-4 h-4" />
                Select Folder
              </Button>
            )}
            <FileBrowser
              open={isSingleFile ? fileBrowserOpen : folderBrowserOpen}
              onOpenChange={isSingleFile ? setFileBrowserOpen : setFolderBrowserOpen}
              onSelect={isSingleFile ? handleFileSelect : handleFolderSelect}
              root="/"
              title={isSingleFile ? "Select File to Import" : "Select Folder to Scan"}
              mode={isSingleFile ? "file" : undefined}
            />
          </div>
        )}

        {step === "scan" && (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {step === "assign" && (
          <>
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
                        <option value="extra">Extra</option>
                      </select>
                    </div>

                    {isSingleFile ? (
                      <div className="flex items-center gap-3">
                        <div className="flex-1">
                          <Label className="text-xs text-muted-foreground">Game</Label>
                          <p className="text-sm font-medium">{game!.title}</p>
                        </div>
                        <div className="w-48">
                          <Label className="text-xs text-muted-foreground">Platform</Label>
                          <select
                            value={a.platformDir}
                            onChange={(e) => updateAssignment(i, { platformDir: e.target.value })}
                            className="w-full h-8 text-xs rounded-md border border-input bg-background px-2"
                          >
                            <option value="">Auto-detect</option>
                            {platformFolders.map((pf) => (
                              <option key={pf} value={pf}>{pf}</option>
                            ))}
                          </select>
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
                            <option key={pf} value={pf}>{pf}</option>
                          ))}
                        </select>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={reset}>Back</Button>
              <Button
                onClick={() => {
                  setStep("importing");
                  executeMutation.mutate();
                }}
                disabled={!assignments.some((a) => a.gameId) || executeMutation.isPending}
                className="gap-2"
              >
                <Upload className="w-4 h-4" />
                {isSingleFile ? "Import" : `Import ${assignments.filter((a) => a.gameId).length} file(s)`}
              </Button>
            </div>
          </>
        )}

        {step === "importing" && (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-sm font-medium">
              Importing {importProgress.current} of {importProgress.total}...
            </p>
            <p className="text-xs text-muted-foreground">{scanPath}</p>
          </div>
        )}

        {step === "done" && (
          <div className="space-y-3">
            <ScrollArea className="max-h-64 border rounded-md">
              <div className="divide-y">
                {importResults.map((r, i) => (
                  <div key={i} className="flex items-center gap-3 p-3 text-sm">
                    {r.success ? (
                      <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : (
                      <AlertCircle className="w-4 h-4 text-destructive shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="truncate">{r.filePath.split("/").pop()}</p>
                      {!r.success && <p className="text-xs text-destructive">{r.error}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </ScrollArea>
            <div className="flex justify-between items-center pt-2">
              <p className="text-sm text-muted-foreground">
                {importResults.filter((r) => r.success).length} succeeded, {importResults.filter((r) => !r.success).length} failed
              </p>
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}