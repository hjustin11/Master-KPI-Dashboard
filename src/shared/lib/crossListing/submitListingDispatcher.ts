/**
 * Cross-Listing Submission Dispatcher.
 *
 * Zentraler Einstiegspunkt für Draft-Submission auf allen Marktplätzen.
 * - Amazon: nutzt die bestehende SP-API-Pipeline (`buildAmazonListingPutBody` +
 *   `submitAmazonListingItem`).
 * - Andere Marktplätze: Payload wird marktplatzgerecht gebaut und — je nach
 *   API-Reife — entweder direkt per HTTP an den MP übergeben oder als
 *   `prepared`-Status gespeichert (Payload im Draft hinterlegt, Upload im
 *   Seller-Portal-Adapter nachgelagert).
 */

import { buildAmazonListingPutBody } from "./amazonListingPayload";
import { submitAmazonListingItem } from "@/shared/lib/amazonListingsItemsPut";
import {
  DEFAULT_AMAZON_SLUG,
  getAmazonMarketplaceBySlug,
  getLanguageTagForMarketplaceId,
} from "@/shared/config/amazonMarketplaces";
import type {
  CrossListingDraftValues,
  CrossListingTargetSlug,
} from "./crossListingDraftTypes";

export type SubmissionIssue = {
  severity: "ERROR" | "WARNING" | "INFO";
  message: string;
  attributeNames?: string[];
};

export type SubmissionOutcome = {
  ok: boolean;
  status: string;
  submissionId: string | null;
  issues: SubmissionIssue[];
  httpStatus?: number;
  endpointUsed?: string;
  sandbox?: boolean;
  /** Der final gebaute, marktplatzgerechte Payload (JSON-serialisierbar). */
  preparedPayload: unknown;
  /** Wenn true, ist Upload via API noch NICHT implementiert — Payload nur vorbereitet. */
  preparedOnly: boolean;
  preparedMessage?: string;
};

export type DispatchArgs = {
  sku: string;
  values: CrossListingDraftValues;
  targetSlug: CrossListingTargetSlug;
  /** Amazon-Country-Slug (amazon-de, amazon-fr, ...) — ignoriert für Non-Amazon. */
  amazonCountrySlug?: string;
  productTypeOverride?: string;
};

// ---------------------------------------------------------------------------
// Amazon
// ---------------------------------------------------------------------------

async function dispatchAmazon(args: DispatchArgs): Promise<SubmissionOutcome> {
  const amazonCountrySlug = args.amazonCountrySlug || DEFAULT_AMAZON_SLUG;
  const cfg = getAmazonMarketplaceBySlug(amazonCountrySlug);
  if (!cfg) {
    return {
      ok: false,
      status: "CONFIG_ERROR",
      submissionId: null,
      issues: [{ severity: "ERROR", message: `Unbekannter Amazon-Slug: ${amazonCountrySlug}` }],
      preparedPayload: null,
      preparedOnly: false,
    };
  }
  const marketplaceId = cfg.marketplaceId;
  const languageTag = getLanguageTagForMarketplaceId(marketplaceId);
  const productType = args.productTypeOverride?.trim() || args.values.amazonProductType || "PET_SUPPLIES";
  const built = buildAmazonListingPutBody({
    values: args.values,
    marketplaceId,
    productType,
    sku: args.sku,
    languageTag,
  });
  if (!built.ok) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      submissionId: null,
      issues: built.errors.map((e) => ({ severity: "ERROR" as const, message: e.message, attributeNames: [e.field] })),
      preparedPayload: null,
      preparedOnly: false,
    };
  }
  const submission = await submitAmazonListingItem({
    sku: args.sku,
    marketplaceId,
    body: built.body,
  });
  const normalizedIssues: SubmissionIssue[] = submission.issues.map((iss) => ({
    severity:
      iss.severity === "ERROR" || iss.severity === "WARNING" || iss.severity === "INFO"
        ? (iss.severity as "ERROR" | "WARNING" | "INFO")
        : "INFO",
    message: iss.message,
    attributeNames: iss.attributeNames,
  }));
  return {
    ok: submission.ok,
    status: submission.status,
    submissionId: submission.submissionId,
    issues: normalizedIssues,
    httpStatus: submission.httpStatus,
    endpointUsed: submission.endpointUsed,
    sandbox: submission.sandbox,
    preparedPayload: built.body,
    preparedOnly: false,
  };
}

// ---------------------------------------------------------------------------
// Generische Payload-Builder für Non-Amazon-Marktplätze
// ---------------------------------------------------------------------------

function num(s: string): number | null {
  if (!s) return null;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function buildGenericPayload(args: DispatchArgs): Record<string, unknown> {
  const v = args.values;
  return {
    sku: args.sku,
    targetMarketplace: args.targetSlug,
    title: v.title.trim(),
    description: v.description.trim(),
    bullets: v.bullets.map((b) => b.trim()).filter(Boolean),
    images: v.images.map((u) => u.trim()).filter(Boolean),
    priceEur: num(v.priceEur),
    uvpEur: num(v.uvpEur),
    stockQty: num(v.stockQty),
    ean: v.ean.trim() || null,
    brand: v.brand.trim() || null,
    category: v.category.trim() || null,
    dimensionsCm: {
      length: num(v.dimL),
      width: num(v.dimW),
      height: num(v.dimH),
    },
    weightKg: num(v.weight),
    petSpecies: v.petSpecies.trim() || null,
    tags: v.tags,
    condition: v.condition.trim() || "Neu",
    handlingTimeDays: num(v.handlingTime),
    seo: {
      title: v.seoTitle.trim() || null,
      description: v.seoDescription.trim() || null,
    },
    attributes: v.attributes,
  };
}

// ---------------------------------------------------------------------------
// Otto Market: POST /v5/products
// ---------------------------------------------------------------------------
// Otto-API-Versionen (verifiziert April 2026 via
// /api/otto/categories-debug?diagnose=1):
//   - v1/v2/v3/v4/products → 404 "no Route matched with those values"
//   - v5/products          → 200 (produktiv, liefert existierende Listings)
// Der archivierte PHP-SDK nutzt v2 — irreführend, aber das v5-Schema ist
// (lt. Response-Sample) fast identisch mit v2/v4: ProductVariation bleibt, nur
// Zusatzfelder kamen rein (`brandId`, `moin`, `compliance`-Container).
//
// v5-Schema-Änderungen (OTTO_LISTING_UPLOAD.md §12):
//   - `compliance`-Container (2025-05-05): `productSafety` ist reingezogen,
//     plus `foodInformation` für Food/Tiernahrung (GPSR-Pflicht seit 2024-12).
//     Economic-Operator-Adressen sind Pflicht — aktuell NICHT vom Builder gesetzt
//     (→ erwarteter Validation-Error im Task-Result, dann nachziehen).
//   - `brandId`: v5-GET zeigt `brand + brandId`, aber im POST-Body scheint
//     `brand`-Name weiter erlaubt — Otto resolved intern. Falls doch nötig:
//     via `/v5/products/brands` auflösen.
//   - `additionalRequirements.reference` wurde aus Kategorien entfernt (2025-08-19).
//
// Override via env: `OTTO_PRODUCTS_API_VERSION=v6` o. ä., falls Otto bumpt.

type OttoMediaAsset = { type: "IMAGE"; location: string; filename?: string };

/** PackingUnit-Einheiten: Gewicht in GRAMM, Maße in MILLIMETER (int).
 *  Referenz: OTTO_LISTING_UPLOAD.md §9. */
type OttoPackingUnit = {
  weight?: number;
  width?: number;
  height?: number;
  length?: number;
};

type OttoProductVariation = {
  productReference: string;
  sku: string;
  ean?: string;
  productDescription: {
    category: string;
    brand: string;
    description: string;
    bulletPoints: string[];
    fscCertified: boolean;
    disposal: boolean;
    attributes: Array<{ name: string; values: string[] }>;
  };
  mediaAssets: OttoMediaAsset[];
  delivery: { type: "PARCEL" | "FORWARDING"; deliveryTime: number };
  pricing: {
    standardPrice: { amount: number; currency: string };
    vat: "FULL" | "HALF" | "NONE";
  };
  logistics: { packingUnitCount: number; packingUnits: OttoPackingUnit[] };
};

/** HTML → Plaintext. Otto's description darf kein HTML enthalten. */
function stripHtmlForOtto(raw: string): string {
  return raw
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<\/li>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function buildOttoProductVariation(args: DispatchArgs): OttoProductVariation {
  const v = args.values;
  const priceEurRaw = num(v.priceEur);
  const priceEur = priceEurRaw !== null && priceEurRaw > 0 ? priceEurRaw : 0;
  const images = v.images
    .map((u) => u.trim())
    .filter((u) => /^https:\/\//i.test(u))
    .slice(0, 10);
  const mediaAssets: OttoMediaAsset[] = images.map((url, i) => {
    const urlObj = (() => {
      try {
        return new URL(url);
      } catch {
        return null;
      }
    })();
    const filename =
      (urlObj?.pathname.split("/").filter(Boolean).pop() ?? `image-${i + 1}`) || `image-${i + 1}`;
    return { type: "IMAGE", location: url, filename };
  });

  const bullets = v.bullets
    .map((b) => stripHtmlForOtto(b).slice(0, 250))
    .filter(Boolean)
    .slice(0, 10);
  const category = v.category.trim() || v.attributes.category || "";
  const brand = v.brand.trim();

  // Otto verlangt `attributes` als Liste {name, values[]}. Wir mappen die
  // freien user-Attribute 1:1 + vermeiden Duplikate.
  const attributes: Array<{ name: string; values: string[] }> = [];
  const seenAttrNames = new Set<string>();
  for (const [key, value] of Object.entries(v.attributes)) {
    if (!key || !value.trim()) continue;
    if (["category", "brand"].includes(key)) continue;
    attributes.push({ name: key, values: [value.trim()] });
    seenAttrNames.add(key.toLowerCase());
  }
  // petSpecies → "Zielgruppe" falls nicht schon vom required-attributes-Builder gesetzt.
  if (v.petSpecies.trim() && !seenAttrNames.has("zielgruppe") && !seenAttrNames.has("tierart")) {
    attributes.push({ name: "Zielgruppe", values: [v.petSpecies.trim()] });
  }

  // PackingUnit: Xentral liefert cm + kg, Otto erwartet mm + g (integer).
  // Referenz: OTTO_LISTING_UPLOAD.md §9.
  const dimL = num(v.dimL);
  const dimW = num(v.dimW);
  const dimH = num(v.dimH);
  const weight = num(v.weight);
  const packingUnit: OttoPackingUnit = {};
  if (weight != null && weight > 0) packingUnit.weight = Math.round(weight * 1000);
  if (dimL != null && dimL > 0) packingUnit.length = Math.round(dimL * 10);
  if (dimW != null && dimW > 0) packingUnit.width = Math.round(dimW * 10);
  if (dimH != null && dimH > 0) packingUnit.height = Math.round(dimH * 10);
  const hasPackingDims = Object.keys(packingUnit).length > 0;
  const logistics: { packingUnitCount: number; packingUnits: OttoPackingUnit[] } = hasPackingDims
    ? { packingUnitCount: 1, packingUnits: [packingUnit] }
    : { packingUnitCount: 1, packingUnits: [] };

  const descriptionPlain = stripHtmlForOtto(v.description || "").slice(0, 4000);

  return {
    productReference: args.sku,
    sku: args.sku,
    ean: v.ean.trim() || undefined,
    productDescription: {
      category,
      brand,
      description: descriptionPlain,
      bulletPoints: bullets,
      fscCertified: false,
      disposal: false,
      attributes,
    },
    mediaAssets,
    delivery: {
      type: "PARCEL",
      deliveryTime: Math.max(1, Math.round(num(v.handlingTime) ?? 2)),
    },
    pricing: {
      standardPrice: { amount: priceEur, currency: "EUR" },
      vat: "FULL",
    },
    logistics,
  };
}

async function dispatchOtto(args: DispatchArgs): Promise<SubmissionOutcome> {
  const variation = buildOttoProductVariation(args);
  const payload = [variation];
  try {
    const { getOttoAccessToken, getOttoIntegrationConfig, ensureOttoProductsScope } = await import(
      "@/shared/lib/ottoApiClient"
    );
    const cfg = await getOttoIntegrationConfig();
    if (!cfg.clientId || !cfg.clientSecret) {
      return {
        ok: false,
        status: "CONFIG_ERROR",
        submissionId: null,
        issues: [
          { severity: "ERROR", message: "Otto API nicht konfiguriert (OTTO_API_CLIENT_ID/SECRET)." },
        ],
        preparedPayload: payload,
        preparedOnly: true,
      };
    }
    const scopes = ensureOttoProductsScope(cfg.scopes);
    const token = await getOttoAccessToken({
      baseUrl: cfg.baseUrl,
      clientId: cfg.clientId,
      clientSecret: cfg.clientSecret,
      scopes,
    });

    // v5 ist der aktuell aktive Pfad (verifiziert via /api/otto/categories-debug
    // ?diagnose=1 — nur /v5/products liefert 200, v1–v4 sind "no Route matched").
    // Override via `OTTO_PRODUCTS_API_VERSION` falls Otto eine neue Version rolled.
    const apiVersion = (process.env.OTTO_PRODUCTS_API_VERSION ?? "v5").trim() || "v5";
    const url = new URL(`/${apiVersion}/products`, cfg.baseUrl).toString();
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const bodyMsg =
        (json && typeof json === "object" && "message" in json &&
         typeof (json as { message?: unknown }).message === "string"
          ? (json as { message: string }).message
          : null) ??
        (json && typeof json === "object" && "errors" in json
          ? JSON.stringify((json as { errors: unknown }).errors).slice(0, 500)
          : null) ??
        (text ? text.slice(0, 500) : null);
      const hint =
        res.status === 404
          ? ` Hinweis: ${url} liefert 404. Check /api/otto/categories-debug?diagnose=1 welche Version antwortet, dann OTTO_PRODUCTS_API_VERSION=vN in der .env setzen.`
          : "";
      const errorMsg = `Otto ${res.status} bei ${url}: ${bodyMsg ?? "(leerer Response-Body)"}${hint}`;
      return {
        ok: false,
        status: `HTTP_${res.status}`,
        submissionId: null,
        issues: [{ severity: "ERROR", message: errorMsg }],
        httpStatus: res.status,
        endpointUsed: url,
        preparedPayload: payload,
        preparedOnly: false,
      };
    }

    // Erfolgreich akzeptiert — Otto verarbeitet asynchron. Wir extrahieren die
    // update-task-UUID aus der self-Link-Referenz für späteres Polling.
    // WICHTIG: das eigentliche Validation-Ergebnis (pro Variation + Errors)
    // steht erst am `result`-Link ab, NICHT hier in der Sync-Response.
    // OTTO_LISTING_UPLOAD.md §10.
    const links =
      json && typeof json === "object" && "links" in json && Array.isArray((json as { links: unknown }).links)
        ? ((json as { links: Array<{ rel?: string; href?: string }> }).links)
        : [];
    const selfLink = links.find((l) => l?.rel === "self")?.href ?? null;
    const resultLink = links.find((l) => l?.rel === "result")?.href ?? null;
    const taskUuid = selfLink ? selfLink.split("/").pop() ?? null : null;
    const state =
      json && typeof json === "object" && "state" in json && typeof (json as { state: unknown }).state === "string"
        ? ((json as { state: string }).state)
        : "pending";
    const issueMessage = taskUuid
      ? `Otto hat den Upload angenommen (state=${state}, task=${taskUuid}). Verarbeitung ist asynchron. Status: GET /v4/products/update-tasks/${taskUuid} — Pro-Variation-Fehler: GET ${resultLink ?? `/v4/products/update-tasks/${taskUuid}/result`}.`
      : `Otto hat den Upload angenommen (state=${state}). Task-UUID konnte nicht extrahiert werden.`;
    return {
      ok: true,
      status: `ACCEPTED_${state.toUpperCase()}`,
      submissionId: taskUuid,
      issues: [{ severity: "INFO", message: issueMessage }],
      httpStatus: res.status,
      endpointUsed: url,
      preparedPayload: payload,
      preparedOnly: false,
    };
  } catch (err) {
    return {
      ok: false,
      status: "EXCEPTION",
      submissionId: null,
      issues: [{ severity: "ERROR", message: err instanceof Error ? err.message : String(err) }],
      preparedPayload: payload,
      preparedOnly: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Kaufland Seller API v2: PUT /product-data/ → POST /units/
// ---------------------------------------------------------------------------
// Zwei-Schritt-Flow:
//   1. PUT  /product-data/              → Katalog-Eintrag (async, Status
//                                         per GET /product-data/status/{ean})
//   2. POST /units/                     → Seller-Angebot (Preis, Menge)
//
// Referenz: https://sellerapi.kaufland.com/?page=product-data
//           https://sellerapi.kaufland.com/?page=inventory

async function dispatchKaufland(args: DispatchArgs): Promise<SubmissionOutcome> {
  const v = args.values;
  const ean = v.ean.trim();
  if (!ean) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      submissionId: null,
      issues: [{ severity: "ERROR", message: "Kaufland erfordert EAN für Produkt-Upload." }],
      preparedPayload: null,
      preparedOnly: false,
    };
  }
  const priceEur = num(v.priceEur);
  if (priceEur === null || priceEur <= 0) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      submissionId: null,
      issues: [{ severity: "ERROR", message: "Kaufland erfordert einen gültigen Preis (>0)." }],
      preparedPayload: null,
      preparedOnly: false,
    };
  }

  try {
    const { getKauflandIntegrationConfig, kauflandSignedWrite } = await import(
      "@/shared/lib/kauflandApiClient"
    );
    const cfg = await getKauflandIntegrationConfig();
    if (!cfg.clientKey || !cfg.secretKey) {
      return {
        ok: false,
        status: "CONFIG_ERROR",
        submissionId: null,
        issues: [
          { severity: "ERROR", message: "Kaufland API nicht konfiguriert (CLIENT_KEY/SECRET_KEY)." },
        ],
        preparedPayload: null,
        preparedOnly: true,
      };
    }

    const images = v.images
      .map((u) => u.trim())
      .filter((u) => /^https:\/\//i.test(u))
      .slice(0, 10);
    const brand = v.brand.trim() || "AstroPet";
    const category = v.category.trim() || "Tierbedarf";

    // --- Schritt 1: Product-Data PUT ---
    // Kaufland erwartet `locale` als Query-Parameter, nicht im Body, und
    // im Format `de-DE` (Bindestrich), nicht `de_DE`.
    // Erlaubt: de-DE, cs-CZ, sk-SK, de-AT, pl-PL, fr-FR, it-IT, es-ES, nl-NL.
    const LOCALE_BY_STOREFRONT: Record<string, string> = {
      de: "de-DE",
      at: "de-AT",
      cz: "cs-CZ",
      sk: "sk-SK",
      pl: "pl-PL",
      fr: "fr-FR",
      it: "it-IT",
      es: "es-ES",
      nl: "nl-NL",
    };
    const locale = LOCALE_BY_STOREFRONT[cfg.storefront] ?? "de-DE";
    const productDataBody = JSON.stringify({
      ean: [ean],
      attributes: {
        title: [v.title.trim()],
        description: [v.description.trim()],
        category: [category],
        picture: images,
        manufacturer: [brand],
        ...(v.bullets.length > 0
          ? { features: v.bullets.map((b) => b.trim()).filter(Boolean).slice(0, 10) }
          : {}),
      },
    });
    const productDataRes = await kauflandSignedWrite(cfg, {
      method: "PUT",
      pathAndQuery: `/v2/product-data/?locale=${encodeURIComponent(locale)}`,
      body: productDataBody,
    });
    const productDataText = await productDataRes.text();
    if (!productDataRes.ok) {
      return {
        ok: false,
        status: `HTTP_${productDataRes.status}`,
        submissionId: null,
        issues: [
          {
            severity: "ERROR",
            message: `Kaufland product-data PUT fehlgeschlagen: ${productDataText.slice(0, 500)}`,
          },
        ],
        httpStatus: productDataRes.status,
        endpointUsed: `${cfg.baseUrl}/v2/product-data/`,
        preparedPayload: JSON.parse(productDataBody),
        preparedOnly: false,
      };
    }

    // --- Schritt 2: Unit POST (Offer anlegen) ---
    // Kaufland verlangt:
    //   - `id_offer` im Body (Seller-eigene Offer-ID, hier = SKU)
    //   - `storefront` als Query-Param, NICHT im Body
    const stockQty = Math.max(0, Math.round(num(v.stockQty) ?? 0));
    const handlingTime = Math.max(1, Math.round(num(v.handlingTime) ?? 2));
    const listingPriceCents = Math.round(priceEur * 100);
    const storefrontParam = cfg.storefront || "de";
    const unitBody = JSON.stringify({
      id_offer: args.sku,
      ean,
      condition: "NEW",
      listing_price: listingPriceCents,
      amount: stockQty,
      handling_time: handlingTime,
    });
    const unitRes = await kauflandSignedWrite(cfg, {
      method: "POST",
      pathAndQuery: `/v2/units?storefront=${encodeURIComponent(storefrontParam)}`,
      body: unitBody,
    });
    const unitText = await unitRes.text();
    let unitJson: unknown = null;
    try {
      unitJson = unitText ? JSON.parse(unitText) : null;
    } catch {
      unitJson = null;
    }
    if (!unitRes.ok) {
      return {
        ok: false,
        status: `HTTP_${unitRes.status}`,
        submissionId: null,
        issues: [
          {
            severity: "ERROR",
            message: `Kaufland units POST fehlgeschlagen (Product-Data war erfolgreich): ${unitText.slice(0, 500)}`,
          },
          {
            severity: "INFO",
            message:
              "Hinweis: Katalog-Eintrag wurde akzeptiert (product-data). Das Offer konnte nicht angelegt werden — ggf. Product-Data-Status erst abfragen (GET /product-data/status/{ean}) bevor Unit erstellt wird.",
          },
        ],
        httpStatus: unitRes.status,
        endpointUsed: `${cfg.baseUrl}/v2/units`,
        preparedPayload: { productData: JSON.parse(productDataBody), unit: JSON.parse(unitBody) },
        preparedOnly: false,
      };
    }

    const unitId =
      (unitJson && typeof unitJson === "object" && "data" in unitJson
        ? (() => {
            const d = (unitJson as { data?: unknown }).data;
            if (d && typeof d === "object" && "id_offer" in d) {
              return String((d as { id_offer?: unknown }).id_offer ?? "");
            }
            return null;
          })()
        : null) ?? null;

    return {
      ok: true,
      status: "SUBMITTED",
      submissionId: unitId,
      issues: [
        {
          severity: "INFO",
          message: `Kaufland Katalog-Eintrag + Offer erfolgreich angelegt (EAN ${ean}). Freischaltung kann wenige Minuten dauern.`,
        },
      ],
      httpStatus: unitRes.status,
      endpointUsed: `${cfg.baseUrl}/v2/units`,
      preparedPayload: { productData: JSON.parse(productDataBody), unit: JSON.parse(unitBody) },
      preparedOnly: false,
    };
  } catch (err) {
    return {
      ok: false,
      status: "EXCEPTION",
      submissionId: null,
      issues: [{ severity: "ERROR", message: err instanceof Error ? err.message : String(err) }],
      preparedPayload: null,
      preparedOnly: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Mirakl Seller API — PM01 (Katalog) + OF01 (Angebot)
// ---------------------------------------------------------------------------
// Wird genutzt für Fressnapf, Zooplus, MediaMarkt & Saturn (alle Mirakl-based).
// Flow (zwei Schritte — neues Produkt muss zuerst im Katalog landen):
//   1. PM01: POST /api/products/imports multipart mit Produkt-CSV (Titel, Description,
//      Brand, EAN, Kategorie, Medien-URLs). Antwort enthält `import_id`, asynchrone
//      Verarbeitung; Status via GET /api/products/imports/{id}.
//   2. OF01: POST /api/offers/imports multipart mit Offer-CSV (Preis, Stock,
//      Handling-Time). Antwort enthält `import_id`. Status via GET /api/offers/imports/{id}.
// Referenzen:
//   - PM01: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3/products/pm01
//   - OF01: https://developer.mirakl.com/content/product/mmp/rest/seller/openapi3/offers/of01

type MiraklAuthInfo = {
  baseUrl: string;
  apiKey: string;
  authMode: "mirakl" | "bearer" | "x-api-key";
};

async function loadMiraklAuth(slug: "fressnapf" | "zooplus" | "mediamarkt-saturn"): Promise<MiraklAuthInfo | null> {
  if (slug === "fressnapf") {
    const { getFressnapfIntegrationConfig } = await import("@/shared/lib/fressnapfApiClient");
    const cfg = await getFressnapfIntegrationConfig();
    if (!cfg.apiKey || !cfg.baseUrl) return null;
    return { baseUrl: cfg.baseUrl, apiKey: cfg.apiKey, authMode: cfg.authMode };
  }
  const { getFlexIntegrationConfig, FLEX_MARKETPLACE_ZOOPLUS_SPEC, FLEX_MARKETPLACE_MMS_SPEC } =
    await import("@/shared/lib/flexMarketplaceApiClient");
  const spec = slug === "zooplus" ? FLEX_MARKETPLACE_ZOOPLUS_SPEC : FLEX_MARKETPLACE_MMS_SPEC;
  const cfg = await getFlexIntegrationConfig(spec);
  if (!cfg.apiKey || !cfg.baseUrl) return null;
  // Mirakl-based Flex marketplaces use "mirakl" auth mode (Authorization: <apiKey>)
  return {
    baseUrl: cfg.baseUrl,
    apiKey: cfg.apiKey,
    authMode: "mirakl",
  };
}

function miraklAuthHeader(auth: MiraklAuthInfo): Record<string, string> {
  if (auth.authMode === "x-api-key") return { "X-API-Key": auth.apiKey };
  if (auth.authMode === "bearer") return { Authorization: `Bearer ${auth.apiKey}` };
  return { Authorization: auth.apiKey };
}

function csvEscape(value: string): string {
  const needsQuoting = /[";\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuoting ? `"${escaped}"` : escaped;
}

/**
 * RFC-4180-ähnlicher CSV-Parser mit Auto-Delimiter-Erkennung (`;` oder `,`).
 * Respektiert `"..."`-Quoting inkl. `""`-Escape und erlaubt Delimiter + Newlines
 * innerhalb eines gequoteten Feldes. Nötig, weil Mirakl-Error-Reports die
 * Original-Description zurückspiegeln — dort stecken `;`-Zeichen (z. B. in
 * `&nbsp;` / `&bull;`) die einen naiven `split(";")` zerlegen würden.
 */
function parseCsvQuoted(text: string): string[][] {
  const firstLineEnd = text.search(/\r?\n/);
  const headerSample = firstLineEnd >= 0 ? text.slice(0, firstLineEnd) : text;
  const delim = (headerSample.match(/;/g)?.length ?? 0) >= (headerSample.match(/,/g)?.length ?? 0)
    ? ";"
    : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === delim) {
      row.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i += 1;
      row.push(field);
      field = "";
      if (row.some((c) => c.length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += ch;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    if (row.some((c) => c.length > 0)) rows.push(row);
  }
  return rows;
}

async function buildMiraklProductCsv(
  args: DispatchArgs,
  slug: "fressnapf" | "zooplus" | "mediamarkt-saturn"
): Promise<string> {
  const v = args.values;
  const ean = v.ean.trim();
  const brand = v.brand.trim() || "";
  // Fressnapf-PM01 cap (Error 2004): `title (Produktname)` max. 40 Zeichen,
  // andere Mirakl-Operatoren erlauben Mirakl-Standard 200.
  const titleMaxLen = slug === "fressnapf" ? 40 : 200;
  const title = (v.title.trim() || args.sku).slice(0, titleMaxLen);
  const description = (v.description.trim() || title).slice(0, 4000);
  let category = v.category.trim() || (v.attributes.category ?? "").toString().trim();
  let animalCategory: string | null = null;
  let isAnimalHierarchy = false;
  // Fressnapf: PM01 erwartet einen Mirakl-Hierarchy-Code (z. B. "marketplace_animal_housing").
  // Alte WGR-Codes (z. B. "201005") werden vom Catalog mit "category is unknown" abgelehnt.
  if (slug === "fressnapf") {
    const { resolveFressnapfCategoryCode, detectFressnapfAnimalCategory } = await import(
      "./fressnapfCategories"
    );
    const resolved = resolveFressnapfCategoryCode(category);
    if (resolved) category = resolved;
    isAnimalHierarchy = /^marketplace_animal_/.test(category) || category === "marketplace_cat_litter";
    // Alle Tierart-hinweisenden Texte einbeziehen (Titel, Bullets, Description,
    // petSpecies-Feld, attributes) — Fressnapf lehnt `animal_categories`-leer ab.
    // UI-Werte → Fressnapf-Codes aus /api/values_lists (nicht generisch "bird"/"fish"!)
    const petSpeciesGerman = (v.petSpecies || "").toLowerCase();
    const petSpeciesCode = ({
      katze: "cat",
      hund: "dog",
      kleintier: "small_animal",
      vogel: "ornamental_bird",
      fisch: "aquarium_fish",
      pferd: "horse",
    } as Record<string, string>)[petSpeciesGerman] ?? null;
    animalCategory =
      petSpeciesCode ??
      detectFressnapfAnimalCategory(`${v.title} ${v.description} ${v.bullets.join(" ")}`) ??
      // Heuristischer Default für Cat-Litter-Kategorie (offensichtlich Katze).
      (category === "marketplace_cat_litter" ? "cat" : null);
  }
  // MediaMarkt/Saturn: PM01 erwartet einen Kategorie-**Pfad** (z. B.
  // "PET CARE / PET WELFARE / HYGIENE" oder "Handelsware|Katzentoilette"),
  // KEINE FET_FRA_NNNN-Codes — das sind MMS-interne IDs, die nur in Offers
  // sichtbar werden. Beweis: XML-Templates aus dem Backoffice (siehe
  // content/marketplace_guidelines/mediamarkt-saturn.md).
  let mmsIsPetCare = false;
  let mmsAnimalSpecies: string | null = null;
  if (slug === "mediamarkt-saturn") {
    const { resolveMediaMarktCategoryCode } = await import("./mediaMarktSaturnCategories");
    const resolved = resolveMediaMarktCategoryCode(category);
    if (resolved) category = resolved;
    mmsIsPetCare = /\bPET CARE\b/i.test(category) || /katzentoilette/i.test(category);
    // MMS erwartet im PET-CARE-Zweig `PROD_FEAT_15670` (Tierart). Mapping
    // deutsche UI-Labels → MMS-Listen-Werte (LIST-Attribut, nicht Freitext).
    const petSpeciesGerman = (v.petSpecies || "").toLowerCase();
    mmsAnimalSpecies = ({
      katze: "Katze",
      hund: "Hund",
      kleintier: "Kleintier",
      vogel: "Vogel",
      fisch: "Fisch",
      pferd: "Pferd",
    } as Record<string, string>)[petSpeciesGerman] ?? null;
  }
  const bulletLines = v.bullets
    .map((b) => b.trim())
    .filter(Boolean)
    .slice(0, 5);
  const images = v.images
    .map((i) => (typeof i === "string" ? i.trim() : ""))
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 12);
  // Mirakl-PM01-Standard-Template-Spalten für Fressnapf:
  //   sku, product-sku, category, hierarchy, product-title, description, brand,
  //   ean, bullet-1..bullet-5, main-image, media-url-1..N
  // `product-id` / `product-id-type` gehört NICHT in PM01 — das sind OF01-Felder.
  //
  // **Beide Spalten `category` + `hierarchy`** senden:
  //  - `category`: Fressnapf verlangt die Spalte (sonst 1004 "could not be identified")
  //  - `hierarchy`: Mirakl-Standard für Hierarchy-Zuweisung
  //  Wir schreiben in beide denselben Code — Fressnapf ignoriert die nicht-
  //  matchende Spalte. Wenn die Werte unterschiedlich wären, könnte man hier
  //  einen User-eigenen Kategorie-Code aus dem Backoffice setzen.
  const maxMedia = 9;
  const headers: string[] = [
    "sku",
    "product-sku",
    "category",
    "hierarchy",
    "product-title",
    "description",
    "brand",
    "ean",
  ];
  const row: string[] = [
    args.sku,
    args.sku,
    category,
    category,
    title.slice(0, 200),
    description,
    brand,
    ean,
  ];
  // Bullet-1..Bullet-5 als separate Spalten (Mirakl-Standard, nicht pipe-joined).
  for (let i = 0; i < 5; i += 1) {
    headers.push(`bullet-${i + 1}`);
    row.push(bulletLines[i] ?? "");
  }
  // Haupt-Bild + zusätzliche Medien.
  headers.push("main-image");
  row.push(images[0] ?? "");
  for (let i = 0; i < maxMedia; i += 1) {
    headers.push(`media-url-${i + 1}`);
    row.push(images[i + 1] ?? "");
  }
  // Dimension/Gewicht wenn vorhanden (Mirakl-Standard-Attribute).
  const dimL = num(v.dimL);
  const dimW = num(v.dimW);
  const dimH = num(v.dimH);
  const weight = num(v.weight);
  if (dimL !== null) {
    headers.push("product-length");
    row.push(dimL.toString());
  }
  if (dimW !== null) {
    headers.push("product-width");
    row.push(dimW.toString());
  }
  if (dimH !== null) {
    headers.push("product-height");
    row.push(dimH.toString());
  }
  if (weight !== null) {
    headers.push("product-weight");
    row.push(weight.toString());
  }
  // Fressnapf verlangt pro Hierarchie Pflicht-Attribute (z. B. `animal_categories`
  // für alle `marketplace_animal_*`-Kategorien). Ohne diesen Wert wird der
  // Upload abgelehnt. Wir schreiben die Spalte immer, wenn die Hierarchie
  // tierbezogen ist — ein leerer Wert führt zu einer klaren Rejection-Message
  // ("animal_categories is required") statt eines Kategorie-Fehlers.
  if (slug === "fressnapf" && isAnimalHierarchy) {
    headers.push("animal_categories");
    row.push(animalCategory ?? "");
  }
  // MediaMarkt/Saturn: PET-CARE-Pfade verlangen `PROD_FEAT_15670` (Tierart) +
  // `ATTR_PROD_MP_Manufacturer_PartNumber` (MPN) — siehe Content-Guidelines
  // Q1 2022. Ohne diese schlagen PM01-Validierungen mit `AGE`/`ATC` fehl.
  // Zusätzliche Bilder werden bei MMS als `ATTR_PROD_MP_AdditionalImage1..N`
  // erwartet, parallel zum Mirakl-Standard `media-url-*`.
  if (slug === "mediamarkt-saturn") {
    if (mmsIsPetCare && mmsAnimalSpecies) {
      headers.push("PROD_FEAT_15670");
      row.push(mmsAnimalSpecies);
    }
    const mpn = (v.attributes.mpn ?? v.attributes.manufacturerPartNumber ?? "").toString().trim();
    if (mpn) {
      headers.push("ATTR_PROD_MP_Manufacturer_PartNumber");
      row.push(mpn);
    }
    const variantGroupCode = (v.attributes.variantGroupCode ?? "").toString().trim();
    if (variantGroupCode) {
      headers.push("ATTR_PROD_MP_VariantGroupCode");
      row.push(variantGroupCode);
    }
    for (let i = 0; i < Math.min(images.length - 1, 9); i += 1) {
      headers.push(`ATTR_PROD_MP_AdditionalImage${i + 1}`);
      row.push(images[i + 1] ?? "");
    }
  }
  // Beliebige Custom-Attribute aus `values.attributes` (Key=Spalte, Value=Wert).
  for (const [key, value] of Object.entries(v.attributes)) {
    if (!key || !value) continue;
    if (key === "category" || key === "brand") continue;
    if (headers.includes(key)) continue;
    headers.push(key);
    row.push(String(value));
  }
  const escapedRow = row.map(csvEscape);
  return `${headers.join(";")}\n${escapedRow.join(";")}\n`;
}

function buildMiraklOfferCsv(args: DispatchArgs): string {
  const v = args.values;
  const priceEurRaw = num(v.priceEur);
  const priceEur = priceEurRaw !== null && priceEurRaw > 0 ? priceEurRaw : 0;
  const stockQty = Math.max(0, Math.round(num(v.stockQty) ?? 0));
  const ean = v.ean.trim();
  // Mirakl common columns. `state` = Produktzustand-Code: 11 = Neu.
  // `product-id-type` = Identifier-Typ (EAN/ASIN/SHOP_SKU).
  const headers = [
    "sku",
    "product-id",
    "product-id-type",
    "price",
    "quantity",
    "state",
    "description",
    "leadtime-to-ship",
    "min-quantity-alert",
    "update-delete",
  ];
  const descriptionForCsv = (v.description.trim() || v.title.trim() || args.sku).slice(0, 2000);
  const handlingTime = Math.max(1, Math.round(num(v.handlingTime) ?? 2));
  const row = [
    args.sku,
    ean || args.sku, // wenn kein EAN: Seller-SKU als Shop-SKU
    ean ? "EAN" : "SHOP_SKU",
    priceEur.toFixed(2),
    String(stockQty),
    "11", // Neuware
    descriptionForCsv,
    String(handlingTime),
    "0",
    "update",
  ].map(csvEscape);
  return `${headers.join(";")}\n${row.join(";")}\n`;
}

/**
 * Holt die verfügbaren Kategorie-Codes des Operators per GET /api/categories.
 * Wird nach PM01-Rejection "category X is unknown" aufgerufen, um dem Nutzer
 * konkrete Code-Vorschläge zu geben.
 *
 * Zusätzlich: wenn /api/categories 403 liefert (Fressnapf-Seller-Key!), holen
 * wir die Category-Codes aus existierenden Produkten via /api/products?max=5.
 * So sehen wir die reale Code-Form (oft nicht identisch mit Hierarchies).
 */
async function miraklFetchAvailableCategories(auth: MiraklAuthInfo): Promise<string[]> {
  const candidates = ["/api/categories", "/api/hierarchies", "/api/shop/categories"];
  for (const path of candidates) {
    try {
      const url = new URL(path, auth.baseUrl).toString();
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...miraklAuthHeader(auth) },
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as unknown;
      if (!json) continue;
      const list = Array.isArray(json)
        ? json
        : Array.isArray((json as { categories?: unknown }).categories)
          ? (json as { categories: unknown[] }).categories
          : Array.isArray((json as { hierarchies?: unknown }).hierarchies)
            ? (json as { hierarchies: unknown[] }).hierarchies
            : [];
      const codes = list
        .map((e) => {
          if (typeof e === "string") return e;
          if (e && typeof e === "object") {
            const o = e as Record<string, unknown>;
            return String(o.code ?? o.category_code ?? o.id ?? "");
          }
          return "";
        })
        .filter((c) => c.length > 0);
      if (codes.length > 0) return codes;
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Fallback-Discovery: Holt existierende Produkte und extrahiert das
 * `category`-Feld. So kennen wir die reale Code-Form, auch wenn die
 * Category-API 403 liefert.
 */
async function miraklSampleExistingProductCategories(
  auth: MiraklAuthInfo
): Promise<string[]> {
  try {
    const url = new URL("/api/products?max=10", auth.baseUrl).toString();
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json", ...miraklAuthHeader(auth) },
    });
    if (!res.ok) return [];
    const json = (await res.json().catch(() => null)) as unknown;
    if (!json || typeof json !== "object") return [];
    const products = Array.isArray((json as { products?: unknown }).products)
      ? (json as { products: unknown[] }).products
      : Array.isArray(json)
        ? (json as unknown[])
        : [];
    const codes = new Set<string>();
    for (const p of products) {
      if (!p || typeof p !== "object") continue;
      const o = p as Record<string, unknown>;
      const cat = String(o.category ?? o.category_code ?? "").trim();
      if (cat) codes.add(cat);
    }
    return Array.from(codes);
  } catch {
    return [];
  }
}

/**
 * Holt das Per-Hierarchie-Attribut-Schema von Mirakl (Fressnapf, MMS, etc.).
 * Wird in der PM01-Fehler-Hint genutzt, wenn `1000|... is required` oder
 * `2006|... is not in the possible values` auftaucht — dann sehen wir die
 * **echten** Attribut-Codes, statt sie zu raten. Beweis-Pattern aus der
 * Fressnapf-PM01-Reihe: Spalten wie `length`, `length_outside`, `data_dummy`
 * etc. wurden NICHT gelesen, obwohl wir sie geschickt haben — die echten
 * Codes hat nur das Attribut-Schema des Operators.
 */
type MiraklAttrInfo = {
  code: string;
  label: string;
  required: boolean;
  type: string;
  valuesList?: string;
};

async function miraklFetchHierarchyAttributes(
  auth: MiraklAuthInfo,
  hierarchy: string
): Promise<MiraklAttrInfo[]> {
  const candidates = [
    `/api/products/attributes?hierarchy=${encodeURIComponent(hierarchy)}`,
    `/api/products/attributes?category=${encodeURIComponent(hierarchy)}`,
    `/api/products/attributes`,
  ];
  for (const path of candidates) {
    try {
      const url = new URL(path, auth.baseUrl).toString();
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...miraklAuthHeader(auth) },
      });
      if (!res.ok) continue;
      const json = (await res.json().catch(() => null)) as unknown;
      if (!json) continue;
      const list = Array.isArray((json as { attributes?: unknown }).attributes)
        ? (json as { attributes: unknown[] }).attributes
        : Array.isArray(json)
          ? (json as unknown[])
          : [];
      const out: MiraklAttrInfo[] = [];
      for (const item of list) {
        if (!item || typeof item !== "object") continue;
        const o = item as Record<string, unknown>;
        const code = String(o.code ?? o.attribute_code ?? "").trim();
        if (!code) continue;
        out.push({
          code,
          label: String(o.label ?? o.name ?? code),
          required: o.required === true || o.is_required === true,
          type: String(o.type ?? o.attribute_type ?? "?"),
          valuesList:
            typeof o.values_list === "string"
              ? o.values_list
              : typeof o.values_lists === "string"
                ? o.values_lists
                : undefined,
        });
      }
      if (out.length > 0) return out;
    } catch {
      continue;
    }
  }
  return [];
}

/**
 * Lädt den Error-Report einer fehlgeschlagenen PM01/OF01-Import.
 * Mirakl liefert je Operator unterschiedliche Formate:
 *  - Standard: CSV mit `sku;error_message` an `/error_report`
 *  - Fressnapf/einige andere: Ablage an `/error_report_file` oder als JSON
 *  - Manche Operatoren: Text/Plain mit Zeilenweisen Fehlern
 *
 * Wenn wir nichts Parsebares finden, geben wir einen Raw-Snippet + Status zurück,
 * damit der Nutzer im Dashboard zumindest den tatsächlichen API-Response sieht.
 */
async function miraklFetchErrorReport(
  auth: MiraklAuthInfo,
  endpointPath: string,
  importId: string,
  maxLines = 5
): Promise<string[]> {
  const candidatePaths = [
    `${endpointPath}/${encodeURIComponent(importId)}/error_report`,
    `${endpointPath}/${encodeURIComponent(importId)}/error_report_file`,
    `${endpointPath}/${encodeURIComponent(importId)}/errors`,
  ];
  const collected: string[] = [];
  for (const path of candidatePaths) {
    const url = new URL(path, auth.baseUrl).toString();
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: {
          Accept: "text/csv, text/plain, application/json",
          ...miraklAuthHeader(auth),
        },
      });
      // Response kann Latin-1-encoded sein (Fressnapf & andere Mirakl-Operatoren).
      // Wir lesen als Bytes, detektieren UTF-8-Validität und fallen sonst auf
      // Latin-1 zurück — sonst kommt "für" als "fÃ¼r" im Report.
      const buf = new Uint8Array(await res.arrayBuffer());
      let text: string;
      try {
        text = new TextDecoder("utf-8", { fatal: true }).decode(buf);
      } catch {
        text = new TextDecoder("iso-8859-1").decode(buf);
      }
      // Zusätzliche Heuristik: wenn UTF-8-decoded Text typische Latin-1-Artefakte
      // enthält (Ã¼, Ã¶, Ã¤, Ã„, Ã–, Ãœ, ÃŸ), doch Latin-1 verwenden.
      if (/Ã[¤¶¼„–œŸ]/.test(text)) {
        try {
          text = new TextDecoder("iso-8859-1").decode(buf);
        } catch {
          /* keep utf-8 */
        }
      }
      if (!res.ok) {
        // Nur den letzten Kandidaten als Error reporten wenn alle anderen auch scheiterten.
        collected.push(`[HTTP ${res.status} @ ${path}] ${text.slice(0, 200)}`);
        continue;
      }
      if (!text || !text.trim()) continue;

      // 1) JSON-Form: { errors: [...] } oder { error_report: [...] }
      if (text.trim().startsWith("{") || text.trim().startsWith("[")) {
        try {
          const json = JSON.parse(text);
          const arr = Array.isArray(json)
            ? json
            : Array.isArray((json as { errors?: unknown }).errors)
              ? (json as { errors: unknown[] }).errors
              : Array.isArray((json as { error_report?: unknown }).error_report)
                ? (json as { error_report: unknown[] }).error_report
                : [];
          for (const item of arr.slice(0, maxLines)) {
            if (typeof item === "string") return [item];
            if (item && typeof item === "object") {
              const it = item as Record<string, unknown>;
              const msg = String(
                it.error_message ?? it.message ?? it.error ?? it.reason ?? it.detail ?? ""
              ).trim();
              const sku = String(it.sku ?? it.product_sku ?? it["product-sku"] ?? "").trim();
              if (msg) return [sku ? `${sku}: ${msg}` : msg];
            }
          }
        } catch {
          // Weiter zum CSV-Parse-Fallback
        }
      }

      // 2) CSV: erste Zeile = Header (getrennt durch ; oder ,), danach Datenzeilen.
      //    Quoted fields können Delimiter & Newlines enthalten (z. B. HTML in
      //    `description`). Deshalb proper quoted-field-aware Parser statt `split`.
      const rows = parseCsvQuoted(text);
      if (rows.length > 0) {
        const headerCells = rows[0].map((c) => c.trim().toLowerCase());
        // Präferenz: `error-message` / `message` vor `error-line` — `error-line`
        // ist nur die Zeilennummer, der Text steht in `error-message`.
        const errorColPreferred = headerCells.findIndex((h) =>
          /(^|[-_])message$|error.?message|error.?description|reason|detail/.test(h)
        );
        const errorColFallback = headerCells.findIndex((h) => /error/.test(h));
        const errorCol = errorColPreferred >= 0 ? errorColPreferred : errorColFallback;
        const skuCol = headerCells.findIndex((h) => /^sku$/.test(h) || /product.?sku/.test(h));
        if (errorCol >= 0 && rows.length > 1) {
          const out: string[] = [];
          for (let i = 1; i < rows.length && out.length < maxLines; i += 1) {
            const cells = rows[i];
            const message = (cells[errorCol] ?? "").trim();
            const sku = skuCol >= 0 ? (cells[skuCol] ?? "").trim() : "";
            if (!message) continue;
            out.push(sku ? `${sku}: ${message}` : message);
          }
          if (out.length > 0) return out;
        }
      }

      // 3) Fallback: Text-Plain Zeilen oder Raw-Snippet.
      const firstLines = text
        .split(/\r?\n/)
        .filter((l) => l.trim().length > 0)
        .slice(0, maxLines)
        .map((l) => l.slice(0, 250));
      if (firstLines.length > 0) return firstLines;
      collected.push(`[raw @ ${path}] ${text.slice(0, 200)}`);
    } catch (err) {
      collected.push(`[fetch-error @ ${path}] ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  // Keine der Routen lieferte Parsebares — roher Debug-Output
  return collected.length > 0 ? [collected.join(" | ")] : [];
}

async function miraklPollImportStatus(
  auth: MiraklAuthInfo,
  endpointPath: string,
  importId: string,
  timeoutMs = 8000
): Promise<{
  status: string;
  errors: string[];
  lineErrors: number;
  lineSuccesses: number;
}> {
  const url = new URL(`${endpointPath}/${encodeURIComponent(importId)}`, auth.baseUrl).toString();
  const start = Date.now();
  let lastStatus = "unknown";
  let errors: string[] = [];
  let lineErrors = 0;
  let lineSuccesses = 0;
  while (Date.now() - start < timeoutMs) {
    await new Promise((r) => setTimeout(r, 1500));
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Accept: "application/json", ...miraklAuthHeader(auth) },
      });
      if (!res.ok) break;
      const json = (await res.json().catch(() => ({}))) as {
        import_status?: string;
        status?: string;
        lines_in_error?: number;
        lines_in_success?: number;
        has_error_report?: boolean;
        errors?: Array<{ message?: string; reason?: string }> | string;
      };
      lastStatus = (json.import_status ?? json.status ?? "unknown").toString();
      lineErrors = Number(json.lines_in_error ?? 0);
      lineSuccesses = Number(json.lines_in_success ?? 0);
      if (Array.isArray(json.errors)) {
        errors = json.errors
          .map((e) => String(e.message ?? e.reason ?? ""))
          .filter(Boolean)
          .slice(0, 5);
      } else if (typeof json.errors === "string") {
        errors = [json.errors];
      }
      // Mirakl-Terminalzustände: COMPLETE, FINISHED, ON_ERROR, FAILED, CANCELLED.
      // NICHT: PROCESSING, IMPORTING, WAITING, WAITING_FOR_OPERATOR_APPROVAL.
      const done = /^(COMPLETE|FINISHED|ON_ERROR|FAILED|CANCELLED)$/i.test(lastStatus);
      if (done) break;
    } catch {
      break;
    }
  }
  return { status: lastStatus, errors, lineErrors, lineSuccesses };
}

async function miraklPostCsvImport(
  auth: MiraklAuthInfo,
  endpointPath: string,
  csvBody: string,
  filename: string
): Promise<
  | { ok: true; importId: string | null; httpStatus: number; endpointUsed: string }
  | { ok: false; httpStatus: number; endpointUsed: string; error: string }
> {
  const form = new FormData();
  // Fressnapf (und die meisten Mirakl-Operatoren) erwarten UTF-8 für CSV-Imports.
  // Beweis: Latin-1-Upload produzierte FFFD-Replacement-Chars in Fressnapfs
  // Error-Report (= UTF-8-Decoder konnte Latin-1-Bytes nicht lesen). Das
  // frühere `fÃ¼r`-Mojibake war Viewer-seitig (Excel/VSCode öffnet UTF-8 als
  // Latin-1, wenn nicht explizit konfiguriert).
  const encoder = new TextEncoder();
  const bodyBytes = encoder.encode(csvBody);
  const blob = new Blob([bodyBytes], { type: "text/csv; charset=utf-8" });
  form.append("file", blob, filename);
  form.append("import_mode", "NORMAL");
  const url = new URL(endpointPath, auth.baseUrl).toString();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      ...miraklAuthHeader(auth),
    },
    body: form,
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const errMsg =
      (json && typeof json === "object" && "message" in json && typeof (json as { message?: unknown }).message === "string"
        ? (json as { message: string }).message
        : null) ??
      text.slice(0, 500) ??
      `HTTP ${res.status}`;
    return { ok: false, httpStatus: res.status, endpointUsed: url, error: errMsg };
  }
  const importId =
    json && typeof json === "object" && "import_id" in json
      ? String((json as { import_id: unknown }).import_id)
      : null;
  return { ok: true, importId, httpStatus: res.status, endpointUsed: url };
}

async function dispatchMirakl(
  args: DispatchArgs,
  slug: "fressnapf" | "zooplus" | "mediamarkt-saturn"
): Promise<SubmissionOutcome> {
  const productCsv = await buildMiraklProductCsv(args, slug);
  const offerCsv = buildMiraklOfferCsv(args);
  const payload = { productCsv, offerCsv, targetSlug: slug };

  const priceEurRaw = num(args.values.priceEur);
  if (priceEurRaw === null || priceEurRaw <= 0) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      submissionId: null,
      issues: [{ severity: "ERROR", message: `${slug} erfordert einen gültigen Preis (>0).` }],
      preparedPayload: payload,
      preparedOnly: false,
    };
  }
  if (!args.values.ean.trim() && !args.sku.trim()) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      submissionId: null,
      issues: [{ severity: "ERROR", message: `${slug} erfordert EAN oder SKU als Produkt-ID.` }],
      preparedPayload: payload,
      preparedOnly: false,
    };
  }
  if (!args.values.title.trim()) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      submissionId: null,
      issues: [
        { severity: "ERROR", message: `${slug} Katalog-Import benötigt einen Titel (title).` },
      ],
      preparedPayload: payload,
      preparedOnly: false,
    };
  }
  const categoryInput =
    args.values.category.trim() || (args.values.attributes.category ?? "").toString().trim();
  if (!categoryInput) {
    return {
      ok: false,
      status: "VALIDATION_ERROR",
      submissionId: null,
      issues: [
        {
          severity: "ERROR",
          message: `${slug} Katalog-Import (PM01) benötigt eine Kategorie (category) — diese muss mit dem Marktplatz-Kategoriebaum übereinstimmen.`,
        },
      ],
      preparedPayload: payload,
      preparedOnly: false,
    };
  }
  // Fressnapf: Mirakl-Hierarchy-Code aus `/api/hierarchies` vorab validieren.
  // Sonst kassieren wir garantiert ein "The category X is unknown".
  if (slug === "fressnapf") {
    const { resolveFressnapfCategoryCode, detectFressnapfAnimalCategory } = await import(
      "./fressnapfCategories"
    );
    const code = resolveFressnapfCategoryCode(categoryInput);
    if (!code) {
      return {
        ok: false,
        status: "VALIDATION_ERROR",
        submissionId: null,
        issues: [
          {
            severity: "ERROR",
            message: `Fressnapf: Kategorie "${categoryInput}" nicht erkannt. Fressnapf erwartet einen Mirakl-Hierarchy-Code (z. B. "marketplace_animal_housing" für Katzenhöhle/Lodge/Hundehütte, "marketplace_animal_scratch_accessory" für Kratzpappe/Kratzbaum, "marketplace_animal_sleeping_place" für Bett/Liegeplatz). Vollständige Liste: GET /api/fressnapf/categories-debug.`,
          },
        ],
        preparedPayload: payload,
        preparedOnly: false,
      };
    }
    // Alle `marketplace_animal_*`-Hierarchien + Katzenstreu erfordern
    // `animal_categories`. Wenn weder petSpecies noch Freitext die Tierart
    // signalisiert, brechen wir ab — Fressnapf würde sonst mit
    // "animal_categories is required" rejecten.
    const isAnimalHier = /^marketplace_animal_/.test(code) || code === "marketplace_cat_litter";
    if (isAnimalHier) {
      const v = args.values;
      const petSpeciesGerman = (v.petSpecies || "").toLowerCase();
      const petSpeciesCode = ({
        katze: "cat",
        hund: "dog",
        kleintier: "small_animal",
        vogel: "ornamental_bird",
        fisch: "aquarium_fish",
        pferd: "horse",
      } as Record<string, string>)[petSpeciesGerman] ?? null;
      const detected =
        petSpeciesCode ??
        detectFressnapfAnimalCategory(`${v.title} ${v.description} ${v.bullets.join(" ")}`) ??
        (code === "marketplace_cat_litter" ? "cat" : null);
      if (!detected) {
        return {
          ok: false,
          status: "VALIDATION_ERROR",
          submissionId: null,
          issues: [
            {
              severity: "ERROR",
              message: `Fressnapf: Tierart nicht erkennbar. Kategorie "${code}" verlangt das Attribut "animal_categories" (cat, dog, aquarium_fish, pond_fish, small_animal, horse, ornamental_bird, wild_bird, terrarium_animal, wild_animal, insect, invertebrate, n_a). Bitte Feld "Tierart" im Editor setzen oder Titel/Beschreibung eindeutig formulieren (z. B. "für Katzen").`,
            },
          ],
          preparedPayload: payload,
          preparedOnly: false,
        };
      }
    }
  }
  // MediaMarkt/Saturn: Resolver mappt deutsche Labels → Kategorie-Pfad.
  // PM01 verlangt einen Pfad-String wie "PET CARE / PET WELFARE / HYGIENE"
  // oder "Handelsware|Katzentoilette" (nicht die internen FET_FRA_NNNN-Codes).
  if (slug === "mediamarkt-saturn") {
    const { resolveMediaMarktCategoryCode, MMS_CATEGORIES } = await import(
      "./mediaMarktSaturnCategories"
    );
    const resolved = resolveMediaMarktCategoryCode(categoryInput);
    const isValidPath =
      resolved && (resolved.includes("/") || resolved.includes("|"));
    if (!isValidPath) {
      const knownSample = MMS_CATEGORIES.map((c) => `"${c.path}" (${c.label})`).join(", ");
      const kratzHint = /kratz|katzenh(ö|oe)hle|katzenm(ö|oe)bel|lodge|scratch|tower|kratztonne|cave|spielzeug|toy|schlafplatz|bett|kissen/i.test(
        categoryInput
      )
        ? ` Für Kratzmöbel/Spielzeug/Schlafplatz gibt es KEINEN bestätigten MMS-Pfad — bitte im MMS-Backoffice (Katalog > Produkt anlegen > Kategorie-Auswahl) den exakten Pfad nachschlagen und als Kategorie-Feld eintragen. Bisher sind in deinem Offer-Katalog nur HYGIENE, PFLEGE und TRAENKE & NAEPFE belegt.`
        : "";
      return {
        ok: false,
        status: "VALIDATION_ERROR",
        submissionId: null,
        issues: [
          {
            severity: "ERROR",
            message: `MediaMarkt/Saturn: Kategorie "${categoryInput}" konnte nicht auf einen bestätigten MMS-Kategorie-Pfad gemappt werden.${kratzHint} MMS-PM01 erwartet einen Pfad-String (z. B. "PET CARE / PET WELFARE / HYGIENE" oder "Handelsware|Katzentoilette"). Bestätigte Pfade: ${knownSample}. Weitere findest du im MMS-Seller-Backoffice unter Katalog > Produkt anlegen > Kategorie-Auswahl; den gefundenen Pfad dann direkt ins Kategorie-Feld eintragen.`,
          },
        ],
        preparedPayload: payload,
        preparedOnly: false,
      };
    }
  }
  // Zooplus: erwartet numerischen/strukturierten Kategorie-Code aus dem
  // Marktplatz-Katalog, keinen deutschen Rohlabel.
  if (slug === "zooplus") {
    const looksLikeCode = /^[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(categoryInput) && !/\s/.test(categoryInput);
    if (!looksLikeCode) {
      return {
        ok: false,
        status: "VALIDATION_ERROR",
        submissionId: null,
        issues: [
          {
            severity: "ERROR",
            message: `Zooplus: Kategorie "${categoryInput}" ist ein Freitext-Label — der Mirakl-Katalog erwartet einen Kategorie-Code aus dem Zooplus-Seller-Portal. Bitte den exakten Code eintragen und erneut hochladen.`,
          },
        ],
        preparedPayload: payload,
        preparedOnly: false,
      };
    }
  }

  const auth = await loadMiraklAuth(slug);
  if (!auth) {
    return {
      ok: false,
      status: "CONFIG_ERROR",
      submissionId: null,
      issues: [
        { severity: "ERROR", message: `${slug.toUpperCase()} API nicht konfiguriert (API_KEY / BASE_URL).` },
      ],
      preparedPayload: payload,
      preparedOnly: true,
    };
  }

  try {
    // Schritt 1: PM01 — Produkt-Katalog-Import
    const productResult = await miraklPostCsvImport(
      auth,
      "/api/products/imports",
      productCsv,
      `product-${args.sku}.csv`
    );
    if (!productResult.ok) {
      return {
        ok: false,
        status: `HTTP_${productResult.httpStatus}`,
        submissionId: null,
        issues: [
          {
            severity: "ERROR",
            message: `${slug} Katalog-Import (PM01) fehlgeschlagen: ${productResult.error}`,
          },
        ],
        httpStatus: productResult.httpStatus,
        endpointUsed: productResult.endpointUsed,
        preparedPayload: payload,
        preparedOnly: false,
      };
    }

    // Zwischenschritt: PM01-Status pollen. Viele Mirakl-Operatoren
    // akzeptieren den Upload mit 200 OK (import_id), die eigentliche
    // Validierung läuft aber asynchron. Wenn die Validierung fehlschlägt
    // (z.B. unbekannte Kategorie, fehlende Pflichtattribute), sehen wir es nur
    // im Status-Endpoint. Bei Fehlern abbrechen bevor OF01 gesendet wird.
    let pm01FullyComplete = false;
    if (productResult.importId) {
      // 45s Timeout: neue Produkte benötigen auf Fressnapf typisch 10–30s bis
      // sie im Katalog auftauchen — sonst rejected OF01 mit "product not found".
      const productStatus = await miraklPollImportStatus(
        auth,
        "/api/products/imports",
        productResult.importId,
        45000
      );
      if (productStatus.lineErrors > 0 || /FAILED|ERROR/i.test(productStatus.status)) {
        // Error-Report-CSV fetchen — enthält pro Zeile die echte Rejection-Message
        // (z. B. "The category marketplace_animal_housing requires attribute animal_categories").
        const reportLines = await miraklFetchErrorReport(
          auth,
          "/api/products/imports",
          productResult.importId
        );
        const combinedErrors = [
          ...productStatus.errors,
          ...reportLines,
        ].filter(Boolean);
        const errorDetail =
          combinedErrors.length > 0
            ? combinedErrors.join(" · ")
            : `lines_in_error=${productStatus.lineErrors}, status=${productStatus.status}`;

        // Wenn Rejection "category ... is unknown" enthält, live die verfügbaren
        // Codes fetchen und in der Meldung auflisten — sonst rät der Nutzer blind.
        // Zusätzlich: existierende Produkte samplen, falls /api/categories 403
        // liefert (Fressnapf).
        let categoryHint = "";
        if (/category.*(is unknown|not found|could not be identified)/i.test(errorDetail)) {
          const [codes, sampleCats] = await Promise.all([
            miraklFetchAvailableCategories(auth),
            miraklSampleExistingProductCategories(auth),
          ]);
          const hintParts: string[] = [];
          if (codes.length > 0) {
            const sample = codes.slice(0, 10).join(", ");
            hintParts.push(
              `Hierarchies-Codes (${codes.length}): ${sample}${codes.length > 10 ? ", …" : ""}`
            );
          }
          if (sampleCats.length > 0) {
            hintParts.push(
              `**Real verwendete Category-Codes aus existierenden Fressnapf-Produkten**: ${sampleCats.join(", ")} → einen davon als Kategorie eintragen.`
            );
          }
          if (hintParts.length === 0) {
            hintParts.push(
              `Weder Hierarchies noch existierende Produkte abrufbar. Bitte den korrekten Category-Code aus dem Fressnapf-Seller-Backoffice holen (Produkte → neues Produkt → Kategorie) und im Editor eintragen.`
            );
          }
          categoryHint = ` → ${hintParts.join(" · ")}`;
        }

        // Wenn Attribut-Errors auftreten (1000 required / 2006 enum-mismatch),
        // live das Per-Hierarchie-Attribut-Schema fetchen — sonst rät der User
        // (und ich) blind weiter, welche Spaltennamen Fressnapf erwartet.
        let attributeHint = "";
        const hasAttributeError = /\b1000\|.+is required|\b2006\|.+is not in the possible values|\b2030\|/i.test(
          errorDetail
        );
        if (hasAttributeError && categoryInput) {
          const schema = await miraklFetchHierarchyAttributes(auth, categoryInput);
          if (schema.length > 0) {
            const required = schema.filter((a) => a.required);
            const lines = required.map(
              (a) =>
                `${a.code} (${a.label}, ${a.type}${a.valuesList ? `, values_list=${a.valuesList}` : ""})`
            );
            const head = lines.slice(0, 30).join(" · ");
            const tail = lines.length > 30 ? ` …+${lines.length - 30} weitere` : "";
            attributeHint = ` → **Echtes Fressnapf-Attribut-Schema für \`${categoryInput}\`** (${required.length} Pflicht-Attribute, ${schema.length} insgesamt): ${head}${tail}`;
          } else {
            attributeHint = ` → Fressnapf-Attribut-Schema für \`${categoryInput}\` konnte nicht geladen werden (API liefert nichts unter /api/products/attributes?hierarchy=...). Im Backoffice die Attribut-Liste prüfen.`;
          }
        }

        return {
          ok: false,
          status: "PM01_VALIDATION_FAILED",
          submissionId: productResult.importId,
          issues: [
            {
              severity: "ERROR",
              message: `${slug} Katalog-Import (PM01, import_id=${productResult.importId}) abgelehnt: ${errorDetail}.${categoryHint}${attributeHint}`,
            },
          ],
          endpointUsed: productResult.endpointUsed,
          preparedPayload: payload,
          preparedOnly: false,
        };
      }
      // Status muss tatsächlich COMPLETE sein — sonst ist das Produkt noch nicht
      // im Katalog, und OF01 würde "product-sku not found" rejecten.
      pm01FullyComplete = /COMPLETE|FINISHED/i.test(productStatus.status);
    }

    // Wenn PM01 noch nicht fertig durchgelaufen ist, verzichten wir bewusst auf
    // den OF01-Call — dieser würde garantiert rejecten ("product-id not found in
    // catalog"). Nutzer weiß dann, dass er das Angebot nach ein paar Minuten
    // erneut anstoßen soll, oder PM01 im Backoffice abwarten kann.
    if (productResult.importId && !pm01FullyComplete) {
      return {
        ok: true,
        status: "PM01_PENDING",
        submissionId: productResult.importId,
        issues: [
          {
            severity: "WARNING",
            message: `${slug}: Katalog-Import PM01 (import_id=${productResult.importId}) läuft noch auf dem Marktplatz. Das Produkt wird voraussichtlich in wenigen Minuten im Katalog erscheinen — bitte anschließend den Upload erneut anstoßen, damit Preis und Bestand (OF01) angelegt werden. Der Status ist abrufbar unter GET /api/products/imports/${productResult.importId}.`,
          },
        ],
        endpointUsed: productResult.endpointUsed,
        preparedPayload: payload,
        preparedOnly: false,
      };
    }

    // Schritt 2: OF01 — Offer-Import (Preis/Stock). Auch nach PM01-COMPLETE gibt
    // es bei vielen Mirakl-Operatoren (inkl. Fressnapf) eine Katalog-Sync-
    // Verzögerung von 3–30 s, bevor das Produkt für Offers auffindbar ist. Wir
    // retryen deshalb einmal mit 6 s Wartezeit bei "product does not exist".
    const isProductNotFoundError = (errLines: string[]): boolean =>
      errLines.some((l) => /product.*(does not exist|not found|unknown)/i.test(l));

    type OfferAttempt = {
      importId: string | null;
      httpStatus: number;
      endpointUsed: string;
      status: string;
      lineErrors: number;
      statusErrors: string[];
      reportLines: string[];
    };

    const runOfferAttempt = async (filename: string): Promise<OfferAttempt | {
      failed: true;
      httpStatus: number;
      endpointUsed: string;
      error: string;
    }> => {
      const r = await miraklPostCsvImport(auth, "/api/offers/imports", offerCsv, filename);
      if (!r.ok) {
        return {
          failed: true,
          httpStatus: r.httpStatus,
          endpointUsed: r.endpointUsed,
          error: r.error,
        };
      }
      const st = r.importId
        ? await miraklPollImportStatus(auth, "/api/offers/imports", r.importId, 8000)
        : { status: "unknown", errors: [], lineErrors: 0, lineSuccesses: 0 };
      const lines =
        r.importId && st.lineErrors > 0
          ? await miraklFetchErrorReport(auth, "/api/offers/imports", r.importId)
          : [];
      return {
        importId: r.importId,
        httpStatus: r.httpStatus,
        endpointUsed: r.endpointUsed,
        status: st.status,
        lineErrors: st.lineErrors,
        statusErrors: st.errors,
        reportLines: lines,
      };
    };

    let attempt = await runOfferAttempt(`offer-${args.sku}.csv`);
    if ("failed" in attempt) {
      return {
        ok: false,
        status: `HTTP_${attempt.httpStatus}`,
        submissionId: productResult.importId,
        issues: [
          {
            severity: "ERROR",
            message: `${slug} Offer-Import (OF01) fehlgeschlagen: ${attempt.error}. Katalog-Import (PM01, import_id=${productResult.importId ?? "?"}) war erfolgreich — OF01 bitte manuell nachliefern.`,
          },
        ],
        httpStatus: attempt.httpStatus,
        endpointUsed: attempt.endpointUsed,
        preparedPayload: payload,
        preparedOnly: false,
      };
    }

    // Retry einmalig wenn OF01 mit "product does not exist" rejected —
    // Fressnapf-Katalog-Sync kann nach PM01-COMPLETE noch 3–15 s laufen.
    if (attempt.lineErrors > 0 && isProductNotFoundError(attempt.reportLines)) {
      await new Promise((r) => setTimeout(r, 6000));
      const retry = await runOfferAttempt(`offer-${args.sku}-retry.csv`);
      if (!("failed" in retry)) {
        attempt = retry;
      }
    }

    const offerImportId = attempt.importId;
    const offerEndpointUsed = attempt.endpointUsed;

    // Immer noch "product does not exist" → Katalog-Sync noch nicht durch.
    // Saubere Defer-Antwort statt Fehler, damit Nutzer weiß: in ein paar
    // Minuten erneut uploaden.
    if (attempt.lineErrors > 0 && isProductNotFoundError(attempt.reportLines)) {
      return {
        ok: true,
        status: "OF01_AWAITING_CATALOG_SYNC",
        submissionId: productResult.importId,
        issues: [
          {
            severity: "WARNING",
            message: `${slug}: Katalog-Eintrag PM01 wurde erfolgreich angelegt (import_id=${productResult.importId ?? "?"}), aber der Marktplatz-Katalog hat den Artikel noch nicht veröffentlicht. OF01 (Preis/Bestand) kann deshalb noch nicht greifen ("${attempt.reportLines.slice(0, 1).join("")}"). Bitte in 5–15 Minuten den Upload erneut anstoßen — das Angebot wird dann angelegt.`,
          },
        ],
        endpointUsed: offerEndpointUsed,
        preparedPayload: payload,
        preparedOnly: false,
      };
    }

    // Andere OF01-Fehler (Preis/Menge/etc.) sofort reporten.
    if (attempt.lineErrors > 0 || /FAILED|ON_ERROR/i.test(attempt.status)) {
      const combined = [...attempt.statusErrors, ...attempt.reportLines].filter(Boolean);
      return {
        ok: false,
        status: "OF01_VALIDATION_FAILED",
        submissionId: productResult.importId,
        issues: [
          {
            severity: "ERROR",
            message: `${slug} Offer-Import (OF01, import_id=${offerImportId ?? "?"}) abgelehnt: ${
              combined.length > 0
                ? combined.join(" · ")
                : `lines_in_error=${attempt.lineErrors}, status=${attempt.status}`
            }.`,
          },
        ],
        endpointUsed: offerEndpointUsed,
        preparedPayload: payload,
        preparedOnly: false,
      };
    }

    return {
      ok: true,
      status: "SUBMITTED",
      submissionId: productResult.importId,
      issues: [
        {
          severity: "INFO",
          message: `${slug}: Katalog-Import PM01 erfolgreich (product_import_id=${productResult.importId ?? "?"}) und Offer-Import OF01 angelegt (offer_import_id=${offerImportId ?? "?"}). Beide Imports durch — Freischaltung auf dem Marktplatz kann wenige Minuten dauern.`,
        },
      ],
      httpStatus: productResult.httpStatus,
      endpointUsed: `${productResult.endpointUsed} + ${offerEndpointUsed}`,
      preparedPayload: payload,
      preparedOnly: false,
    };
  } catch (err) {
    return {
      ok: false,
      status: "EXCEPTION",
      submissionId: null,
      issues: [{ severity: "ERROR", message: err instanceof Error ? err.message : String(err) }],
      preparedPayload: payload,
      preparedOnly: true,
    };
  }
}

// ---------------------------------------------------------------------------
// Fallback für Marktplätze ohne implementierte Real-API
// ---------------------------------------------------------------------------

function dispatchPreparedOnly(
  args: DispatchArgs,
  message: string
): SubmissionOutcome {
  const payload = buildGenericPayload(args);
  return {
    ok: true,
    status: "PREPARED",
    submissionId: null,
    issues: [{ severity: "INFO", message }],
    preparedPayload: payload,
    preparedOnly: true,
    preparedMessage: message,
  };
}

// ---------------------------------------------------------------------------
// Öffentlicher Dispatcher
// ---------------------------------------------------------------------------

export async function dispatchCrossListingSubmission(
  args: DispatchArgs
): Promise<SubmissionOutcome> {
  switch (args.targetSlug) {
    case "amazon":
      return dispatchAmazon(args);
    case "otto":
      return dispatchOtto(args);
    case "kaufland":
      return dispatchKaufland(args);
    case "fressnapf":
      return dispatchMirakl(args, "fressnapf");
    case "zooplus":
      return dispatchMirakl(args, "zooplus");
    case "mediamarkt-saturn":
      return dispatchMirakl(args, "mediamarkt-saturn");
    case "ebay":
    case "tiktok":
    case "shopify":
      return dispatchPreparedOnly(
        args,
        `Listing für '${args.targetSlug}' wurde AI-optimiert und validiert. Upload via API ist für diesen Marktplatz noch nicht eingebunden — der fertige Payload liegt in der Draft-Zeile bereit und kann über das Seller-Portal oder den Mirakl-Batch-Import übernommen werden.`
      );
    default:
      return {
        ok: false,
        status: "UNSUPPORTED_MARKETPLACE",
        submissionId: null,
        issues: [{ severity: "ERROR", message: `Unbekannter Marktplatz: ${String(args.targetSlug)}` }],
        preparedPayload: null,
        preparedOnly: false,
      };
  }
}
