import { describe, it, expect, beforeEach } from "vitest";
import { checkRateLimit, rateLimitKeyFromRequest } from "./rateLimit";

describe("checkRateLimit", () => {
  beforeEach(() => {
    // Jeder Test nutzt einen eigenen Key, damit die Buckets nicht leak'n.
  });

  it("erlaubt bis zur Grenze, blockt danach", () => {
    const key = `test-limit-${Math.random()}`;
    const r1 = checkRateLimit(key, 3, 60_000);
    const r2 = checkRateLimit(key, 3, 60_000);
    const r3 = checkRateLimit(key, 3, 60_000);
    const r4 = checkRateLimit(key, 3, 60_000);
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    expect(r3.ok).toBe(true);
    expect(r4.ok).toBe(false);
    expect(r4.remaining).toBe(0);
  });

  it("gibt remaining richtig an", () => {
    const key = `test-remaining-${Math.random()}`;
    expect(checkRateLimit(key, 5, 60_000).remaining).toBe(4);
    expect(checkRateLimit(key, 5, 60_000).remaining).toBe(3);
  });

  it("hat separate Buckets pro Key", () => {
    const key1 = `test-separate-a-${Math.random()}`;
    const key2 = `test-separate-b-${Math.random()}`;
    checkRateLimit(key1, 2, 60_000);
    checkRateLimit(key1, 2, 60_000);
    expect(checkRateLimit(key1, 2, 60_000).ok).toBe(false);
    expect(checkRateLimit(key2, 2, 60_000).ok).toBe(true);
  });
});

describe("rateLimitKeyFromRequest", () => {
  function req(headers: Record<string, string> = {}): Request {
    return new Request("http://localhost/x", { headers });
  }

  it("nutzt x-forwarded-for erste IP", () => {
    expect(rateLimitKeyFromRequest(req({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" }), "scope")).toBe(
      "scope:1.2.3.4"
    );
  });

  it("fällt auf x-real-ip zurück", () => {
    expect(rateLimitKeyFromRequest(req({ "x-real-ip": "9.9.9.9" }), "scope")).toBe("scope:9.9.9.9");
  });

  it("fällt auf cf-connecting-ip zurück", () => {
    expect(
      rateLimitKeyFromRequest(req({ "cf-connecting-ip": "10.10.10.10" }), "scope")
    ).toBe("scope:10.10.10.10");
  });

  it("nutzt 'unknown' wenn keine Header da sind", () => {
    expect(rateLimitKeyFromRequest(req(), "scope")).toBe("scope:unknown");
  });
});
