/** Zentraler Schalter für Marktplatz-APIs (bei Bedarf Slugs ergänzen). */
export const MARKETPLACE_CHANNELS_WITHOUT_LIVE_API = new Set<string>();

export function isMarketplaceLiveApiEnabled(slug: string): boolean {
  return !MARKETPLACE_CHANNELS_WITHOUT_LIVE_API.has(slug);
}
