"use client";

import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

/**
 * PWA-Install-Trigger für die Header-Titelleiste.
 *
 * - Chrome/Edge/Android: nutzt das `beforeinstallprompt`-Event und ruft bei
 *   Klick `prompt()` auf — der Browser zeigt dann den nativen Install-Dialog
 * - iOS Safari: feuert das Event nicht, daher zeigen wir bei iPad/iPhone-UA
 *   einen Hint-Dialog mit Anleitung „Teilen → Zum Home-Bildschirm"
 * - Wenn die App bereits installiert läuft (display-mode: standalone), wird
 *   der Button ausgeblendet
 *
 * Sichtbarkeit: ab `md:` (Tablet+) — auf Phones ist die UI ohnehin eng, auf
 * Desktop ist Browser-Nutzung der Standard.
 */

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function detectIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // iPad mit iPadOS 13+ identifiziert sich als Mac mit Touch — beides abdecken
  const isIpad = /iPad/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isIphone = /iPhone|iPod/.test(ua);
  return isIpad || isIphone;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  if (window.matchMedia("(display-mode: standalone)").matches) return true;
  // iOS Safari nutzt das non-standard `navigator.standalone`-Flag
  const navWithStandalone = navigator as Navigator & { standalone?: boolean };
  return Boolean(navWithStandalone.standalone);
}

export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [iosHintOpen, setIosHintOpen] = useState(false);
  const [isIos, setIsIos] = useState(false);

  useEffect(() => {
    // Detection auf den nächsten Frame defern — vermeidet kaskadierende
    // Renders direkt im Effect (react-hooks/set-state-in-effect).
    const detectId = requestAnimationFrame(() => {
      setIsIos(detectIos());
      setIsInstalled(isStandalone());
    });

    const onBeforeInstallPrompt = (event: Event) => {
      // Default-Mini-Infobar unterdrücken, eigenen Button steuern lassen
      event.preventDefault();
      setDeferredPrompt(event as BeforeInstallPromptEvent);
    };
    const onAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      cancelAnimationFrame(detectId);
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  if (isInstalled) return null;

  const canPrompt = deferredPrompt !== null;
  const showButton = canPrompt || isIos;
  if (!showButton) return null;

  const handleClick = async () => {
    if (canPrompt && deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") setIsInstalled(true);
      setDeferredPrompt(null);
      return;
    }
    if (isIos) {
      setIosHintOpen(true);
    }
  };

  return (
    <>
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={handleClick}
        className="hidden md:inline-flex"
        title="Dashboard als App installieren"
      >
        <Download className="h-4 w-4" />
        <span className="sr-only">Dashboard als App installieren</span>
      </Button>

      <Dialog open={iosHintOpen} onOpenChange={setIosHintOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Dashboard als App installieren</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm text-muted-foreground">
            <p>
              Auf dem iPad / iPhone funktioniert die Installation in wenigen Schritten direkt aus
              Safari heraus:
            </p>
            <ol className="list-decimal space-y-2 pl-5">
              <li>
                Tippe unten in der Safari-Leiste auf das{" "}
                <span className="inline-flex items-center gap-1 align-middle">
                  <Share className="h-3.5 w-3.5" aria-hidden /> <strong>Teilen</strong>
                </span>{" "}
                -Symbol.
              </li>
              <li>
                Wähle <strong>{"„Zum Home-Bildschirm"}</strong> aus der Liste.
              </li>
              <li>
                Bestätige mit <strong>{"„Hinzufügen"}</strong> — fertig, das Dashboard erscheint als
                eigenständige App auf deinem Home-Bildschirm.
              </li>
            </ol>
            <p className="text-xs">
              Tipp: nach der Installation startet das Dashboard ohne Browser-Leiste, ähnlich einer
              echten App.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={() => setIosHintOpen(false)}>
              <X className="h-4 w-4" />
              Schließen
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
