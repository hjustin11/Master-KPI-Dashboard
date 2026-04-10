"use client";

import * as React from "react";
import { DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  MARKETPLACE_PRODUCT_EDITOR_DIALOG_BACKDROP,
  MARKETPLACE_PRODUCT_EDITOR_DIALOG_CONTENT_CLASS,
} from "@/shared/lib/marketplaceProductEditorTokens";

type Props = React.ComponentProps<typeof DialogContent>;

/**
 * Produkt-Editor-Dialog: gleiche äußere Maße und Flex-Layout wie Amazon-Editor.
 */
export function MarketplaceProductEditorDialogContent({
  className,
  backdropClassName,
  ...props
}: Props) {
  return (
    <DialogContent
      backdropClassName={cn(MARKETPLACE_PRODUCT_EDITOR_DIALOG_BACKDROP, backdropClassName)}
      className={cn(MARKETPLACE_PRODUCT_EDITOR_DIALOG_CONTENT_CLASS, className)}
      {...props}
    />
  );
}
