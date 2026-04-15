# Amazon.de – Regelwerk Haustierbedarf

> **Marktplatz:** Amazon.de
> **Kategorie:** Haustierbedarf (Pet Supplies)
> **Quelle:** Amazon Kategorie Style Guide Haustierbedarf, Januar 2017
> **Zweck:** Automatisierte Prüfung von Produktlistungen auf Regelkonformität
> **Letzte Aktualisierung:** 2017 (Originalquelle)

---

## 1. Allgemeine Grundlagen

### 1.1 Warum diese Regeln existieren

Amazon.de verlangt von Verkäufern die Einhaltung bestimmter Standards, weil die Produktdetailseite im E-Commerce das fehlende Beratungsgespräch ersetzen muss. Produkte, die korrekt und ausführlich angelegt wurden, werden von Kunden leichter gefunden, häufiger verkauft und seltener retourniert. Umfassende Produktinformationen verbessern zusätzlich das Ranking in externen Suchmaschinen (Google, Bing, Yahoo).

### 1.2 Konsequenzen bei Nichtbeachtung

Produkte, die den Richtlinien nicht entsprechen, können aus der Such- und Stöberfunktion ausgeblendet werden. Ausgeblendete Artikel sind für Kunden nicht sichtbar. Im schlimmsten Fall (z. B. bei irreführenden Suchbegriffen oder Konkurrenzmarken) kann der Verkäufer-Account suspendiert werden.

### 1.3 Produktidentifikation (EAN)

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| ALLG-001 | Jedes Produkt muss eine EAN (Europäische Artikelnummer, 13-stellig) oder alternativ einen UPC-Code besitzen. | Ja | Die EAN dient der eindeutigen Produktidentifizierung auf Amazon.de. Ohne EAN kann kein Produkt gelistet werden. |
| ALLG-002 | Falls keine EAN vorhanden ist: Markeninhaber können über die Amazon-Markenregistrierung einen GCID (Global Catalogue Identifier) erhalten. | Bedingt | Der GCID ersetzt die EAN für Eigenmarken, personalisierte oder handgefertigte Produkte und gilt weltweit auf allen Amazon-Marktplätzen. |
| ALLG-003 | Falls weder EAN noch GCID möglich: Prüfung auf EAN-Befreiung beantragen. | Bedingt | Einige Produkte qualifizieren sich für eine Befreiung, wenn sie weder über eine EAN verfügen noch für die Markenregistrierung in Frage kommen. |

### 1.4 Einzigartigkeit der Produktdetailseite

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| ALLG-004 | Für jedes Produkt darf es auf Amazon.de nur eine einzige Produktdetailseite geben, auch wenn mehrere Verkäufer dieses Produkt anbieten. | Ja | Titel und Beschreibungen dürfen deshalb niemals verkäuferspezifische Informationen enthalten. Verstöße können zur Unterdrückung der Artikel und zum Entzug der Verkaufsrechte führen. |

---

## 2. Produkttitel

### 2.1 Warum der Titel so wichtig ist

Der Produkttitel ist der erste Eindruck, den Kunden vom Produkt erhalten. Er beeinflusst die Auffindbarkeit in der Amazon-Suche und in externen Suchmaschinen. Ein gut strukturierter Titel signalisiert Professionalität und Vertrauenswürdigkeit.

### 2.2 Allgemeine Titelregeln

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| TITEL-001 | Maximale Titellänge: 80 Zeichen. | Ja | Ja – Zeichenanzahl prüfen | Kürzere Titel werden auf mobilen Endgeräten vollständig angezeigt. Zu lange Titel werden abgeschnitten und wirken unprofessionell. |
| TITEL-002 | Korrekte deutsche Groß- und Kleinschreibung verwenden. | Ja | Ja – Prüfung auf reine Großbuchstaben oder reine Kleinbuchstaben | Nur Großbuchstaben oder nur Kleinbuchstaben wirken unseriös und verstoßen gegen die Richtlinien. |
| TITEL-003 | Zahlen als Ziffern schreiben (z. B. „2" statt „zwei"). | Ja | Ja – Prüfung auf Zahlwörter | Ziffern sind schneller erfassbar und sparen Zeichen im Titel. |
| TITEL-004 | Titel muss in deutscher Sprache verfasst sein. | Ja | Bedingt | Amazon.de ist ein deutschsprachiger Marktplatz. Marken- und Produktnamen in Originalsprache sind erlaubt. |
| TITEL-005 | Keine Preisangaben im Titel. | Ja | Ja – Prüfung auf Währungszeichen (€, EUR) und Preismuster | Preise gehören nicht in den Titel, da sie sich ändern können und Amazon den Preis separat anzeigt. |
| TITEL-006 | Keine Symbole im Titel: !, ?, *, €, Anführungszeichen „..". | Ja | Ja – Zeichenprüfung auf verbotene Symbole | Diese Zeichen wirken unseriös und können die Suche beeinträchtigen. |
| TITEL-007 | Keine subjektiven oder werblichen Aussagen im Titel (z. B. „Sonderangebot", „Bestseller", „Versandkostenfrei"). | Ja | Ja – Wortliste mit verbotenen Begriffen abgleichen | Werbliche Begriffe sind irreführend, da sie nicht für alle Verkäufer gelten, und verstoßen gegen Amazons Richtlinien. |
| TITEL-008 | Kein Verkäufername im Titel, es sei denn der Verkäufername ist eine eingetragene Handelsmarke. | Ja | Ja – Abgleich Verkäufername mit Titeltext | Der Titel beschreibt das Produkt, nicht den Verkäufer. Verkäufernamen verwirren den Kunden. |
| TITEL-009 | Keine HTML-Tags oder Sonderzeichen, die nicht auf einer Standardtastatur vorhanden sind (z. B. ®, ©, ™). | Ja | Ja – Regex-Prüfung auf HTML-Tags und Sonderzeichen | HTML-Tags werden nicht gerendert und Sonderzeichen können die Darstellung stören. |
| TITEL-010 | Bei Bündelprodukten: Anzahl der Produkte im Titel angeben (z. B. „10 Schalen (10 x 100 g)"). | Ja | Bedingt – Prüfung wenn Produkt als Bundle gekennzeichnet | Der Kunde muss sofort erkennen, wie viele Einheiten enthalten sind, um den Wert korrekt einschätzen zu können. |
| TITEL-011 | Format bei Gewichts- und Volumenangaben: „Zahl – Leerzeichen – Einheit" (z. B. „0.5 l", „500 ml", „3,6 kg"). Gängige Abkürzungen verwenden: ml, g, l, mg, kg. | Ja | Ja – Regex-Prüfung auf Maßeinheiten-Format | Einheitliches Format verbessert die Lesbarkeit und ermöglicht korrekte Filterung. |

### 2.3 Titelaufbau – Allgemeine Produkte (nicht Futter)

**Formel:**
```
[Marke] + [Produktbezeichnung] + [Produktbeschreibung] + [Farbvariation] + [Größenvariation]
```

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| TITEL-020 | Der Titel muss mit der Marke beginnen. | Ja | Die Marke ist das erste Erkennungsmerkmal und wichtig für die Filterung. |
| TITEL-021 | Keine Herstellernummer im Titel, außer bei Zubehörartikeln. | Ja | Herstellernummern sind für den Kunden in der Regel nicht relevant und verschwenden Titelzeichen. Bei Zubehör hilft die Nummer bei der Kompatibilitätsprüfung. |
| TITEL-022 | Farbvariationen und Größenvariationen gehören in den Child-ASIN-Titel. | Ja | Parent-ASINs sind übergeordnete Artikel. Die spezifische Variante wird über die Child-ASIN beschrieben. |

**Beispiele für korrekte allgemeine Titel:**
- `Trixie Capri Transportbox, dunkelgrau/lindgrün, 32 × 31 × 48 cm`
- `FURminator Striegel für Hunde, gelb`
- `BactoDes Animal, Geruchsentferner gegen Tieruringeruch, inkl. Mischflasche, 1 Liter`

### 2.4 Titelaufbau – Tierfutter

**Formel:**
```
[Marke] + [Untermarke (optional)] + [Futterart] + [Spezifikation (Geschmack, Altersstufe)] + [Gesamtmenge (X Dosen/Beutel/Packungen/Schalen)] + [Gesamtmenge x Gewicht]
```

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| TITEL-030 | Bei Tierfutter: Futterart muss im Titel enthalten sein (z. B. „Katzenfutter", „Hundefutter"). | Ja | Kunden filtern nach Tierart. Die Futterart ist das zentrale Suchkriterium. |
| TITEL-031 | Gewichts-/Mengenangaben immer mit Leerzeichen vor der Einheit (z. B. „100 g", nicht „100g"). | Ja | Einheitliches Format verbessert die maschinelle Auswertung und Lesbarkeit. |
| TITEL-032 | Redundante Angabe „1 x" kann weggelassen werden (z. B. „48 x 100 g" statt „1 x 48 x 100 g"). | Empfohlen | Spart Zeichen und vermeidet Verwirrung. |
| TITEL-033 | Kommas statt Punkte bei Dezimalzahlen verwenden (z. B. „3,6 kg" statt „3.6 kg"). | Ja | Deutscher Sprachstandard. Punkte als Dezimaltrenner sind im deutschen Raum unüblich und können missverstanden werden. |

**Beispiele für korrekte Futtertitel:**
- `Animonda vom Feinsten Katzenfutter Adult, 32 Schalen (32 x 100 g)`
- `TetraMin Hauptfutter für Zierfische, 1 l (280 g)`
- `Dehner Natura Wildvogelfutter, schalenfreies Streufutter, 5 l (3,6 kg)`

### 2.5 Titelaufbau – Tierfutter-Mehrfachpackungen

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| TITEL-040 | Bei Mehrfachpackungen: Nur das Gesamtgewicht in den Titel schreiben. Die Aufschlüsselung (Details) gehört in die Bullet Points. | Ja | Der Titel wird sonst zu lang und unübersichtlich. Die Details stehen dem Kunden in den Attributen zur Verfügung. |
| TITEL-041 | Der erste Bullet Point bei Mehrfachpackungen muss die Zusammensetzung enthalten (z. B. „Pack enthält: 4 x 20 x 100 g Portionsbeutel + 4 x 2 x 40 g Knusperstückchen"). | Ja | Der Kunde muss die genaue Zusammensetzung nachvollziehen können, ohne die Detailseite verlassen zu müssen. |

**Berechnungslogik für Mehrfachpackungen:**
```
Gesamtgewicht = Anzahl_Multipacks × (Anzahl_Portionen × Portionsgewicht + Anzahl_Extras × Extragewicht)

Beispiel:
4 × (20 × 100 g + 2 × 40 g) = 4 × 2080 g = 4 × 2,08 kg = 8,32 kg
```

### 2.6 Titelaufbau – Produkt-Bundles

**Formel:**
```
[Produkt A] und [Produkt B]
```

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| TITEL-050 | Produkt-Bundles: Beide Produkte im Titel mit „und" verbinden. | Ja | Der Kunde muss sofort erkennen, welche Produkte im Bundle enthalten sind. |
| TITEL-051 | Erster Bullet Point bei Bundles: „Set enthält: Produkt A und Produkt B". | Ja | Die Zusammensetzung muss klar kommuniziert werden. |

### 2.7 Verbotene Begriffe im Titel (Blacklist)

Die folgenden Begriffe und Muster sind im Titel nicht erlaubt:

| Kategorie | Verbotene Begriffe/Muster | Begründung |
|-----------|--------------------------|------------|
| Werbesprache | Sonderangebot, Bestseller, Sale, Rabatt, Aktion, Neuheit, Top, Exklusiv, Limitiert | Werbliche Aussagen sind subjektiv und gelten nicht für alle Verkäufer. |
| Versandhinweise | Versandkostenfrei, Gratisversand, Schnellversand, Prime | Versandinformationen werden von Amazon separat angezeigt und variieren je Verkäufer. |
| Preisbezüge | €, EUR, Preis, Kostenlos, Gratis, Billig, Günstig | Preise ändern sich dynamisch und gehören nicht in den Titel. |
| Symbole | !, ?, *, ®, ©, ™, „", HTML-Tags | Diese Zeichen können die Darstellung und Suche stören. |

---

## 3. Produktbilder

### 3.1 Warum Bilder entscheidend sind

Klare und aussagekräftige Bilder sind von zentraler Bedeutung für den Umsatz. Da Kunden das Produkt nicht physisch inspizieren können, müssen Bilder das Produkt so realistisch und detailliert wie möglich darstellen. Gute Produktbilder spielen bei der Kaufentscheidung eine entscheidende Rolle.

### 3.2 Allgemeine Bildanforderungen

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| BILD-001 | Mindestgröße: 500 Pixel an der längsten Seite. | Ja | Ja – Bildgröße in Pixeln prüfen | Unterhalb von 500 Pixeln ist das Produkt nicht ausreichend erkennbar. Produkte ohne Mindestgröße werden ausgeblendet. |
| BILD-002 | Empfohlene Größe: 1200 Pixel an der längsten Seite (Zoom-Funktion). | Empfohlen | Ja – Bildgröße prüfen | Ab 1200 Pixeln wird die Zoomfunktion aktiviert, die nachweislich die Conversion-Rate erhöht. |
| BILD-003 | Das Produkt muss mindestens 85 % der Bildfläche einnehmen. | Ja | Bedingt – Bildanalyse erforderlich | Das Produkt muss prominent dargestellt werden, damit der Kunde es klar erkennen kann. |
| BILD-004 | Das gesamte Produkt muss im Bild sichtbar sein (kein Abschneiden). | Ja | Bedingt – Bildanalyse erforderlich | Ein abgeschnittenes Produkt wirkt unprofessionell und lässt den Kunden Teile des Produkts nicht erkennen. |
| BILD-005 | Produkt muss gut erkennbar, gut ausgeleuchtet und in aussagekräftiger Perspektive dargestellt sein. | Ja | Manuell | Schlechte Beleuchtung oder ungünstige Perspektiven verhindern eine realistische Produkteinschätzung. |
| BILD-006 | Keine Texte auf dem Bild (außer Text, der physisch auf dem Produkt selbst ist). | Ja | Bedingt – OCR-basierte Prüfung | Zusätzliche Texte lenken vom Produkt ab und können als Werbung gewertet werden. |
| BILD-007 | Keine Ränder, Rahmen, Logos, Etiketten, Preisschilder oder Wasserzeichen. | Ja | Bedingt – Bildanalyse | Diese Elemente wirken unprofessionell und verstoßen gegen Amazons einheitliches Erscheinungsbild. |
| BILD-008 | Bildformat: JPG oder PNG, Farbmodus: RGB. | Ja | Ja – Metadaten prüfen | CMYK-Bilder werden vom System zurückgewiesen. JPG und PNG sind die einzigen akzeptierten Formate. |
| BILD-009 | Für jede Farbvariation muss ein eigenes Bild existieren. | Ja | Ja – Prüfung ob Farbvarianten Bilder haben | Kunden erwarten, das tatsächliche Produkt in ihrer gewünschten Farbe zu sehen. Ein generisches Bild für alle Farben ist irreführend. |
| BILD-010 | Keine Platzhalter-Bilder (z. B. „Bild nicht verfügbar"). | Ja | Ja – Hash-/Text-Erkennung | Platzhalter bieten dem Kunden keinen Mehrwert und wirken unprofessionell. |
| BILD-011 | Keine Zeichnungen, keine animierten Bilder. | Ja | Bedingt | Nur echte Produktfotos vermitteln ein realistisches Bild des Produkts. |
| BILD-012 | Keine Bilder mit Werbeinhalten (z. B. „Sonderangebot"). | Ja | Bedingt – OCR/Textanalyse | Werbeinhalte sind verkäuferspezifisch und gehören nicht auf die Produktdetailseite. |

### 3.3 Hauptbild (Main Image) – Spezifische Regeln

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| BILD-020 | Hauptbild-Hintergrund muss 100 % weiß sein (RGB 255, 255, 255). | Ja | Ja – Hintergrundfarbe analysieren | Weißer Hintergrund sorgt für ein einheitliches Erscheinungsbild in den Suchergebnissen und lenkt nicht vom Produkt ab. |
| BILD-021 | Eine leichte Schattierung zur Abhebung des Produkts vom Hintergrund ist erlaubt. | Info | - | Der Schatten erhöht die Plastizität und hilft, das Produkt vom Hintergrund abzuheben. |
| BILD-022 | Das Hauptbild muss eine Frontansicht des Produkts zeigen. | Ja | Manuell | Die Frontansicht bietet die beste Wiedererkennung und ist der Industriestandard. |
| BILD-023 | Keine Lifestyle-Bilder als Hauptbild. | Ja | Bedingt – Bildanalyse | Lifestyle-Bilder sind als zusätzliche Bilder erwünscht, aber das Hauptbild muss das reine Produkt zeigen. |
| BILD-024 | Jede Parent-ASIN muss ein Hauptbild haben. | Ja | Ja – Prüfung ob Hauptbild vorhanden | Ohne Hauptbild wird das Produkt nicht korrekt in der Suche angezeigt. |
| BILD-025 | Jede Child-ASIN muss ein eigenes Hauptbild haben, das die jeweilige Variante (Größe, Farbe) zeigt. | Ja | Ja – Prüfung ob Child-ASINs Bilder haben | Kunden müssen die spezifische Variante sehen können, die sie kaufen. |

### 3.4 Zusätzliche Bilder (Alternative Bilder)

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| BILD-030 | Zusätzliche Bilder mit verschiedenen Ansichten und Detailausschnitten bereitstellen. | Empfohlen | Mehrere Perspektiven unterstützen die Kaufentscheidung und reduzieren Retouren. |
| BILD-031 | Bei zusätzlichen Bildern sind farbige Hintergründe und Produkt im Anwendungsumfeld erlaubt. | Info | Lifestyle-Bilder zeigen das Produkt im Einsatz und helfen dem Kunden, sich die Nutzung vorzustellen. |
| BILD-032 | Hintergrund darf nicht vom Produkt ablenken. | Ja | Manuell | Das Produkt muss immer im Mittelpunkt stehen. |
| BILD-033 | Text, schematische Darstellungen und Skizzen sind in zusätzlichen Bildern erlaubt, sofern sie zur Erklärung beitragen. | Info | Infografiken können Maße, Materialien oder Besonderheiten effektiv kommunizieren. |

### 3.5 Bilder für Produkt-Bundles

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| BILD-040 | Für Bundles muss ein Bild hochgeladen werden, das alle im Bundle enthaltenen Produkte zeigt. | Ja | Der Kunde muss sehen, was er tatsächlich erhält. Ein Einzelproduktfoto für ein Bundle ist irreführend. |

---

## 4. Attribute (Bullet Points / Highlights)

### 4.1 Warum Attribute wichtig sind

Attribute sind die ersten schriftlichen Informationen, die der Kunde auf der Produktdetailseite lesen kann. Sie beeinflussen die Kaufentscheidung maßgeblich, da sie die wichtigsten Produkteigenschaften auf einen Blick vermitteln.

### 4.2 Formatregeln für Attribute

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| ATTR-001 | Maximal 5 Bullet Points verwenden. | Ja | Ja – Anzahl der Bullet Points zählen | Amazon erlaubt bis zu 5 Schlüsselmerkmale. Mehr werden nicht angezeigt. |
| ATTR-002 | Jedes Highlight mit einem Großbuchstaben beginnen. | Ja | Ja – Erster Buchstabe prüfen | Konsistente Formatierung wirkt professionell und verbessert die Lesbarkeit. |
| ATTR-003 | Zahlen ausschreiben (als Ziffern, z. B. „5" statt „fünf"). | Ja | Ja – Prüfung auf ausgeschriebene Zahlwörter | Ziffern sind schneller erfassbar. |
| ATTR-004 | Mehrere Phrasen innerhalb eines Highlights mit Semikolon trennen. | Ja | Bedingt | Semikolons schaffen Struktur innerhalb eines Bullet Points. |
| ATTR-005 | Maßeinheiten abkürzen: Milliliter = ml, Gramm = g, Liter = l, Milligramm = mg. | Ja | Ja – Prüfung auf ausgeschriebene Maßeinheiten | Spart Platz und ist Industriestandard. |
| ATTR-006 | Keine Satzzeichen wie Bindestriche, Symbole, Punkte und Ausrufezeichen. | Ja | Ja – Zeichenprüfung | Übermäßige Satzzeichen wirken unseriös. |
| ATTR-007 | Keine vagen Andeutungen. Möglichst genaue, beschreibende Produktmerkmale verwenden. | Ja | Bedingt – Blacklist für vage Begriffe | Vage Aussagen wie „Hochwertige Aufmachung" bieten dem Kunden keinen Informationsgehalt. |
| ATTR-008 | Keine Preis- oder Werbeinformationen. | Ja | Ja – Wortliste abgleichen | Preise ändern sich und Werbung ist verkäuferspezifisch. |
| ATTR-009 | Keine Versand- oder Firmeninformationen. | Ja | Ja – Wortliste abgleichen | Amazon stellt diese Informationen bereits bereit. Sie variieren je Verkäufer. |
| ATTR-010 | Kurz und prägnant formulieren. Für lange Beschreibungen das Feld „Produktbeschreibung" nutzen. | Empfohlen | Manuell | Bullet Points sollen als Schnellübersicht dienen, nicht als Fließtext. |

### 4.3 Inhaltliche Struktur der Attribute nach Sub-Kategorie

Das erste Attribut sollte spezifisch für die Sub-Kategorie sein:

| Sub-Kategorie | Empfohlener Inhalt des ersten Attributs | Regel-ID |
|---------------|----------------------------------------|----------|
| Tierfutter & Gesundheit | Unterstützt bei / Zielgruppe (Adult, Welpe, Rasse) / Hauptinhaltsstoffe / Nährwerte / Info zu künstlichen Zusatzstoffen | ATTR-020 |
| Mehrfachpackungen (Futter) | Genaue Aufschlüsselung der Packungsinhalte (z. B. „Pack enthält: 4 x 20 x 100 g Portionsbeutel + 4 x 2 x 40 g Knusperstückchen") | ATTR-021 |
| Spielzeug & Lebensräume | Vorteile für die Entwicklung, Besonderheiten | ATTR-022 |
| Fellpflege | Funktion (z. B. antiseptisch, Schutz vor Haarausfall) | ATTR-023 |
| Aquaristik | Anwendungsbereich (z. B. Beleuchtung für Terrarien & Aquarien) | ATTR-024 |
| Bekleidung | Materialart | ATTR-025 |

Generelle Attribute (für alle Sub-Kategorien anwendbar):

| Attribut-Typ | Beispiel | Regel-ID |
|-------------|---------|----------|
| Produkttyp & Inhaltsstoffe | „Hergestellt mit..." | ATTR-030 |
| Pflegehinweise | „Nur Handwäsche", „Spülmaschinenfest" | ATTR-031 |
| Besonderheiten | „Atmungsaktives Mesh-Material", „Imprägnierung" | ATTR-032 |

### 4.4 Verbotene Inhalte in Attributen (Blacklist)

| Verboten | Beispiele | Begründung |
|----------|----------|------------|
| Vage / leere Aussagen | „Original verpackte Neuware", „Hochwertige Aufmachung" | Kein Informationsgehalt für den Kunden. |
| Preisbezogene Aussagen | „Attraktiver Preis", „Preis-Leistungs-Sieger" | Preise variieren und sind subjektiv. |
| Verkäufer-/Versandhinweise | „Lieferung ab Lager", „Versandkostenfrei" | Diese Informationen sind verkäuferspezifisch und werden von Amazon separat angezeigt. |

---

## 5. Produktbeschreibung

### 5.1 Warum die Produktbeschreibung wichtig ist

Die Produktbeschreibung befindet sich weiter unten auf der Detailseite unter „Weitere Produktdetails". Sie ersetzt das klassische Verkaufsgespräch und erlaubt eine ausführliche, detaillierte Darstellung des Produkts als freier Fließtext. Sie erhöht die Chance, in Suchergebnissen gefunden zu werden.

### 5.2 Regeln für die Produktbeschreibung

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| BESCH-001 | Das Beschreibungsfeld darf nicht leer bleiben. | Ja | Ja – Prüfung auf leeres Feld | Ein leeres Beschreibungsfeld ist eine verpasste Chance, den Kunden zu überzeugen und die SEO-Relevanz zu erhöhen. |
| BESCH-002 | In ganzen Sätzen und als Fließtext schreiben, nicht nur Stichpunkte. | Ja | Bedingt – Prüfung auf Bulletpoint-Muster | Fließtext wirkt professioneller und ersetzt das Beratungsgespräch. Stichpunkte gehören in die Attribute. |
| BESCH-003 | Alleinstellungsmerkmale des Produkts beschreiben. | Empfohlen | Manuell | Alleinstellungsmerkmale differenzieren das Produkt von der Konkurrenz. |
| BESCH-004 | Keine händler- oder angebotsspezifischen Details (Preise, Versand, Händlerinfos). | Ja | Ja – Wortliste abgleichen | Die Produktbeschreibung wird bei allen Verkäufern angezeigt und darf daher nur allgemeingültige Informationen enthalten. |
| BESCH-005 | Beschreibung soll den Gebrauch und Nutzen des Produkts aus Kundensicht darstellen. | Empfohlen | Manuell | Der Kunde soll sich beim Lesen vorstellen können, wie er das Produkt nutzt. Dies fördert die Kaufentscheidung. |

---

## 6. Grundpreisangabe

### 6.1 Warum die Grundpreisangabe Pflicht ist

Die Grundpreisangabe (Preis pro kg oder Liter) ist eine gesetzliche Vorschrift in Deutschland. Sie ermöglicht dem Kunden den Preisvergleich zwischen unterschiedlich großen Verpackungen. Amazon berechnet den Grundpreis automatisch, wenn die Daten korrekt hinterlegt sind.

### 6.2 Regeln für die Grundpreisangabe

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| PREIS-001 | Das Verkaufsgewicht (item_display_weight) muss im Flat File angegeben werden. | Ja | Ja – Prüfung auf vorhandenen Wert | Ohne Verkaufsgewicht kann Amazon den Grundpreis nicht automatisch berechnen. |
| PREIS-002 | Die Maßeinheit (item_display_weight_unit_of_measure) muss angegeben werden (z. B. KG). | Ja | Ja – Prüfung auf vorhandenen Wert | Die Einheit ist erforderlich für die korrekte Berechnung des Grundpreises. |
| PREIS-003 | Bei Mehrfachpackungen: Das gesamte Verkaufsgewicht aller enthaltenen Einheiten berechnen. | Ja | Ja – Formelprüfung möglich | Der Grundpreis muss sich auf die gesamte Liefermenge beziehen, nicht auf eine Einzelpackung. |

**Berechnungsbeispiel:**
```
Produkt: 4er Pack, je 20 × 100 g Beutel + 2 × 40 g Snacks
Einzelpackung: (20 × 100 g) + (2 × 40 g) = 2000 g + 80 g = 2080 g = 2,08 kg
Gesamtgewicht: 4 × 2,08 kg = 8,32 kg
→ item_display_weight = 8.32
→ item_display_weight_unit_of_measure = KG
```

---

## 7. Marke und Hersteller

### 7.1 Warum Marke und Hersteller wichtig sind

Die Marke wird sowohl in der Amazon-Suche als auch in externen Suchmaschinen berücksichtigt. Kunden können in Suchergebnissen gezielt nach Marken filtern. Eine korrekt hinterlegte Marke verbessert die Auffindbarkeit erheblich.

### 7.2 Regeln für Marke und Hersteller

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| MARKE-001 | Jedes Produkt muss eine Marke hinterlegt haben. | Ja | Ja – Prüfung auf leeres Feld | Ohne Marke ist das Produkt über den Markenfilter nicht auffindbar. |
| MARKE-002 | Korrekte Schreibweise der Marke beachten. | Ja | Ja – Abgleich mit Marken-Datenbank | Falsche Schreibweisen führen dazu, dass die Marke nicht erkannt wird und nicht korrekt gefiltert werden kann. |
| MARKE-003 | Für No-Name-Produkte „Unbekannt" als Marke angeben, nicht den Verkäufernamen. | Ja | Ja – Abgleich Markenfeld mit Verkäufernamen | Der Verkäufername ist keine Marke (es sei denn, er ist eingetragen) und würde den Kunden irreführen. |
| MARKE-004 | Marke und Hersteller können unterschiedlich sein (z. B. Marke „Whiskas", Hersteller „Mars"). | Info | - | Die korrekte Zuordnung verbessert die Katalogstruktur und erleichtert die Suche. |

---

## 8. Browse Nodes (Produktkategorisierung)

### 8.1 Warum die richtige Kategorisierung entscheidend ist

Browse Nodes sind das Inhaltsverzeichnis des Amazon-Katalogs. Eine korrekte Zuordnung entscheidet darüber, ob Kunden Produkte über die Kategorie-Navigation und Filter finden können. Falsch kategorisierte Produkte werden in der falschen Abteilung angezeigt oder sind gar nicht auffindbar.

### 8.2 Regeln für Browse Nodes

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| BROWSE-001 | Jedem Produkt muss eine Browse Node ID zugeordnet sein. | Ja | Ja – Prüfung auf vorhandene ID | Ohne Browse Node ist das Produkt in der Kategorie-Navigation nicht auffindbar. |
| BROWSE-002 | Immer den tiefsten/detailliertesten Knotenpunkt verwenden. | Ja | Ja – Prüfung ob Node ein Blattknoten ist | Übergeordnete (graue) Nodes sind zu allgemein. Nur der spezifischste (schwarze) Knotenpunkt gewährleistet eine korrekte Zuordnung. |
| BROWSE-003 | Nur eine einzige, eindeutige Browse Node ID pro Produkt. | Ja | Ja – Prüfung auf Anzahl der IDs | Mehrere IDs können zu widersprüchlichen Zuordnungen führen. |

**Beispiel Browse Node:**
```
ID: 2497416031
Pfad: Haustier > Hunde > Geschirre, Halsbänder & Leinen > Geschirre > Sicherheitsgeschirre
```

---

## 9. Refinements (Filter)

### 9.1 Warum Refinements wichtig sind

Refinements sind zusätzliche Filtermöglichkeiten (z. B. „Altersstufe Hund: Welpe/Jungtier/Ausgewachsen/Senior" oder „Futterform: Nassfutter/Trockenfutter"), die in der linken Spalte der Suchergebnisseite erscheinen. Hat ein Kunde einen Filter angeklickt, erscheint ein Produkt nur dann, wenn die entsprechende Information hinterlegt wurde.

### 9.2 Regeln für Refinements

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| REFINE-001 | Alle relevanten Filterfelder im Flat File ausfüllen. | Ja | Ja – Prüfung auf leere Pflichtfelder | Nicht ausgefüllte Refinement-Felder führen dazu, dass das Produkt bei Filterung ausgeblendet wird. Kunden, die nach „Trockenfutter" filtern, finden ein nicht gekennzeichnetes Trockenfutter nicht. |
| REFINE-002 | Die Refinement-Daten werden zusätzlich auf der Detailseite hervorgehoben. | Info | - | Korrekte Refinement-Daten verbessern nicht nur die Auffindbarkeit, sondern liefern dem Kunden auf der Detailseite weitere Informationen, was die Conversion-Rate positiv beeinflusst. |

---

## 10. Variationen

### 10.1 Warum Variationen wichtig sind

Variationen ermöglichen es, alle Ausführungen eines Produkts (z. B. verschiedene Größen, Farben oder Geschmacksrichtungen) unter einer übergeordneten Parent-ASIN zusammenzufassen. Der Kunde kann so alle verfügbaren Optionen auf einer einzigen Seite sehen, ohne die Produktdetailseite verlassen zu müssen. Das verbessert die Nutzererfahrung und erhöht die Conversion-Rate.

### 10.2 Variationsstruktur

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| VAR-001 | Alle Varianten eines Produkts müssen unter einer gemeinsamen Parent-ASIN erstellt werden. | Ja | Ja – Prüfung auf verwaiste Child-ASINs | Ohne Parent-ASIN werden Varianten als separate Produkte angezeigt. Der Kunde kann dann nicht einfach zwischen Größen/Farben wechseln. |
| VAR-002 | Die Parent-ASIN wird nicht zum Verkauf angeboten. | Ja | Ja – Prüfung ob Parent-ASIN einen Preis hat | Die Parent-ASIN ist nur ein Rahmen zur Verknüpfung der Child-ASINs. Verkauft werden ausschließlich die Child-ASINs. |
| VAR-003 | Jede Child-ASIN muss über das Feld „Variantentyp" (Variation Theme) korrekt definiert sein. | Ja | Ja – Prüfung auf vorhandenes Variation Theme | Ohne Variantentyp weiß Amazon nicht, wie die Variante dargestellt werden soll (Dropdown, Farbauswahl etc.). |
| VAR-004 | Alle Child-ASINs müssen denselben Produktnamen verwenden, nur mit spezifischen Variationsmerkmalen ergänzt. | Ja | Ja – Namensvergleich zwischen Parent und Children | Unterschiedliche Produktnamen bei Varianten verwirren den Kunden und können als separate Produkte interpretiert werden. |
| VAR-005 | Variationen dürfen nicht für neue Produktversionen verwendet werden. | Ja | Manuell | Variationen sind nur für gleichzeitig existierende Ausführungen (Größe, Farbe) gedacht, nicht für Produktgenerationen. Für Nachfolger gibt es die Funktion „Nachfolgeprodukte". |

### 10.3 Erlaubte Variationstypen nach Sub-Kategorie

| Sub-Kategorie | Erlaubte Variationstypen (variation_theme) | Erklärung |
|---------------|-------------------------------------------|-----------|
| Tierfutter & Snacks – Trockenfutter | SizeName | Verschiedene Packungsgrößen oder Bundles. |
| Tierfutter & Snacks – Nassfutter | Flavor | Verschiedene Geschmacksrichtungen. |
| Tierfutter & Snacks – Nassfutter (mit Größen) | FlavorSize | Kombination aus Geschmack und Größe, falls für den Kunden relevant. |
| Alle anderen Produkte (nicht Futter) | SizeName | Verschiedene Größen oder Bundles. |
| Alle anderen Produkte (nicht Futter) | Color | Verschiedene Farben. |
| Alle anderen Produkte (nicht Futter) | SizeNameColorName | Kombination aus Größe und Farbe, z. B. bei Leinen. |

---

## 11. Nachfolgeprodukte

### 11.1 Regeln für Nachfolgeprodukte

| Regel-ID | Regel | Pflicht | Begründung |
|----------|-------|---------|------------|
| NACHF-001 | Wenn ein Produkt eine neue Version oder ein Nachfolgemodell eines bestehenden Produkts ist, muss dies beim Einlisten angegeben werden. | Ja | Kunden und Amazon benötigen die Information, dass das alte Produkt abgelöst wird. Der Nachfolger erbt ggf. Bewertungen und Traffic. |
| NACHF-002 | Nachfolgeprodukt-Verknüpfung nur verwenden bei: gleichem Produkt mit geringfügigen Änderungen und offiziellem Nachfolgestatus. | Ja | Missbräuchliche Nutzung (z. B. Verknüpfung komplett anderer Produkte) würde die Katalogstruktur beschädigen. |

---

## 12. Suchbegriffe

### 12.1 Warum Suchbegriffe wichtig sind

Der Titel und die fest definierten Filter können nicht alle Facetten eines Produkts abdecken. Suchbegriffe ermöglichen die Auffindbarkeit über Synonyme und alternative Bezeichnungen, die nicht im Titel oder in den Attributen vorkommen.

### 12.2 Regeln für Suchbegriffe

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| SUCH-001 | Alle verfügbaren Suchbegriff-Felder nutzen, idealerweise max. 20 Suchbegriffe insgesamt. | Empfohlen | Ja – Anzahl der Suchbegriffe zählen | Mehr Suchbegriffe bedeuten mehr Auffindbarkeit über verschiedene Suchanfragen. |
| SUCH-002 | Einzelwörter durch Kommas trennen, Doppelwörter mit Leerzeichen. | Ja | Ja – Formatprüfung | Korrekte Trennung gewährleistet, dass Amazon die einzelnen Begriffe korrekt erkennt und zuordnet. |
| SUCH-003 | Nur Begriffe verwenden, die noch nicht im Titel oder in den Attributen vorkommen. | Ja | Ja – Abgleich Suchbegriffe mit Titel und Attributen | Titel und Attribute fließen bereits in die Suche ein. Wiederholungen verschwenden Platz und bringen keinen Vorteil. |
| SUCH-004 | Keine Suchbegriffe in den Titel schreiben. | Ja | Bedingt | Der Titel hat eine eigene Struktur. Keyword-Stuffing im Titel wirkt unprofessionell und verstößt gegen die Richtlinien. |
| SUCH-005 | Keine Wiederholung der Marke. | Ja | Ja – Abgleich mit Markenfeld | Die Marke fließt automatisch in die Suche ein. |
| SUCH-006 | Keine üblichen Falschschreibungen oder Pluralformen. | Ja | Bedingt | Amazons Suchprogramm erkennt Falschschreibungen und Pluralformen automatisch. |
| SUCH-007 | Keine subjektiven Adjektive (z. B. „einzigartig", „unvergesslich"). | Ja | Ja – Wortliste abgleichen | Kunden suchen nicht nach subjektiven Adjektiven. Diese Begriffe haben keine Relevanz für die Suche. |
| SUCH-008 | Keine zu weit gefassten Begriffe (z. B. „Hund", „Katze"). | Ja | Bedingt – Blacklist für generische Begriffe | Zu generische Begriffe sind nicht spezifisch genug und führen zu irrelevanten Suchergebnissen. |
| SUCH-009 | Keinen Verkäufernamen als Suchbegriff. | Ja | Ja – Abgleich mit Verkäufernamen | Der Verkäufername ist kein Produktmerkmal. |
| SUCH-010 | Keine falschen, irreführenden Attribute oder Konkurrenzmarken. | Ja | Ja – Marken-Blacklist | Kann im schlimmsten Fall zur Suspendierung des Accounts führen. Dies ist ein schwerwiegender Verstoß. |

---

## 13. Impressum

### 13.1 Regeln für das Impressum

| Regel-ID | Regel | Pflicht | Prüfbar | Begründung |
|----------|-------|---------|---------|------------|
| IMPR-001 | Ein vollständiges Impressum muss im Verkäuferkonto hinterlegt sein. | Ja | Ja – Prüfung auf vorhandenes Impressum | Gesetzliche Pflicht in Deutschland gemäß den Teilnahmebedingungen. |
| IMPR-002 | Das Impressum muss enthalten: Rechtsform, Adresse, Telefon/Fax (zusätzlich zu E-Mail), Registernummern, Vertretungsberechtigter. | Ja | Ja – Prüfung auf Vollständigkeit | Diese Angaben sind gesetzlich vorgeschrieben. Fehlende Angaben können zu Abmahnungen führen. |

---

## Anhang: Zusammenfassung der Prüfregeln nach Schweregrad

### Kritisch (Produkt wird ausgeblendet oder Account gefährdet)

| Regel-ID | Kurzbeschreibung |
|----------|-----------------|
| BILD-001 | Bildgröße unter 500 Pixel |
| BILD-008 | Falsches Bildformat oder Farbmodus |
| BILD-020 | Hauptbild ohne weißen Hintergrund |
| ALLG-001 | Fehlende EAN / GCID |
| ALLG-004 | Verkäuferspezifische Infos in Titel/Beschreibung |
| TITEL-005 | Preise im Titel |
| TITEL-007 | Werbliche Begriffe im Titel |
| SUCH-010 | Irreführende Suchbegriffe / Konkurrenzmarken |
| IMPR-001 | Fehlendes Impressum |

### Hoch (Auffindbarkeit und Conversion stark beeinträchtigt)

| Regel-ID | Kurzbeschreibung |
|----------|-----------------|
| TITEL-001 | Titel über 80 Zeichen |
| TITEL-002 | Nur Groß- oder Kleinbuchstaben |
| BILD-009 | Fehlende Bilder für Farbvarianten |
| BILD-025 | Child-ASIN ohne eigenes Bild |
| BROWSE-001 | Fehlende Browse Node ID |
| BROWSE-002 | Übergeordnete statt spezifische Browse Node |
| REFINE-001 | Leere Refinement-Felder |
| VAR-001 | Varianten ohne Parent-ASIN |
| BESCH-001 | Leere Produktbeschreibung |
| MARKE-001 | Fehlende Marke |
| PREIS-001 | Fehlendes Verkaufsgewicht für Grundpreisberechnung |

### Mittel (Qualitätsverbesserung empfohlen)

| Regel-ID | Kurzbeschreibung |
|----------|-----------------|
| BILD-002 | Bildgröße unter 1200 Pixel (kein Zoom) |
| ATTR-007 | Vage Aussagen in Attributen |
| BESCH-002 | Nur Stichpunkte statt Fließtext in Beschreibung |
| SUCH-001 | Nicht alle Suchbegriff-Felder genutzt |
| BILD-030 | Fehlende zusätzliche Produktbilder |

---

> **Hinweis:** Dieses Regelwerk basiert auf dem Amazon Kategorie Style Guide Haustierbedarf (Januar 2017). Amazon kann diese Richtlinien jederzeit aktualisieren. Es wird empfohlen, die aktuelle Version des Style Guides in Seller Central regelmäßig zu überprüfen.

---

## 14. Praxis-Update 2025/2026 (ergänzend zum 2017-Guide)

> Diese Punkte ergänzen das historische Regelwerk für die operative Umsetzung heute. Bei Abweichungen gilt immer der jeweils aktuelle Seller-Central-Style-Guide der Zielkategorie.

### 14.1 Titel-Policy aktualisiert

| Regel-ID | Regel | Pflicht | Prüfbar | Quelle / Hinweis |
|----------|-------|---------|---------|------------------|
| TITEL-100 | Standardmäßig max. 200 Zeichen (inkl. Leerzeichen), sofern die Kategorie keinen strengeren Wert vorgibt. | Ja | Ja – Zeichenanzahl | Amazon hat die Titelanforderungen marktplatzweit verschärft; kategoriespezifische Limits bleiben möglich. |
| TITEL-101 | Sonderzeichen im Titel strikt minimieren; nur nutzen, wenn Teil der Marke/Produktspezifikation. | Ja | Ja – Zeichenprüfung | Amazon entfernt bzw. beanstandet zunehmend "dekorative" Titelzeichen. |
| TITEL-102 | Wortwiederholungen vermeiden (keine Keyword-Stopfung). | Ja | Ja – Token-Zählung | Doppelte Tokens senken Lesbarkeit und können Policy-Verstöße triggern. |

### 14.2 Bilder: Zoom und Conversion-Standard

| Regel-ID | Regel | Pflicht | Prüfbar | Quelle / Hinweis |
|----------|-------|---------|---------|------------------|
| BILD-100 | Längste Bildseite mindestens 1000 px für Zoom-Funktion. | Ja | Ja – Pixelprüfung | Unterhalb von 1000 px fehlt Zoom (negativer Conversion-Effekt). |
| BILD-101 | Zielwert 1600+ px längste Seite für bessere Zoom-Schärfe. | Empfohlen | Ja – Pixelprüfung | Praktischer Performance-Standard im Wettbewerb. |
| BILD-102 | Hauptbild bleibt weiterhin: weißer Hintergrund, Produktfüllung 85-100 %, keine Werbe-Overlays. | Ja | Bedingt | Unverändert kritischer Compliance-Blocker. |

### 14.3 Backend-Keywords (Search Terms)

| Regel-ID | Regel | Pflicht | Prüfbar | Quelle / Hinweis |
|----------|-------|---------|---------|------------------|
| SUCH-100 | Backend-Suchbegriffe byte-basiert pflegen (typisch 249 Bytes in EU/US; pro Marketplace prüfen). | Ja | Ja – Byte-Counter | Zeichenanzahl allein reicht nicht; Umlaute/Sonderzeichen können mehr Bytes belegen. |
| SUCH-101 | Nur Leerzeichen als Trenner nutzen (keine Kommas/Punkte nötig). | Ja | Ja – Formatprüfung | Amazon tokenisiert Leerzeichen zuverlässig; Satzzeichen verschwenden Platz. |
| SUCH-102 | Keine Duplikate aus Titel/Bullets/Attributen in Search Terms. | Ja | Ja – Dedup | Reduziert "verschwendete" Relevanzsignale. |

### 14.4 Variation- und Kataloghygiene

| Regel-ID | Regel | Pflicht | Prüfbar | Hinweis |
|----------|-------|---------|---------|---------|
| VAR-100 | Variation nur bei echten, kundenseitig vergleichbaren Varianten (z. B. Größe/Farbe/Geschmack). | Ja | Bedingt | Keine künstlichen Parent-Strukturen für unterschiedliche Produkte. |
| VAR-101 | Parent ohne Preis/Bestand; Childs vollständig mit Bild, Attributen, GTIN und korrektem Theme. | Ja | Ja | Verhindert Suppression und Fehldarstellungen. |
| VAR-102 | Child-Titel nur um Variantenmerkmal unterscheiden; Kernproduktidentität gleich halten. | Ja | Ja – Titelvergleich | Erhöht Konsistenz und reduziert Fragmentierung im Katalog. |

### 14.5 Operative "Insider"-Best-Practices für Sichtbarkeit

| Regel-ID | Regel | Priorität | Begründung |
|----------|-------|-----------|------------|
| OPS-001 | Titel/Bullets in den ersten 80-120 Zeichen auf Suchintention ausrichten (Produkttyp + Kernvorteil + Spezifikation). | Hoch | Mobile Snippets und Scan-Verhalten entscheiden über Klickrate. |
| OPS-002 | Einheitliche Attributsprache je Variation (keine wechselnden Begriffe für dieselbe Eigenschaft). | Hoch | Verbessert Indexierung und reduziert Variantensplit. |
| OPS-003 | Main Image + mindestens 5 Secondary Images (Anwendung, Detail, Größenbezug, Inhaltsumfang, Material). | Hoch | Erhöht Conversion und senkt Retourenquote. |
| OPS-004 | Suchbegriffe quartalsweise auf Basis realer Suchanfragen/Ads-Daten nachschärfen. | Mittel | Hält Relevanz gegenüber Saison- und Trendverschiebungen. |
| OPS-005 | Bei Policy-Änderungen zuerst Top-ASINs nach Umsatz priorisieren und Compliance-Rollout staged durchführen. | Hoch | Minimiert Ranking- und Umsatzrisiko bei Massenänderungen. |

### 14.6 Empfohlene Monitoring-Checks (automatisierbar)

1. **Suppression-Check täglich:** unterdrückte Angebote, fehlende Pflichtattribute, Bildverstöße.
2. **Titel-Compliance-Check wöchentlich:** Länge, verbotene Zeichen, Wiederholungen, Werbewörter.
3. **Media-Qualität monatlich:** Zoom-Fähigkeit, Variantenbilder, Bildanzahl pro Child.
4. **Keyword-Refit quartalsweise:** Search Terms gegen aktuelle Conversion-Queries und ACOS-Keywords prüfen.
5. **Variation-Audit monatlich:** Parent/Child-Integrität, Theme-Konsistenz, ASIN-Merge-Konflikte.

### 14.7 Referenzen (für laufende Aktualisierung)

- Amazon Seller Central: Product title requirements and guidelines  
  https://sellercentral.amazon.com/help/hub/reference/external/GYTR6SYGFA5E3EQC?locale=en-US
- Amazon Seller Central: Product image guide  
  https://sellercentral.amazon.com/gp/help/external/G1881
- Amazon Seller Central: Use search terms effectively  
  https://sellercentral.amazon.com/help/hub/reference/external/G23501?locale=en-US

