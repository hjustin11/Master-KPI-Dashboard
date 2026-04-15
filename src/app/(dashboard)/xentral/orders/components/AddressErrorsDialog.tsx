"use client";

import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTranslation } from "@/i18n/I18nProvider";
import type {
  AddressDialogPhase,
  XentralOrderRow,
} from "@/shared/lib/xentral-orders-utils";
import type { XentralPrimaryAddressFieldKey } from "@/shared/lib/xentralPrimaryAddressFields";
import { XentralAddressErrorDialogRow } from "./XentralAddressErrorDialogRow";

export function AddressErrorsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  phase: AddressDialogPhase;
  setPhase: (phase: AddressDialogPhase) => void;
  rows: XentralOrderRow[];
  isDirty: boolean;
  xentralError: string | null;
  xentralSubmitting: boolean;
  xentralOrderWebBase: string | null;
  xentralSalesOrderWebPath: string;
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
  removeAddressDraftRow: (orderId: string) => void;
  requestProceedToReview: () => void;
  submitAddressDraftToXentral: () => Promise<void> | void;
}) {
  const {
    open,
    onOpenChange,
    phase,
    setPhase,
    rows,
    isDirty,
    xentralError,
    xentralSubmitting,
    xentralOrderWebBase,
    xentralSalesOrderWebPath,
    patchDraftField,
    patchDraftGeocode,
    removeAddressDraftRow,
    requestProceedToReview,
    submitAddressDraftToXentral,
  } = props;
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[96vh] w-[min(96rem,calc(100vw-1.25rem))] max-w-[calc(100%-1rem)] flex-col gap-0 overflow-hidden border-border/50 bg-card p-0 shadow-xl sm:max-w-none"
        showCloseButton
      >
        <DialogHeader className="shrink-0 space-y-1 border-b border-border/40 bg-gradient-to-b from-muted/45 to-muted/10 px-4 py-4 text-left sm:px-6">
          <DialogTitle className="text-lg font-semibold tracking-tight">
            {phase === "edit"
              ? t("xentralOrders.dialogEditTitle")
              : t("xentralOrders.dialogReviewTitle")}
          </DialogTitle>
          <DialogDescription className="text-pretty text-sm text-muted-foreground">
            {phase === "edit"
              ? t("xentralOrders.dialogEditDesc")
              : t("xentralOrders.dialogReviewDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="min-h-0 min-w-0 flex-1 overflow-x-auto overflow-y-auto px-4 py-4 sm:px-6">
          {rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-border/60 bg-muted/20 py-12 text-center text-sm text-muted-foreground">
              {t("xentralOrders.dialogEmpty")}
            </p>
          ) : (
            <div className="space-y-3">
              {phase === "review" && xentralError ? (
                <div
                  className="rounded-lg border border-destructive/35 bg-destructive/10 px-3 py-2 text-sm break-words text-destructive whitespace-pre-wrap"
                  role="alert"
                >
                  {xentralError}
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
                    {rows.map((row, rowIndex) => (
                      <XentralAddressErrorDialogRow
                        key={row.id}
                        row={row}
                        rowIndex={rowIndex}
                        dialogOpen={open}
                        mode={phase}
                        patchDraftField={patchDraftField}
                        patchDraftGeocode={patchDraftGeocode}
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
              {phase === "edit" ? (
                rows.length === 0 ? (
                  <span>{t("xentralOrders.footerEmptyList")}</span>
                ) : isDirty ? (
                  t("xentralOrders.footerDirty")
                ) : (
                  t("xentralOrders.footerCleanEdit")
                )
              ) : (
                <span className="font-medium text-foreground">
                  {rows.length === 1
                    ? t("xentralOrders.footerReadyOne", { count: rows.length })
                    : t("xentralOrders.footerReadyMany", { count: rows.length })}
                </span>
              )}
            </p>
            <div className="flex flex-wrap justify-end gap-2">
              {phase === "edit" ? (
                <>
                  <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                    {t("xentralOrders.cancel")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={rows.length === 0}
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
                    onClick={() => onOpenChange(false)}
                    disabled={xentralSubmitting}
                  >
                    {t("xentralOrders.cancel")}
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setPhase("edit")}
                    disabled={xentralSubmitting}
                  >
                    {t("xentralOrders.edit")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    disabled={rows.length === 0 || xentralSubmitting}
                    onClick={() => void submitAddressDraftToXentral()}
                  >
                    {xentralSubmitting ? (
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
  );
}

export function SaveConfirmDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}) {
  const { open, onOpenChange, onConfirm } = props;
  const { t } = useTranslation();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton className="z-[100] max-w-md shadow-lg">
        <DialogHeader>
          <DialogTitle>{t("xentralOrders.confirmOverviewTitle")}</DialogTitle>
          <DialogDescription className="text-pretty">
            {t("xentralOrders.confirmOverviewDesc")}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {t("xentralOrders.back")}
          </Button>
          <Button type="button" size="sm" onClick={onConfirm}>
            {t("xentralOrders.toOverview")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
