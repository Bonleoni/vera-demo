import type { ProcessingState } from "@/lib/types/forum";

export interface PipelineStage {
  key: "INPUT" | "AI PROCESSING" | "JSON" | "WORKSPACE";
  label: string;
  status: ProcessingState;
}

const statusClassMap: Record<ProcessingState, string> = {
  waiting: "status waiting",
  processing: "status processing",
  completed: "status completed",
  error: "status error",
};

export function PipelineStatus({ stages }: { stages: PipelineStage[] }) {
  return (
    <div className="panel">
      <h2>Processing Pipeline</h2>
      <div className="pipeline-row" aria-label="FORUM pipeline">
        {stages.map((stage, index) => (
          <div key={stage.key} className="pipeline-node-wrap">
            <div className="pipeline-node">
              <div className="pipeline-title">{stage.label}</div>
              <span className={statusClassMap[stage.status]}>{stage.status}</span>
            </div>
            {index < stages.length - 1 ? <span className="pipeline-arrow">→</span> : null}
          </div>
        ))}
      </div>
    </div>
  );
}
