"use client";

import React, { useEffect, useState } from "react";
import AssistantChat from "@/components/AssistantChat";
import AgentCard, { type Agent } from "@/components/AgentCard";
import { type AgentGraph } from "@/components/FlowMap";

export default function Sidebar({
	selectedAgent,
	onCollapse,
	defaultTab = "details",
	graph,
	onGraphUpdate,
}: {
	selectedAgent: Agent | null;
	onCollapse: () => void;
	defaultTab?: "details" | "chat";
	graph?: AgentGraph | null;
	onGraphUpdate?: (g: AgentGraph) => void;
}) {
	const [tab, setTab] = useState<"details" | "chat">(defaultTab);
  const [full, setFull] = useState<Agent | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      if (!selectedAgent?.id) { setFull(null); return; }
      try {
        const res = await fetch(`/api/agents/${selectedAgent.id}`, { cache: "no-store" });
        const data = (await res.json()) as { agent?: Partial<Agent> & { id: string; name: string } | null };
        if (!cancelled) {
          const merged: Agent = { ...selectedAgent, ...(data.agent ?? {}) } as Agent;
          setFull(merged);
        }
      } catch {
        if (!cancelled) setFull(selectedAgent);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [selectedAgent?.id, selectedAgent]);

	return (
		<div className="h-full min-h-0 grid grid-rows-[auto_auto_minmax(0,1fr)] bg-[#0b0c1a] text-white border-l border-white/10 overflow-hidden">
			<div className="flex items-center justify-between px-3 py-2 bg-[#0f1020]">
				<div className="font-bold tracking-wide">ATOA Panel</div>
				<button
					className="text-xs px-2 py-1 ring-1 ring-white/20"
					onClick={onCollapse}
				>
					Collapse
				</button>
			</div>
			<div className="grid grid-cols-2">
				<button
					className={`px-3 py-2 text-sm ${tab === "details" ? "bg-[#141532]" : "bg-[#0f1020]"}`}
					onClick={() => setTab("details")}
				>
					Details
				</button>
				<button
					className={`px-3 py-2 text-sm ${tab === "chat" ? "bg-[#141532]" : "bg-[#0f1020]"}`}
					onClick={() => setTab("chat")}
				>
					Chat
				</button>
			</div>
			<div className="h-full overflow-hidden min-h-0">
				{tab === "details" ? (
					<div className="p-3 h-full overflow-y-auto">
                        {full ? (
                            <AgentCard
                                agent={full}
                                onUpdated={(upd) => {
                                    // Reflect updates in-place on the Home graph via a custom event
                                    try {
                                        window.dispatchEvent(new CustomEvent("atoa:update-agent-local", { detail: upd }));
                                    } catch {}
                                    setFull((f) => f && f.id === upd.id ? { ...f, ...upd } as Agent : f);
                                }}
                                onDeleted={(id) => {
                                    try {
                                        window.dispatchEvent(new CustomEvent("atoa:delete-agent-local", { detail: { id } }));
                                    } catch {}
                                    setFull(null);
                                }}
                            />
						) : (
							<div className="text-sm text-white/70">Select an agent on the map to see details.</div>
						)}
					</div>
				) : (
					<AssistantChat graph={graph ?? undefined} onGraph={(g) => onGraphUpdate?.(g)} />
				)}
			</div>
		</div>
	);
}


