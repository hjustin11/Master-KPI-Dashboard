import { describe, it, expect, vi, afterEach } from "vitest";
import {
  resolveCalendarPreset,
  formatSettlementLabel,
  settlementToValue,
  valueToSettlement,
} from "../periodResolver";

describe("resolveCalendarPreset", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("last_14_days: 14 Tage bis heute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
    const r = resolveCalendarPreset("last_14_days");
    expect(r.from).toBe("2026-04-03");
    expect(r.to).toBe("2026-04-16");
  });

  it("last_30_days: 30 Tage bis heute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
    const r = resolveCalendarPreset("last_30_days");
    expect(r.from).toBe("2026-03-18");
    expect(r.to).toBe("2026-04-16");
  });

  it("last_month: vorheriger Kalendermonat", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
    const r = resolveCalendarPreset("last_month");
    expect(r.from).toBe("2026-03-01");
    expect(r.to).toBe("2026-03-31");
  });

  it("last_month im Januar: Dezember Vorjahr", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-10T12:00:00Z"));
    const r = resolveCalendarPreset("last_month");
    expect(r.from).toBe("2025-12-01");
    expect(r.to).toBe("2025-12-31");
  });

  it("last_quarter: letzte 3 vollständige Monate", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
    const r = resolveCalendarPreset("last_quarter");
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-03-31");
  });

  it("year_to_date: 1. Januar bis heute", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-16T12:00:00Z"));
    const r = resolveCalendarPreset("year_to_date");
    expect(r.from).toBe("2026-01-01");
    expect(r.to).toBe("2026-04-16");
  });
});

describe("formatSettlementLabel", () => {
  it("reguläre Periode: D.M.YYYY – D.M.YYYY", () => {
    const label = formatSettlementLabel({
      periodFrom: "2026-03-31",
      periodTo: "2026-04-14",
      marketplace: "amazon",
      isOpen: false,
    });
    expect(label).toBe("31.3.2026 – 14.4.2026");
  });

  it("offene Periode: D.M.YYYY – heute (offen)", () => {
    const label = formatSettlementLabel({
      periodFrom: "2026-04-14",
      periodTo: "2026-04-30",
      marketplace: "amazon",
      isOpen: true,
    });
    expect(label).toBe("14.4.2026 – heute (offen)");
  });
});

describe("settlementToValue / valueToSettlement", () => {
  it("roundtrip", () => {
    const sp = {
      periodFrom: "2026-03-31",
      periodTo: "2026-04-14",
      marketplace: "amazon",
      isOpen: false,
    };
    const val = settlementToValue(sp);
    expect(val).toBe("settlement:2026-03-31:2026-04-14:amazon");
    const parsed = valueToSettlement(val);
    expect(parsed).not.toBeNull();
    expect(parsed!.periodFrom).toBe("2026-03-31");
    expect(parsed!.periodTo).toBe("2026-04-14");
    expect(parsed!.marketplace).toBe("amazon");
  });

  it("invalid value returns null", () => {
    expect(valueToSettlement("preset:last_14_days")).toBeNull();
    expect(valueToSettlement("")).toBeNull();
  });
});
