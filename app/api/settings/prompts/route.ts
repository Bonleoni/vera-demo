import { NextResponse } from "next/server";
import { getDefaultPrompts, getPrompts, savePrompts } from "@/lib/config-store";

export async function GET() {
  const prompts = await getPrompts();
  return NextResponse.json({
    prompts,
    defaults: getDefaultPrompts(),
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const saved = await savePrompts(body);
    return NextResponse.json(saved);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to save prompt settings." },
      { status: 500 },
    );
  }
}
