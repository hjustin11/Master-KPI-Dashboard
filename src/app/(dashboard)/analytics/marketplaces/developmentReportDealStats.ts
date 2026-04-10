export type SalesPointLike = {
  date: string;
  amount?: number;
  orders?: number;
  units?: number;
};

export function sumPointsInYmdRange(
  points: SalesPointLike[] | undefined,
  from: string,
  to: string
): { amount: number; orders: number; units: number } {
  const list = points ?? [];
  let amount = 0;
  let orders = 0;
  let units = 0;
  for (const p of list) {
    if (p.date < from || p.date > to) continue;
    amount += p.amount ?? 0;
    orders += p.orders ?? 0;
    units += p.units ?? 0;
  }
  return { amount: Number(amount.toFixed(2)), orders, units };
}
