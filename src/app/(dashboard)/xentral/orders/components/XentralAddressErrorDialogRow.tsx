"use client";

import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableCell, TableRow } from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/i18n/I18nProvider";
import { useAddressGeocodeSuggest } from "../AddressGeocodeSuggest";
import { MarketplaceOrderIdLink } from "@/shared/components/MarketplaceOrderIdLink";
import { XentralBelegNumberLink } from "../XentralBelegNumberLink";
import { AddressEditStack } from "./XentralAddressHelpers";
import {
  ADDRESS_HINT_NAME_UNCERTAIN,
  ADDRESS_ISSUE_HN,
  ADDRESS_ISSUE_NAME,
  ADDRESS_ISSUE_NAME_UNSUITABLE,
  findAlternateHouseNumberHints,
  findAlternateRecipientNameHints,
  shippingFlatMissingHouseNumber,
  streetHasHouseNumber,
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
  addressFieldNorm,
  mergePrimaryFields,
  type AddressDialogPhase,
  type XentralOrderRow,
} from "@/shared/lib/xentral-orders-utils";

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

export function XentralAddressErrorDialogRow({
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
