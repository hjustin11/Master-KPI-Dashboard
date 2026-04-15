import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";

/**
 * Einheitliche Request-Parser für Route-Handler.
 * Bei Schema-Fehlern wird ein strukturiertes 400 zurückgegeben — der Handler muss keine eigene
 * Fehlerbehandlung mehr schreiben.
 *
 * Nutzung:
 * ```ts
 * const schema = z.object({ email: z.string().email() });
 * const parsed = await parseRequestBody(request, schema);
 * if (!parsed.ok) return parsed.response;  // 400 bereits erstellt
 * const { email } = parsed.data;
 * ```
 */

export type ParseSuccess<T> = { ok: true; data: T };
export type ParseFailure = { ok: false; response: NextResponse };
export type ParseResult<T> = ParseSuccess<T> | ParseFailure;

function zodErrorToDetails(error: ZodError): Array<{ path: string; message: string }> {
  return error.issues.map((i) => ({
    path: i.path.join("."),
    message: i.message,
  }));
}

function validationFailureResponse(error: ZodError, errMessage = "Ungültige Eingabe."): NextResponse {
  return NextResponse.json(
    {
      error: errMessage,
      details: zodErrorToDetails(error),
    },
    { status: 400 }
  );
}

/** JSON-Body parsen + validieren. */
export async function parseRequestBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<ParseResult<T>> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Ungültiger JSON-Body." }, { status: 400 }),
    };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return { ok: false, response: validationFailureResponse(result.error) };
  }
  return { ok: true, data: result.data };
}

/** Query-Parameter aus einer URL parsen + validieren. Übergibt ein `Record<string, string>` an Zod. */
export function parseSearchParams<T>(url: URL | string, schema: ZodSchema<T>): ParseResult<T> {
  const parsedUrl = typeof url === "string" ? new URL(url) : url;
  const params: Record<string, string> = {};
  parsedUrl.searchParams.forEach((value, key) => {
    params[key] = value;
  });
  const result = schema.safeParse(params);
  if (!result.success) {
    return { ok: false, response: validationFailureResponse(result.error, "Ungültige Query-Parameter.") };
  }
  return { ok: true, data: result.data };
}

/** FormData parsen (für File-Uploads) — extrahiert nur Text-Felder; Files müssen separat abgefragt werden. */
export async function parseFormFields<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<ParseResult<T> & { form?: FormData }> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: "Ungültiges Formular." }, { status: 400 }),
    };
  }
  const fields: Record<string, string> = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === "string") fields[key] = value;
  }
  const result = schema.safeParse(fields);
  if (!result.success) {
    return { ok: false, response: validationFailureResponse(result.error) };
  }
  return { ok: true, data: result.data, form };
}
