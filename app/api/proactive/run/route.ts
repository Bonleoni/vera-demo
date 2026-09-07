import { NextResponse } from "next/server";
import { runProactiveManualRound, startProactiveScheduler } from "@/lib/proactive-engine";

startProactiveScheduler();

export async function POST() {
  try {
    const result = await runProactiveManualRound();
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proaktif tur basarisiz." },
      { status: 500 },
    );
  }
}
