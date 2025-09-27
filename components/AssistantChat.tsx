"use client";

import React, { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";
import { type AgentGraph } from "@/components/FlowMap";

export default function AssistantChat({ graph, onGraph }: { graph?: AgentGraph; onGraph?: (g: AgentGraph) => void }) {
	const [messages, setMessages] = useState<{ role: "user" | "assistant"; text: string }[]>([
		{ role: "assistant", text: "Hi! Ask me anything." },
	]);
	const [input, setInput] = useState("");
	const [loading, setLoading] = useState(false);
	const [persona, setPersona] = useState<string>("");
	const [showSteps, setShowSteps] = useState<boolean>(false);
	const scrollerRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		scrollerRef.current?.scrollTo({ top: scrollerRef.current.scrollHeight, behavior: "smooth" });
	}, [messages.length]);

	useEffect(() => {
		try {
			const saved = localStorage.getItem("atoa_persona") || "";
			if (saved) setPersona(saved);
		} catch {}
	}, []);

	function persistPersona(next: string) {
		setPersona(next);
		try {
			localStorage.setItem("atoa_persona", next);
		} catch {}
	}

	async function ask() {
		if (!input.trim()) return;
		const userText = input.trim();
		setInput("");
		setMessages((m) => [...m, { role: "user", text: userText }]);
		setLoading(true);

		// decrement credits at page level via custom event
		try {
			window.dispatchEvent(new CustomEvent("atoa:consume-credit", { detail: { amount: 1 } }));
		} catch {}

		// Minimal UX: no orchestration chatter, no stepwise graph animations
		// If a parent provides onGraph, we leave the current graph unchanged

		try {
			const res = await fetch("/api/agents/answer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ persona, question: userText }),
			});
			const data = (await res.json()) as { answer: string; trace?: string[]; activations?: string[] };
			const traceMsgs = Array.isArray(data?.trace) ? data.trace : [];
			// Show steps progressively with small delays and highlight inferred agents
			if (showSteps && traceMsgs.length) {
				for (const t of traceMsgs) {
					setMessages((m) => [...m, { role: "assistant", text: t }]);
					try {
						if (graph) {
							const name = t.split(":")[0]?.trim().toLowerCase();
							const found = graph.agents.find((a) => a.name.toLowerCase() === name || a.id.toLowerCase() === name);
							if (found) {
								window.dispatchEvent(new CustomEvent("atoa:highlight-agents", { detail: { ids: [found.id] } }));
							}
						}
					} catch {}
					// small delay so users see progress
					// eslint-disable-next-line no-await-in-loop
					await new Promise((r) => setTimeout(r, 550));
				}
			}
			// final highlight of all activations (if any) and short pause
			try {
				if (Array.isArray(data?.activations) && data.activations.length) {
					window.dispatchEvent(new CustomEvent("atoa:highlight-agents", { detail: { ids: data.activations } }));
				}
			} catch {}
			await new Promise((r) => setTimeout(r, traceMsgs.length ? 300 : 0));
			setMessages((m) => [...m, { role: "assistant", text: data.answer }]);
      } catch {
			setMessages((m) => [...m, { role: "assistant", text: "Sorry, I couldn't generate an answer right now." }]);
		} finally {
			setLoading(false);
		}
	}

	return (
		<div className="h-full flex flex-col bg-[#0f1020] text-white border-l border-white/10 min-h-0 basis-auto">
			<header className="px-4 py-3 bg-[#141532] text-white font-extrabold flex-shrink-0 flex items-center justify-between">
				<span>Assistant Agent</span>
				<label className="flex items-center gap-2 text-xs font-normal">
					<input type="checkbox" checked={showSteps} onChange={(e) => setShowSteps(e.target.checked)} />
					Show steps
				</label>
			</header>
			<div className="px-3 py-2 flex gap-2 items-center bg-[#0f1020] border-b border-white/10 flex-shrink-0">
				<span className="text-xs text-white/70">Persona</span>
				<input
					className="flex-1 bg-[#11132a] text-white placeholder:text-white/50 border border-white/10 px-2 py-1 ring-1 ring-white/10 focus:outline-none text-xs"
					placeholder="e.g., payments ops specialist; prefer Perplexity for web search"
					value={persona}
					onChange={(e) => persistPersona(e.target.value)}
				/>
			</div>
			<div ref={scrollerRef} className="flex-1 p-3 overflow-y-auto overscroll-y-contain space-y-3 min-h-0" style={{maxHeight: "calc(100vh - 220px)"}}>
				{messages.map((m, idx) => (
					<div key={idx} className={m.role === "user" ? "text-right" : "text-left"}>
						<motion.div
							initial={{ y: 6, opacity: 0 }}
							animate={{ y: 0, opacity: 1 }}
							transition={{ duration: 0.25 }}
							className={
								m.role === "user"
									? "inline-block bg-[#00BBF9] text-black ring-2 ring-black px-3 py-2 max-w-[90%] rounded-2xl rounded-br-sm"
									: "inline-block bg-[#2a2b45] text-white ring-1 ring-white/15 px-3 py-2 max-w-[90%] rounded-2xl rounded-bl-sm"
							}
						>
							<pre className="whitespace-pre-wrap font-sans text-sm leading-relaxed">{m.text}</pre>
						</motion.div>
					</div>
				))}
			</div>
			<div className="p-3 flex gap-2 border-t border-white/10 bg-[#0f1020] flex-shrink-0">
				<input
					className="flex-1 bg-[#11132a] text-white placeholder:text-white/50 border border-white/10 px-3 py-2 ring-1 ring-white/10 focus:outline-none"
					placeholder='Ask for agents: "route USD to EUR"'
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") ask();
					}}
				/>
				<Button onClick={ask} disabled={loading} className="bg-[#00F5D4] text-black ring-2 ring-black">
					{loading ? "Working..." : "Send"}
				</Button>
			</div>
		</div>
	);
}
