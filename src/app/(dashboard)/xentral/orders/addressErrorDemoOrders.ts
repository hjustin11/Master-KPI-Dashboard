import {
  ADDRESS_ISSUE_HN,
  ADDRESS_ISSUE_NAME,
  ADDRESS_ISSUE_PLZ,
} from "@/shared/lib/shippingAddressValidation";
import {
  emptyPrimaryAddressFields,
  type XentralPrimaryAddressFields,
} from "@/shared/lib/xentralPrimaryAddressFields";

/** Entfernen / ersetzen beim Umschalten der Demo oder neuem Tag. */
export const ADDRESS_ERROR_DEMO_ID_PREFIX = "xentral_af_demo_";

function addr(p: Partial<XentralPrimaryAddressFields>): XentralPrimaryAddressFields {
  return { ...emptyPrimaryAddressFields(), ...p };
}

/**
 * Fiktive Test-Bestellungen (Marktplatz TEST-SHOP), Datum nur yyyy-mm-dd.
 * Nur aktiv, wenn NEXT_PUBLIC_XENTRAL_ADDRESS_DEMO_ORDERS=true.
 */
export function buildAddressErrorDemoOrders(ymd: string) {
  const orderDate = ymd;
  const mp = "TEST-SHOP";

  return [
    {
      id: `${ADDRESS_ERROR_DEMO_ID_PREFIX}01`,
      documentNumber: "123-814",
      orderDate,
      customer: "Leonie Brandt",
      marketplace: mp,
      total: 42.99,
      currency: "EUR",
      addressValidation: "invalid" as const,
      addressValidationIssues: [ADDRESS_ISSUE_PLZ],
      addressEdited: false,
      addressPrimaryFields: addr({
        name: "Leonie Brandt",
        street: "Unter den Linden 12",
        zip: "1011",
        city: "Berlin",
        country: "DE",
      }),
      internetNumber: "TEST-4810",
    },
    {
      id: `${ADDRESS_ERROR_DEMO_ID_PREFIX}02`,
      documentNumber: "123-825",
      orderDate,
      customer: "Jonas Ehrlich",
      marketplace: mp,
      total: 19.5,
      currency: "EUR",
      addressValidation: "invalid" as const,
      addressValidationIssues: [ADDRESS_ISSUE_HN],
      addressEdited: false,
      addressPrimaryFields: addr({
        name: "Jonas Ehrlich",
        street: "Gendarmenmarkt",
        zip: "10117",
        city: "Berlin",
        country: "DE",
      }),
      internetNumber: "TEST-5921",
    },
    {
      id: `${ADDRESS_ERROR_DEMO_ID_PREFIX}03`,
      documentNumber: "123-836",
      orderDate,
      customer: "Mira Hoffmann",
      marketplace: mp,
      total: 128,
      currency: "EUR",
      addressValidation: "invalid" as const,
      addressValidationIssues: [ADDRESS_ISSUE_PLZ, ADDRESS_ISSUE_HN],
      addressEdited: false,
      addressPrimaryFields: addr({
        name: "Mira Hoffmann",
        street: "Hackescher Markt",
        zip: "99",
        city: "Berlin",
        country: "DE",
      }),
      internetNumber: "TEST-6032",
    },
    {
      id: `${ADDRESS_ERROR_DEMO_ID_PREFIX}04`,
      documentNumber: "123-847",
      orderDate,
      customer: "Felix Krämer",
      marketplace: mp,
      total: 67.2,
      currency: "EUR",
      addressValidation: "invalid" as const,
      addressValidationIssues: [ADDRESS_ISSUE_PLZ],
      addressEdited: false,
      addressPrimaryFields: addr({
        name: "Felix Krämer",
        street: "Friedrichstraße 20",
        zip: "",
        city: "Berlin",
        country: "DE",
      }),
      internetNumber: "TEST-7143",
    },
    {
      id: `${ADDRESS_ERROR_DEMO_ID_PREFIX}05`,
      documentNumber: "123-858",
      orderDate,
      customer: "Nora Schäfer",
      marketplace: mp,
      total: 33,
      currency: "EUR",
      addressValidation: "invalid" as const,
      addressValidationIssues: [ADDRESS_ISSUE_HN],
      addressEdited: false,
      addressPrimaryFields: addr({
        name: "Nora Schäfer",
        street: "Bebelplatz",
        zip: "10117",
        city: "Berlin",
        country: "DE",
      }),
      internetNumber: "TEST-8254",
    },
    {
      id: `${ADDRESS_ERROR_DEMO_ID_PREFIX}06`,
      documentNumber: "123-869",
      orderDate,
      customer: "—",
      marketplace: mp,
      total: 55,
      currency: "EUR",
      addressValidation: "invalid" as const,
      addressValidationIssues: [ADDRESS_ISSUE_NAME],
      addressEdited: false,
      addressPrimaryFields: addr({
        name: "",
        department: "Clara Beispiel (Lagerausgang)",
        street: "Alexanderplatz 5",
        zip: "10178",
        city: "Berlin",
        country: "DE",
      }),
      internetNumber: "TEST-9365",
    },
  ];
}
