"use client";

import { useEffect, useState } from "react";

/**
 * In-Memory-Cache: öffentliche Pfade → Object-URL, damit dieselbe Marken-Grafik
 * beim erneuten Öffnen der Seite nicht erneut aus dem Netz geladen wird.
 */
const objectUrlByPublicPath = new Map<string, string>();

function getSyncDisplaySrc(href: string): string {
  if (typeof window === "undefined") return href;
  return objectUrlByPublicPath.get(href) ?? href;
}

type MarketplaceBrandImgProps = {
  src: string;
  alt: string;
  className?: string;
};

/**
 * Marktplatz-Logos unter `/public` — nach erstem Fetch als Blob-URL gecacht, weiteres Laden entfällt.
 */
export function MarketplaceBrandImg({ src, alt, className }: MarketplaceBrandImgProps) {
  const [, forceRefresh] = useState(0);
  const displaySrc = getSyncDisplaySrc(src);

  useEffect(() => {
    const cached = objectUrlByPublicPath.get(src);
    if (cached) {
      return;
    }
    let cancelled = false;
    fetch(src, { cache: "force-cache" })
      .then((r) => r.blob())
      .then((blob) => {
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        objectUrlByPublicPath.set(src, url);
        forceRefresh((v) => v + 1);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [src]);

  return (
    <img src={displaySrc} alt={alt} className={className} loading="lazy" decoding="async" />
  );
}
