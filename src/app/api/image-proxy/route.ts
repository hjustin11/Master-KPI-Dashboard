import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const url = searchParams.get("url") ?? "";
  const filename = searchParams.get("filename") ?? "bild.jpg";

  if (!url || !url.startsWith("https://")) {
    return NextResponse.json({ error: "Ungültige URL." }, { status: 400 });
  }

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json({ error: `Bild konnte nicht geladen werden (${res.status}).` }, { status: 502 });
    }

    const blob = await res.blob();
    const headers = new Headers();
    headers.set("Content-Type", blob.type || "application/octet-stream");
    headers.set("Content-Disposition", `attachment; filename="${filename}"`);
    headers.set("Cache-Control", "no-store");

    return new NextResponse(blob, { status: 200, headers });
  } catch {
    return NextResponse.json({ error: "Download fehlgeschlagen." }, { status: 500 });
  }
}
