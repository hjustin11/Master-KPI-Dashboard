/**
 * Lieferfähige Adresse (Xentral): konsistente Prüfung für API und UI nach Bearbeitung.
 * Datengrundlage: primär Lieferadresse, sonst Rechnungsadresse (wie Xentral-Import).
 */

import {
  XENTRAL_PRIMARY_ADDRESS_FIELD_LABELS,
  XENTRAL_RECIPIENT_NAME_HINT_SCAN_KEYS,
  type XentralPrimaryAddressFieldKey,
} from "@/shared/lib/xentralPrimaryAddressFields";

export type ShippingAddressValidationStatus = "ok" | "invalid";

/** Feste Texte — bitte in Demo-Daten und Geocode-Trigger dieselben Strings nutzen. */
export const ADDRESS_ISSUE_NAME =
  "Kein Liefername: weder in der Adresse noch als Kundenname hinterlegt (min. 2 Zeichen).";

/** Rechtsform / Abkürzung / Platzhalter als einziger „Name“ (z. B. nur „EG“). */
export const ADDRESS_ISSUE_NAME_UNSUITABLE =
  "Liefername ungeeignet (z. B. Rechtsform-Kürzel ohne Person/Firma) — bitte vollständigen Namen setzen.";

export const ADDRESS_ISSUE_STREET =
  "Straße fehlt oder ist leer — Versandadresse nicht eindeutig.";

export const ADDRESS_ISSUE_PLZ =
  "Postleitzahl unvollständig oder fehlt (DE: genau 5 Ziffern; AT/CH: 4 Ziffern; sonst 4–10 Ziffern).";

export const ADDRESS_ISSUE_HN =
  "Keine Hausnummer: weder als eigenes Feld gesetzt noch in der Straße erkennbar.";

/** Nominatim-/Adress-Abgleich nur sinnvoll, wenn Straße, PLZ oder Hausnummer betroffen sind. */
export function issuesNeedAddressGeocode(issues: string[]): boolean {
  return issues.some(
    (i) => i === ADDRESS_ISSUE_STREET || i === ADDRESS_ISSUE_PLZ || i === ADDRESS_ISSUE_HN
  );
}

/** Hinweis im Formular, wenn der Name formal gültig, aber heuristisch fraglich ist. */
export const ADDRESS_HINT_NAME_UNCERTAIN =
  "Der Name wirkt ungewöhnlich — bitte im Marktplatz prüfen.";

function pickFirstString(value: unknown): string | null {
  if (typeof value === "string") return value;
  if (typeof value === "number") return String(value);
  return null;
}

export function normalizeAddressBlock(block: Record<string, unknown> | undefined): {
  street: string;
  zip: string;
  city: string;
  country: string;
} {
  if (!block || typeof block !== "object") {
    return { street: "", zip: "", city: "", country: "" };
  }
  const b = block;
  const street =
    pickFirstString(b.street) ??
    pickFirstString(b.streetName) ??
    pickFirstString(b.address1) ??
    pickFirstString(b.line1) ??
    pickFirstString(b.street1) ??
    "";
  const zip =
    pickFirstString(b.zip) ??
    pickFirstString(b.zipCode) ??
    pickFirstString(b.postalCode) ??
    pickFirstString(b.postcode) ??
    "";
  const city =
    pickFirstString(b.city) ??
    pickFirstString(b.town) ??
    pickFirstString(b.cityName) ??
    "";
  const country =
    pickFirstString(b.country) ??
    pickFirstString(b.countryCode) ??
    pickFirstString(b.countryIso) ??
    "";
  return {
    street: street.trim(),
    zip: zip.trim(),
    city: city.trim(),
    country: country.trim(),
  };
}

export function pickRecipientNameFromAddressBlock(block: Record<string, unknown> | undefined): string {
  return pickNameFromBlock(block);
}

function pickNameFromBlock(block: Record<string, unknown> | undefined): string {
  if (!block || typeof block !== "object") return "";
  const b = block;
  const direct =
    pickFirstString(b.name) ??
    pickFirstString(b.company) ??
    pickFirstString(b.contactPerson) ??
    pickFirstString(b.contact_person);
  if (direct?.trim()) return direct.trim();
  const fn = (pickFirstString(b.firstName) ?? pickFirstString(b.first_name) ?? "").trim();
  const ln = (pickFirstString(b.lastName) ?? pickFirstString(b.last_name) ?? "").trim();
  return `${fn} ${ln}`.trim();
}

function pickHouseNumberFromBlock(block: Record<string, unknown> | undefined): string {
  if (!block || typeof block !== "object") return "";
  return (
    pickFirstString(block.houseNumber) ??
    pickFirstString(block.house_number) ??
    pickFirstString(block.houseNo) ??
    pickFirstString(block.house_no) ??
    pickFirstString(block.streetNumber) ??
    pickFirstString(block.street_number) ??
    ""
  ).trim();
}

function missingHouseNumberInPrimaryBlock(
  primaryBlock: Record<string, unknown> | undefined,
  normStreet: string
): boolean {
  const hnField = pickHouseNumberFromBlock(primaryBlock);
  if (hnField.length > 0) return false;
  return !streetHasHouseNumber(normStreet);
}

/** Erkennt eine Hausnummer in der Straßenzeile (enthält mindestens eine Ziffer). */
export function streetHasHouseNumber(street: string): boolean {
  return /\d/.test(street.trim());
}

/**
 * Lieferadresse-Objekt (flach aus Xentral) nutzen, sobald darin überhaupt Inhalt steht.
 * Wichtig: Nicht nur Straße/PLZ/Ort — sonst würde bei leerer Normalisierung auf Rechnungsadresse
 * umgeschaltet und z. B. der Name in `shipping.name` ignoriert; die Validierung fiele dann auf
 * den Kundennamen (z. B. „EG“) zurück und blieb fälschlich ungültig.
 */
function shippingBlockHasUsableData(block: Record<string, unknown> | undefined): boolean {
  if (!block || typeof block !== "object") return false;
  const n = normalizeAddressBlock(block);
  if (n.street || n.zip || n.city || n.country) return true;
  if (pickNameFromBlock(block).trim().length > 0) return true;
  if (pickHouseNumberFromBlock(block).length > 0) return true;
  for (const v of Object.values(block)) {
    if (typeof v === "string" && v.trim().length > 0) return true;
    if (typeof v === "number" && Number.isFinite(v)) return true;
  }
  return false;
}

export function primaryAddressContext(args: {
  shipping?: Record<string, unknown> | undefined;
  billing?: Record<string, unknown> | undefined;
}): {
  primaryBlock: Record<string, unknown> | undefined;
  norm: { street: string; zip: string; city: string; country: string };
} {
  const ship = normalizeAddressBlock(args.shipping);
  const bill = normalizeAddressBlock(args.billing);
  const useShipping =
    args.shipping &&
    typeof args.shipping === "object" &&
    shippingBlockHasUsableData(args.shipping as Record<string, unknown>);
  return {
    primaryBlock: useShipping ? (args.shipping as Record<string, unknown>) : args.billing,
    norm: useShipping ? ship : bill,
  };
}

export function isPlzComplete(zip: string, country: string): boolean {
  const raw = zip.trim();
  if (!raw) return false;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return false;
  const c = country.replace(/\s/g, "").toUpperCase();
  if (!c || c === "DE" || c === "DEU" || c === "D" || c === "GERMANY" || c === "DEUTSCHLAND") {
    return digits.length === 5;
  }
  if (c === "AT" || c === "AUT" || c === "A" || c === "AUSTRIA" || c === "ÖSTERREICH") {
    return digits.length === 4;
  }
  if (c === "CH" || c === "CHE" || c === "SWITZERLAND" || c === "SCHWEIZ") {
    return digits.length === 4;
  }
  return digits.length >= 4 && digits.length <= 10;
}

export function computeAddressValidation(args: {
  shipping?: Record<string, unknown> | undefined;
  billing?: Record<string, unknown> | undefined;
  customerDisplay: string;
}): { status: ShippingAddressValidationStatus; issues: string[] } {
  const { primaryBlock, norm } = primaryAddressContext({
    shipping: args.shipping,
    billing: args.billing,
  });

  const issues: string[] = [];

  const nameFromAddr = pickNameFromBlock(primaryBlock);
  const cust = args.customerDisplay.trim();
  const customerOk = cust.length >= 2 && cust !== "—";

  let nameOk = false;
  if (nameFromAddr.length >= 2) {
    if (isRecipientNameUnacceptableAsSoleRecipient(nameFromAddr)) {
      issues.push(ADDRESS_ISSUE_NAME_UNSUITABLE);
    } else {
      nameOk = true;
    }
  } else if (customerOk) {
    if (isRecipientNameUnacceptableAsSoleRecipient(cust)) {
      issues.push(ADDRESS_ISSUE_NAME_UNSUITABLE);
    } else {
      nameOk = true;
    }
  } else {
    issues.push(ADDRESS_ISSUE_NAME);
  }

  const streetOk = norm.street.length > 0;
  if (!streetOk) {
    issues.push(ADDRESS_ISSUE_STREET);
  }

  const plzOk = isPlzComplete(norm.zip, norm.country);
  if (!plzOk) {
    issues.push(ADDRESS_ISSUE_PLZ);
  }

  const hnOk = !missingHouseNumberInPrimaryBlock(primaryBlock, norm.street);
  if (!hnOk) {
    issues.push(ADDRESS_ISSUE_HN);
  }

  const allOk = nameOk && streetOk && plzOk && hnOk;
  return {
    status: allOk ? "ok" : "invalid",
    issues,
  };
}

/** Gleiche Hausnummer-Logik wie in der Validierung, für flache Xentral-Felder (nur Lieferadresse). */
export function shippingFlatMissingHouseNumber(flat: Record<string, unknown> | undefined): boolean {
  if (!flat || typeof flat !== "object") return true;
  const norm = normalizeAddressBlock(flat);
  return missingHouseNumberInPrimaryBlock(flat, norm.street);
}

function resolveBestRecipientDisplayForNameCheck(
  flat: Record<string, unknown> | undefined,
  customerDisplay: string
): string {
  const fromAddr = pickNameFromBlock(flat);
  const cust = customerDisplay.trim();
  const customerOk = cust.length >= 2 && cust !== "—";
  const nameFromAddrOk = fromAddr.length >= 2;
  if (nameFromAddrOk) return fromAddr;
  if (customerOk) return cust;
  return fromAddr || cust;
}

/**
 * Typische Kürzel als alleiniger Empfängername (kein Liefername).
 * Normalisierung: klein, ohne überflüssige Punkte bei Abkürzungen.
 */
const RECIPIENT_SOLE_NAME_BLOCKLIST = new Set([
  "eg",
  "ag",
  "kg",
  "ohg",
  "gbr",
  "ev",
  "e.v",
  "ug",
  "se",
  "nv",
  "bv",
  "gmbh",
  "partg",
  "vvag",
  "plc",
  "ltd",
  "inc",
  "llc",
  "llp",
  "co",
  "corp",
  "sa",
  "sas",
  "sarl",
  "srl",
]);

function normalizeSoleRecipientKey(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\./g, "")
    .replace(/\s+/g, " ");
}

/**
 * true, wenn der String nicht als alleiniger Liefername gelten soll (Kürzel, Heuristik).
 * Nur anwenden, wenn die Länge schon ≥ 2 — leerer Name bleibt bei ADDRESS_ISSUE_NAME.
 */
export function isRecipientNameUnacceptableAsSoleRecipient(displayName: string): boolean {
  const t = displayName.trim();
  if (t.length < 2) return false;
  const key = normalizeSoleRecipientKey(t);
  if (RECIPIENT_SOLE_NAME_BLOCKLIST.has(key)) return true;
  return isRecipientNameHeuristicUncertain(t);
}

/**
 * Heuristik für „ungewöhnlicher“ Name (Platzhalter, rein numerisch, wenig Buchstaben bei vielen Ziffern).
 * Nur sinnvoll, wenn die Länge schon ≥ 2 — fehlender Name läuft über ADDRESS_ISSUE_NAME.
 */
export function isRecipientNameHeuristicUncertain(displayName: string): boolean {
  const t = displayName.trim();
  if (t.length < 2) return false;
  if (!/\p{L}/u.test(t)) return true;
  if (
    /^(test|xxx|n\/a|na|unknown|unbekannt|tbd|todo|kunde|customer|mustermann|sample|placeholder)$/i.test(t)
  ) {
    return true;
  }
  const compact = t.replace(/\s/g, "");
  if (/^[\d\-./#]+$/.test(compact) && /\d{5,}/.test(compact)) return true;
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  const digits = (t.match(/\d/g) ?? []).length;
  if (digits >= 4 && letters <= 2) return true;
  if (t.length <= 4 && letters <= 2 && digits >= 1) return true;
  return false;
}

function normRecipientHint(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Kurzbezeichnung für kompakte UI (ohne langen Xentral-Key-Klammerzusatz). */
const NAME_HINT_SOURCE_SHORT: Partial<Record<XentralPrimaryAddressFieldKey, string>> = {
  title: "Titel",
  salutation: "Anrede",
  academicTitle: "Akad. Titel",
  contactPerson: "Ansprechpartner",
  contact_person: "Ansprechpartner",
  department: "Abteilung",
  departmentName: "Abteilung",
  subDepartment: "Unterabteilung",
  subdepartment: "Unterabteilung",
  sub_department: "Unterabteilung",
  division: "Bereich",
  address2: "Adresszeile 2",
  line2: "Zeile 2",
  address3: "Adresszeile 3",
  line3: "Zeile 3",
  street2: "Straße 2",
  addressSupplement: "Adresszusatz",
  address_supplement: "Adresszusatz",
  additionalAddressLine: "Zusatzzeile",
};

function recipientNameHintShortLabel(
  key: XentralPrimaryAddressFieldKey,
  longLabel: string
): string {
  const short = NAME_HINT_SOURCE_SHORT[key];
  if (short) return short;
  const stripped = longLabel.replace(/\s*\([^)]*\)\s*$/u, "").trim();
  return stripped.length > 0 ? stripped : longLabel;
}

export type AlternateRecipientNameHint = {
  value: string;
  sourceKey: XentralPrimaryAddressFieldKey;
  sourceLabel: string;
  /** Kompakte Quellenbezeichnung fürs Popup. */
  sourceShort: string;
};

/**
 * Werte aus Titel, Ansprechpartner, Abteilung, Adresszusatz usw., die als Liefername taugen könnten
 * (wenn `name` leer/fraglich, aber Xentral die Info woanders abgelegt hat).
 */
export function findAlternateRecipientNameHints(
  flat: Record<string, unknown> | undefined,
  customerDisplay: string
): AlternateRecipientNameHint[] {
  if (!flat || typeof flat !== "object") return [];
  const resolved = pickNameFromBlock(flat);
  const nameField = (pickFirstString(flat.name) ?? "").trim();
  const cust = customerDisplay.trim();
  const custOk = cust.length >= 2 && cust !== "—";
  const seen = new Set<string>();
  const out: AlternateRecipientNameHint[] = [];

  for (const key of XENTRAL_RECIPIENT_NAME_HINT_SCAN_KEYS) {
    const raw = (pickFirstString(flat[key]) ?? "").trim();
    if (raw.length < 2 || !/\p{L}/u.test(raw)) continue;
    if (isRecipientNameUnacceptableAsSoleRecipient(raw)) continue;
    const n = normRecipientHint(raw);
    if (seen.has(n)) continue;
    if (resolved && normRecipientHint(resolved) === n) continue;
    if (nameField && normRecipientHint(nameField) === n) continue;
    if (custOk && normRecipientHint(cust) === n) continue;
    seen.add(n);
    const sourceLabel = XENTRAL_PRIMARY_ADDRESS_FIELD_LABELS[key];
    out.push({
      value: raw,
      sourceKey: key,
      sourceLabel,
      sourceShort: recipientNameHintShortLabel(key, sourceLabel),
    });
    if (out.length >= 4) break;
  }
  return out;
}

/** Name laut Regeln ungültig oder heuristisch fraglich (für Markierung / Speicher-Rückfrage). */
export function shippingFlatRecipientNameUncertain(
  flat: Record<string, unknown> | undefined,
  customerDisplay: string
): boolean {
  const { issues } = computeAddressValidation({
    shipping: flat,
    billing: undefined,
    customerDisplay,
  });
  if (issues.includes(ADDRESS_ISSUE_NAME) || issues.includes(ADDRESS_ISSUE_NAME_UNSUITABLE)) {
    return true;
  }
  const best = resolveBestRecipientDisplayForNameCheck(flat, customerDisplay);
  return isRecipientNameHeuristicUncertain(best);
}

/** Speicher-Bestätigung: nur bei Ungewissheit zu Name oder Hausnummer (nicht bei ausschließlich PLZ/Straße). */
export function shippingFlatNeedsNameOrHnSaveConfirm(
  flat: Record<string, unknown> | undefined,
  customerDisplay: string
): boolean {
  return (
    shippingFlatMissingHouseNumber(flat) || shippingFlatRecipientNameUncertain(flat, customerDisplay)
  );
}
