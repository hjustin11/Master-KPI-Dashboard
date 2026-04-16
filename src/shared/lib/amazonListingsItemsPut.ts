import crypto from "node:crypto";
import {
  getAmazonProductsLwaToken,
  loadAmazonSpApiProductsConfig,
  resolveEffectiveAmazonSellerId,
  type AmazonSpApiProductsConfig,
} from "@/shared/lib/amazonProductsSpApiCatalog";

const SANDBOX_ENDPOINT = "sandbox.sellingpartnerapi-eu.amazon.com";
const SANDBOX_PREFIX = "sandbox.";

function env(name: string) {
  return (process.env[name] ?? "").trim();
}

function isSandboxEnabled() {
  const v = env("AMAZON_SP_API_SANDBOX").toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

function normalizeHost(value: string) {
  return value.replace(/^https?:\/\//i, "").replace(/\/+$/, "");
}

function asciiCompare(a: string, b: string) {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

function hmac(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}
function hmacHex(key: Buffer | string, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}
function hashHex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}
function percentEncodeRfc3986(value: string) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (ch) =>
    `%${ch.charCodeAt(0).toString(16).toUpperCase()}`
  );
}
function canonicalQuery(query: Record<string, string>) {
  const pairs = Object.entries(query).filter(([, v]) => v !== "");
  pairs.sort(([a], [b]) => asciiCompare(a, b));
  return pairs.map(([k, v]) => `${percentEncodeRfc3986(k)}=${percentEncodeRfc3986(v)}`).join("&");
}

const CONTENT_TYPE = "application/json; charset=utf-8";

async function spApiPut(args: {
  endpoint: string;
  region: string;
  path: string;
  query: Record<string, string>;
  body: string;
  awsAccessKeyId: string;
  awsSecretAccessKey: string;
  awsSessionToken?: string;
  lwaAccessToken: string;
}) {
  const method = "PUT";
  const service = "execute-api";
  const host = args.endpoint;
  const canonicalUri = args.path;
  const queryString = canonicalQuery(args.query);
  const payloadHash = hashHex(args.body);
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const canonicalHeadersList: Array<[string, string]> = [
    ["content-type", CONTENT_TYPE],
    ["host", host],
    ["x-amz-access-token", args.lwaAccessToken],
    ["x-amz-date", amzDate],
  ];
  if (args.awsSessionToken) canonicalHeadersList.push(["x-amz-security-token", args.awsSessionToken]);
  canonicalHeadersList.sort(([a], [b]) => asciiCompare(a, b));
  const canonicalHeaders = canonicalHeadersList.map(([k, v]) => `${k}:${v.trim()}\n`).join("");
  const signedHeaders = canonicalHeadersList.map(([k]) => k).join(";");
  const canonicalRequest = [method, canonicalUri, queryString, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const credentialScope = `${dateStamp}/${args.region}/${service}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, credentialScope, hashHex(canonicalRequest)].join("\n");
  const kDate = hmac(`AWS4${args.awsSecretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, args.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${args.awsAccessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");
  const url = new URL(`https://${host}${canonicalUri}`);
  for (const [k, v] of Object.entries(args.query)) {
    if (v !== "") url.searchParams.set(k, v);
  }
  const headers: Record<string, string> = {
    host,
    "content-type": CONTENT_TYPE,
    "x-amz-date": amzDate,
    "x-amz-access-token": args.lwaAccessToken,
    Authorization: authorization,
    Accept: "application/json",
  };
  if (args.awsSessionToken) headers["x-amz-security-token"] = args.awsSessionToken;
  const res = await fetch(url.toString(), { method, headers, body: args.body, cache: "no-store" });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? (JSON.parse(text) as unknown) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

export type AmazonSubmissionIssue = {
  code?: string;
  message: string;
  severity: "ERROR" | "WARNING" | "INFO" | string;
  attributeNames?: string[];
};

export type AmazonSubmissionResult = {
  ok: boolean;
  status: string;
  submissionId: string | null;
  issues: AmazonSubmissionIssue[];
  httpStatus: number;
  endpointUsed: string;
  sandbox: boolean;
  rawText: string;
};

function extractIssues(json: unknown): AmazonSubmissionIssue[] {
  if (!json || typeof json !== "object") return [];
  const obj = json as Record<string, unknown>;
  const issues = Array.isArray(obj.issues) ? obj.issues : [];
  return issues.map((i) => {
    const r = (i ?? {}) as Record<string, unknown>;
    return {
      code: typeof r.code === "string" ? r.code : undefined,
      message: typeof r.message === "string" ? r.message : "",
      severity: typeof r.severity === "string" ? r.severity : "INFO",
      attributeNames: Array.isArray(r.attributeNames)
        ? (r.attributeNames as unknown[]).filter((x): x is string => typeof x === "string")
        : undefined,
    };
  });
}

function extractStatus(json: unknown): string {
  if (!json || typeof json !== "object") return "UNKNOWN";
  const o = json as Record<string, unknown>;
  return typeof o.status === "string" ? o.status : "UNKNOWN";
}
function extractSubmissionId(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const o = json as Record<string, unknown>;
  return typeof o.submissionId === "string" ? o.submissionId : null;
}
function extractApiError(json: unknown, status: number, text: string): string {
  if (json && typeof json === "object") {
    const errs = (json as Record<string, unknown>).errors;
    if (Array.isArray(errs) && errs.length > 0) {
      const first = errs[0] as Record<string, unknown>;
      const msg = String(first.message ?? first.code ?? "").trim();
      if (msg) return msg;
    }
  }
  const preview = text.replace(/\s+/g, " ").trim().slice(0, 240);
  return preview || `HTTP ${status}`;
}

export type SubmitAmazonListingArgs = {
  sku: string;
  marketplaceId?: string;
  body: {
    productType: string;
    requirements: "LISTING";
    attributes: Record<string, unknown>;
  };
};

export async function submitAmazonListingItem(
  args: SubmitAmazonListingArgs
): Promise<AmazonSubmissionResult> {
  const config: AmazonSpApiProductsConfig = await loadAmazonSpApiProductsConfig();

  if (
    !config.refreshToken ||
    !config.lwaClientId ||
    !config.lwaClientSecret ||
    !config.awsAccessKeyId ||
    !config.awsSecretAccessKey ||
    config.marketplaceIds.length === 0
  ) {
    throw new Error("Amazon SP-API nicht vollständig konfiguriert (LWA/AWS/Marketplace).");
  }

  const lwaAccessToken = await getAmazonProductsLwaToken(config);

  let sellerId = config.sellerId.trim();
  if (!sellerId) {
    sellerId = (await resolveEffectiveAmazonSellerId(config, lwaAccessToken)) ?? "";
  }
  if (!sellerId) throw new Error("Amazon Seller-ID fehlt (AMAZON_SP_API_SELLER_ID).");

  const marketplaceId = (args.marketplaceId || config.marketplaceIds[0] || "").trim();
  if (!marketplaceId) throw new Error("marketplaceId fehlt.");

  const sandbox = isSandboxEnabled();
  let endpoint = normalizeHost(config.endpoint);
  if (sandbox && !endpoint.startsWith(SANDBOX_PREFIX)) {
    endpoint = endpoint === "sellingpartnerapi-eu.amazon.com" ? SANDBOX_ENDPOINT : `${SANDBOX_PREFIX}${endpoint}`;
  }

  const skuTrim = args.sku.trim();
  if (!skuTrim) throw new Error("sku fehlt.");

  const path = `/listings/2021-08-01/items/${encodeURIComponent(sellerId)}/${encodeURIComponent(skuTrim)}`;
  const query = {
    marketplaceIds: marketplaceId,
    productType: args.body.productType,
    issueLocale: "de_DE",
  };

  const bodyStr = JSON.stringify(args.body);

  const result = await spApiPut({
    endpoint,
    region: config.region,
    path,
    query,
    body: bodyStr,
    awsAccessKeyId: config.awsAccessKeyId,
    awsSecretAccessKey: config.awsSecretAccessKey,
    awsSessionToken: config.awsSessionToken || env("AMAZON_AWS_SESSION_TOKEN") || undefined,
    lwaAccessToken,
  });

  const issues = extractIssues(result.json);

  if (!result.res.ok) {
    return {
      ok: false,
      status: "HTTP_ERROR",
      submissionId: null,
      issues:
        issues.length > 0
          ? issues
          : [{ severity: "ERROR", message: extractApiError(result.json, result.res.status, result.text) }],
      httpStatus: result.res.status,
      endpointUsed: endpoint,
      sandbox,
      rawText: result.text.slice(0, 4000),
    };
  }

  const status = extractStatus(result.json);
  const submissionId = extractSubmissionId(result.json);
  const hasErrorIssues = issues.some((i) => i.severity === "ERROR");

  return {
    ok: !hasErrorIssues,
    status,
    submissionId,
    issues,
    httpStatus: result.res.status,
    endpointUsed: endpoint,
    sandbox,
    rawText: result.text.slice(0, 4000),
  };
}
