-- Updates vom 2026-04-22: großer Feature-Schub aus den letzten 5 Tagen.
-- Konvention: Texte können nach "\n\n— Details —\n" einen ausführlichen Block
-- enthalten, der im UI als <details>-Aufklapper dargestellt wird.
-- Idempotent dank `on conflict (date, title, text) do nothing` (unique-index
-- aus 20260501114500_dashboard_updates_seed.sql).

insert into public.dashboard_updates (date, title, text, release_key, created_by)
values
  (
    '2026-04-22',
    'Amazon France: Listings auf Französisch — mit KI-Übersetzung',
    'Es gibt jetzt einen eigenen Amazon-FR-Bereich neben Amazon DE — mit eigenen Bestellungen, Produkten und einem Editor, der genau weiß, welche Felder schon auf Französisch gepflegt sind und welche nicht. Wo der französische Inhalt noch fehlt, übernimmt ein neuer KI-Übersetzungs-Button die Übersetzung deiner deutschen Texte direkt im Editor. Vor dem Senden zeigt eine Vorschau klar an, was an Amazon übermittelt wird.

— Details —
• Neue Routen: /amazon-fr/orders und /amazon-fr/products mit länderspezifischem API-Routing
• Two-Pass-Sprachfilter: erst strikt fr_FR, fallback auf vorhandene Sprache, fehlende Felder werden geflaggt
• MissingTranslationHint zeigt amber Warnung bei jedem unübersetzten Feld (Beschreibung, Bullets, Marke)
• AmazonSubmitPreviewDialog rendert Diff (alt → neu) bevor der API-Call rausgeht
• KI-Übersetzungs-Endpoint kann auch DE-Inhalt überschreiben, wenn das Feld als „nicht lokalisiert" markiert ist
• Sprachbanner oben im Editor erinnert daran, in welchem Sprach-Kontext man arbeitet',
    '2026-04-22-amazon-fr',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '2026-04-22',
    'Ein-Klick-Upload zu Fressnapf, MediaMarkt & Saturn',
    'Cross-Listings landen jetzt auf Knopfdruck direkt im Marktplatz-Katalog: erst der Produkt-Eintrag, dann automatisch Preis und Bestand obendrauf — ohne CSV-Hochladen im Backoffice. Wenn der Marktplatz ein Problem meldet (z. B. unbekannte Kategorie oder fehlendes Pflichtfeld), siehst du jetzt eine konkrete deutsche Fehlermeldung mit Lösungsvorschlag, statt eines kryptischen Codes. Der erste echte Upload (PLSP-003BGE Safari Lodge) ist erfolgreich an Fressnapf rausgegangen.

— Details —
• PM01 (Katalog) → OF01 (Preis/Bestand) mit automatischem Race-Condition-Retry
• Fressnapf-Kategorien: 41 verifizierte marketplace_*-Codes + Inactive-Redirects (z. B. animal_housing → scratch_accessory)
• MMS-Kategorien: Pfad-basierter Resolver (z. B. „PET CARE / PET WELFARE / HYGIENE")
• Robuste Fehler-Report-Auswertung: HTML-Beschreibungen mit Semikola brechen den CSV-Parser nicht mehr
• Encoding-Fallback UTF-8 → Latin-1, damit Umlaute in Rejection-Reports lesbar bleiben
• Pre-Flight-Validation stoppt unbekannte Kategorien VOR dem Upload mit Backoffice-Hinweis',
    '2026-04-22-mirakl-upload',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '2026-04-22',
    'Pflichtfelder werden klüger automatisch ausgefüllt',
    'Beim Anlegen eines Listings werden Marktplatz-Pflichtfelder jetzt mit sinnvollen Werten vorbelegt — Material, Farbe, Tier-Kategorie, Variant-Group-Code und Maße werden aus deinen Quelldaten und dem Titel heuristisch erkannt. Damit verhinderst du das nervige Muster, dass Fressnapf leere Felder mit deinem Markennamen auto-befüllt und dann „Wert PetRhein gehört nicht zur Liste" wirft. Alle Vorbelegungen siehst du im Cross-Listing-Editor und kannst sie vor dem Upload überschreiben.

— Details —
• Heuristik-Material: Sisal (Kratzmöbel), Plüsch, Holz, Baumwolle, Keramik etc. aus Titel/Beschreibung erkannt
• Farb-Heuristik: 13 deutsche Standardfarben (Beige, Grau, Schwarz, Weiß…)
• Tier-Kategorie: aus „Tierart"-Feld in Fressnapf-Enum gemappt (Katze→cat, Hund→dog, Vogel→ornamental_bird…)
• Variant-Group-Code: aus SKU abgeleitet (PLSP-003BGE → PLSP-003)
• Defaults für Country=DE, Verpackungssprache=DE, Verkaufseinheit=Stück
• Brand-Pollution-Filter: Source-Attribute mit Wert == Markenname werden ignoriert',
    '2026-04-22-smart-defaults',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '2026-04-22',
    'Wochenbericht: Was lief diese Woche auf allen Marktplätzen?',
    'Es gibt einen neuen Reporting-Bereich, der pro Kalenderwoche alle Marktplatz-Verkäufe aggregiert auf einer Seite zeigt — Umsatz, Bestellungen, Stückzahlen pro Kanal. Du kannst persönliche Notizen zur Woche speichern (z. B. „Kaufland-Aktion lief gut") und der Bericht lässt sich als Email-fertiges HTML exportieren. Perfekt für den Montagmorgen-Überblick oder das wöchentliche Owner-Update.

— Details —
• Eigene Page unter /analytics/weekly-report mit Filter pro ISO-Kalenderwoche
• Export-Endpoint generiert Email-tauglichen HTML-Report
• Notizen pro Woche werden persistent in einer neuen Supabase-Tabelle gespeichert
• Service-Layer mit isoWeekResolver, weeklyReportService und weeklyReportHtmlRenderer
• Vorbereitung für automatischen Mail-Versand (kommt im nächsten Release)',
    '2026-04-22-weekly-report',
    '00000000-0000-0000-0000-000000000000'
  ),
  (
    '2026-04-22',
    'Marktplatz-Dokumentation: Fressnapf & MediaMarkt komplett dokumentiert',
    'Die internen Spielregeln von Fressnapf und MediaMarkt/Saturn (Pflichtfelder, Bildgrößen, Kategorien, Rejection-Codes) sind jetzt vollständig dokumentiert — über 750 Zeilen geprüfter Marktplatz-Wissen, das vorher nur in Köpfen oder verstreuten PDFs lebte. Das hilft dir und der KI bei jedem Listing-Aufbau zu wissen, was der Marktplatz erwartet, ohne erst durch Rejection-Schleifen zu gehen.

— Details —
• content/marketplace_guidelines/fressnapf.md (+401 Zeilen): Pflichtfelder, animal_categories-Enum, PM01/OF01-Flow, alle Rejection-Codes
• content/marketplace_guidelines/mediamarkt-saturn.md (+352 Zeilen): 3-stufige Kategorie-Taxonomie, alle PROD_FEAT_*/ATTR_PROD_MP_*-Codes, EPREL-Energy-Label, 22 Rejection-Codes (AGE/CAT/DSM/IMG/TTL…)
• Bild-Anforderungen: 1200×1200 RGB, weiß, max 10 Bilder pro Listing
• Discovery-Endpoints: /api/fressnapf/sample-categories und /api/mediamarkt/discover-categories für Kategorie-Lookup live aus der Marktplatz-API',
    '2026-04-22-marketplace-docs',
    '00000000-0000-0000-0000-000000000000'
  )
on conflict (date, title, text) do nothing;
