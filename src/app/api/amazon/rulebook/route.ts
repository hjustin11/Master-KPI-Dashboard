import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/shared/lib/supabase/server";

const FILE_NAME = "amazon_haustierbedarf_regelwerk.md";

async function firstExistingPath(candidates: string[]): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate);
      return candidate;
    } catch {
      continue;
    }
  }
  return null;
}

function buildCandidatePaths(): { existingCandidates: string[]; fallbackWritePath: string } {
  const envPath = process.env.AMAZON_RULEBOOK_PATH?.trim();
  const cwd = process.cwd();
  const localContentPath = path.join(cwd, "content", FILE_NAME);
  const nestedContentPath = path.join(cwd, "master-dashboard", "content", FILE_NAME);
  const existingCandidates = [
    envPath,
    localContentPath,
    nestedContentPath,
  ].filter((entry): entry is string => Boolean(entry));
  return {
    existingCandidates,
    fallbackWritePath: localContentPath,
  };
}

export async function GET() {
  const { existingCandidates } = buildCandidatePaths();
  const filePath = await firstExistingPath(existingCandidates);
  if (!filePath) {
    return NextResponse.json(
      {
        error:
          "Regelwerk-Datei nicht gefunden. Erwartet unter AMAZON_RULEBOOK_PATH, Downloads oder content/.",
      },
      { status: 404 }
    );
  }

  const content = await readFile(filePath, "utf8");
  return NextResponse.json({ content, path: filePath });
}

export async function PUT(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Nicht authentifiziert." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { content?: unknown } | null;
  const content = typeof body?.content === "string" ? body.content : null;
  if (content == null) {
    return NextResponse.json({ error: "Ungültiger Inhalt (content:string erwartet)." }, { status: 400 });
  }

  const { existingCandidates, fallbackWritePath } = buildCandidatePaths();
  const filePath = (await firstExistingPath(existingCandidates)) ?? fallbackWritePath;
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content, "utf8");
  return NextResponse.json({ ok: true, path: filePath });
}

