import type { ForumStructuredResult } from "@/lib/types/forum";

interface WorkspaceResultProps {
  result: ForumStructuredResult;
}

function formatDate(value?: string): string {
  if (!value) {
    return "Not set";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString();
}

export function WorkspaceResult({ result }: WorkspaceResultProps) {
  const ids = result.conversation_output;

  return (
    <div className="workspace-grid">
      <section className="workspace-block">
        <div className="subtle-label">References</div>
        <div className="id-row">
          <span>{ids.conversationId}</span>
          <span>{ids.messageId}</span>
          <span>{ids.replyId}</span>
        </div>
      </section>

      <section className="workspace-block">
        <h3>What happened?</h3>
        <p>{result.summary}</p>
      </section>

      <section className="workspace-block">
        <h3>Who is involved?</h3>
        <ul>
          {result.entities.map((entity, index) => (
            <li key={`${entity.name}-${index}`}>
              <strong>{entity.name}</strong> ({entity.type})
              {entity.role ? ` - ${entity.role}` : ""}
            </li>
          ))}
        </ul>
      </section>

      <section className="workspace-block">
        <h3>What opportunity exists?</h3>
        <p>{result.knowledge.opportunity}</p>
      </section>

      <section className="workspace-block">
        <h3>Important facts (user-stated)</h3>
        <ul>
          {result.facts.map((fact) => (
            <li key={fact.factId}>
              {fact.statement} <span className="meta">({Math.round(fact.confidence * 100)}% confidence)</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="workspace-block">
        <h3>AI assumptions / signals</h3>
        <ul>
          {result.reasoning.assumptions.map((assumption, index) => (
            <li key={`assumption-${index}`}>{assumption}</li>
          ))}
          {result.knowledge.signals.map((signal, index) => (
            <li key={`signal-${index}`}>{signal}</li>
          ))}
        </ul>
      </section>

      <section className="workspace-block">
        <h3>What should happen next?</h3>
        <ul>
          {result.actions.map((action) => (
            <li key={action.actionId}>
              <strong>{action.title}</strong> - {action.description}
              <span className="meta"> (Status: {action.status}; {action.requiresApproval ? "pending approval" : "ready to execute"})</span>
              {action.dueDate ? <span className="meta"> (Due: {formatDate(action.dueDate)})</span> : null}
            </li>
          ))}
        </ul>
      </section>

      <section className="workspace-block">
        <h3>Does anything require approval?</h3>
        <p>{result.approval_required ? "Yes - pending approval" : "No approval required"}</p>
      </section>

      <section className="workspace-block">
        <h3>What will FORUM reply?</h3>
        <p>{result.reply.text}</p>
      </section>
    </div>
  );
}
