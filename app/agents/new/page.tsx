"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import FlowMap, { type AgentGraph } from "@/components/FlowMap";
import { Button } from "@/components/ui/button";

type AgentInput = { id: string; name: string; purpose: string };
type EdgeInput = { source: string; target: string; label?: string };

export default function NewAgentPage() {
  const router = useRouter();
  const [agent, setAgent] = React.useState<AgentInput>({ id: "", name: "", purpose: "" });
  const [peers, setPeers] = React.useState<AgentInput[]>([]);
  const [edges, setEdges] = React.useState<EdgeInput[]>([]);
  const [suggesting, setSuggesting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const graph: AgentGraph = React.useMemo(
    () => ({ agents: [agent, ...peers].filter((a) => a.id && a.name), edges }),
    [agent, peers, edges]
  );

  function onAddPeer() {
    setPeers((p) => [...p, { id: "", name: "", purpose: "" }]);
  }

  function onRemovePeer(index: number) {
    setPeers((p) => p.filter((_, i) => i !== index));
    setEdges((es) => es.filter((e) => e.source !== peers[index]?.id && e.target !== peers[index]?.id));
  }

  async function onSuggestEdges() {
    setSuggesting(true);
    setError(null);
    try {
      const agents = [agent, ...peers].filter((a) => a.id && a.name);
      const res = await fetch("/api/agents/graph", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: "agent-to-agent wiring", persona: "builder", agents }),
      });
      const data = (await res.json()) as { agents: AgentInput[]; edges: EdgeInput[] };
      if (Array.isArray(data?.edges)) setEdges(data.edges);
    } catch (e) {
      setError("Failed to suggest edges");
    } finally {
      setSuggesting(false);
    }
  }

  function onAddEdge() {
    const ids = [agent, ...peers].map((a) => a.id).filter(Boolean);
    if (ids.length < 2) return;
    setEdges((es) => [...es, { source: ids[0]!, target: ids[1]! }]);
  }

  async function persistAndExit() {
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: agent.id, name: agent.name, purpose: agent.purpose }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error || "Failed to save agent");
      }
      router.push("/");
    } catch (e) {
      setError("Failed to save agent");
    }
  }

  return (
    <div className="w-screen h-screen grid grid-rows-[auto_minmax(0,1fr)] bg-[#0b0c1a] text-white">
      <div className="flex items-center justify-between px-4 py-3 bg-[#0f1020] border-b border-white/10">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-sm hover:underline">← Back</Link>
          <div className="font-bold tracking-wide">Add AI Agent</div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={onSuggestEdges} disabled={suggesting}>
            {suggesting ? "Suggesting…" : "Suggest A2A Edges"}
          </Button>
          <Button onClick={persistAndExit} disabled={!agent.id || !agent.name}>Save</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[420px_1fr] min-h-0">
        <div className="h-full overflow-y-auto border-r border-white/10 p-4 space-y-6 bg-[#0f1020]">
          <section>
            <div className="text-xs uppercase tracking-widest text-[#a78bfa]">Agent</div>
            <div className="mt-2 grid gap-2">
              <input
                className="px-3 py-2 bg-[#141532] ring-1 ring-white/20 outline-none"
                placeholder="id (lowercase-dashes)"
                value={agent.id}
                onChange={(e) => setAgent((a) => ({ ...a, id: e.target.value }))}
              />
              <input
                className="px-3 py-2 bg-[#141532] ring-1 ring-white/20 outline-none"
                placeholder="name"
                value={agent.name}
                onChange={(e) => setAgent((a) => ({ ...a, name: e.target.value }))}
              />
              <textarea
                className="px-3 py-2 bg-[#141532] ring-1 ring-white/20 outline-none min-h-24"
                placeholder="purpose"
                value={agent.purpose}
                onChange={(e) => setAgent((a) => ({ ...a, purpose: e.target.value }))}
              />
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-[#a78bfa]">Peers</div>
              <Button size="sm" variant="secondary" onClick={onAddPeer}>Add peer</Button>
            </div>
            <div className="mt-2 space-y-3">
              {peers.map((p, i) => (
                <div key={i} className="grid gap-2 p-2 bg-[#141532] ring-1 ring-white/10">
                  <div className="flex items-center justify-between">
                    <div className="text-xs text-white/70">Peer #{i + 1}</div>
                    <button className="text-xs underline" onClick={() => onRemovePeer(i)}>remove</button>
                  </div>
                  <input
                    className="px-3 py-2 bg-[#0f1020] ring-1 ring-white/10 outline-none"
                    placeholder="id"
                    value={p.id}
                    onChange={(e) => setPeers((arr) => arr.map((pp, idx) => idx === i ? { ...pp, id: e.target.value } : pp))}
                  />
                  <input
                    className="px-3 py-2 bg-[#0f1020] ring-1 ring-white/10 outline-none"
                    placeholder="name"
                    value={p.name}
                    onChange={(e) => setPeers((arr) => arr.map((pp, idx) => idx === i ? { ...pp, name: e.target.value } : pp))}
                  />
                  <textarea
                    className="px-3 py-2 bg-[#0f1020] ring-1 ring-white/10 outline-none min-h-20"
                    placeholder="purpose"
                    value={p.purpose}
                    onChange={(e) => setPeers((arr) => arr.map((pp, idx) => idx === i ? { ...pp, purpose: e.target.value } : pp))}
                  />
                </div>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center justify-between">
              <div className="text-xs uppercase tracking-widest text-[#a78bfa]">A2A Edges</div>
              <Button size="sm" variant="outline" onClick={onAddEdge}>Add edge</Button>
            </div>
            <div className="mt-2 space-y-2">
              {edges.map((e, i) => (
                <div key={i} className="grid grid-cols-3 gap-2">
                  <input
                    className="px-2 py-1 bg-[#141532] ring-1 ring-white/20 outline-none"
                    placeholder="source id"
                    value={e.source}
                    onChange={(ev) => setEdges((arr) => arr.map((ee, idx) => idx === i ? { ...ee, source: ev.target.value } : ee))}
                  />
                  <input
                    className="px-2 py-1 bg-[#141532] ring-1 ring-white/20 outline-none"
                    placeholder="target id"
                    value={e.target}
                    onChange={(ev) => setEdges((arr) => arr.map((ee, idx) => idx === i ? { ...ee, target: ev.target.value } : ee))}
                  />
                  <input
                    className="px-2 py-1 bg-[#141532] ring-1 ring-white/20 outline-none"
                    placeholder="label (optional)"
                    value={e.label ?? ""}
                    onChange={(ev) => setEdges((arr) => arr.map((ee, idx) => idx === i ? { ...ee, label: ev.target.value } : ee))}
                  />
                </div>
              ))}
            </div>
          </section>

          {error ? <div className="text-xs text-red-400">{error}</div> : null}
        </div>

        <div className="h-full min-h-0">
          <FlowMap graph={graph} />
        </div>
      </div>
    </div>
  );
}


