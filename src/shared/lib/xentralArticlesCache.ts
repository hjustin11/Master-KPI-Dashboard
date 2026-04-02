import { createHash } from "node:crypto";
import type { XentralArticlesComputeArgs } from "@/shared/lib/xentralArticlesCompute";

/** Schlüssel für `integration_data_cache` — deckt sich mit den `computeXentralArticlesPayload`-Eingaben. */
export function buildXentralArticlesCacheKey(args: Pick<
  XentralArticlesComputeArgs,
  | "query"
  | "fetchAll"
  | "includePrices"
  | "includeSales"
  | "pageSize"
  | "pageNumber"
  | "salesFromYmd"
  | "salesToYmd"
>): string {
  const fp = createHash("sha256")
    .update(
      JSON.stringify({
        v: 2,
        q: args.query,
        all: args.fetchAll,
        ip: args.includePrices,
        is: args.includeSales,
        limit: args.pageSize,
        page: args.pageNumber,
        f: args.salesFromYmd,
        t: args.salesToYmd,
      }),
      "utf8"
    )
    .digest("hex")
    .slice(0, 24);
  return `xentral:articles:v2:${fp}`;
}
