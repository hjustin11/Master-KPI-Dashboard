"use client";

import { useEffect, useRef, useState } from "react";
import type { XentralPrimaryAddressFieldKey } from "@/shared/lib/xentralPrimaryAddressFields";
import { issuesNeedAddressGeocode } from "@/shared/lib/shippingAddressValidation";

type SuggestBest = {
  streetLine: string;
  postcode: string;
  city: string;
  displayName: string;
};

function norm(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export type AddressGeocodeCorrectionHints = {
  street?: { from: string; to: string };
  zip?: { from: string; to: string };
  city?: { from: string; to: string };
} | null;

export type AddressGeocodeSuggestProps = {
  dialogOpen: boolean;
  rowId: string;
  rowIndex: number;
  street: string;
  zipValue: string;
  zipKey: XentralPrimaryAddressFieldKey;
  cityValue: string;
  cityKey: XentralPrimaryAddressFieldKey;
  country: string;
  issues: string[];
  /** Entwurf: Straße, PLZ und Ort in einem Schritt (kein „Speichern“ zur Hauptliste). */
  onApplyGeocode: (patch: {
    street?: string;
    zipKey: XentralPrimaryAddressFieldKey;
    zip?: string;
    cityKey: XentralPrimaryAddressFieldKey;
    city?: string;
  }) => void;
};

/**
 * Server: OpenStreetMap Nominatim — strukturierte Suche.
 * Einmal pro Zeile pro Dialog-Öffnung; schreibt nur in den Dialog-Entwurf (via onApplyGeocode).
 */
export function useAddressGeocodeSuggest({
  dialogOpen,
  rowId,
  rowIndex,
  street,
  zipValue,
  zipKey,
  cityValue,
  cityKey,
  country,
  issues,
  onApplyGeocode,
}: AddressGeocodeSuggestProps): {
  loading: boolean;
  hints: AddressGeocodeCorrectionHints;
} {
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [hints, setHints] = useState<AddressGeocodeCorrectionHints>(null);

  const appliedRef = useRef(false);
  const streetRef = useRef(street);
  const zipRef = useRef(zipValue);
  const cityRef = useRef(cityValue);
  const countryRef = useRef(country);
  const issuesRef = useRef(issues);
  const onApplyGeocodeRef = useRef(onApplyGeocode);
  const zipKeyRef = useRef(zipKey);
  const cityKeyRef = useRef(cityKey);

  useEffect(() => {
    streetRef.current = street;
    zipRef.current = zipValue;
    cityRef.current = cityValue;
    countryRef.current = country;
    issuesRef.current = issues;
    onApplyGeocodeRef.current = onApplyGeocode;
    zipKeyRef.current = zipKey;
    cityKeyRef.current = cityKey;
  }, [street, zipValue, cityValue, country, issues, onApplyGeocode, zipKey, cityKey]);

  useEffect(() => {
    if (!dialogOpen) {
      appliedRef.current = false;
      queueMicrotask(() => {
        setStatus("idle");
        setHints(null);
      });
      return;
    }

    const iss0 = issuesRef.current;
    const st0 = streetRef.current;
    const z0 = zipRef.current;
    const city0 = cityRef.current.trim();
    const hasAddressHint = st0.trim().length > 0 || z0.trim().length > 0 || city0.length > 0;

    if (iss0.length === 0 || !hasAddressHint || !issuesNeedAddressGeocode(iss0)) {
      queueMicrotask(() => {
        setStatus("idle");
        setHints(null);
      });
      return;
    }

    appliedRef.current = false;
    queueMicrotask(() => {
      setHints(null);
      setStatus("loading");
    });

    const staggerMs = rowIndex * 1100;
    const debounceMs = 600;
    let cancelled = false;

    const t = window.setTimeout(() => {
      void (async () => {
        const iss = issuesRef.current;
        const st = streetRef.current;
        const z = zipRef.current;
        const cityLive = cityRef.current.trim();
        const hasHint = st.trim().length > 0 || z.trim().length > 0 || cityLive.length > 0;

        if (iss.length === 0 || !hasHint || !issuesNeedAddressGeocode(iss)) {
          if (!cancelled) setStatus("idle");
          return;
        }

        try {
          const res = await fetch("/api/address-suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              street: st,
              postalcode: z,
              city: cityLive,
              country: countryRef.current || "DE",
            }),
          });
          if (cancelled) return;
          if (!res.ok) {
            setStatus("done");
            return;
          }
          const json = (await res.json()) as { best: SuggestBest | null };
          const best = json.best;
          if (!best || (!best.postcode && !best.streetLine && !best.city)) {
            setStatus("done");
            return;
          }

          const curStreet = streetRef.current;
          const curZip = zipRef.current;
          const curCity = cityRef.current.trim();
          const zk = zipKeyRef.current;
          const ck = cityKeyRef.current;

          const newStreet = best.streetLine.trim();
          const newZip = best.postcode.trim();
          const newCity = best.city.trim();

          let streetPair: { from: string; to: string } | undefined;
          let zipPair: { from: string; to: string } | undefined;
          let cityPair: { from: string; to: string } | undefined;

          if (newStreet && norm(newStreet) !== norm(curStreet)) {
            streetPair = { from: curStreet || "—", to: newStreet };
          }
          if (newZip && norm(newZip) !== norm(curZip)) {
            zipPair = { from: curZip || "—", to: newZip };
          }
          if (newCity && norm(newCity) !== norm(curCity)) {
            cityPair = { from: curCity || "—", to: newCity };
          }

          if (!streetPair && !zipPair && !cityPair) {
            setStatus("done");
            return;
          }

          if (!appliedRef.current) {
            appliedRef.current = true;
            onApplyGeocodeRef.current({
              street: streetPair?.to,
              zipKey: zk,
              zip: zipPair?.to,
              cityKey: ck,
              city: cityPair?.to,
            });
          }

          const nextHints: NonNullable<AddressGeocodeCorrectionHints> = {};
          if (streetPair) nextHints.street = streetPair;
          if (zipPair) nextHints.zip = zipPair;
          if (cityPair) nextHints.city = cityPair;
          setHints(Object.keys(nextHints).length > 0 ? nextHints : null);
          setStatus("done");
        } catch {
          if (!cancelled) setStatus("done");
        }
      })();
    }, staggerMs + debounceMs);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [dialogOpen, rowId, rowIndex]);

  return {
    loading: status === "loading",
    hints,
  };
}
