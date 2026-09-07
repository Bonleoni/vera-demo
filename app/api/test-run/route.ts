import { NextResponse } from "next/server";

import { findScenarioById, getDefaultScenario } from "@/lib/testing/scenario-library";
import { runTestScenario } from "@/lib/testing/test-runner";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      scenarioId?: string;
      mode?: "MOCK" | "LIVE";
      maxMessages?: number;
      maxSessions?: number;
    };

    const scenario = typeof body.scenarioId === "string"
      ? findScenarioById(body.scenarioId) ?? getDefaultScenario()
      : getDefaultScenario();

    const maxMessages = Number.isFinite(body.maxMessages)
      ? Math.min(Math.max(Number(body.maxMessages), 1), 50)
      : scenario.maxMessages;

    const maxSessions = Number.isFinite(body.maxSessions)
      ? Math.min(Math.max(Number(body.maxSessions), 1), 10)
      : scenario.maxSessions;

    const mode = body.mode === "LIVE" ? "LIVE" : "MOCK";

    const run = await runTestScenario({
      scenario,
      mode,
      maxMessages,
      maxSessions,
    });

    return NextResponse.json(run, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Simulation failed.";
    return NextResponse.json(
      {
        error: {
          message,
        },
      },
      { status: 500 },
    );
  }
}
