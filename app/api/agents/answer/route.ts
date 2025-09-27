import { NextResponse } from "next/server";
import { generateText } from "ai";
import { google } from "@ai-sdk/google";
import { getMongoDb, type DbAgent } from "@/lib/mongo";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const { persona, question }: { persona?: string; question?: string } = await request.json();
    const trace: string[] = [];
    const apiKeyMissing = !process.env.GOOGLE_GENERATIVE_AI_API_KEY;

    // Load agents from MongoDB at runtime
    let agents: Pick<DbAgent, "id" | "name" | "purpose" | "context">[] = [];
    try {
      const db = await getMongoDb();
      agents = await db
        .collection<DbAgent>("agents")
        .find({}, { projection: { _id: 0, id: 1, name: 1, purpose: 1, context: 1 } })
        .toArray();
    } catch {}

    // If no agents exist, short-circuit with guidance
    if (!agents.length) {
      const emptyMsg = "No agents found in the catalog. Add agents in /agents/new, then try again.";
      trace.push("Orchestrator: no agents available");
      return NextResponse.json({ answer: emptyMsg, trace }, { status: 200 });
    }

    const catalog = agents
      .map((a) => `- id: ${a.id}\n  name: ${a.name}\n  purpose: ${a.purpose || ""}\n  context: ${(a.context || "").slice(0, 400)}`)
      .join("\n\n");

    if (apiKeyMissing) {
      return NextResponse.json({ answer: "Model key missing. Set GOOGLE_GENERATIVE_AI_API_KEY in .env.local and restart the dev server.", trace }, { status: 200 });
    }

    trace.push("Orchestrator: analyzing request");

    // Preferred: ask the model to design a small multi-agent plan and return strict JSON
    const planPrompt = `You are the orchestrator. Break the user's request into 2-5 steps across specialist agents from the catalog.\n` +
      `Return STRICT JSON only: {"steps":[{"agentId":string,"note":string}],"answer":string}.\n` +
      `- steps: ordered execution plan; agentId must be one of the catalog ids.\n` +
      `- note: short present-tense action (e.g., \"fetch rates\", \"plan route\").\n` +
      `Persona: ${persona || "(none)"}\n` +
      `Question: ${question || "(none)"}\n\n` +
      `Catalog:\n${catalog}`;

    try {
      const { text: planText } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: planPrompt });
      const cleaned = (planText || "").trim().replace(/^```json\n?|```$/g, "");
      const parsed = JSON.parse(cleaned) as { steps?: { agentId?: string; note?: string }[]; answer?: string };
      const steps = Array.isArray(parsed.steps) ? parsed.steps : [];
      const valid = steps
        .map((s) => ({ id: String(s.agentId || ""), note: String(s.note || "") }))
        .filter((s) => agents.some((a) => a.id === s.id));
      if (valid.length) {
        const activations = valid.map((s) => s.id);
        for (const s of valid) {
          const a = agents.find((x) => x.id === s.id)!;
          trace.push(`${a.name}: ${s.note || "working"}`);
        }
        // Try a second LLM pass to produce a crisp final answer using the planned steps and agent contexts
        try {
          const used = agents.filter((a) => activations.includes(a.id));
          const planLines = valid.map((s, i) => `${i + 1}. ${s.id}: ${s.note || "do step"}`).join("\n");
          const ctx = used.map((a) => `- ${a.id} (${a.name}): purpose=${a.purpose || ""}; context=${(a.context || "").slice(0, 200)}`).join("\n");
          const finalSynthesisPrompt = `You are the orchestrator. A plan has been selected across agents.\n` +
            `Write the final answer for the user now.\n\n` +
            `Persona: ${persona || "(none)"}\n` +
            `User question: ${question || "(none)"}\n\n` +
            `Plan steps (for your reference, do not list them):\n${planLines}\n\n` +
            `Agent contexts:\n${ctx}\n\n` +
            `Return only the final concise answer as plain text. Do NOT output JSON, code blocks, or markdown fences.`;
          const { text: composed } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: finalSynthesisPrompt });
          const answerSynth = toPlainAnswer(composed || "");
          if (answerSynth) {
            return NextResponse.json({ answer: answerSynth, trace, activations }, { status: 200 });
          }
        } catch {}
        const answer = String(parsed.answer || "").trim() ||
          `Completed: ${valid.map((s) => agents.find((a) => a.id === s.id)?.name).filter(Boolean).join(" → ")}.`;
        return NextResponse.json({ answer, trace, activations }, { status: 200 });
      }
    } catch {
      // fall back to two-stage flow below
    }

    // Fallback: two-stage selection + answer (single agent)
    const selectionPrompt = `You are the orchestrator. Select the single best agent for the user's request.\n` +
      `Return STRICT JSON: {"agentId": string, "reason": string}. No extra text.\n\n` +
      `Persona: ${persona || "(none)"}\n` +
      `Question: ${question || "(none)"}\n\n` +
      `Catalog:\n${catalog}`;

    let chosen: Pick<DbAgent, "id" | "name" | "purpose" | "context"> | null = null;
    try {
      const { text: selText } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: selectionPrompt });
      const cleaned = (selText || "").trim().replace(/^```json\n?|```$/g, "");
      const sel = JSON.parse(cleaned) as { agentId?: string; reason?: string };
      const found = sel?.agentId ? agents.find((a) => a.id === sel.agentId) : undefined;
      if (found) {
        chosen = found;
        trace.push(`Selected agent (LLM): ${found.name}`);
      } else {
        trace.push("Selected agent (LLM): not recognized; proceeding with self-selection in final prompt");
      }
    } catch {
      trace.push("Selection: parsing failed; proceeding with self-selection in final prompt");
    }

    const finalPrompt = chosen
      ? `You are ${chosen.name}. Purpose: ${chosen.purpose || ""}. Context: ${chosen.context || ""}.\n` +
        `Answer the user's request using your capabilities.\n` +
        `Persona: ${persona || "(none)"}\n` +
        `User question: ${question || "(none)"}\n\n` +
        `Respond concisely in plain text. Do NOT output JSON, code blocks, or markdown fences. Do not mention internal agent selection.`
      : `You are an expert orchestrator with access to specialist agents listed below.\n` +
        `Choose the best agent implicitly and answer directly. Do not mention the selection.\n` +
        `Agents:\n${catalog}\n\n` +
        `Persona: ${persona || "(none)"}\n` +
        `User question: ${question || "(none)"}\n\n` +
        `Respond concisely in plain text. Do NOT output JSON, code blocks, or markdown fences.`;

    const { text: finalOut } = await generateText({ model: google("models/gemini-2.0-flash-exp"), prompt: finalPrompt });
    const answer = toPlainAnswer(finalOut || "") || `${chosen ? chosen.name : "Assistant"}: response generated.`;
    if (chosen) trace.push(`${chosen.name}: answering`);
    const activations = chosen ? [chosen.id] : [];
    return NextResponse.json({ answer, trace, activations }, { status: 200 });
  } catch {
    return NextResponse.json({ answer: "Sorry, I couldn't generate an answer right now." }, { status: 200 });
  }
}

function toPlainAnswer(raw: string): string {
  let t = (raw || "").trim();
  if (!t) return "";
  t = t.replace(/^```[a-zA-Z]*\n?/, "").replace(/```$/, "").trim();
  try {
    const obj = JSON.parse(t);
    if (obj && typeof obj === "object") {
      const parts: string[] = [];
      for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
        if (v && typeof v === "object") {
          const inner = Object.entries(v as Record<string, unknown>)
            .map(([ik, iv]) => `${ik.replace(/_/g, " ")}: ${String(iv)}`)
            .join(", ");
          parts.push(`${k}: ${inner}`);
        } else {
          parts.push(`${k}: ${String(v)}`);
        }
      }
      return parts.join("\n");
    }
  } catch {
    // not JSON; fall through
  }
  return t;
}


