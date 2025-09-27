"use client";
import FlowMap, { type AgentGraph, HARDCODED_TEAM } from "@/components/FlowMap";
import Sidebar from "@/components/Sidebar";
import React, { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Web3AuthConnectButton from "@/components/Web3AuthConnectButton";
import { Button } from "@/components/ui/button";

function HighlightBridge({ onFlash }: { onFlash: (ids: string[]) => void }) {
  React.useEffect(() => {
    function onHighlight(e: Event) {
      const ids = (e as CustomEvent<{ ids?: string[] }>).detail?.ids ?? [];
      if (Array.isArray(ids) && ids.length) onFlash(ids);
    }
    window.addEventListener("atoa:highlight-agents", onHighlight);
    return () => window.removeEventListener("atoa:highlight-agents", onHighlight);
  }, [onFlash]);
  return null;
}

export default function Home() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [graph, setGraph] = useState<AgentGraph | null>(HARDCODED_TEAM);
  const [credits, setCredits] = useState<number>(100);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);

  React.useEffect(() => {
    function onConsume(e: Event) {
      const amt = (e as CustomEvent<{ amount?: number }>).detail?.amount ?? 1;
      setCredits((c) => Math.max(0, c - amt));
    }
    window.addEventListener("atoa:consume-credit", onConsume);
    return () => window.removeEventListener("atoa:consume-credit", onConsume);
  }, []);

  // Live update handlers from Sidebar edits
  React.useEffect(() => {
    function onClear() { setSelected(null); }
    function onUpdate(e: Event) {
      const upd = (e as CustomEvent<{ id: string; name?: string; purpose?: string; context?: string }>).detail;
      setGraph((g) => {
        if (!g) return g;
        const next = { ...g, agents: g.agents.map((a) => a.id === upd.id ? { ...a, name: upd.name ?? a.name, purpose: upd.purpose ?? a.purpose } : a) };
        return next;
      });
    }
    function onDelete(e: Event) {
      const id = (e as CustomEvent<{ id: string }>).detail?.id;
      if (!id) return;
      setGraph((g) => {
        if (!g) return g;
        const agents = g.agents.filter((a) => a.id !== id);
        const edges = g.edges.filter((e) => e.source !== id && e.target !== id);
        return { agents, edges };
      });
    }
    window.addEventListener("atoa:clear-selection", onClear);
    window.addEventListener("atoa:update-agent-local", onUpdate as EventListener);
    window.addEventListener("atoa:delete-agent-local", onDelete as EventListener);
    return () => {
      window.removeEventListener("atoa:clear-selection", onClear);
      window.removeEventListener("atoa:update-agent-local", onUpdate as EventListener);
      window.removeEventListener("atoa:delete-agent-local", onDelete as EventListener);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    async function loadGraphAndAgents() {
      try {
        const [agentsRes, graphRes] = await Promise.all([
          fetch("/api/agents", { cache: "no-store" }),
          fetch("/api/graphs?id=default", { cache: "no-store" }),
        ]);
        const agentsJson = (await agentsRes.json()) as { agents?: { id: string; name: string; purpose?: string }[] };
        const dbAgents = Array.isArray(agentsJson?.agents) ? agentsJson.agents : [];
        const graphJson = (await graphRes.json()) as { graph: AgentGraph | null };
        const savedGraph = graphJson?.graph ?? null;

        if (cancelled) return;

        if (savedGraph) {
          // Merge any new agents from DB that are not yet in the saved graph
          const existingIds = new Set(savedGraph.agents.map((a) => a.id));
          const missing = dbAgents.filter((a) => !existingIds.has(a.id));
          const merged: AgentGraph = missing.length
            ? { agents: [...savedGraph.agents, ...missing], edges: savedGraph.edges }
            : savedGraph;
          setGraph(merged);
          // Persist the merged graph for future loads
          if (missing.length) {
            try {
              await fetch("/api/graphs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id: "default", agents: merged.agents, edges: merged.edges }),
              });
            } catch {}
          }
          return;
        }

        // No saved graph: render agents directly
        if (dbAgents.length) {
          setGraph({ agents: dbAgents, edges: [] });
        }
      } catch {
        // ignore and keep default graph
      }
    }
    loadGraphAndAgents();
    return () => { cancelled = true; };
  }, []);
  return (
    <div className={`w-screen h-screen min-h-0 overflow-hidden grid ${sidebarOpen ? "grid-cols-[1fr_360px] md:grid-cols-[1fr_420px]" : "grid-cols-[1fr_0px]"}`}>
      <div className="relative">
        <div className="absolute top-3 left-3 right-3 z-20">
          <div className="flex items-center justify-between bg-[#0f1020]/80 backdrop-blur ring-1 ring-white/10 px-3 py-2">
            <div className="flex items-center gap-3">
              <div className="text-sm font-black tracking-wider">ATOA</div>
              <div className="px-2 py-1 bg-black/60 text-white ring-1 ring-white/10 text-xs">Credits: {credits}</div>
            </div>
            <div className="flex items-center gap-2">
              <Button asChild variant="secondary" size="sm">
                <Link href="/agents/new">Create Agent</Link>
              </Button>
              <Button asChild variant="outline" size="sm">
                <a href="https://zealous-rook-259.notion.site/2729062b846880b4ba4bc9aa84e09353?pvs=73" target="_blank" rel="noopener noreferrer">Whitepaper</a>
              </Button>
              <Web3AuthConnectButton />
            </div>
          </div>
        </div>
        <FlowMap graph={graph ?? undefined} onSelect={(a) => setSelected(a)} highlight={highlightIds} />
        {/* transient highlights from chat */}
        <HighlightBridge onFlash={(ids) => {
          setHighlightIds(ids);
          setTimeout(() => setHighlightIds([]), 3500);
        }} />
        <button
          className="absolute top-1/2 -translate-y-1/2 right-0 translate-x-1/2 z-10 bg-[#141532] text-white ring-1 ring-white/20 w-8 h-16 flex items-center justify-center"
          onClick={() => setSidebarOpen((s) => !s)}
          aria-label={sidebarOpen ? "Hide panel" : "Show panel"}
        >
          {sidebarOpen ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>
      <div className="relative h-full min-h-0">
        <Sidebar
          selectedAgent={selected ? { id: selected.id, name: selected.name, score: Math.random() * 1 } : null}
          onCollapse={() => setSidebarOpen(false)}
          graph={graph}
          onGraphUpdate={(g) => setGraph(g)}
        />
      </div>
    </div>
  );
}
