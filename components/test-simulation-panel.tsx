"use client";

import { useMemo, useState } from "react";

import { buildAnalysisDataset } from "@/lib/testing/analysis-dataset";
import { getDefaultScenario, TEST_SCENARIOS } from "@/lib/testing/scenario-library";
import type { TestRun, TestScenario } from "@/lib/testing/test-types";

type ScenarioMatrixRow = {
  scenarioId: string;
  scenarioName: string;
  turns: number;
  insight: string;
  finalState: string;
  assertions: number;
  result: "NOT RUN" | "PASS" | "FAIL";
};

type ScenarioResultSummary = {
  status: string;
  turns: number;
  sessions: number;
  finalState: string;
  insightReached: boolean;
  assertionPass: number;
  assertionFail: number;
  sameSession: boolean;
  finalAssessment: string;
};

type CombinedDatasetTurn = {
  scenarioId: string;
  scenarioName: string;
  runId: string;
  turnNumber: number;
  sessionId: string;
  userMessage: string;
  forumReply: string;
  conversationState: string;
  replyStrategy: string;
  confidence: number;
  insight: string | null;
  sessionDecision: string;
  simulatedUser: {
    intent: string | null;
    disclosure: string | null;
    sessionSignal: string | null;
    reasonSummary: string | null;
  };
  assertions: Array<{ id: string; status: string; reason: string }>;
};

function summarizeScenarioResult(run: TestRun): ScenarioResultSummary {
  const sessionIds = Array.from(new Set(run.turns.map((turn) => turn.sessionId)));
  const assertionPass = run.assertions.filter((assertion) => assertion.status === "PASS").length;
  const assertionFail = run.assertions.filter((assertion) => assertion.status === "FAIL").length;
  const insightReached = run.turns.some((turn) => Boolean(turn.insight && turn.insight.trim().length > 0));
  const sameSession = run.turns.length > 0 && run.turns.every((turn) => turn.sessionId === run.turns[0].sessionId);

  return {
    status: run.status,
    turns: run.turns.length,
    sessions: sessionIds.length,
    finalState: run.turns.at(-1)?.conversationState ?? "n/a",
    insightReached,
    assertionPass,
    assertionFail,
    sameSession,
    finalAssessment: run.finalAssessment,
  };
}

function buildMatrixRows(results: Record<string, TestRun>): ScenarioMatrixRow[] {
  return TEST_SCENARIOS.map((scenario) => {
    const run = results[scenario.id];

    if (!run) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        turns: 0,
        insight: "-",
        finalState: "-",
        assertions: 0,
        result: "NOT RUN",
      };
    }

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      turns: run.turns.length,
      insight: run.turns.some((turn) => Boolean(turn.insight && turn.insight.trim().length > 0)) ? "YES" : "NO",
      finalState: run.turns.at(-1)?.conversationState ?? "n/a",
      assertions: run.assertions.length,
      result: run.finalAssessment === "PASS" ? "PASS" : "FAIL",
    };
  });
}

function buildCombinedDataset(results: Record<string, TestRun>): CombinedDatasetTurn[] {
  return Object.values(results).flatMap((run) =>
    buildAnalysisDataset(run).turns.map((turn) => ({
      scenarioId: run.scenarioId,
      scenarioName: run.scenarioName,
      runId: run.id,
      turnNumber: turn.turnNumber,
      sessionId: turn.sessionId,
      userMessage: turn.userMessage,
      forumReply: turn.forumReply,
      conversationState: turn.conversationState,
      replyStrategy: turn.replyStrategy,
      confidence: turn.confidence,
      insight: turn.insight,
      sessionDecision: turn.sessionAction,
      simulatedUser: {
        intent: turn.simulatedUserIntent,
        disclosure: turn.simulatedUserDisclosure,
        sessionSignal: turn.simulatedUserSessionSignal,
        reasonSummary: turn.simulatedUserReason,
      },
      assertions: turn.assertionResults,
    })),
  );
}

export function TestSimulationPanel() {
  const [scenarioId, setScenarioId] = useState<string>(getDefaultScenario().id);
  const [mode, setMode] = useState<"MOCK" | "LIVE">("MOCK");
  const [maxMessages, setMaxMessages] = useState<number>(8);
  const [maxSessions, setMaxSessions] = useState<number>(2);
  const [run, setRun] = useState<TestRun | null>(null);
  const [scenarioResults, setScenarioResults] = useState<Record<string, TestRun>>({});
  const [matrixRows, setMatrixRows] = useState<ScenarioMatrixRow[]>(() => buildMatrixRows({}));
  const [combinedDataset, setCombinedDataset] = useState<CombinedDatasetTurn[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedScenario = useMemo<TestScenario>(
    () => TEST_SCENARIOS.find((item) => item.id === scenarioId) ?? getDefaultScenario(),
    [scenarioId],
  );

  const handleScenarioChange = (nextScenarioId: string) => {
    const nextScenario = TEST_SCENARIOS.find((item) => item.id === nextScenarioId) ?? getDefaultScenario();
    setScenarioId(nextScenario.id);
    setMaxMessages(nextScenario.maxMessages);
    setMaxSessions(nextScenario.maxSessions);
  };

  const runTest = async () => {
    setError(null);
    setIsRunning(true);

    try {
      const response = await fetch("/api/test-run", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          scenarioId: selectedScenario.id,
          mode,
          maxMessages,
          maxSessions,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(payload?.error?.message ?? "Simulation failed.");
      }

      const nextRun = (await response.json()) as TestRun;
      const nextResults = { ...scenarioResults, [selectedScenario.id]: nextRun };
      setRun(nextRun);
      setScenarioResults(nextResults);
      setMatrixRows(buildMatrixRows(nextResults));
      setCombinedDataset(buildCombinedDataset(nextResults));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Simulation failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const runAllScenarios = async () => {
    setError(null);
    setIsRunning(true);

    try {
      const nextResults: Record<string, TestRun> = {};

      for (const scenario of TEST_SCENARIOS) {
        const response = await fetch("/api/test-run", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            scenarioId: scenario.id,
            mode,
            maxMessages,
            maxSessions,
          }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
          throw new Error(payload?.error?.message ?? `Simulation failed for ${scenario.name}.`);
        }

        const nextRun = (await response.json()) as TestRun;
        nextResults[scenario.id] = nextRun;
        setScenarioResults({ ...nextResults });
        setMatrixRows(buildMatrixRows(nextResults));
        setCombinedDataset(buildCombinedDataset(nextResults));
        setRun(nextRun);

        if (nextRun.finalAssessment !== "PASS") {
          break;
        }
      }

      setScenarioResults(nextResults);
      setMatrixRows(buildMatrixRows(nextResults));
      setCombinedDataset(buildCombinedDataset(nextResults));
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Run all scenarios failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const handleExportDatasetJson = () => {
    if (!run) {
      return;
    }

    const dataset = buildAnalysisDataset(run);
    const blob = new Blob([JSON.stringify(dataset, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${run.id}-dataset.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportDatasetMarkdown = () => {
    if (!run) {
      return;
    }

    const dataset = buildAnalysisDataset(run);
    const lines: string[] = [
      "# FORUM CONVERSATION ANALYSIS DATASET",
      "",
      `Scenario: ${dataset.run.scenarioName}`,
      `Status: ${dataset.run.status}`,
      `Final State: ${dataset.summary.finalState ?? "n/a"}`,
      "",
    ];

    dataset.turns.forEach((turn, index) => {
      lines.push(`## Turn ${index + 1}`);
      lines.push(`- State: ${turn.conversationState}`);
      lines.push(`- User: ${turn.userMessage}`);
      lines.push(`- Forum: ${turn.forumReply}`);
      lines.push(`- Insight: ${turn.insight ?? "n/a"}`);
      lines.push("");
    });

    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${run.id}-dataset.md`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleExportCompact = () => {
    if (!run) {
      return;
    }

    const dataset = buildAnalysisDataset(run);
    const lines = dataset.turns.map((turn) => `${turn.turnNumber}|${turn.conversationState}|${turn.sessionAction}|${turn.userMessage}`);
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${run.id}-compact.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const scenarioSummary = run ? summarizeScenarioResult(run) : null;
  const comparisonRows = TEST_SCENARIOS.map((scenario) => {
    const scenarioRun = scenarioResults[scenario.id];
    if (!scenarioRun) {
      return {
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        turnsToInsight: "-",
        insightReached: "NO",
        finalState: "-",
        assertionPassRate: "-",
        sameSession: "-",
        unsupportedClaim: "-",
        earlyIntervention: "-",
      };
    }

    const turnsToInsight = scenarioRun.turns.findIndex((turn) => Boolean(turn.insight && turn.insight.trim().length > 0));
    const passCount = scenarioRun.assertions.filter((assertion) => assertion.status === "PASS").length;
    const totalAssertions = Math.max(scenarioRun.assertions.length, 1);
    const sameSession = scenarioRun.turns.length > 0 && scenarioRun.turns.every((turn) => turn.sessionId === scenarioRun.turns[0].sessionId);
    const unsupportedClaim = scenarioRun.assertions.some((assertion) => assertion.id === "must_not_claim_unstated_fact" && assertion.status === "FAIL") ? "YES" : "NO";
    const earlyIntervention = scenarioRun.turns.some((turn) => turn.replyStrategy === "CLARIFY" || turn.replyStrategy === "VALIDATE_PATTERN") ? "YES" : "NO";

    return {
      scenarioId: scenario.id,
      scenarioName: scenario.name,
      turnsToInsight: turnsToInsight >= 0 ? String(turnsToInsight + 1) : "-",
      insightReached: scenarioRun.turns.some((turn) => Boolean(turn.insight && turn.insight.trim().length > 0)) ? "YES" : "NO",
      finalState: scenarioRun.turns.at(-1)?.conversationState ?? "n/a",
      assertionPassRate: `${Math.round((passCount / totalAssertions) * 100)}%`,
      sameSession: sameSession ? "YES" : "NO",
      unsupportedClaim,
      earlyIntervention,
    };
  });

  return (
    <section className="panel">
      <h2>FORUM — WEIGHT MANAGEMENT</h2>
      <h3>Scenario Studio V1</h3>

      <div className="wm-session-controls">
        <label className="wm-session-field">
          <span className="subtle-label">SCENARIO</span>
          <select value={scenarioId} onChange={(event) => handleScenarioChange(event.target.value)}>
            {TEST_SCENARIOS.map((scenario) => (
              <option key={scenario.id} value={scenario.id}>
                {scenario.name}
              </option>
            ))}
          </select>
        </label>

        <label className="wm-session-field">
          <span className="subtle-label">Mode</span>
          <select value={mode} onChange={(event) => setMode(event.target.value as "MOCK" | "LIVE")}>
            <option value="MOCK">MOCK</option>
            <option value="LIVE">LIVE</option>
          </select>
        </label>

        <label className="wm-session-field">
          <span className="subtle-label">Max Messages</span>
          <input
            type="number"
            min={1}
            max={50}
            value={maxMessages}
            onChange={(event) => setMaxMessages(Number(event.target.value) || 1)}
          />
        </label>

        <label className="wm-session-field">
          <span className="subtle-label">Max Sessions</span>
          <input
            type="number"
            min={1}
            max={10}
            value={maxSessions}
            onChange={(event) => setMaxSessions(Number(event.target.value) || 1)}
          />
        </label>
      </div>

      <div className="button-row">
        <button type="button" className="primary-button" onClick={runTest} disabled={isRunning}>
          {isRunning ? "Running..." : "RUN TEST"}
        </button>
        <button type="button" className="secondary-button" onClick={runAllScenarios} disabled={isRunning}>
          {isRunning ? "Running All..." : "RUN ALL SCENARIOS"}
        </button>
      </div>

      {error ? <p className="error-text">{error}</p> : null}

      <div style={{ marginTop: 16, padding: 12, border: "1px solid #2a2f36", borderRadius: 8 }}>
        <div className="subtle-label">SCENARIO DESCRIPTION</div>
        <div style={{ display: "grid", gap: 6 }}>
          <div><strong>USER PROFILE:</strong> {selectedScenario.userProfile}</div>
          <div><strong>OBJECTIVE:</strong> {selectedScenario.objective}</div>
          <div><strong>EXPECTED BEHAVIOR:</strong> {selectedScenario.expectedStates?.join(" → ") ?? "n/a"}</div>
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <div className="subtle-label">SCENARIO MATRIX</div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", padding: 6 }}>Scenario</th>
              <th style={{ textAlign: "left", padding: 6 }}>Turns</th>
              <th style={{ textAlign: "left", padding: 6 }}>Insight</th>
              <th style={{ textAlign: "left", padding: 6 }}>Final State</th>
              <th style={{ textAlign: "left", padding: 6 }}>Assertions</th>
              <th style={{ textAlign: "left", padding: 6 }}>Result</th>
            </tr>
          </thead>
          <tbody>
            {matrixRows.map((row) => (
              <tr key={row.scenarioId}>
                <td style={{ padding: 6 }}>{row.scenarioName}</td>
                <td style={{ padding: 6 }}>{row.turns}</td>
                <td style={{ padding: 6 }}>{row.insight}</td>
                <td style={{ padding: 6 }}>{row.finalState}</td>
                <td style={{ padding: 6 }}>{row.assertions}</td>
                <td style={{ padding: 6 }}>{row.result}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {scenarioSummary ? (
        <div className="wm-debug-panel" style={{ marginTop: 16 }}>
          <div className="subtle-label">SCENARIO RESULT</div>
          <div className="wm-debug-grid">
            <div className="wm-debug-row"><span className="wm-debug-label">Status:</span><strong>{scenarioSummary.status}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Turns:</span><strong>{scenarioSummary.turns}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Sessions:</span><strong>{scenarioSummary.sessions}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Final State:</span><strong>{scenarioSummary.finalState}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Insight Reached:</span><strong>{scenarioSummary.insightReached ? "YES" : "NO"}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Assertion Pass:</span><strong>{scenarioSummary.assertionPass}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Assertion Fail:</span><strong>{scenarioSummary.assertionFail}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Same Session:</span><strong>{scenarioSummary.sameSession ? "YES" : "NO"}</strong></div>
            <div className="wm-debug-row"><span className="wm-debug-label">Final Assessment:</span><strong>{scenarioSummary.finalAssessment}</strong></div>
          </div>

          <div className="button-row">
            <button type="button" className="secondary-button" onClick={handleExportDatasetJson}>EXPORT DATASET JSON</button>
            <button type="button" className="secondary-button" onClick={handleExportDatasetMarkdown}>EXPORT DATASET MARKDOWN</button>
            <button type="button" className="secondary-button" onClick={handleExportCompact}>EXPORT COMPACT</button>
          </div>

          {run?.turns.length ? (
            <div style={{ marginTop: 16, display: "grid", gap: 10 }}>
              {run.turns.slice(-3).map((turn) => (
                <div key={`${turn.sessionId}-${turn.turnNumber}`} className="workspace-block">
                  <h3>Turn {turn.turnNumber}</h3>
                  <p><strong>Session:</strong> {turn.sessionId}</p>
                  <p><strong>User:</strong> {turn.userMessage}</p>
                  <p><strong>Forum:</strong> {turn.forumReply}</p>
                  <p><strong>State:</strong> {turn.conversationState}</p>
                  <p><strong>Insight:</strong> {turn.insight ?? "n/a"}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {comparisonRows.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="subtle-label">SCENARIO COMPARISON</div>
          <table style={{ width: "100%", borderCollapse: "collapse", marginTop: 8 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left", padding: 6 }}>Scenario</th>
                <th style={{ textAlign: "left", padding: 6 }}>Turns to Insight</th>
                <th style={{ textAlign: "left", padding: 6 }}>Insight Reached</th>
                <th style={{ textAlign: "left", padding: 6 }}>Final State</th>
                <th style={{ textAlign: "left", padding: 6 }}>Assertion Pass Rate</th>
                <th style={{ textAlign: "left", padding: 6 }}>Same Session</th>
                <th style={{ textAlign: "left", padding: 6 }}>Unsupported Claim</th>
                <th style={{ textAlign: "left", padding: 6 }}>Early Intervention</th>
              </tr>
            </thead>
            <tbody>
              {comparisonRows.map((row) => (
                <tr key={row.scenarioId}>
                  <td style={{ padding: 6 }}>{row.scenarioName}</td>
                  <td style={{ padding: 6 }}>{row.turnsToInsight}</td>
                  <td style={{ padding: 6 }}>{row.insightReached}</td>
                  <td style={{ padding: 6 }}>{row.finalState}</td>
                  <td style={{ padding: 6 }}>{row.assertionPassRate}</td>
                  <td style={{ padding: 6 }}>{row.sameSession}</td>
                  <td style={{ padding: 6 }}>{row.unsupportedClaim}</td>
                  <td style={{ padding: 6 }}>{row.earlyIntervention}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {combinedDataset.length > 0 ? (
        <div style={{ marginTop: 16 }}>
          <div className="subtle-label">Combined Dataset</div>
          <pre style={{ whiteSpace: "pre-wrap", overflowX: "auto", padding: 12, background: "#101418", borderRadius: 8 }}>
            {JSON.stringify(combinedDataset, null, 2)}
          </pre>
        </div>
      ) : null}
    </section>
  );
}
