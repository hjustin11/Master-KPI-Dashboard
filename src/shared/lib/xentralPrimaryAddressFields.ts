/** Xentral-Attribute der primären Liefer-/Rechnungsadresse: je UI-Feld genau ein JSON-Key, kein Fallback. */

export const XENTRAL_PRIMARY_ADDRESS_NAME_KEYS = [
  "name",
  "company",
  "contactPerson",
  "contact_person",
  "firstName",
  "first_name",
  "lastName",
  "last_name",
] as const;

export const XENTRAL_PRIMARY_ADDRESS_LINE_KEYS = [
  "street",
  "streetName",
  "address1",
  "line1",
  "street1",
  "houseNumber",
  "house_number",
  "houseNo",
  "streetNumber",
  "street_number",
  "zip",
  "zipCode",
  "postalCode",
  "postcode",
  "city",
  "town",
  "cityName",
  "country",
  "countryCode",
  "countryIso",
] as const;

/** Titel, Organisation, Zusatzzeilen — oft Liefername in Xentral hier statt in „name“. */
export const XENTRAL_ALTERNATE_RECIPIENT_NAME_KEYS = [
  "title",
  "salutation",
  "academicTitle",
  "department",
  "departmentName",
  "subDepartment",
  "subdepartment",
  "sub_department",
  "division",
  "address2",
  "line2",
  "address3",
  "line3",
  "street2",
  "addressSupplement",
  "address_supplement",
  "additionalAddressLine",
] as const;

export type XentralAlternateRecipientNameKey = (typeof XENTRAL_ALTERNATE_RECIPIENT_NAME_KEYS)[number];

/** Felder, in denen eine Hausnummer landen kann, obwohl Straße + Hausnummer-Felder leer bleiben. */
export const XENTRAL_HOUSE_NUMBER_HINT_SCAN_KEYS = [
  "address2",
  "line2",
  "address3",
  "line3",
  "street2",
  "addressSupplement",
  "address_supplement",
  "additionalAddressLine",
  "company",
] as const satisfies readonly XentralPrimaryAddressFieldKey[];

/** Mögliche Xentral-Keys für die Hausnummer (Schreibziel beim Übernehmen eines Vorschlags). */
export const XENTRAL_HOUSE_NUMBER_FIELD_KEYS = [
  "houseNumber",
  "house_number",
  "houseNo",
  "streetNumber",
  "street_number",
] as const satisfies readonly XentralPrimaryAddressFieldKey[];

/**
 * Reihenfolge für Namens-Vorschläge: Titel/Ansprechpartner vor Abteilung/Zusatzzeilen.
 * `name` steht in der UI separat; `pickNameFromBlock` liest name vor contactPerson — bei vollem
 * aber fragwürdigem `name` können Ansprechpartner & Co. trotzdem sinnvolle Vorschläge liefern.
 */
export const XENTRAL_RECIPIENT_NAME_HINT_SCAN_KEYS = [
  "title",
  "salutation",
  "academicTitle",
  "contactPerson",
  "contact_person",
  ...XENTRAL_ALTERNATE_RECIPIENT_NAME_KEYS,
] as const satisfies readonly XentralPrimaryAddressFieldKey[];

export const XENTRAL_PRIMARY_ADDRESS_FIELD_KEYS = [
  ...XENTRAL_PRIMARY_ADDRESS_NAME_KEYS,
  ...XENTRAL_PRIMARY_ADDRESS_LINE_KEYS,
  ...XENTRAL_ALTERNATE_RECIPIENT_NAME_KEYS,
] as const;

export type XentralPrimaryAddressFieldKey = (typeof XENTRAL_PRIMARY_ADDRESS_FIELD_KEYS)[number];

export type XentralPrimaryAddressFields = Record<XentralPrimaryAddressFieldKey, string>;

/** Mögliche Xentral-Keys für die Postleitzahl (häufig zipCode/postalCode statt zip). */
export const XENTRAL_PLZ_FIELD_KEYS = ["zip", "zipCode", "postalCode", "postcode"] as const satisfies readonly
  XentralPrimaryAddressFieldKey[];

/** Ort: city / town / cityName — Reihenfolge wie in normalizeAddressBlock (API). */
export const XENTRAL_CITY_FIELD_KEYS = ["city", "town", "cityName"] as const satisfies readonly
  XentralPrimaryAddressFieldKey[];

/**
 * Liefert den angezeigten PLZ-Wert und den Key, der in Xentral befüllt ist.
 * Leere Felder → Bearbeitung schreibt in `zip`.
 */
export function resolvePlzEditBinding(fields: XentralPrimaryAddressFields): {
  key: XentralPrimaryAddressFieldKey;
  value: string;
} {
  for (const k of XENTRAL_PLZ_FIELD_KEYS) {
    const raw = fields[k];
    if (raw != null && String(raw).trim() !== "") {
      return { key: k, value: String(raw) };
    }
  }
  return { key: "zip", value: "" };
}

/**
 * Liefert den angezeigten Ort und den Xentral-Key.
 * Leere Felder → Bearbeitung schreibt in `city`.
 */
export function resolveCityEditBinding(fields: XentralPrimaryAddressFields): {
  key: XentralPrimaryAddressFieldKey;
  value: string;
} {
  for (const k of XENTRAL_CITY_FIELD_KEYS) {
    const raw = fields[k];
    if (raw != null && String(raw).trim() !== "") {
      return { key: k, value: String(raw) };
    }
  }
  return { key: "city", value: "" };
}

/**
 * Hausnummer: angezeigter Wert und Xentral-Key. Leer → Schreibziel `houseNumber`.
 */
export function resolveHouseNumberEditBinding(fields: XentralPrimaryAddressFields): {
  key: XentralPrimaryAddressFieldKey;
  value: string;
} {
  for (const k of XENTRAL_HOUSE_NUMBER_FIELD_KEYS) {
    const raw = fields[k];
    if (raw != null && String(raw).trim() !== "") {
      return { key: k, value: String(raw) };
    }
  }
  return { key: "houseNumber", value: "" };
}

function pickString(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value).trim();
  return "";
}

export function emptyPrimaryAddressFields(): XentralPrimaryAddressFields {
  const o = {} as XentralPrimaryAddressFields;
  for (const k of XENTRAL_PRIMARY_ADDRESS_FIELD_KEYS) o[k] = "";
  return o;
}

/** Liest jedes Feld nur aus dem gleichnamigen Xentral-Attribut. */
export function extractPrimaryAddressFieldsOneToOne(
  block: Record<string, unknown> | undefined
): XentralPrimaryAddressFields {
  const o = emptyPrimaryAddressFields();
  if (!block || typeof block !== "object") return o;
  for (const k of XENTRAL_PRIMARY_ADDRESS_FIELD_KEYS) {
    o[k] = pickString(block[k]);
  }
  return o;
}

/** Kurzbeschriftung + Xentral-Key in Klammern (für Formular). */
export const XENTRAL_PRIMARY_ADDRESS_FIELD_LABELS: Record<XentralPrimaryAddressFieldKey, string> = {
  name: "Name (name)",
  company: "Firma (company)",
  contactPerson: "Ansprechpartner (contactPerson)",
  contact_person: "Ansprechpartner (contact_person)",
  firstName: "Vorname (firstName)",
  first_name: "Vorname (first_name)",
  lastName: "Nachname (lastName)",
  last_name: "Nachname (last_name)",
  street: "Straße (street)",
  streetName: "Straße (streetName)",
  address1: "Adresszeile (address1)",
  line1: "Zeile 1 (line1)",
  street1: "Straße (street1)",
  houseNumber: "Hausnummer (houseNumber)",
  house_number: "Hausnummer (house_number)",
  houseNo: "Hausnr. (houseNo)",
  streetNumber: "Straßennummer (streetNumber)",
  street_number: "Straßennummer (street_number)",
  zip: "PLZ (zip)",
  zipCode: "PLZ (zipCode)",
  postalCode: "PLZ (postalCode)",
  postcode: "PLZ (postcode)",
  city: "Ort (city)",
  town: "Ort (town)",
  cityName: "Ort (cityName)",
  country: "Land (country)",
  countryCode: "Ländercode (countryCode)",
  countryIso: "ISO-Land (countryIso)",
  title: "Titel (title)",
  salutation: "Anrede (salutation)",
  academicTitle: "Akademischer Titel (academicTitle)",
  department: "Abteilung (department)",
  departmentName: "Abteilung (departmentName)",
  subDepartment: "Unterabteilung (subDepartment)",
  subdepartment: "Unterabteilung (subdepartment)",
  sub_department: "Unterabteilung (sub_department)",
  division: "Bereich (division)",
  address2: "Adresszeile 2 (address2)",
  line2: "Zeile 2 (line2)",
  address3: "Adresszeile 3 (address3)",
  line3: "Zeile 3 (line3)",
  street2: "Straße 2 (street2)",
  addressSupplement: "Adresszusatz (addressSupplement)",
  address_supplement: "Adresszusatz (address_supplement)",
  additionalAddressLine: "Zusätzliche Zeile (additionalAddressLine)",
};
