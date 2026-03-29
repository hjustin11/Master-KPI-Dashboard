/** Client state + API payload fields for SP-API „nicht konfiguriert“ responses. */
export type AmazonSpApiClientError = {
  message: string;
  missingKeys?: string[];
  hint?: string;
};
