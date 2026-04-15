import { NextResponse } from "next/server";
import {
  applyRateLimitHeaders,
  checkRateLimit,
  rateLimitKeyFromRequest,
} from "@/shared/lib/rateLimit";

/**
 * Adressabgleich online: Nominatim (OSM) + optional Photon (Komoot, ebenfalls OSM-basiert).
 * Ziel: bei Straße + Ort fehlende/falsche PLZ zuverlässig setzen, ohne die Straße durch eine
 * andere zu ersetzen (Abgleich Straßenname + Hausnummer, ggf. display_name).
 */
const NOMINATIM_USER_AGENT =
  "MasterDashboard/1.0 (internal address validation; contact: IT admin)";

type NominatimItem = {
  display_name?: string;
  address?: Record<string, string | undefined>;
  /** Photon liefert keine address-Objekte — wir mappen auf dasselbe Format */
  _source?: "nominatim" | "photon";
};

function pickStreetLine(addr: Record<string, string | undefined> | undefined): string {
  if (!addr) return "";
  const road =
    addr.road ?? addr.pedestrian ?? addr.path ?? addr.residential ?? addr.neighbourhood ?? "";
  const hn = addr.house_number ?? "";
  const parts = [road.trim(), hn.trim()].filter(Boolean);
  return parts.join(" ").trim();
}

function pickOsmRoadName(addr: Record<string, string | undefined> | undefined): string {
  if (!addr) return "";
  return (
    addr.road ??
    addr.pedestrian ??
    addr.path ??
    addr.residential ??
    addr.neighbourhood ??
    ""
  ).trim();
}

function pickPostcode(addr: Record<string, string | undefined> | undefined): string {
  if (!addr) return "";
  return (addr.postcode ?? "").trim();
}

function pickCity(addr: Record<string, string | undefined> | undefined): string {
  if (!addr) return "";
  return (
    addr.city ??
    addr.town ??
    addr.village ??
    addr.municipality ??
    addr.hamlet ??
    ""
  ).trim();
}

function digitsOnly(s: string): string {
  return s.replace(/\D/g, "");
}

function isCompleteGermanPlz(postalcode: string): boolean {
  const d = digitsOnly(postalcode);
  return d.length === 5;
}

function shouldOmitPostcodeInStructuredSearch(postalcode: string, country: string): boolean {
  const t = postalcode.trim();
  if (!t) return true;
  if (country === "DE" || country === "DEU") {
    return !isCompleteGermanPlz(postalcode);
  }
  return false;
}

function parseUserStreetLine(full: string): { road: string; houseNumber: string } {
  const s = full.trim();
  if (!s) return { road: "", houseNumber: "" };
  const m = s.match(/^(.*?)(\s+(\d+[a-zA-Z\-\/]*))$/u);
  if (m && m[1].trim()) {
    return { road: m[1].trim(), houseNumber: (m[3] ?? "").trim() };
  }
  return { road: s, houseNumber: "" };
}

function normalizeRoadToken(s: string): string {
  return s
    .toLocaleLowerCase("de-DE")
    .replace(/\./g, "")
    .replace(/ß/g, "ss")
    .replace(/\s+/g, " ")
    .trim();
}

function expandRoadForCompare(s: string): string {
  let x = normalizeRoadToken(s);
  x = x.replace(/\bstr\b/g, "straße");
  x = x.replace(/\bstraßeße\b/g, "straße");
  return x;
}

function compactAlnum(s: string): string {
  return expandRoadForCompare(s).replace(/[^a-z0-9äöü]+/g, "");
}

function houseNumbersCompatible(userHn: string, osmHnRaw: string | undefined): boolean {
  const un = userHn.trim().toLowerCase();
  const on = (osmHnRaw ?? "").trim().toLowerCase();
  if (!un || !on) return true;
  return un === on || on.startsWith(un) || un.startsWith(on);
}

/** Kern: gleiche Straße (nicht z. B. Friedrichstraße vs. Bölschestraße). */
function sameStreetName(userRoadExpanded: string, osmRoadExpanded: string): boolean {
  if (!userRoadExpanded || !osmRoadExpanded) return false;
  if (userRoadExpanded === osmRoadExpanded) return true;
  if (userRoadExpanded.includes(osmRoadExpanded) || osmRoadExpanded.includes(userRoadExpanded)) return true;
  const uc = compactAlnum(userRoadExpanded);
  const oc = compactAlnum(osmRoadExpanded);
  if (uc.length >= 6 && oc.length >= 6) {
    if (uc === oc) return true;
    if (uc.startsWith(oc.slice(0, 10)) || oc.startsWith(uc.slice(0, 10))) return true;
  }
  const uTok = userRoadExpanded.split(" ").filter((t) => t.length > 2);
  for (const t of uTok) {
    if (osmRoadExpanded.includes(t)) return true;
  }
  return false;
}

/**
 * Liegt der Straßenname der Nutzereingabe im Nominatim-Resultat (addr, volle Zeile, display_name)?
 */
function resultMatchesUserStreet(
  item: NominatimItem,
  userStreetLine: string,
  userCity?: string
): boolean {
  if (!userStreetLine.trim()) return true;
  const { road: userRoad, houseNumber: userHn } = parseUserStreetLine(userStreetLine);
  const u = expandRoadForCompare(userRoad);
  if (!u) return true;

  const addr = item.address;
  const osmCity = pickCity(addr);
  if (userCity?.trim() && osmCity && !citiesCompatible(userCity, osmCity)) {
    return false;
  }
  const osmRoad = pickOsmRoadName(addr);
  if (osmRoad) {
    const o = expandRoadForCompare(osmRoad);
    if (o && sameStreetName(u, o) && houseNumbersCompatible(userHn, addr?.house_number)) {
      return true;
    }
  }

  const fullLine = pickStreetLine(addr);
  if (fullLine) {
    const { road: flRoad } = parseUserStreetLine(fullLine);
    const fl = expandRoadForCompare(flRoad || fullLine);
    if (fl && sameStreetName(u, fl) && houseNumbersCompatible(userHn, addr?.house_number)) {
      return true;
    }
  }

  const dn = item.display_name ?? "";
  if (dn) {
    const dnNorm = expandRoadForCompare(dn.replace(/,/g, " "));
    const uc = compactAlnum(u);
    if (uc.length >= 6 && compactAlnum(dnNorm).includes(uc) && houseNumbersCompatible(userHn, addr?.house_number)) {
      return true;
    }
    if (dnNorm.includes(u) || u.split(" ").every((t) => t.length < 3 || dnNorm.includes(t))) {
      if (houseNumbersCompatible(userHn, addr?.house_number)) return true;
    }
  }

  return false;
}

/**
 * Ort muss wirklich passen — kein „Berlin“ in „Rüdersdorf bei Berlin“ als Treffer.
 */
function citiesCompatible(userCity: string, osmCity: string): boolean {
  const u = normalizeRoadToken(userCity.trim());
  const o = normalizeRoadToken(osmCity.trim());
  if (!u) return true;
  if (!o) return false;
  if (o === u) return true;
  if (o.startsWith(`${u} `) || o.startsWith(`${u}(`)) return true;
  if (u.startsWith(`${o} `) || u.startsWith(`${o}(`)) return true;
  const oFirst = o.split(/\s+/)[0] ?? "";
  const uFirst = u.split(/\s+/)[0] ?? "";
  if (oFirst.length >= 3 && uFirst.length >= 3 && oFirst === uFirst) return true;
  return false;
}

function scoreItem(
  item: NominatimItem,
  input: { postalcode: string; street: string; city: string },
  country: string
): number {
  const addr = item.address;
  const pc = pickPostcode(addr);
  const city = pickCity(addr);
  const hn = (addr?.house_number ?? "").trim();

  if (!resultMatchesUserStreet(item, input.street, input.city)) return -1000;

  let score = 10;
  if (item._source === "photon") score += 1;

  if (hn) score += 5;
  const inPc = digitsOnly(input.postalcode);
  const outPc = digitsOnly(pc);
  if (country === "DE" || country === "DEU") {
    if (outPc.length === 5) score += 25;
    if (inPc && outPc && inPc === outPc) score += 8;
  } else if (outPc) score += 8;

  const inCity = input.city.trim();
  if (inCity && citiesCompatible(inCity, city)) score += 18;
  else if (city) score += 1;

  const osmRoad = pickOsmRoadName(addr);
  if (osmRoad) score += 3;

  return score;
}

function pickBest(items: NominatimItem[], input: { postalcode: string; street: string; city: string }, country: string) {
  const ranked = items
    .map((item) => ({ item, score: scoreItem(item, input, country) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  return ranked[0]?.item ?? null;
}

function dedupeItems(items: NominatimItem[]): NominatimItem[] {
  const seen = new Set<string>();
  const out: NominatimItem[] = [];
  for (const it of items) {
    const pc = pickPostcode(it.address);
    const line = pickStreetLine(it.address).toLowerCase();
    const c = pickCity(it.address).toLowerCase();
    const key = `${pc}|${line}|${c}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(it);
  }
  return out;
}

async function nominatimSearch(params: URLSearchParams): Promise<NominatimItem[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("limit", "20");
  params.forEach((v, k) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), {
    headers: {
      "User-Agent": NOMINATIM_USER_AGENT,
      "Accept-Language": "de,en;q=0.9",
    },
    cache: "no-store",
  });

  if (!res.ok) return [];
  try {
    const data = (await res.json()) as unknown;
    const arr = Array.isArray(data) ? (data as NominatimItem[]) : [];
    return arr.map((x) => ({ ...x, _source: "nominatim" as const }));
  } catch {
    return [];
  }
}

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    locality?: string;
    district?: string;
    countrycode?: string;
  };
};

/** Zweite Online-Quelle (OSM-Daten), hilft wenn Nominatim wenig Treffer liefert. */
async function photonSearch(query: string): Promise<NominatimItem[]> {
  const url = new URL("https://photon.komoot.io/api/");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "15");
  url.searchParams.set("lang", "de");

  let res: Response;
  try {
    res = await fetch(url.toString(), { cache: "no-store" });
  } catch {
    return [];
  }
  if (!res.ok) return [];

  try {
    const json = (await res.json()) as { features?: PhotonFeature[] };
    const features = json.features ?? [];
    const out: NominatimItem[] = [];
    for (const f of features) {
      const p = f.properties;
      if (!p) continue;
      const road = (p.street ?? "").trim();
      const hn = (p.housenumber ?? "").trim();
      const line = [road, hn].filter(Boolean).join(" ");
      const pc = (p.postcode ?? "").trim();
      const city = (p.city ?? p.locality ?? "").trim();
      if (!line && !pc) continue;
      const addr: Record<string, string | undefined> = {
        road: road || undefined,
        house_number: hn || undefined,
        postcode: pc || undefined,
        city: city || undefined,
      };
      const display = [line, pc, city, "Deutschland"].filter(Boolean).join(", ");
      out.push({
        display_name: display,
        address: addr,
        _source: "photon",
      });
    }
    return out;
  } catch {
    return [];
  }
}

export async function POST(req: Request) {
  // Rate-Limit: 30 Suggest-Calls/min pro IP (Nominatim/Photon sind externe Dienste mit UA-Tracking).
  const rl = checkRateLimit(rateLimitKeyFromRequest(req, "address-suggest"), 30, 60_000);
  if (!rl.ok) {
    const retryAfterSec = Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000));
    const res = NextResponse.json(
      { error: "Zu viele Anfragen. Bitte kurz warten." },
      { status: 429 }
    );
    res.headers.set("Retry-After", String(retryAfterSec));
    return applyRateLimitHeaders(res, rl);
  }

  let body: { street?: string; postalcode?: string; city?: string; country?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 });
  }

  const street = (body.street ?? "").trim();
  const postalcode = (body.postalcode ?? "").trim();
  const city = (body.city ?? "").trim();
  const countryRaw = (body.country ?? "DE").trim();
  const country = countryRaw.toUpperCase() || "DE";

  if (!street && !postalcode && !city) {
    return NextResponse.json({ best: null });
  }

  const countrycodes = country.length === 2 ? country.toLowerCase() : "";
  const omitPc = shouldOmitPostcodeInStructuredSearch(postalcode, country);

  const collected: NominatimItem[] = [];

  try {
    const structured = new URLSearchParams();
    if (street) structured.set("street", street);
    if (city) structured.set("city", city);
    if (!omitPc && postalcode) structured.set("postalcode", postalcode);
    if (country.length > 2) structured.set("country", countryRaw);
    else if (countrycodes) structured.set("countrycodes", countrycodes);

    collected.push(...(await nominatimSearch(structured)));

    if (street && city) {
      const s2 = new URLSearchParams();
      s2.set("street", street);
      s2.set("city", city);
      if (countrycodes) s2.set("countrycodes", countrycodes);
      else if (country.length > 2) s2.set("country", countryRaw);
      collected.push(...(await nominatimSearch(s2)));
    }

    const qParts = [street, omitPc ? "" : postalcode, city, country === "DE" ? "Deutschland" : countryRaw].filter(
      Boolean
    );
    const qStr = qParts.join(", ").replace(/\s+,/g, ",").trim();
    if (qStr) {
      const q = new URLSearchParams();
      q.set("q", qStr);
      if (countrycodes) q.set("countrycodes", countrycodes);
      collected.push(...(await nominatimSearch(q)));
    }

    if (street && city) {
      const photonQ = `${street}, ${city}`;
      collected.push(...(await photonSearch(photonQ)));
    }
  } catch {
    return NextResponse.json({ error: "Geocoding nicht erreichbar." }, { status: 502 });
  }

  const merged = dedupeItems(collected);
  const best = pickBest(merged, { postalcode, street, city }, country);

  if (!best?.address) {
    return NextResponse.json({ best: null });
  }

  const addr = best.address;
  const pc = pickPostcode(addr);
  const osmCity = pickCity(addr);
  const osmStreetLine = pickStreetLine(addr);

  if (!resultMatchesUserStreet(best, street, city)) {
    return NextResponse.json({ best: null });
  }

  const userRoad = parseUserStreetLine(street).road;
  const preserveUserStreet =
    street.trim().length > 0 &&
    Boolean(userRoad.trim()) &&
    resultMatchesUserStreet(best, street, city);

  const streetLineOut = preserveUserStreet ? street : osmStreetLine;
  const cityOut = city.trim() && citiesCompatible(city, osmCity) ? city : osmCity || city;

  if (!pc && !streetLineOut) {
    return NextResponse.json({ best: null });
  }

  if ((country === "DE" || country === "DEU") && pc && !isCompleteGermanPlz(pc)) {
    return NextResponse.json({ best: null });
  }

  return NextResponse.json({
    best: {
      streetLine: streetLineOut || osmStreetLine,
      postcode: pc,
      city: cityOut,
      displayName: (best.display_name ?? "").trim(),
    },
  });
}
