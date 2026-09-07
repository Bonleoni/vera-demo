import { NextResponse } from "next/server";
import {
  getProactiveKpis,
  getProactiveLogs,
  getProactiveSettings,
  saveProactiveSettings,
  startProactiveScheduler,
} from "@/lib/proactive-engine";

startProactiveScheduler();

export async function GET() {
  const [kpis, settings, logs] = await Promise.all([
    getProactiveKpis(),
    getProactiveSettings(),
    getProactiveLogs(200),
  ]);

  return NextResponse.json({
    kpis,
    settings,
    logs,
  });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as {
      dailyCheckinEnabled?: boolean;
      dailyCheckinTime?: string;
    };

    const settings = await saveProactiveSettings(body);
    return NextResponse.json({ settings });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Proactive ayarlari kaydedilemedi." },
      { status: 500 },
    );
  }
}
