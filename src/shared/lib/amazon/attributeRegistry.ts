import { readFileSync } from "node:fs";
import { join } from "node:path";

// --- Types ---

type RegistryJson = {
  product_types: Record<string, Record<string, string[]>>;
  global_fields: Record<string, string[]>;
  offer_fields: Array<{ group: string; api_field: string; label: string; description?: string; example?: string; required?: string }>;
  alias_mappings: Record<string, Record<string, string>>;
  pflicht_fields_base: PflichtField[];
};

export type PflichtField = {
  api: string;
  label: string;
  required?: boolean;
  max?: number;
  max_items?: number;
  max_per_item?: number;
  enum?: string[];
  use_alias?: string;
  default?: string;
  default_de?: string;
  needs_unit?: string | boolean;
  product_type_dependent?: boolean;
};

// --- Memory Cache ---

let _registry: RegistryJson | null = null;

function loadRegistry(): RegistryJson {
  if (_registry) return _registry;
  const filePath = join(process.cwd(), "content", "amazon_attribute_registry_v2.json");
  const raw = readFileSync(filePath, "utf-8");
  _registry = JSON.parse(raw) as RegistryJson;
  return _registry;
}

// --- Exports ---

export function getProductTypes(): string[] {
  return Object.keys(loadRegistry().product_types);
}

export function getFieldsForProductType(productType: string): Record<string, string[]> {
  return loadRegistry().product_types[productType] ?? {};
}

export function getAllowedValues(productType: string, germanFieldLabel: string): string[] {
  const typeFields = loadRegistry().product_types[productType];
  if (typeFields?.[germanFieldLabel]) return typeFields[germanFieldLabel];
  const global = loadRegistry().global_fields;
  return global[germanFieldLabel] ?? [];
}

export function getBrowseNodes(productType: string): string[] {
  const fields = loadRegistry().product_types[productType];
  return fields?.["Empfohlene Browse Nodes"] ?? fields?.["Empfohlene Stöbern-Knoten"] ?? [];
}

export function getBasePflichtFields(): PflichtField[] {
  return loadRegistry().pflicht_fields_base;
}

export function getOfferFields() {
  return loadRegistry().offer_fields;
}

// --- Alias Translation ---

// Extra mappings not in the JSON file
const BUILTIN_ALIASES: Record<string, Record<string, string>> = {
  "condition_type.value": {
    "Neu": "new_new",
    "Gebraucht - Wie neu": "used_like_new",
    "Gebraucht - Sehr gut": "used_very_good",
    "Gebraucht - Gut": "used_good",
    "Gebraucht - Akzeptabel": "used_acceptable",
    "Sammlerstück - Wie neu": "collectible_like_new",
    "Sammlerstück - Sehr gut": "collectible_very_good",
    "Sammlerstück - Gut": "collectible_good",
    "Sammlerstück - Akzeptabel": "collectible_acceptable",
    "Generalüberholt": "refurbished_refurbished",
  },
  "country_of_origin.value": {
    "Deutschland": "DE", "Spanien": "ES", "Frankreich": "FR", "Italien": "IT",
    "Niederlande": "NL", "Belgien": "BE", "Österreich": "AT", "Schweiz": "CH",
    "Polen": "PL", "Tschechien": "CZ", "Vereinigtes Königreich": "GB",
    "Vereinigte Staaten": "US", "China": "CN", "Japan": "JP", "Südkorea": "KR",
    "Taiwan": "TW", "Indien": "IN", "Türkei": "TR", "Kanada": "CA",
    "Mexiko": "MX", "Brasilien": "BR", "Australien": "AU",
    "Vietnam": "VN", "Thailand": "TH", "Indonesien": "ID", "Malaysia": "MY",
  },
  "batteries_included.value": {
    "Ja": "true",
    "Nein": "false",
  },
};

export function getAliasMapping(fieldKey: string): Record<string, string> {
  const fromFile = loadRegistry().alias_mappings[fieldKey];
  const builtin = BUILTIN_ALIASES[fieldKey];
  if (fromFile && builtin) return { ...fromFile, ...builtin };
  return fromFile ?? builtin ?? {};
}

export function translateToApiKey(fieldKey: string, germanValue: string): string {
  const mapping = getAliasMapping(fieldKey);
  return mapping[germanValue] ?? germanValue;
}

/**
 * Übersetzt alle Werte in einem flachen Key-Value-Objekt über die Registry-Aliase.
 * Nur Felder die ein bekanntes Alias haben werden übersetzt; alle anderen bleiben.
 */
export function translatePayloadValues(
  values: Record<string, string>
): Record<string, string> {
  const out: Record<string, string> = {};
  const allAliasKeys = new Set([
    ...Object.keys(loadRegistry().alias_mappings),
    ...Object.keys(BUILTIN_ALIASES),
  ]);

  for (const [key, val] of Object.entries(values)) {
    // Try exact match first, then with .value suffix
    const candidates = [key, `${key}.value`];
    let translated = val;
    for (const candidate of candidates) {
      if (allAliasKeys.has(candidate)) {
        translated = translateToApiKey(candidate, val);
        break;
      }
    }
    out[key] = translated;
  }
  return out;
}
