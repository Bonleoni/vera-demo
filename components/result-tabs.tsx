"use client";

import { useMemo, useState } from "react";

import { WorkspaceResult } from "@/components/workspace-result";
import type { ForumStructuredResult } from "@/lib/types/forum";

type TabKey = "workspace" | "json" | "logs";

const TAB_LIST: Array<{ key: TabKey; label: string }> = [
  { key: "workspace", label: "Workspace" },
  { key: "json", label: "JSON" },
  { key: "logs", label: "Logs" },
];

export function ResultTabs({ result }: { result: ForumStructuredResult }) {
  const [activeTab, setActiveTab] = useState<TabKey>("workspace");
  const prettyJson = useMemo(() => JSON.stringify(result, null, 2), [result]);

  const onCopyJson = async () => {
    await navigator.clipboard.writeText(prettyJson);
  };

  return (
    <div className="panel">
      <h2>Result</h2>
      <div className="tab-row" role="tablist" aria-label="Result views">
        {TAB_LIST.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={activeTab === tab.key ? "tab active" : "tab"}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "workspace" ? <WorkspaceResult result={result} /> : null}

      {activeTab === "json" ? (
        <div className="json-area">
          <button type="button" className="secondary-button" onClick={onCopyJson}>
            Copy JSON
          </button>
          <pre>{prettyJson}</pre>
        </div>
      ) : null}

      {activeTab === "logs" ? (
        <div className="logs-area">
          <ul>
            {result.logs.map((log, index) => (
              <li key={`${log.timestamp}-${index}`}>
                <span className="meta">{new Date(log.timestamp).toLocaleTimeString()}</span>
                <strong>{log.stage}</strong>
                <span className={log.status === "error" ? "status error" : "status completed"}>{log.status}</span>
                <span>{log.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
