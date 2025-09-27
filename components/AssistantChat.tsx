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
			let meta: { owner?: string; hederaAccountId?: string } | undefined;
			try {
				const raw = localStorage.getItem("hedera.account");
				if (raw) {
					const j = JSON.parse(raw) as { ownerEvm?: string; accountId?: string };
					meta = { owner: j?.ownerEvm, hederaAccountId: j?.accountId };
				}
			} catch {}
			const res = await fetch("/api/agents/answer", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ persona, question: userText, meta }),
			});
			const data = (await res.json()) as { answer: string; trace?: string[]; activations?: string[]; alertId?: string };
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

			// If an alert was created, start a 5s poll loop to show price and auto execute
			if (data.alertId) {
				try {
					const hederaRaw = localStorage.getItem("hedera.account");
					const hedera = hederaRaw ? (JSON.parse(hederaRaw) as { accountId?: string; privateKey?: string }) : null;
					let stop = false;
					for (let i = 0; i < 60 && !stop; i++) {
						// Fetch Pyth directly every 1s for a true realtime view
						try {
							const endpoint = process.env.NEXT_PUBLIC_PYTH_HERMES_URL || "https://hermes.pyth.network";
							const feedId = process.env.NEXT_PUBLIC_PYTH_PRICE_ID_HBAR_USD || "3728e591097635310e6341af53db8b7ee42da9b3a8d918f9463ce9cca886dfbd";
							const url = `${endpoint.replace(/\/$/, "")}/v2/updates/price/latest?ids[]=${encodeURIComponent(feedId)}&parsed=true`;
							const pr = await fetch(url, { cache: "no-store" });
							const pj = (await pr.json()) as { parsed?: Array<{ price?: { price?: number | string; expo?: number } }> };
							const raw = Array.isArray(pj?.parsed) ? pj.parsed[0] : undefined;
							const pp = Number(raw?.price?.price ?? 0);
							const pe = Number(raw?.price?.expo ?? 0);
							const price = Number.isFinite(pp) && Number.isFinite(pe) ? pp * Math.pow(10, pe) : 0;
							setMessages((m) => [...m, { role: "assistant", text: `HBAR price: $${Number(price || 0).toFixed(6)}` }]);
						} catch {}
						// trigger backend check so schedule is created when threshold hits
						try { await fetch("/api/alerts/check", { method: "POST" }); } catch {}
						// Check if backend wrote an HCS signal for this alert (messageSequence present)
						const aRes = await fetch(`/api/alerts?id=${encodeURIComponent(data.alertId)}`);
						const aj = (await aRes.json()) as { alert?: { scheduleId?: string; topicId?: string; messageSequence?: number; action?: string } };
						const scheduleId = aj?.alert?.scheduleId;
						if (scheduleId && hedera?.privateKey) {
							const sRes = await fetch("/api/hedera/schedule/sign", {
								method: "POST",
								headers: { "Content-Type": "application/json" },
								body: JSON.stringify({ scheduleId, privateKey: hedera.privateKey }),
							});
							if (sRes.ok) {
								setMessages((m) => [...m, { role: "assistant", text: "Order executed via scheduled transaction." }]);
								stop = true;
								break;
							}
						}
						const seq = aj?.alert?.messageSequence;
						if (typeof seq === "number" && seq > 0) {
							const net = (process.env.NEXT_PUBLIC_HEDERA_NETWORK || process.env.HEDERA_NETWORK || "testnet").toLowerCase();
							const base = net === "mainnet" ? "https://hashscan.io/mainnet/topic/" : net === "previewnet" ? "https://hashscan.io/previewnet/topic/" : "https://hashscan.io/testnet/topic/";
							const link = aj?.alert?.topicId ? `${base}${aj.alert.topicId}` : "";
							const act = (aj?.alert?.action || "notify").toLowerCase();
							const msg = act === "notify" ? `Alert fired. Seq #${seq}.${link ? " (" + link + ")" : ""}` : `Order signal published (${act}). Seq #${seq}.${link ? " (" + link + ")" : ""}`;
							setMessages((m) => [...m, { role: "assistant", text: msg }]);
							stop = true;
							break;
						}
						await new Promise((r) => setTimeout(r, 1000));
					}
				} catch {}
			}
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
