import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({ source: "zooplus", status: "ok" });
}
