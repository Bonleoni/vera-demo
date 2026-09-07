import {
  type AIProvider,
  type AIProviderInput,
  type AIProviderOutput,
} from "./provider";

function detectDate(message: string): string | undefined {
  const monthDayPattern =
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+([0-3]?\d)/i;
  const match = message.match(monthDayPattern);
  if (!match) {
    return undefined;
  }

  const monthName = match[1].toLowerCase();
  const day = Number(match[2]);
  const monthMap: Record<string, number> = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  const month = monthMap[monthName];
  if (!month || day < 1 || day > 31) {
    return undefined;
  }

  const year = new Date().getUTCFullYear();
  const isoMonth = String(month).padStart(2, "0");
  const isoDay = String(day).padStart(2, "0");
  return `${year}-${isoMonth}-${isoDay}`;
}

function extractOrganization(message: string): string | undefined {
  const match = message.match(/^\s*([A-Z][A-Za-z0-9&\- ]+)\s+(invited|requested|asked)/i);
  return match?.[1]?.trim();
}

function normalizeSummary(message: string): string {
  const compact = message.trim().replace(/\s+/g, " ");
  return compact.length <= 180 ? compact : `${compact.slice(0, 177)}...`;
}

function extractMemorySignals(memoryContext?: string): string[] {
  if (!memoryContext) {
    return [];
  }

  const signals: string[] = [];
  const lines = memoryContext.split(/\n+/);

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.startsWith("Previous user-stated facts:")) {
      continue;
    }

    if (trimmed.startsWith("Previously stated goals:")) {
      continue;
    }

    if (trimmed.startsWith("Previous behavioral patterns to consider cautiously:")) {
      continue;
    }

    if (trimmed.startsWith("Recent context summary:")) {
      signals.push(trimmed.replace("Recent context summary:", "Recent context: "));
      continue;
    }

    if (trimmed.startsWith("- ")) {
      signals.push(trimmed.replace(/^\-\s*/, ""));
    }
  }

  return signals.slice(0, 4);
}

export class MockAIProvider implements AIProvider {
  readonly name = "mock-local-provider";

  async process(input: AIProviderInput): Promise<AIProviderOutput> {
    const message = input.message.trim();
    const lowered = message.toLowerCase();

    const detectedDate = detectDate(message);
    const organization = extractOrganization(message);

    const hasTender = lowered.includes("tender");
    const hasReminder = lowered.includes("remind");
    const hasDeliveryAdvantage = lowered.includes("delivery advantage");

    const memorySignals = input.businessModel === "weight_management" ? extractMemorySignals(input.memoryContext) : [];

    const events = [
      {
        type: "opportunity_signal",
        title: hasTender ? "Tender invitation detected" : "Business update received",
        details: message,
        occurredAt: input.receivedAt,
      },
    ];

    const entities: AIProviderOutput["entities"] = [];
    if (organization) {
      entities.push({ type: "organization", name: organization, role: "counterparty" });
    }
    entities.push({ type: "source", name: "User Message", role: "input" });

    const facts: AIProviderOutput["facts"] = [];
    if (message.length > 0) {
      facts.push({ statement: "A business message was received for processing.", confidence: 0.99 });
    }
    if (hasTender) {
      facts.push({ statement: "A tender opportunity is referenced in the message.", confidence: 0.92 });
    }
    if (hasDeliveryAdvantage) {
      facts.push({ statement: "A 6-month delivery advantage is claimed.", confidence: 0.9 });
    }
    if (detectedDate) {
      facts.push({ statement: `A reminder date was detected: ${detectedDate}.`, confidence: 0.88 });
    }

    const actions: AIProviderOutput["actions"] = [];
    if (hasTender) {
      actions.push({
        type: "create_opportunity",
        title: "Create tender opportunity",
        description: "Register tender opportunity with estimated value and competitive edge.",
        requiresApproval: false,
      });
      actions.push({
        type: "prepare_documents",
        title: "Prepare tender documents",
        description: "Compile and draft required tender documentation.",
        requiresApproval: true,
      });
    }

    if (hasReminder) {
      actions.push({
        type: "create_reminder",
        title: "Create follow-up reminder",
        description: "Set a reminder for user follow-up.",
        dueDate: detectedDate,
        requiresApproval: false,
      });
    }

    if (actions.length === 0) {
      actions.push({
        type: "review_message",
        title: "Review and classify message",
        description: "No explicit action was detected; classify intent manually.",
        requiresApproval: false,
      });
    }

    const isWeightManagement = input.businessModel === "weight_management";
    const relevantMemorySummary = memorySignals.length > 0 ? memorySignals.join("; ") : "";

    const replyText = isWeightManagement
      ? (
          relevantMemorySummary
            ? `Earlier in our conversations, you mentioned patterns that fit this: ${relevantMemorySummary}. I want to understand what happened in the latest situation and keep the focus on the next step.`
            : "I’m keeping this focused on the current pattern and the next small step you want to improve."
        )
      : hasTender
        ? "I have structured this as a tender opportunity, drafted proposed actions, and marked document preparation for approval before execution."
        : "I have structured your message into actionable intelligence and proposed next steps.";

    return {
      summary: isWeightManagement
        ? normalizeSummary(`${message}${relevantMemorySummary ? ` Context: ${relevantMemorySummary}` : ""}`)
        : normalizeSummary(message),
      understanding: {
        intent: isWeightManagement
          ? "Understand recurring eating pattern and support the user toward a next step"
          : hasTender ? "Evaluate and progress tender opportunity" : "Understand business message",
        context: isWeightManagement
          ? (relevantMemorySummary ? `Relevant prior context: ${relevantMemorySummary}.` : "Weight management support context.")
          : hasTender
            ? "Potential commercial tender process with timeline-sensitive tasks."
            : "General business coordination context.",
        urgency: isWeightManagement ? "medium" : hasReminder || hasTender ? "high" : "medium",
      },
      events,
      entities,
      facts,
      knowledge: {
        opportunity: isWeightManagement
          ? (relevantMemorySummary ? `Relevant context identified: ${relevantMemorySummary}.` : "No explicit opportunity extracted.")
          : hasTender
            ? "Potential high-value rooftop solar tender opportunity."
            : "No explicit opportunity extracted.",
        constraints: isWeightManagement
          ? (relevantMemorySummary ? ["Personalization is contextual and should not be treated as a confirmed medical fact."] : [])
          : detectedDate ? [`Reminder target date: ${detectedDate}`] : [],
        signals: isWeightManagement
          ? (relevantMemorySummary ? [relevantMemorySummary] : [])
          : hasDeliveryAdvantage ? ["Differentiator: 6-month delivery advantage"] : [],
      },
      reasoning: {
        summary: isWeightManagement
          ? "The latest message was interpreted in light of prior user context without treating inferred patterns as confirmed facts."
          : "Message was interpreted into event, entity, and action candidates.",
        steps: isWeightManagement
          ? [
              "Reviewed current message for the latest pattern.",
              "Matched relevant prior memory only when context was relevant.",
              "Kept prior signals as contextual guidance rather than fact.",
            ]
          : [
              "Detected business intent from message semantics.",
              "Extracted entities and candidate facts.",
              "Mapped findings into non-executing proposed actions.",
            ],
        assumptions: isWeightManagement
          ? [
              "The user may be describing a recurring pattern that is relevant to the current situation.",
              "The prior memory should be used cautiously and only as context.",
            ]
          : [
              "User expects planning support instead of immediate external execution.",
              "Detected due date uses the current year unless specified.",
            ],
      },
      prioritization: {
        level: isWeightManagement ? "medium" : hasTender ? "high" : "medium",
        rationale: isWeightManagement
          ? "The response should stay focused on the current context while acknowledging relevant historical patterns without over-asserting certainty."
          : hasTender
            ? "Tender opportunities are time-sensitive and potentially high value."
            : "Message needs review but has no explicit deadline-sensitive trigger.",
        nextFocus: isWeightManagement ? "Keep the focus on the current trigger and next small action" : hasTender ? "Opportunity qualification and document preparation" : "Intent clarification",
      },
      actions: isWeightManagement
        ? [
            {
              type: "reflect_and_ask",
              title: "Reflect and clarify next trigger",
              description: "Use prior context to gently guide the next conversation step without turning it into a questionnaire.",
              requiresApproval: false,
            },
          ]
        : actions,
      approval_required: isWeightManagement ? false : actions.some((item) => item.requiresApproval),
      replyText,
    };
  }
}
