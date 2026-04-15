"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type ColumnDef } from "@tanstack/react-table";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAddressGeocodeSuggest } from "./AddressGeocodeSuggest";
import { MarketplaceOrderIdLink } from "@/shared/components/MarketplaceOrderIdLink";
import { XentralBelegNumberLink } from "./XentralBelegNumberLink";
import { ADDRESS_ERROR_DEMO_ID_PREFIX } from "./addressErrorDemoOrders";
import {
  AddressEditStack,
  AddressValidationCell,
} from "./components/XentralAddressHelpers";
import { DataTable } from "@/shared/components/DataTable";
import { DASHBOARD_PAGE_SHELL, DASHBOARD_PAGE_TITLE } from "@/shared/lib/dashboardUi";
import {
  ADDRESS_HINT_NAME_UNCERTAIN,
  ADDRESS_ISSUE_HN,
  ADDRESS_ISSUE_NAME,
  ADDRESS_ISSUE_NAME_UNSUITABLE,
  computeAddressValidation,
  findAlternateHouseNumberHints,
  findAlternateRecipientNameHints,
  shippingFlatMissingHouseNumber,
  streetHasHouseNumber,
  shippingFlatNeedsNameOrHnSaveConfirm,
  shippingFlatRecipientNameUncertain,
} from "@/shared/lib/shippingAddressValidation";
import {
  resolveCityEditBinding,
  resolveHouseNumberEditBinding,
  resolvePlzEditBinding,
  type XentralPrimaryAddressFieldKey,
} from "@/shared/lib/xentralPrimaryAddressFields";
import {
  AF_INPUT_BASE,
  AF_INPUT_CORRECTED,
  AF_INPUT_UNCERTAIN,
  XENTRAL_ORDERS_CACHE_KEY,
  addressFieldNorm,
  applyAddressDemoMerge,
  defaultBerlinLastTwoDays,
  formatXentralAddressSubmitError,
  mergePrimaryFields,
  resolveAddressDisplay,
  sortAddressDialogOrders,
  withNormalizedPrimaryFields,
  type AddressDialogPhase,
  type CachedPayload,
  type ImportMode,
  type XentralOrderRow,
  type XentralOrdersLoadOptions,
} from "@/shared/lib/xentral-orders-utils";
import {
  DASHBOARD_CLIENT_BACKGROUND_SYNC_MS,
  shouldRunBackgroundSync,
} from "@/shared/lib/dashboardClientCache";
import { mergeXentralOrderLists } from "@/shared/lib/xentralOrderMerge";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import { intlLocaleTag } from "@/i18n/locale-formatting";
import { usePermissions } from "@/shared/hooks/usePermissions";

type XentralAddressErrorDialogRowProps = {
  row: XentralOrderRow;
  rowIndex: number;
  dialogOpen: boolean;
  mode: AddressDialogPhase;
  patchDraftField: (orderId: string, key: XentralPrimaryAddressFieldKey, value: string) => void;
  patchDraftGeocode: (
    orderId: string,
    args: {
      street?: string;
      zipKey?: XentralPrimaryAddressFieldKey;
      zip?: string;
      cityKey?: XentralPrimaryAddressFieldKey;
      city?: string;
    }
  ) => void;
  onRemoveFromDraft: (orderId: string) => void;
  xentralOrderWebBase: string | null;
  xentralSalesOrderWebPath: string;
};

function XentralAddressErrorDialogRow({
  row,
  rowIndex,
  dialogOpen,
  mode,
  patchDraftField,
  patchDraftGeocode,
  onRemoveFromDraft,
  xentralOrderWebBase,
  xentralSalesOrderWebPath,
}: XentralAddressErrorDialogRowProps) {
  const { t } = useTranslation();
  const fields = mergePrimaryFields(row);
  const plz = resolvePlzEditBinding(fields);
  const ort = resolveCityEditBinding(fields);
  const mp = row.marketplace?.trim() || "—";
  const patch = (key: XentralPrimaryAddressFieldKey, value: string) =>
    patchDraftField(row.id, key, value);
  const countryLine =
    [fields.country, fields.countryCode, fields.countryIso].find((s) => s?.trim()) ?? "DE";

  const geo = useAddressGeocodeSuggest({
    dialogOpen: dialogOpen && mode === "edit",
    rowId: row.id,
    rowIndex,
    street: fields.street,
    zipValue: plz.value,
    zipKey: plz.key,
    cityValue: ort.value,
    cityKey: ort.key,
    country: countryLine,
    issues: row.addressValidationIssues ?? [],
    onApplyGeocode: (p) =>
      patchDraftGeocode(row.id, {
        street: p.street,
        zipKey: p.zipKey,
        zip: p.zip,
        cityKey: p.cityKey,
        city: p.city,
      }),
  });

  const sh = geo.hints?.street;
  const zh = geo.hints?.zip;
  const ch = geo.hints?.city;
  const streetMatchesSuggestion = Boolean(sh && addressFieldNorm(fields.street) === addressFieldNorm(sh.to));
  const zipMatchesSuggestion = Boolean(zh && addressFieldNorm(plz.value) === addressFieldNorm(zh.to));
  const cityMatchesSuggestion = Boolean(ch && addressFieldNorm(ort.value) === addressFieldNorm(ch.to));
  const flatFields = fields as unknown as Record<string, unknown>;
  const missingHouseNumber = shippingFlatMissingHouseNumber(flatFields);
  const nameUncertain = shippingFlatRecipientNameUncertain(flatFields, row.customer);
  const issues = row.addressValidationIssues ?? [];
  const nameFieldTitle = issues.includes(ADDRESS_ISSUE_NAME)
    ? ADDRESS_ISSUE_NAME
    : issues.includes(ADDRESS_ISSUE_NAME_UNSUITABLE)
      ? ADDRESS_ISSUE_NAME_UNSUITABLE
      : nameUncertain
        ? ADDRESS_HINT_NAME_UNCERTAIN
        : undefined;

  const showNameAlternateHints =
    issues.includes(ADDRESS_ISSUE_NAME) ||
    issues.includes(ADDRESS_ISSUE_NAME_UNSUITABLE) ||
    nameUncertain;
  const nameAlternateHints = showNameAlternateHints
    ? findAlternateRecipientNameHints(flatFields, row.customer)
    : [];
  const houseNumberAlternateHints = missingHouseNumber
    ? findAlternateHouseNumberHints(flatFields)
    : [];
  const hnTarget = resolveHouseNumberEditBinding(fields);
  const streetHasHn = streetHasHouseNumber(fields.street ?? "");

  if (mode === "review") {
    return (
      <TableRow className="border-b border-border/40 transition-colors odd:bg-muted/[0.12] [&>td]:align-middle">
        <TableCell className="sticky left-0 z-10 w-12 border-border/50 bg-background px-1 py-2 align-middle text-center shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            title={t("xentralOrders.removeFromSubmitTitle")}
            aria-label={t("xentralOrders.removeReviewAria", { doc: row.documentNumber })}
            onClick={() => onRemoveFromDraft(row.id)}
          >
            <X className="size-4" strokeWidth={2.25} aria-hidden />
          </Button>
        </TableCell>
        <TableCell className="sticky left-12 z-10 w-[9.5rem] border-border/50 bg-background px-3 py-2 align-middle text-left text-xs shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
          <div className="flex min-h-[3.5rem] w-full items-center justify-start">
            <XentralBelegNumberLink
              documentNumber={row.documentNumber}
              salesOrderId={row.id}
              webBase={xentralOrderWebBase}
              webPath={xentralSalesOrderWebPath}
              className="text-xs"
            />
          </div>
        </TableCell>
        <TableCell className="sticky left-[12.5rem] z-10 w-[9.5rem] border-border/50 bg-background px-3 py-2 align-middle text-left text-xs shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
          <div className="flex min-h-[3.5rem] w-full items-center justify-start">
            <MarketplaceOrderIdLink
              marketplace={row.marketplace}
              internetNumber={row.internetNumber}
              className="text-xs"
            />
          </div>
        </TableCell>
        <TableCell className="sticky left-[22rem] z-10 w-[9rem] border-border/50 bg-background px-3 py-2 align-middle text-center text-xs text-muted-foreground shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
          <div className="flex min-h-[3.5rem] w-full items-center justify-center text-center">{mp}</div>
        </TableCell>
        <TableCell className="max-w-[11rem] border-border/50 px-2 py-2 align-middle">
          <p className="truncate text-xs font-medium text-foreground" title={fields.name}>
            {fields.name?.trim() || "—"}
          </p>
        </TableCell>
        <TableCell className="max-w-[14rem] border-border/50 px-3 py-2 align-middle">
          <p className="truncate text-xs text-foreground/90" title={fields.street}>
            {fields.street?.trim() || "—"}
          </p>
        </TableCell>
        <TableCell className="border-border/50 px-2 py-2 align-middle text-center">
          <span className="text-xs tabular-nums text-foreground/90">{plz.value || "—"}</span>
        </TableCell>
        <TableCell className="border-border/50 px-3 py-2 align-middle">
          <span className="truncate text-xs text-foreground/90" title={ort.value}>
            {ort.value || "—"}
          </span>
        </TableCell>
      </TableRow>
    );
  }

  const dialogEditCellInner = "flex min-h-[3.5rem] w-full items-center";
  /** Beleg / Bestellnr.: links wie Haupttabelle; Marktplatz: zentriert. */
  const dialogEditCellStickyId =
    "flex min-h-[3.5rem] w-full items-center justify-start text-left";
  const dialogEditCellStickyMeta =
    "flex min-h-[3.5rem] w-full items-center justify-center text-center";

  return (
    <TableRow className="border-b border-border/50 transition-colors hover:bg-muted/25 [&>td]:align-middle">
      <TableCell className="sticky left-0 z-10 w-12 min-w-12 max-w-12 border-border/50 bg-background px-1 py-3 align-middle text-center shadow-[3px_0_14px_-4px_rgba(0,0,0,0.08)]">
        <div className={`${dialogEditCellInner} justify-center`}>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground hover:text-destructive"
            title={t("xentralOrders.removeFromDraftTitle")}
            aria-label={t("xentralOrders.removeEditAria", { doc: row.documentNumber })}
            onClick={() => onRemoveFromDraft(row.id)}
          >
            <X className="size-4" strokeWidth={2.25} aria-hidden />
          </Button>
        </div>
      </TableCell>
      <TableCell className="sticky left-12 z-10 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] border-border/50 bg-background px-3 py-3 align-middle text-left shadow-[3px_0_14px_-4px_rgba(0,0,0,0.08)]">
        <div className={dialogEditCellStickyId}>
          <div className="min-w-0 w-full max-w-full break-all text-xs leading-snug">
            <XentralBelegNumberLink
              documentNumber={row.documentNumber}
              salesOrderId={row.id}
              webBase={xentralOrderWebBase}
              webPath={xentralSalesOrderWebPath}
              className="text-xs"
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="sticky left-[12.5rem] z-10 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] border-border/50 bg-background px-3 py-3 align-middle text-left shadow-[3px_0_14px_-4px_rgba(0,0,0,0.08)]">
        <div className={dialogEditCellStickyId}>
          <div className="min-w-0 w-full max-w-full break-all text-xs leading-snug">
            <MarketplaceOrderIdLink
              marketplace={row.marketplace}
              internetNumber={row.internetNumber}
              className="text-xs"
            />
          </div>
        </div>
      </TableCell>
      <TableCell className="sticky left-[22rem] z-10 w-[9rem] min-w-[9rem] max-w-[9rem] border-border/50 bg-background px-3 py-3 align-middle text-center text-muted-foreground shadow-[3px_0_14px_-4px_rgba(0,0,0,0.08)]">
        <div className={dialogEditCellStickyMeta}>
          <div className="min-w-0 w-full max-w-full break-words text-xs leading-snug">{mp}</div>
        </div>
      </TableCell>
      <TableCell className="min-w-0 max-w-[11rem] border-border/50 bg-transparent px-2 py-3 align-middle">
        <div className={dialogEditCellInner}>
        <AddressEditStack>
          <div className="flex w-full min-w-0 max-w-full items-center gap-1">
            <Input
              id={`${row.id}-name`}
              className={cn(
                AF_INPUT_BASE,
                "min-w-0 flex-1",
                nameUncertain ||
                  issues.includes(ADDRESS_ISSUE_NAME) ||
                  issues.includes(ADDRESS_ISSUE_NAME_UNSUITABLE)
                  ? AF_INPUT_UNCERTAIN
                  : null
              )}
              value={fields.name}
              onChange={(e) => patch("name", e.target.value)}
              autoComplete="off"
              aria-invalid={
                nameUncertain ||
                issues.includes(ADDRESS_ISSUE_NAME) ||
                issues.includes(ADDRESS_ISSUE_NAME_UNSUITABLE)
              }
              title={nameFieldTitle}
              aria-label={
                nameFieldTitle
                  ? t("xentralOrders.nameFieldWithHint", { hint: nameFieldTitle })
                  : t("xentralOrders.nameFieldBase")
              }
            />
            {nameAlternateHints.length > 0 ? (
              <Popover>
                <PopoverTrigger
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-amber-600 outline-none transition-colors hover:bg-amber-500/10 hover:text-amber-800 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-amber-400 dark:hover:bg-amber-500/15 dark:hover:text-amber-200"
                  )}
                  title={t("xentralOrders.nameSuggestionsTitle")}
                  aria-label={t("xentralOrders.nameSuggestionsAria")}
                >
                  <Sparkles className="size-4" aria-hidden />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="left"
                  sideOffset={6}
                  className="w-[min(calc(100vw-2rem),18.5rem)] border-amber-500/20 p-2.5 shadow-md"
                >
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("xentralOrders.suggestionsHeading")}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {nameAlternateHints.map((h) => {
                      const suggested = h.value.trim();
                      const nameInField = (fields.name ?? "").trim();
                      const mergedName =
                        nameInField.length > 0 &&
                        addressFieldNorm(suggested) !== addressFieldNorm(nameInField)
                          ? `${suggested} - ${nameInField}`
                          : null;
                      return (
                        <li key={`${row.id}-${h.sourceKey}-${addressFieldNorm(h.value)}`}>
                          <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
                            <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300/95">
                              {h.sourceShort}
                            </p>
                            <p className="mt-0.5 line-clamp-2 text-xs text-foreground" title={h.value}>
                              {h.value}
                            </p>
                            <div className="mt-1.5 flex flex-col gap-1">
                              <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                className="h-7 w-full text-[11px]"
                                onClick={() => patch("name", suggested)}
                              >
                                {t("xentralOrders.applySuggestionOnly")}
                              </Button>
                              {mergedName ? (
                                <>
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-auto min-h-7 w-full whitespace-normal py-1.5 text-left text-[11px] leading-snug"
                                    title={mergedName}
                                    onClick={() => patch("name", mergedName)}
                                  >
                                    {t("xentralOrders.applySuggestionMerged")}
                                  </Button>
                                  <p
                                    className="rounded border border-dashed border-border/70 bg-background/60 px-1.5 py-1 text-[10px] leading-tight text-muted-foreground"
                                    title={mergedName}
                                  >
                                    {mergedName}
                                  </p>
                                </>
                              ) : null}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        </AddressEditStack>
        </div>
      </TableCell>
      <TableCell className="min-w-[13rem] border-border/50 bg-transparent px-3 py-3 align-middle">
        <div className={dialogEditCellInner}>
        <AddressEditStack
          beforeFrom={sh?.from}
          showGeocodeLoading={geo.loading}
        >
          <div className="flex w-full min-w-0 max-w-full items-center gap-1">
            <Input
              id={`${row.id}-street`}
              className={cn(
                AF_INPUT_BASE,
                "min-w-0 flex-1",
                missingHouseNumber
                  ? AF_INPUT_UNCERTAIN
                  : streetMatchesSuggestion
                    ? AF_INPUT_CORRECTED
                    : null
              )}
              value={fields.street}
              onChange={(e) => patch("street", e.target.value)}
              autoComplete="street-address"
              aria-invalid={missingHouseNumber}
              title={missingHouseNumber ? ADDRESS_ISSUE_HN : undefined}
              aria-label={
                missingHouseNumber
                  ? t("xentralOrders.streetFieldWithHn", { hint: ADDRESS_ISSUE_HN })
                  : t("xentralOrders.streetFieldBase")
              }
            />
            {houseNumberAlternateHints.length > 0 ? (
              <Popover>
                <PopoverTrigger
                  className={cn(
                    "inline-flex size-8 shrink-0 items-center justify-center rounded-lg border border-transparent text-amber-600 outline-none transition-colors hover:bg-amber-500/10 hover:text-amber-800 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40 dark:text-amber-400 dark:hover:bg-amber-500/15 dark:hover:text-amber-200"
                  )}
                  title={t("xentralOrders.houseNumberSuggestionsTitle")}
                  aria-label={t("xentralOrders.houseNumberSuggestionsAria")}
                >
                  <Sparkles className="size-4" aria-hidden />
                </PopoverTrigger>
                <PopoverContent
                  align="end"
                  side="left"
                  sideOffset={6}
                  className="w-[min(calc(100vw-2rem),18.5rem)] border-amber-500/20 p-2.5 shadow-md"
                >
                  <p className="mb-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                    {t("xentralOrders.suggestionsHeading")}
                  </p>
                  <ul className="m-0 flex list-none flex-col gap-2 p-0">
                    {houseNumberAlternateHints.map((h) => (
                      <li key={`${row.id}-hn-${h.sourceKey}-${addressFieldNorm(h.value)}`}>
                        <div className="rounded-md border border-border/60 bg-muted/30 px-2 py-1.5">
                          <p className="text-[10px] font-medium text-amber-800 dark:text-amber-300/95">
                            {h.sourceShort}
                          </p>
                          <p className="mt-0.5 text-xs font-medium text-foreground" title={h.value}>
                            {h.value}
                          </p>
                          {addressFieldNorm(h.sourceRaw) !== addressFieldNorm(h.value) ? (
                            <p
                              className="mt-0.5 line-clamp-2 text-[10px] text-muted-foreground"
                              title={h.sourceRaw}
                            >
                              {h.sourceRaw}
                            </p>
                          ) : null}
                          <div className="mt-1.5 flex flex-col gap-1">
                            <Button
                              type="button"
                              variant="secondary"
                              size="sm"
                              className="h-7 w-full text-[11px]"
                              onClick={() => patch(hnTarget.key, h.value)}
                            >
                              {t("xentralOrders.applyHouseNumberToField")}
                            </Button>
                            {!streetHasHn ? (
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                className="h-auto min-h-7 w-full whitespace-normal py-1.5 text-left text-[11px] leading-snug"
                                title={`${fields.street} ${h.value}`.trim()}
                                onClick={() =>
                                  patch("street", `${(fields.street ?? "").trim()} ${h.value}`.trim())
                                }
                              >
                                {t("xentralOrders.applyHouseNumberToStreet")}
                              </Button>
                            ) : null}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                </PopoverContent>
              </Popover>
            ) : null}
          </div>
        </AddressEditStack>
        </div>
      </TableCell>
      <TableCell className="w-[6.75rem] min-w-[6.75rem] max-w-[7.5rem] border-border/50 bg-transparent px-2 py-3 align-middle">
        <div className={dialogEditCellInner}>
        <AddressEditStack beforeFrom={zh?.from} alignCenter>
          <Input
            id={`${row.id}-zip`}
            className={cn(
              AF_INPUT_BASE,
              "w-full max-w-[6.5rem] px-2 text-center text-xs tabular-nums tracking-wide",
              zipMatchesSuggestion ? AF_INPUT_CORRECTED : null
            )}
            value={plz.value}
            onChange={(e) => patch(plz.key, e.target.value)}
            autoComplete="postal-code"
            maxLength={16}
            aria-label={t("xentralOrders.zipAria", { key: plz.key })}
          />
        </AddressEditStack>
        </div>
      </TableCell>
      <TableCell className="min-w-[10rem] border-border/50 bg-transparent px-3 py-3 align-middle">
        <div className={dialogEditCellInner}>
        <AddressEditStack beforeFrom={ch?.from}>
          <Input
            id={`${row.id}-city`}
            className={cn(AF_INPUT_BASE, cityMatchesSuggestion ? AF_INPUT_CORRECTED : null)}
            value={ort.value}
            onChange={(e) => patch(ort.key, e.target.value)}
            autoComplete="address-level2"
            aria-label={t("xentralOrders.cityAria", { key: ort.key })}
          />
        </AddressEditStack>
        </div>
      </TableCell>
    </TableRow>
  );
}

export default function XentralOrdersPage() {
  const { t, locale } = useTranslation();
  const { canUseAction } = usePermissions();
  const intlTag = intlLocaleTag(locale);
  const formatMoney = useCallback(
    (amount: number | null, currency: string | null) => {
  if (amount == null || !Number.isFinite(amount)) return "—";
      return new Intl.NumberFormat(intlTag, {
    style: "currency",
    currency: (currency || "EUR").trim() || "EUR",
  }).format(amount);
    },
    [intlTag]
  );

  const [data, setData] = useState<XentralOrderRow[]>([]);
  const [displayedRows, setDisplayedRows] = useState<XentralOrderRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState<number | null>(null);
  const [importMode, setImportMode] = useState<ImportMode>("recent");
  /** Nach Mount setzen — verhindert Hydration-Mismatch (Datum/Intl zwischen Server und Browser). */
  const [hasMounted, setHasMounted] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const berlinRangeRef = useRef({ from: "", to: "" });
  /** Aktuelle Filterdaten für fetch — vermeidet veraltete Closures in `load`. */
  const dateFromRef = useRef("");
  const dateToRef = useRef("");
  const prevDateFilterRef = useRef<{ from: string; to: string } | null>(null);
  const [addressErrorsOpen, setAddressErrorsOpen] = useState(false);
  /** Nur Dialog: bis „Speichern“ keine Änderung an Haupttabelle / localStorage. */
  const [addressDialogDraft, setAddressDialogDraft] = useState<Record<string, XentralOrderRow>>({});
  const [addressDialogBaseline, setAddressDialogBaseline] = useState<Record<string, XentralOrderRow>>({});
  const [addressSaveConfirmOpen, setAddressSaveConfirmOpen] = useState(false);
  const [addressDialogPhase, setAddressDialogPhase] = useState<AddressDialogPhase>("edit");
  const [addressXentralSubmitting, setAddressXentralSubmitting] = useState(false);
  const [addressXentralError, setAddressXentralError] = useState<string | null>(null);
  const [xentralOrderWebBase, setXentralOrderWebBase] = useState<string | null>(null);
  const [xentralSalesOrderWebPath, setXentralSalesOrderWebPath] = useState("/sales-orders");
  const [isBackgroundSyncing, setIsBackgroundSyncing] = useState(false);

  const dataRef = useRef<XentralOrderRow[]>([]);
  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  /** Sichtbare Tabellenzeilen (DataTable inkl. Suche) — Snapshot beim Öffnen des Dialogs. */
  const displayedRowsRef = useRef<XentralOrderRow[]>([]);
  useEffect(() => {
    displayedRowsRef.current = displayedRows;
  }, [displayedRows]);

  /** Aktueller Adress-Entwurf — synchroner Lesevorgang beim Senden (nur Keys in diesem Objekt). */
  const addressDialogDraftRef = useRef<Record<string, XentralOrderRow>>({});
  useEffect(() => {
    addressDialogDraftRef.current = addressDialogDraft;
  }, [addressDialogDraft]);

  const importModeRef = useRef<ImportMode>("recent");
  useEffect(() => {
    importModeRef.current = importMode;
  }, [importMode]);

  const dateFilteredData = useMemo(() => {
    if (!hasMounted || (!dateFrom && !dateTo)) return data;
    return data.filter((row) => {
      const ymd = row.orderDate?.slice(0, 10) ?? "";
      if (!ymd) return false;
      if (dateFrom && ymd < dateFrom) return false;
      if (dateTo && ymd > dateTo) return false;
      return true;
    });
  }, [data, dateFrom, dateTo, hasMounted]);

  const sumDisplayed = useMemo(
    () => displayedRows.reduce((sum, row) => sum + (row.total ?? 0), 0),
    [displayedRows]
  );

  const sumLabel = useMemo(
    () =>
      new Intl.NumberFormat(intlTag, { style: "currency", currency: "EUR" }).format(sumDisplayed),
    [sumDisplayed, intlTag]
  );

  const addressErrorRows = useMemo(
    () => displayedRows.filter((row) => resolveAddressDisplay(row) === "invalid"),
    [displayedRows]
  );

  const addressDraftRowsSorted = useMemo(
    () => sortAddressDialogOrders(Object.values(addressDialogDraft)),
    [addressDialogDraft]
  );

  const isAddressDraftDirty = useMemo(() => {
    const draftIds = Object.keys(addressDialogDraft);
    const baseIds = Object.keys(addressDialogBaseline);
    if (draftIds.length !== baseIds.length) return true;
    const baseSet = new Set(baseIds);
    for (const id of draftIds) {
      if (!baseSet.has(id)) return true;
    }
    const draftSet = new Set(draftIds);
    for (const id of baseIds) {
      if (!draftSet.has(id)) return true;
    }
    for (const id of draftIds) {
      const cur = addressDialogDraft[id];
      const base = addressDialogBaseline[id];
      if (!cur || !base) return true;
      if (JSON.stringify(cur.addressPrimaryFields) !== JSON.stringify(base.addressPrimaryFields)) {
        return true;
      }
    }
    return false;
  }, [addressDialogDraft, addressDialogBaseline]);

  const addressDraftNeedsUncertainSaveConfirm = useMemo(() => {
    return Object.values(addressDialogDraft).some((r) =>
      shippingFlatNeedsNameOrHnSaveConfirm(
        mergePrimaryFields(r) as unknown as Record<string, unknown>,
        r.customer
      )
    );
  }, [addressDialogDraft]);

  const removeAddressDraftRow = useCallback((orderId: string) => {
    setAddressDialogDraft((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      addressDialogDraftRef.current = next;
      return next;
    });
    setAddressDialogBaseline((prev) => {
      if (!prev[orderId]) return prev;
      const next = { ...prev };
      delete next[orderId];
      return next;
    });
  }, []);

  /**
   * Nur Aufträge, die in der **aktuell sichtbaren** Tabelle stehen (Zeitraum + Suchfilter),
   * und nur mit ungültiger Adresse. Mit „X“ entfernte Zeilen liegen nicht mehr im Draft und
   * werden weder an Xentral gesendet noch lokal aus dem Entwurf übernommen.
   */
  const openAddressCorrectionDialog = useCallback(() => {
    if (!canUseAction("xentral.orders.correctAddress")) {
      toast.error(t("xentralOrders.noPermissionAddressCorrection"));
      return;
    }
    const visible = displayedRowsRef.current;
    const invalid = visible.filter((row) => resolveAddressDisplay(row) === "invalid");
    if (invalid.length === 0) {
      setAddressDialogDraft({});
      setAddressDialogBaseline({});
      addressDialogDraftRef.current = {};
    } else {
      const draft: Record<string, XentralOrderRow> = {};
      for (const r of invalid) {
        draft[r.id] = JSON.parse(JSON.stringify(r)) as XentralOrderRow;
      }
      const snapshot = JSON.parse(JSON.stringify(draft)) as Record<string, XentralOrderRow>;
      setAddressDialogDraft(draft);
      setAddressDialogBaseline(snapshot);
      addressDialogDraftRef.current = draft;
    }
    setAddressDialogPhase("edit");
    setAddressXentralError(null);
    setAddressXentralSubmitting(false);
    setAddressErrorsOpen(true);
  }, [canUseAction, t]);

  const handleAddressDialogOpenChange = useCallback((open: boolean) => {
    if (!open) {
      setAddressDialogDraft({});
      setAddressDialogBaseline({});
      setAddressSaveConfirmOpen(false);
      setAddressDialogPhase("edit");
      setAddressXentralError(null);
      setAddressXentralSubmitting(false);
    }
    setAddressErrorsOpen(open);
  }, []);

  const patchAddressDraftField = useCallback(
    (orderId: string, key: XentralPrimaryAddressFieldKey, value: string) => {
      setAddressDialogDraft((prev) => {
        const r = prev[orderId];
        if (!r) return prev;
        const nextFields = { ...mergePrimaryFields(r), [key]: value };
        const { status, issues } = computeAddressValidation({
          shipping: nextFields as unknown as Record<string, unknown>,
          billing: undefined,
          customerDisplay: r.customer,
        });
        return {
          ...prev,
          [orderId]: {
            ...r,
            addressPrimaryFields: nextFields,
            addressValidation: status,
            addressValidationIssues: issues,
          },
        };
      });
    },
    []
  );

  const patchAddressDraftGeocode = useCallback(
    (
      orderId: string,
      args: {
        street?: string;
        zipKey?: XentralPrimaryAddressFieldKey;
        zip?: string;
        cityKey?: XentralPrimaryAddressFieldKey;
        city?: string;
      }
    ) => {
      setAddressDialogDraft((prev) => {
        const r = prev[orderId];
        if (!r) return prev;
        let nextFields = { ...mergePrimaryFields(r) };
        if (args.street !== undefined) nextFields = { ...nextFields, street: args.street };
        if (args.zipKey !== undefined && args.zip !== undefined) {
          nextFields = { ...nextFields, [args.zipKey]: args.zip };
        }
        if (args.cityKey !== undefined && args.city !== undefined) {
          nextFields = { ...nextFields, [args.cityKey]: args.city };
        }
        const { status, issues } = computeAddressValidation({
          shipping: nextFields as unknown as Record<string, unknown>,
          billing: undefined,
          customerDisplay: r.customer,
        });
        return {
          ...prev,
          [orderId]: {
            ...r,
            addressPrimaryFields: nextFields,
            addressValidation: status,
            addressValidationIssues: issues,
          },
        };
      });
    },
    []
  );

  const flushAddressDraftToApp = useCallback((draft: Record<string, XentralOrderRow>) => {
    const ids = Object.keys(draft);
    if (ids.length === 0) return;

    const applyRowPatch = (r: XentralOrderRow): XentralOrderRow => {
      const d = draft[r.id];
      if (!d) return r;
      return {
        ...r,
        addressPrimaryFields: d.addressPrimaryFields,
        addressValidation: d.addressValidation,
        addressValidationIssues: d.addressValidationIssues ?? [],
        addressEdited: true,
      };
    };

    setData((prev) => prev.map(applyRowPatch));
    setDisplayedRows((prev) => prev.map(applyRowPatch));

    try {
      const raw = localStorage.getItem(XENTRAL_ORDERS_CACHE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as CachedPayload;
        if (Array.isArray(p.items)) {
          const mergedItems = p.items.map((item) => {
            const d = draft[item.id];
            if (!d) return item;
            return {
              ...item,
              addressPrimaryFields: d.addressPrimaryFields,
              addressValidation: d.addressValidation,
              addressValidationIssues: d.addressValidationIssues ?? [],
              addressEdited: true,
            };
          });
          localStorage.setItem(
            XENTRAL_ORDERS_CACHE_KEY,
            JSON.stringify({
              ...p,
              savedAt: Date.now(),
              items: mergedItems,
              xentralOrderWebBase: p.xentralOrderWebBase ?? null,
              xentralSalesOrderWebPath: p.xentralSalesOrderWebPath ?? "/sales-orders",
            } satisfies CachedPayload)
          );
        }
      }
    } catch {
      /* Cache optional */
    }

    setAddressSaveConfirmOpen(false);
    setAddressDialogPhase("edit");
    setAddressDialogDraft({});
    setAddressDialogBaseline({});
    setAddressXentralError(null);
    setAddressErrorsOpen(false);
  }, []);

  const requestProceedToReview = useCallback(() => {
    if (addressDraftNeedsUncertainSaveConfirm) {
      setAddressSaveConfirmOpen(true);
    } else {
      setAddressDialogPhase("review");
    }
  }, [addressDraftNeedsUncertainSaveConfirm]);

  const submitAddressDraftToXentral = useCallback(async () => {
    const draft = addressDialogDraftRef.current;
    const rows = sortAddressDialogOrders(Object.values(draft));
    if (rows.length === 0) return;

    const draftMap = Object.fromEntries(rows.map((r) => [r.id, r])) as Record<string, XentralOrderRow>;
    const realUpdates = rows
      .filter((r) => !r.id.startsWith(ADDRESS_ERROR_DEMO_ID_PREFIX))
      .map((r) => ({
        salesOrderId: r.id,
        addressPrimaryFields: mergePrimaryFields(r),
      }));

    setAddressXentralSubmitting(true);
    setAddressXentralError(null);
    try {
      if (realUpdates.length > 0) {
        const res = await fetch("/api/xentral/sales-order-shipping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ updates: realUpdates }),
        });
        const json = (await res.json()) as {
          error?: string;
          partialFailures?: Array<{ salesOrderId: string; error?: string }>;
          results?: Array<{ ok: boolean; salesOrderId: string; error?: string }>;
        };
        if (!res.ok) {
          const fromResults = Array.isArray(json.results)
            ? json.results.find((x) => x && !x.ok)?.error
            : undefined;
          const base = json.error?.trim() || `Xentral (${res.status})`;
          throw new Error(
            fromResults && !base.includes(fromResults.slice(0, 60))
              ? `${base}\n${fromResults}`
              : base
          );
        }
        const fails =
          json.partialFailures ??
          (Array.isArray(json.results) ? json.results.filter((x) => !x.ok) : []);
        if (fails.length > 0) {
          throw new Error(
            fails
              .map(
                (f) =>
                  `${f.salesOrderId}: ${f.error?.slice(0, 120) ?? t("xentralOrders.errorShort")}`
              )
              .join(" · ")
          );
        }
      }
      flushAddressDraftToApp(draftMap);
      toast.success(
        realUpdates.length > 0 ? t("xentralOrders.toastAddressesSaved") : t("xentralOrders.toastDemoSaved")
      );
    } catch (e) {
      const msg = formatXentralAddressSubmitError(
        e instanceof Error ? e.message : t("commonUi.unknownError"),
        t
      );
      setAddressXentralError(msg);
      toast.error(msg.length > 280 ? `${msg.slice(0, 277)}…` : msg);
    } finally {
      setAddressXentralSubmitting(false);
    }
  }, [flushAddressDraftToApp, t]);

  const load = useCallback(async (options?: XentralOrdersLoadOptions) => {
    const bustServerCache = options?.bustServerCache ?? false;
    const silent = options?.silent ?? false;
    const mode = options?.mode;
    let fetchMode: ImportMode = mode ?? importModeRef.current;
    let hadCache = false;

    if (!bustServerCache && !silent) {
      const raw = localStorage.getItem(XENTRAL_ORDERS_CACHE_KEY);
      if (raw) {
        try {
          const parsed = JSON.parse(raw) as CachedPayload;
          if (
            Array.isArray(parsed.items) &&
            (parsed.importMode === "recent" || parsed.importMode === "all")
          ) {
            const normalized = withNormalizedPrimaryFields(parsed.items);
            const forUi = applyAddressDemoMerge(normalized);
            dataRef.current = forUi;
            setData(forUi);
            setDisplayedRows(forUi);
            setTotalCount(
              typeof parsed.xentralTotalCount === "number"
                ? parsed.xentralTotalCount
                : parsed.items.length
            );
            setImportMode(parsed.importMode);
            importModeRef.current = parsed.importMode;
            fetchMode = parsed.importMode;
            setXentralOrderWebBase(parsed.xentralOrderWebBase ?? null);
            setXentralSalesOrderWebPath(parsed.xentralSalesOrderWebPath ?? "/sales-orders");
            hadCache = true;
            setIsLoading(false);
          }
        } catch {
          /* Cache ungültig */
        }
      }
    }

    const retainVisual = hadCache || dataRef.current.length > 0;
    if (!silent && !retainVisual && !hadCache) {
      setIsLoading(true);
    }
    if (silent || retainVisual) {
      setIsBackgroundSyncing(true);
    }

    if (!silent) {
      setError(null);
    }

    try {
      let qs: URLSearchParams;
      if (fetchMode === "all") {
        qs = new URLSearchParams({ all: "1", limit: "50" });
      } else {
        qs = new URLSearchParams({ recentDays: "2", limit: "50" });
        const f = dateFromRef.current.trim();
        const t = dateToRef.current.trim();
        if (/^\d{4}-\d{2}-\d{2}$/.test(f) && /^\d{4}-\d{2}-\d{2}$/.test(t)) {
          qs.set("fromYmd", f);
          qs.set("toYmd", t);
        }
      }
      if (bustServerCache) {
        qs.set("refresh", "1");
      }
      const res = await fetch(`/api/xentral/orders?${qs.toString()}`, {
        cache: "no-store",
      });

      const payload = (await res.json()) as {
        items?: XentralOrderRow[];
        totalCount?: number;
        error?: string;
        meta?: {
          mode?: string;
          stoppedEarly?: boolean;
          fromYmd?: string;
          toYmd?: string;
          xentralOrderWebBase?: string | null;
          xentralSalesOrderWebPath?: string;
        };
      };

      if (!res.ok) {
        throw new Error(payload.error ?? t("xentralOrders.loadFailed"));
      }

      const normalized = withNormalizedPrimaryFields(payload.items ?? []);
      const nextItems = applyAddressDemoMerge(normalized);
      const apiTotal =
        typeof payload.totalCount === "number" ? payload.totalCount : normalized.length;

      const linkBase = payload.meta?.xentralOrderWebBase ?? null;
      const linkPath = payload.meta?.xentralSalesOrderWebPath ?? "/sales-orders";
      setXentralOrderWebBase(linkBase);
      setXentralSalesOrderWebPath(linkPath);

      const merged = mergeXentralOrderLists(dataRef.current, nextItems, {
        dropMissingFromPrevious: false,
      });
      const stored = merged;
      dataRef.current = merged;
      setData(merged);

      setTotalCount(apiTotal);
      setImportMode(fetchMode);
      importModeRef.current = fetchMode;

      if (
        fetchMode === "recent" &&
        (payload.meta?.mode === "recentDays" || payload.meta?.mode === "dateRange") &&
        typeof payload.meta.fromYmd === "string" &&
        typeof payload.meta.toYmd === "string"
      ) {
        berlinRangeRef.current = {
          from: payload.meta.fromYmd,
          to: payload.meta.toYmd,
        };
        setDateFrom(payload.meta.fromYmd);
        setDateTo(payload.meta.toYmd);
        dateFromRef.current = payload.meta.fromYmd;
        dateToRef.current = payload.meta.toYmd;
      }

      if (
        fetchMode === "recent" &&
        (payload.meta?.mode === "recentDays" || payload.meta?.mode === "dateRange") &&
        payload.meta?.stoppedEarly
      ) {
        console.warn(
          "[Xentral] Datumsimport vorzeitig beendet (leere Seiten). Bei fehlenden Aufträgen: „Alle laden“."
        );
      }

      const savedAt = Date.now();
      localStorage.setItem(
        XENTRAL_ORDERS_CACHE_KEY,
        JSON.stringify({
          savedAt,
          items: stored,
          importMode: fetchMode,
          xentralTotalCount: apiTotal,
          xentralOrderWebBase: linkBase,
          xentralSalesOrderWebPath: linkPath,
        } satisfies CachedPayload)
      );
    } catch (e) {
      if (silent) {
        console.warn("[Xentral] Hintergrund-Abgleich fehlgeschlagen:", e);
      } else {
        setError(e instanceof Error ? e.message : t("commonUi.unknownError"));
      }
    } finally {
      if (!silent) {
        setIsLoading(false);
      }
      if (silent || retainVisual) {
        setIsBackgroundSyncing(false);
      }
    }
  }, [t]);

  /** Stabile Ref — verhindert Endlos-Reload bei HMR/Locale-Wechsel (`useEffect` mit `[load]`). */
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    setHasMounted(true);
    const d = defaultBerlinLastTwoDays();
    berlinRangeRef.current = { from: d.from, to: d.to };
    dateFromRef.current = d.from;
    dateToRef.current = d.to;
    setDateFrom(d.from);
    setDateTo(d.to);
    void loadRef.current();
  }, []);

  useEffect(() => {
    dateFromRef.current = dateFrom;
    dateToRef.current = dateTo;
  }, [dateFrom, dateTo]);

  /**
   * Nach Änderung von „Von/Bis“: Xentral für den gewählten Zeitraum nachladen (Modus „Nur 2 Tage“ / recent).
   * Erster Stand nach Mount zählt nicht als Änderung (kein zweiter Request neben dem Initial-Load).
   */
  useEffect(() => {
    if (!hasMounted || importMode !== "recent") return;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) return;
    const prev = prevDateFilterRef.current;
    prevDateFilterRef.current = { from: dateFrom, to: dateTo };
    if (!prev || (prev.from === dateFrom && prev.to === dateTo)) return;
    const id = window.setTimeout(() => {
      void loadRef.current({ mode: "recent" });
    }, 450);
    return () => window.clearTimeout(id);
  }, [dateFrom, dateTo, hasMounted, importMode]);

  useEffect(() => {
    if (!hasMounted) return;
    const id = window.setInterval(() => {
      if (!shouldRunBackgroundSync()) return;
      void loadRef.current({ silent: true });
    }, DASHBOARD_CLIENT_BACKGROUND_SYNC_MS);
    return () => window.clearInterval(id);
  }, [hasMounted]);

  const columns = useMemo<Array<ColumnDef<XentralOrderRow>>>(
    () => [
      {
        accessorKey: "documentNumber",
        header: t("xentralOrders.documentNr"),
        meta: { align: "left" as const, valign: "bottom" as const },
        cell: ({ row }) => (
          <XentralBelegNumberLink
            documentNumber={row.original.documentNumber}
            salesOrderId={row.original.id}
            webBase={xentralOrderWebBase}
            webPath={xentralSalesOrderWebPath}
          />
        ),
      },
      {
        accessorKey: "internetNumber",
        header: t("xentralOrders.orderNr"),
        meta: { align: "left" as const, valign: "bottom" as const },
        cell: ({ row }) => (
          <MarketplaceOrderIdLink
            marketplace={row.original.marketplace}
            internetNumber={row.original.internetNumber}
          />
        ),
      },
      {
        accessorKey: "customer",
        header: t("xentralOrders.customer"),
        cell: ({ row }) => {
          const value = row.original.customer ?? "";
          const truncated = value.length > 48 ? `${value.slice(0, 45)}…` : value;
          return (
            <span className="text-muted-foreground" title={value}>
              {truncated}
            </span>
          );
        },
      },
      {
        accessorKey: "orderDate",
        header: t("xentralOrders.date"),
        cell: ({ row }) => {
          const raw = row.original.orderDate ?? "";
          const ymd = raw.slice(0, 10);
          const label = /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? ymd : raw.trim() || "—";
          return <span className="tabular-nums text-muted-foreground">{label}</span>;
        },
      },
      {
        accessorKey: "marketplace",
        header: t("xentralOrders.marketplace"),
        meta: { align: "center" as const, valign: "bottom" as const },
        cell: ({ row }) => {
          const value = row.original.marketplace?.trim() || "—";
          const truncated = value.length > 32 ? `${value.slice(0, 29)}…` : value;
          return (
            <span className="text-muted-foreground" title={value === "—" ? undefined : value}>
              {truncated}
            </span>
          );
        },
      },
      {
        id: "addressValidation",
        meta: { align: "center" as const },
        accessorFn: (row) => {
          const d = resolveAddressDisplay(row);
          return d === "invalid" ? 0 : d === "edited" ? 1 : 2;
        },
        header: () => (
          <span className="inline-block text-center">{t("xentralOrders.addressValidation")}</span>
        ),
        cell: ({ row }) => (
          <AddressValidationCell
            display={resolveAddressDisplay(row.original)}
            issues={row.original.addressValidationIssues ?? []}
          />
        ),
      },
      {
        accessorKey: "total",
        header: t("xentralOrders.sum"),
        meta: { align: "right" as const },
        cell: ({ row }) => (
          <div className="text-right tabular-nums">{formatMoney(row.original.total, row.original.currency)}</div>
        ),
      },
    ],
    [xentralOrderWebBase, xentralSalesOrderWebPath, t, formatMoney]
  );

  const dateFilterIsDefault =
    hasMounted &&
    dateFrom === berlinRangeRef.current.from &&
    dateTo === berlinRangeRef.current.to;

  return (
    <div className={DASHBOARD_PAGE_SHELL}>
      <div className="space-y-1">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h1 className={DASHBOARD_PAGE_TITLE}>{t("xentralOrders.title")}</h1>
          <div className="flex flex-wrap items-center gap-3">
            {!isLoading && displayedRows.length > 0 ? (
              <p className="text-sm text-muted-foreground">
                {t("xentralOrders.shown")}{" "}
                <span className="font-medium text-foreground">{displayedRows.length}</span>
                {totalCount != null && totalCount > displayedRows.length ? (
                  <span>
                    {" "}
                    / {totalCount} {t("xentralOrders.inXentral")}
                  </span>
                ) : null}
                <span>
                  {" "}
                  · {dateFilteredData.length} {t("xentralOrders.inPeriod")}
                </span>
                {" · "}
                {t("xentralOrders.sumView")}{" "}
                <span className="font-medium text-foreground">{sumLabel}</span>
              </p>
            ) : null}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void load({ bustServerCache: true, mode: importMode })}
              disabled={isLoading || !hasMounted}
            >
              {t("xentralOrders.refresh")}
            </Button>
            <Button
              type="button"
              variant={importMode === "all" ? "secondary" : "outline"}
              size="sm"
              onClick={() => void load({ bustServerCache: true, mode: "all" })}
              disabled={isLoading || !hasMounted}
              title={t("xentralOrders.loadAllTitle")}
            >
              {t("xentralOrders.loadAll")}
            </Button>
            {importMode === "all" ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void load({ bustServerCache: true, mode: "recent" })}
                disabled={isLoading || !hasMounted}
                title={t("xentralOrders.loadRecentTitle")}
              >
                {t("xentralOrders.loadRecent")}
              </Button>
            ) : null}
            {isBackgroundSyncing ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                {t("xentralOrders.syncing")}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {isLoading ? (
        <div className="rounded-xl border border-border/50 bg-card/80 p-4 text-sm text-muted-foreground backdrop-blur-sm">
          {t("xentralOrders.loading")}
        </div>
      ) : (
        <>
          <Dialog open={addressErrorsOpen} onOpenChange={handleAddressDialogOpenChange}>
            <DialogContent
              className="flex max-h-[96vh] w-[min(96rem,calc(100vw-1.25rem))] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-border/50 bg-card p-0 shadow-xl sm:max-w-none"
              showCloseButton
            >
              <DialogHeader className="shrink-0 space-y-1 border-b border-border/40 bg-gradient-to-b from-muted/45 to-muted/10 px-4 py-4 text-left sm:px-6">
                <DialogTitle className="text-lg font-semibold tracking-tight">
                  {addressDialogPhase === "edit"
                    ? t("xentralOrders.dialogEditTitle")
                    : t("xentralOrders.dialogReviewTitle")}
                </DialogTitle>
                <DialogDescription className="text-pretty text-sm text-muted-foreground">
                  {addressDialogPhase === "edit"
                    ? t("xentralOrders.dialogEditDesc")
                    : t("xentralOrders.dialogReviewDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto px-4 py-4 sm:px-6">
                {addressDraftRowsSorted.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
                    {t("xentralOrders.dialogEmpty")}
                  </p>
                ) : (
                  <div className="space-y-3">
                    {addressDialogPhase === "review" && addressXentralError ? (
                      <div
                        className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm break-words text-destructive whitespace-pre-wrap"
                        role="alert"
                      >
                        {addressXentralError}
                      </div>
                    ) : null}
                    <div className="overflow-hidden rounded-xl border border-border/40 bg-background/80 shadow-sm ring-1 ring-black/[0.03] dark:ring-white/[0.04]">
                    <Table className="w-full min-w-[min(100%,68rem)] max-w-full border-separate border-spacing-0 text-xs">
                      <TableHeader>
                        <TableRow className="border-0 hover:bg-transparent">
                          <TableHead className="sticky left-0 z-20 w-12 min-w-12 max-w-12 border-b border-border/50 bg-muted/40 px-1 py-3 text-center shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="sr-only">{t("xentralOrders.srRemoveFromList")}</span>
                            <X
                              className="mx-auto size-3.5 text-muted-foreground opacity-60"
                              strokeWidth={2.25}
                              aria-hidden
                            />
                          </TableHead>
                          <TableHead className="sticky left-12 z-20 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-center align-middle shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.documentNr")}
                            </span>
                          </TableHead>
                          <TableHead className="sticky left-[12.5rem] z-20 w-[9.5rem] min-w-[9.5rem] max-w-[9.5rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-center align-middle shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.orderNrShort")}
                            </span>
                          </TableHead>
                          <TableHead className="sticky left-[22rem] z-20 w-[9rem] min-w-[9rem] max-w-[9rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-center align-middle shadow-[3px_0_14px_-4px_rgba(0,0,0,0.06)]">
                            <span className="inline-block text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.marketplace")}
                            </span>
                          </TableHead>
                          <TableHead className="min-w-[8rem] max-w-[11rem] border-b border-border/50 bg-muted/40 px-2 py-3 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldName")}
                            </span>
                          </TableHead>
                          <TableHead className="min-w-[13rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldStreet")}
                            </span>
                          </TableHead>
                          <TableHead className="w-[6.75rem] min-w-[6.75rem] border-b border-border/50 bg-muted/40 px-2 py-3 text-center">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldZip")}
                            </span>
                          </TableHead>
                          <TableHead className="min-w-[10rem] border-b border-border/50 bg-muted/40 px-3 py-3 text-left">
                            <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                              {t("xentralOrders.fieldCity")}
                            </span>
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {addressDraftRowsSorted.map((row, rowIndex) => (
                          <XentralAddressErrorDialogRow
                            key={row.id}
                            row={row}
                            rowIndex={rowIndex}
                            dialogOpen={addressErrorsOpen}
                            mode={addressDialogPhase}
                            patchDraftField={patchAddressDraftField}
                            patchDraftGeocode={patchAddressDraftGeocode}
                            onRemoveFromDraft={removeAddressDraftRow}
                            xentralOrderWebBase={xentralOrderWebBase}
                            xentralSalesOrderWebPath={xentralSalesOrderWebPath}
                          />
                        ))}
                      </TableBody>
                    </Table>
                    </div>
                  </div>
                )}
              </div>
              <div className="shrink-0 border-t border-border/40 bg-muted/25 px-4 py-3 sm:px-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-[11px] text-muted-foreground">
                    {addressDialogPhase === "edit" ? (
                      addressDraftRowsSorted.length === 0 ? (
                        <span>{t("xentralOrders.footerEmptyList")}</span>
                      ) : isAddressDraftDirty ? (
                        t("xentralOrders.footerDirty")
                      ) : (
                        t("xentralOrders.footerCleanEdit")
                      )
                    ) : (
                      <span className="font-medium text-foreground">
                        {addressDraftRowsSorted.length === 1
                          ? t("xentralOrders.footerReadyOne", {
                              count: addressDraftRowsSorted.length,
                            })
                          : t("xentralOrders.footerReadyMany", {
                              count: addressDraftRowsSorted.length,
                            })}
                      </span>
                    )}
                  </p>
                  <div className="flex flex-wrap justify-end gap-2">
                    {addressDialogPhase === "edit" ? (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddressDialogOpenChange(false)}
                        >
                          {t("xentralOrders.cancel")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={addressDraftRowsSorted.length === 0}
                          onClick={() => requestProceedToReview()}
                          title={t("xentralOrders.saveAndReviewTitle")}
                        >
                          {t("xentralOrders.saveAndReview")}
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => handleAddressDialogOpenChange(false)}
                          disabled={addressXentralSubmitting}
                        >
                          {t("xentralOrders.cancel")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          onClick={() => setAddressDialogPhase("edit")}
                          disabled={addressXentralSubmitting}
                        >
                          {t("xentralOrders.edit")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          disabled={addressDraftRowsSorted.length === 0 || addressXentralSubmitting}
                          onClick={() => void submitAddressDraftToXentral()}
                        >
                          {addressXentralSubmitting ? (
                            <span className="inline-flex items-center gap-1.5">
                              <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden />
                              {t("xentralOrders.sending")}
                            </span>
                          ) : (
                            t("xentralOrders.submitToXentral")
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={addressSaveConfirmOpen} onOpenChange={setAddressSaveConfirmOpen}>
            <DialogContent
              showCloseButton
              className="z-[100] max-w-md shadow-lg"
            >
              <DialogHeader>
                <DialogTitle>{t("xentralOrders.confirmOverviewTitle")}</DialogTitle>
                <DialogDescription className="text-pretty">
                  {t("xentralOrders.confirmOverviewDesc")}
                </DialogDescription>
              </DialogHeader>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button type="button" variant="outline" size="sm" onClick={() => setAddressSaveConfirmOpen(false)}>
                  {t("xentralOrders.back")}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setAddressSaveConfirmOpen(false);
                    setAddressDialogPhase("review");
                  }}
                >
                  {t("xentralOrders.toOverview")}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

        <DataTable
          columns={columns}
          data={dateFilteredData}
            filterColumn={t("filters.xentralOrders")}
            toolbarBetween={
              canUseAction("xentral.orders.correctAddress") ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => openAddressCorrectionDialog()}
                  disabled={!hasMounted}
                >
                  {t("xentralOrders.correctAddresses")}
                  {addressErrorRows.length > 0 ? (
                    <span className="rounded-full bg-destructive/15 px-1.5 py-px text-xs font-medium tabular-nums text-destructive">
                      {addressErrorRows.length}
                    </span>
                  ) : null}
                </Button>
              ) : null
            }
          toolbarEnd={
            <div className="flex flex-wrap items-center justify-end gap-3">
              <div className="flex items-center gap-2">
                <Label htmlFor="xentral-orders-date-from" className="shrink-0 text-muted-foreground">
                    {t("dates.from")}
                </Label>
                <Input
                  id="xentral-orders-date-from"
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-[min(100%,11rem)] tabular-nums"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="xentral-orders-date-to" className="shrink-0 text-muted-foreground">
                    {t("dates.to")}
                </Label>
                <Input
                  id="xentral-orders-date-to"
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-[min(100%,11rem)] tabular-nums"
                />
              </div>
              {!dateFilterIsDefault ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 text-muted-foreground"
                  disabled={!hasMounted}
                  onClick={() => {
                    const d = defaultBerlinLastTwoDays();
                    berlinRangeRef.current = { from: d.from, to: d.to };
                    setDateFrom(d.from);
                    setDateTo(d.to);
                  }}
                >
                    {t("xentralOrders.lastTwoDays")}
                </Button>
              ) : null}
            </div>
          }
          paginate={false}
          compact
          className="flex-1 min-h-0"
          tableWrapClassName="min-h-0"
          onDisplayedRowsChange={setDisplayedRows}
        />
        </>
      )}
    </div>
  );
}

