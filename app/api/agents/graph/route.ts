import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";

type Agent = {
  id: string;
  name: string;
  purpose: string;
};

type Edge = {
  source: string;
  target: string;
  label?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const persona = searchParams.get("persona") ?? "";

  try {
    const system = `You are designing a small multi-agent team (5 agents) for a task. Return a strict JSON object with two arrays: agents (5 objects with id, name, purpose) and edges (connections between agents by id with optional label). The graph should reflect useful collaboration for the user query and the provided persona, if any. Use short lowercase ids with dashes. Avoid extra commentary.`;

    const { text } = await generateText({
      model: google("models/gemini-2.0-flash-exp"),
      prompt: `${system}\n\nPersona: ${persona || "(none)"}\nUser query: ${q || "general orchestration"}\n\nReturn JSON only.`,
    });

    // Best-effort parse; fall back to a sane default
    let parsed: { agents: Agent[]; edges: Edge[] } | null = null;
    try {
      // Some models wrap JSON in markdown; strip fences if present
      const cleaned = text.trim().replace(/^```json\n?|```$/g, "");
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }

    if (!parsed || !Array.isArray(parsed.agents) || parsed.agents.length !== 5) {
      parsed = defaultGraph(q);
    }

    return NextResponse.json(parsed, { status: 200 });
  } catch {
    return NextResponse.json(defaultGraph(q), { status: 200 });
  }
}

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const body = await request.json().catch(() => ({}));
  const persona: string = body?.persona ?? "";
  const providedAgents: Agent[] | undefined = body?.agents;

  try {
    if (providedAgents && Array.isArray(providedAgents) && providedAgents.length > 0) {
      const system = `You will be given a FIXED team of agents. Do not change their ids or names. Create useful edges (connections) between these agents to accomplish the user's query, considering the persona. Return STRICT JSON with { agents: [exactly the same agents provided, same order], edges: [{source,target,label?}, ...] }. No commentary.`;

      const agentList = providedAgents.map((a) => `- ${a.id}: ${a.name} — ${a.purpose ?? ""}`).join("\n");
      const { text } = await generateText({
        model: google("models/gemini-2.0-flash-exp"),
        prompt: `${system}\n\nPersona: ${persona || "(none)"}\nUser query: ${q || "general orchestration"}\n\nAgents:\n${agentList}\n\nReturn JSON only.`,
      });

      let parsed: { agents: Agent[]; edges: Edge[] } | null = null;
      try {
        const cleaned = text.trim().replace(/^```json\n?|```$/g, "");
        parsed = JSON.parse(cleaned);
      } catch {
        parsed = null;
      }

      if (!parsed || !Array.isArray(parsed.edges)) {
        return NextResponse.json({ agents: providedAgents, edges: fallbackEdges(providedAgents) }, { status: 200 });
      }
      // Ensure agents stay identical
      return NextResponse.json({ agents: providedAgents, edges: parsed.edges }, { status: 200 });
    }

    // No provided agents: generate a new 5-agent graph (same as GET but accepting persona in body)
    const system = `You are designing a small multi-agent team (5 agents) for a task. Return a strict JSON object with two arrays: agents (5 objects with id, name, purpose) and edges (connections between agents by id with optional label). The graph should reflect useful collaboration for the user query and the provided persona. Use short lowercase ids with dashes. Avoid extra commentary.`;

    const { text } = await generateText({
      model: google("models/gemini-2.0-flash-exp"),
      prompt: `${system}\n\nPersona: ${persona || "(none)"}\nUser query: ${q || "general orchestration"}\n\nReturn JSON only.`,
    });

    let parsed: { agents: Agent[]; edges: Edge[] } | null = null;
    try {
      const cleaned = text.trim().replace(/^```json\n?|```$/g, "");
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = null;
    }
    if (!parsed || !Array.isArray(parsed.agents) || parsed.agents.length !== 5) {
      parsed = defaultGraph(q);
    }
    return NextResponse.json(parsed, { status: 200 });
  } catch {
    if (providedAgents && Array.isArray(providedAgents) && providedAgents.length > 0) {
      return NextResponse.json({ agents: providedAgents, edges: fallbackEdges(providedAgents) }, { status: 200 });
    }
    return NextResponse.json(defaultGraph(q), { status: 200 });
  }
}

function defaultGraph(q: string): { agents: Agent[]; edges: Edge[] } {
  const agents: Agent[] = [
    { id: "intent-parser", name: "Intent Parser", purpose: "understand the request and extract goals" },
    { id: "planner", name: "Planner", purpose: "decompose into steps and assign agents" },
    { id: "researcher", name: "Researcher", purpose: "gather data or options" },
    { id: "executor", name: "Executor", purpose: "perform API calls or actions" },
    { id: "verifier", name: "Verifier", purpose: "check results and summarize" },
  ];
  const edges: Edge[] = [
    { source: "intent-parser", target: "planner", label: "goals" },
    { source: "planner", target: "researcher", label: "requirements" },
    { source: "planner", target: "executor", label: "tasks" },
    { source: "researcher", target: "planner", label: "findings" },
    { source: "executor", target: "verifier", label: "results" },
    { source: "verifier", target: "planner", label: "feedback" },
  ];
  return { agents, edges };
}

function fallbackEdges(agents: Agent[]): Edge[] {
  if (agents.length <= 1) return [];
  const es: Edge[] = [];
  for (let i = 0; i < agents.length; i++) {
    const a = agents[i];
    const b = agents[(i + 1) % agents.length];
    es.push({ source: a.id, target: b.id });
  }
  return es;
}


