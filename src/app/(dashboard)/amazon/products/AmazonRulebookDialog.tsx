"use client";

import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type RulebookResponse = {
  content?: string;
  path?: string;
  error?: string;
};

export function AmazonRulebookDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [content, setContent] = useState("");
  const [sourcePath, setSourcePath] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loadedOnce, setLoadedOnce] = useState(false);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    const lines = content.split(/\r?\n/);
    const out: Array<{ lineNo: number; text: string }> = [];
    for (let i = 0; i < lines.length; i += 1) {
      const line = lines[i] ?? "";
      if (line.toLowerCase().includes(q)) {
        out.push({ lineNo: i + 1, text: line });
      }
      if (out.length >= 30) break;
    }
    return out;
  }, [content, query]);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/amazon/rulebook", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as RulebookResponse;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setContent(json.content ?? "");
      setSourcePath(json.path ?? null);
      setLoadedOnce(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regelwerk konnte nicht geladen werden.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || loadedOnce) return;
    void load();
  }, [open, loadedOnce]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/amazon/rulebook", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      });
      const json = (await res.json().catch(() => ({}))) as RulebookResponse;
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      setSourcePath(json.path ?? sourcePath);
      toast.success("Amazon-Regelwerk gespeichert.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Regelwerk konnte nicht gespeichert werden.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        Amazon-Regelwerk
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[94vh] !w-[min(1560px,calc(100vw-1rem))] !max-w-[min(1560px,calc(100vw-1rem))] sm:!max-w-[min(1560px,calc(100vw-1rem))] overflow-x-hidden overflow-y-auto p-0">
          <div className="flex flex-col gap-3 p-4">
            <DialogHeader>
              <DialogTitle>Amazon Regelwerk Haustierbedarf</DialogTitle>
              <DialogDescription>
                Regeln durchsuchen, bearbeiten und speichern. Quelle: {sourcePath ?? "nicht geladen"}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative min-w-[20rem] flex-1">
                <Search className="pointer-events-none absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Regeln durchsuchen (ID, Begriff, Abschnitt)..."
                  className="pl-8"
                />
              </div>
              <Button type="button" variant="outline" onClick={() => void load()} disabled={loading || saving}>
                Neu laden
              </Button>
              <Button type="button" onClick={() => void save()} disabled={loading || saving}>
                {saving ? "Speichert..." : "Speichern"}
              </Button>
            </div>

            {query.trim() ? (
              <div className="rounded border p-2 text-xs">
                <div className="mb-1 font-medium">
                  Treffer: {matches.length}
                  {matches.length >= 30 ? " (gekürzt)" : ""}
                </div>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {matches.map((m) => (
                    <div key={`${m.lineNo}:${m.text}`} className="font-mono">
                      <span className="mr-2 text-muted-foreground">L{m.lineNo}</span>
                      <span>{m.text || " "}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              wrap="soft"
              className="min-h-[68vh] font-mono text-xs leading-5 [overflow-wrap:anywhere]"
              placeholder={loading ? "Lade Regelwerk..." : "Regelwerk-Inhalt"}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

