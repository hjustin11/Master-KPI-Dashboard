import {
  containerArrivalUtc,
  containerKey,
  groupAllByContainer,
  groupProductTotalAmount,
  type ProcurementProductRowLike,
} from "./procurementAggregation";

export type ContainerComparisonDelta = {
  previousArrivalUtc: number | null;
  newArrivalUtc: number | null;
  arrivalDirection: "earlier" | "later" | null;
  previousTotalQty: number;
  newTotalQty: number;
  qtyDirection: "more" | "less" | null;
};

type Agg = { arrivalUtc: number | null; totalQty: number };

function aggregateByContainer(lines: ProcurementProductRowLike[]): Map<string, Agg> {
  const groups = groupAllByContainer(lines);
  const map = new Map<string, Agg>();
  for (const g of groups) {
    const k = containerKey(g[0]!);
    map.set(k, {
      arrivalUtc: containerArrivalUtc(g),
      totalQty: groupProductTotalAmount(g),
    });
  }
  return map;
}

/**
 * Vergleicht Container-Kennzahlen vor/nach einem Import (früheste Ankunft + Summe Produkt-Mengen).
 * Nur Container, die in beiden Versionen vorkommen und bei denen sich Ankunft oder Menge ändert.
 */
export function compareProcurementByContainer(
  previousLines: ProcurementProductRowLike[],
  nextLines: ProcurementProductRowLike[]
): Record<string, ContainerComparisonDelta> {
  if (previousLines.length === 0 || nextLines.length === 0) return {};

  const prevMap = aggregateByContainer(previousLines);
  const nextMap = aggregateByContainer(nextLines);
  const out: Record<string, ContainerComparisonDelta> = {};

  for (const key of nextMap.keys()) {
    if (!prevMap.has(key)) continue;
    const a = prevMap.get(key)!;
    const b = nextMap.get(key)!;

    let arrivalDirection: "earlier" | "later" | null = null;
    if (a.arrivalUtc !== b.arrivalUtc) {
      if (a.arrivalUtc != null && b.arrivalUtc != null) {
        if (b.arrivalUtc > a.arrivalUtc) arrivalDirection = "later";
        else if (b.arrivalUtc < a.arrivalUtc) arrivalDirection = "earlier";
      }
    }

    let qtyDirection: "more" | "less" | null = null;
    if (a.totalQty !== b.totalQty) {
      qtyDirection = b.totalQty > a.totalQty ? "more" : "less";
    }

    if (arrivalDirection === null && qtyDirection === null) continue;

    out[key] = {
      previousArrivalUtc: a.arrivalUtc,
      newArrivalUtc: b.arrivalUtc,
      arrivalDirection,
      previousTotalQty: a.totalQty,
      newTotalQty: b.totalQty,
      qtyDirection,
    };
  }

  return out;
}
