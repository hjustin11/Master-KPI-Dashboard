"use client";

import { useMemo } from "react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/i18n/I18nProvider";
import type { CrossListingDraftValues } from "@/shared/lib/crossListing/crossListingDraftTypes";
import { validateForAmazonSubmit } from "@/shared/lib/crossListing/amazonPreSubmitValidator";

/** Statische Liste — attributeRegistry nutzt node:fs, nicht client-safe. */
const PRODUCT_TYPES = [
  "ANIMAL_STAIR", "ANIMAL_WATER_DISPENSER", "AREA_DEODORIZER",
  "FOOD_STORAGE_CONTAINER", "HAIR_TRIMMER", "LITTER_BOX",
  "PET_ACTIVITY_STRUCTURE", "PET_FEEDER", "PET_SUPPLIES", "WASTE_BAG",
];

const PFLICHT_COUNT = 27;

type Props = {
  values: CrossListingDraftValues;
  setValues: (fn: (v: CrossListingDraftValues) => CrossListingDraftValues) => void;
  sku: string;
};

const DG_OPTIONS = [
  { label: "Nicht zutreffend", value: "Nicht zutreffend" },
  { label: "Lagerung", value: "Lagerung" },
  { label: "Transport", value: "Transport" },
  { label: "GHS", value: "GHS" },
];

const COUNTRY_OPTIONS = [
  "Deutschland", "China", "Vereinigte Staaten", "Frankreich", "Italien",
  "Spanien", "Niederlande", "Polen", "Tschechien", "Österreich", "Türkei",
  "Indien", "Vietnam", "Thailand",
];

const EPR_OPTIONS = [
  { label: "Papier", value: "Papier" },
  { label: "Kunststoff", value: "Kunststoff" },
  { label: "Metall", value: "Metall" },
  { label: "Glas", value: "Glas" },
  { label: "Holz", value: "Holz" },
  { label: "Textil", value: "Textil" },
];

function setAttr(setValues: Props["setValues"], key: string, value: string | null) {
  if (value === null) return;
  setValues((v) => ({ ...v, attributes: { ...v.attributes, [key]: value } }));
}

function a(attrs: Record<string, string>, key: string, fallback = ""): string {
  return attrs[key] ?? fallback;
}

function FieldRow({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <label className="w-40 shrink-0 text-[11px] font-medium text-muted-foreground">
        {label}
        {required && <span className="ml-0.5 text-rose-500">*</span>}
      </label>
      <div className="flex-1">{children}</div>
    </div>
  );
}

export function CrossListingAmazonFields({ values, setValues, sku }: Props) {
  const { t } = useTranslation();
  const productTypes = PRODUCT_TYPES;
  // Browse-Nodes werden automatisch per detectBrowseNode() im Dialog-Init gesetzt
  const attrs = useMemo(() => values.attributes ?? {}, [values.attributes]);

  const validation = useMemo(
    () => validateForAmazonSubmit(values, values.amazonProductType || "PET_SUPPLIES"),
    [values]
  );

  const filledCount = useMemo(() => {
    let count = 0;
    if (values.title?.trim()) count++;
    if (values.brand?.trim()) count++;
    if (values.description?.trim()) count++;
    if (values.images.length > 0) count++;
    if (values.ean?.trim()) count++;
    if (values.priceEur?.trim()) count++;
    if (values.bullets.length > 0) count++;
    for (const k of ["model_number", "country_of_origin", "supplier_declared_dg_hz_regulation",
      "batteries_required", "batteries_included", "epr_product_packaging.main_material",
      "warranty_description", "recommended_browse_nodes", "unit_count"]) {
      if (attrs[k]?.trim()) count++;
    }
    return count;
  }, [values, attrs]);

  function applyDefaults() {
    setValues((v) => ({
      ...v,
      attributes: {
        ...v.attributes,
        model_number: v.attributes.model_number || sku,
        model_name: v.attributes.model_name || v.title,
        manufacturer: v.attributes.manufacturer || v.brand,
        country_of_origin: v.attributes.country_of_origin || "Deutschland",
        supplier_declared_dg_hz_regulation: v.attributes.supplier_declared_dg_hz_regulation || "Nicht zutreffend",
        batteries_required: v.attributes.batteries_required || "Nein",
        batteries_included: v.attributes.batteries_included || "Nein",
        "epr_product_packaging.main_material": v.attributes["epr_product_packaging.main_material"] || "Papier",
        warranty_description: v.attributes.warranty_description || "Gesetzliche Gewährleistung",
        unit_count: v.attributes.unit_count || "1",
        unit_count_type: v.attributes.unit_count_type || "Stück",
        included_components: v.attributes.included_components || `1x ${v.title}`,
        directions: v.attributes.directions || "Siehe Produktverpackung",
        specific_uses_for_product: v.attributes.specific_uses_for_product || v.petSpecies || "Haustiere",
      },
    }));
  }

  return (
    <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {t("crossListing.amazon.pflichtfelder")}
        </h4>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[10px]">
            {filledCount}/{PFLICHT_COUNT}
          </Badge>
          <Button size="sm" variant="ghost" onClick={applyDefaults} className="h-6 text-[10px]">
            {t("crossListing.amazon.applyDefaults")}
          </Button>
        </div>
      </div>

      {/* Produkttyp */}
      <FieldRow label={t("crossListing.amazon.productType")} required>
        <Select
          value={values.amazonProductType || "PET_SUPPLIES"}
          onValueChange={(v) => { if (v) setValues((prev) => ({ ...prev, amazonProductType: v })); }}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {productTypes.map((pt) => (
              <SelectItem key={pt} value={pt}>{pt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Browse-Node */}
      <FieldRow label={t("crossListing.amazon.browseNode")} required>
        <div className="flex items-center gap-1.5">
          <Input
            value={a(attrs, "recommended_browse_nodes")}
            onChange={(e) => setAttr(setValues, "recommended_browse_nodes", e.target.value)}
            placeholder="Browse-Node-ID"
            className="h-7 flex-1 text-xs"
          />
          {a(attrs, "recommended_browse_nodes") && (
            <Badge variant="secondary" className="shrink-0 text-[9px]">
              {t("crossListing.amazon.autoDetected")}
            </Badge>
          )}
        </div>
      </FieldRow>

      {/* Modell */}
      <FieldRow label={t("crossListing.amazon.modelNumber")}>
        <Input
          value={a(attrs, "model_number")}
          onChange={(e) => setAttr(setValues, "model_number", e.target.value)}
          placeholder={sku}
          className="h-7 text-xs"
        />
      </FieldRow>

      {/* Ursprungsland */}
      <FieldRow label={t("crossListing.amazon.countryOfOrigin")} required>
        <Select
          value={a(attrs, "country_of_origin", "Deutschland")}
          onValueChange={(v) => setAttr(setValues, "country_of_origin", v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COUNTRY_OPTIONS.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Gefahrgut */}
      <FieldRow label={t("crossListing.amazon.dgRegulation")} required>
        <Select
          value={a(attrs, "supplier_declared_dg_hz_regulation", "Nicht zutreffend")}
          onValueChange={(v) => setAttr(setValues, "supplier_declared_dg_hz_regulation", v)}
        >
          <SelectTrigger className="h-7 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DG_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Batterien */}
      <FieldRow label={t("crossListing.amazon.batteriesRequired")}>
        <Select
          value={a(attrs, "batteries_required", "Nein")}
          onValueChange={(v) => setAttr(setValues, "batteries_required", v)}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Ja">Ja</SelectItem>
            <SelectItem value="Nein">Nein</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      <FieldRow label={t("crossListing.amazon.batteriesIncluded")}>
        <Select
          value={a(attrs, "batteries_included", "Nein")}
          onValueChange={(v) => setAttr(setValues, "batteries_included", v)}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="Ja">Ja</SelectItem>
            <SelectItem value="Nein">Nein</SelectItem>
          </SelectContent>
        </Select>
      </FieldRow>

      {/* EPR Verpackung */}
      <FieldRow label={t("crossListing.amazon.eprMaterial")} required>
        <Select
          value={a(attrs, "epr_product_packaging.main_material", "Papier")}
          onValueChange={(v) => setAttr(setValues, "epr_product_packaging.main_material", v)}
        >
          <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            {EPR_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FieldRow>

      {/* Garantie */}
      <FieldRow label={t("crossListing.amazon.warranty")}>
        <Input
          value={a(attrs, "warranty_description")}
          onChange={(e) => setAttr(setValues, "warranty_description", e.target.value)}
          placeholder="Gesetzliche Gewährleistung"
          className="h-7 text-xs"
        />
      </FieldRow>

      {/* Validation errors */}
      {!validation.valid && (
        <div className="rounded border border-rose-200 bg-rose-50 p-2 text-[10px] text-rose-700 dark:border-rose-800 dark:bg-rose-950/30">
          <p className="font-semibold">{validation.errors.length} {t("crossListing.amazon.missingFields")}:</p>
          <ul className="mt-0.5 list-disc pl-3">
            {validation.errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e.message}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
