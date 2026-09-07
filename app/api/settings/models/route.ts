import { NextResponse } from "next/server";
import { getConfig, saveConfig } from "@/lib/config-store";

export async function GET() {
  const config = await getConfig();
  return NextResponse.json(config);
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const saved = await saveConfig(body);
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save model settings." },
      { status: 500 },
    );
  }
}
