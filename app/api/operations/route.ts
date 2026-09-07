import { NextResponse } from "next/server";
import { getConversation, getConversations, getOperationKpis } from "@/lib/conversation-store";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const view = searchParams.get("view") ?? "list";

  if (view === "detail") {
    const id = searchParams.get("id") ?? "";
    if (!id) {
      return NextResponse.json({ error: "id is required for detail view." }, { status: 400 });
    }

    const detail = await getConversation(id);
    if (!detail) {
      return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
    }

    return NextResponse.json({ detail });
  }

  const [conversations, kpis] = await Promise.all([
    getConversations(),
    getOperationKpis(),
  ]);

  const operationKpis = {
    todayMessages: kpis.todayMessages,
    activeConversations: kpis.activeConversations,
    avgResponseSec: kpis.avgResponseSec,
    totalConversations: kpis.totalConversations,
    activeUserRate: kpis.activeUserRate,
    avgDepth: kpis.avgDepth,
  };

  return NextResponse.json({
    view: "list",
    kpis: operationKpis,
    conversations,
  });
}
