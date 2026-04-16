"use client";

import { Dialog, DialogContent } from "@/components/ui/dialog";

export function CrossListingImageLightbox({
  url,
  onClose,
}: {
  url: string | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={url !== null} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent className="max-w-[90vw] p-2">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="" className="max-h-[80vh] w-auto max-w-full object-contain" />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
