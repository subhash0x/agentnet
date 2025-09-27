import React from "react";

export type Agent = {
  id: string;
  name: string;
  role?: string;
  score?: number;
  capabilities?: string[];
  purpose?: string;
  context?: string;
};

export default function AgentCard({ agent, onUpdated, onDeleted }: { agent: Agent; onUpdated?: (a: Partial<Agent> & { id: string }) => void; onDeleted?: (id: string) => void }) {
  const [editing, setEditing] = React.useState(false);
  const [name, setName] = React.useState(agent.name);
  const [purpose, setPurpose] = React.useState(agent.purpose ?? "");
  const [context, setContext] = React.useState(agent.context ?? "");

  React.useEffect(() => {
    setName(agent.name);
    setPurpose(agent.purpose ?? "");
    setContext(agent.context ?? "");
  }, [agent.id, agent.name, agent.purpose, agent.context]);

  async function save() {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, purpose, context }),
      });
      if (!res.ok) throw new Error("save failed");
      onUpdated?.({ id: agent.id, name, purpose, context });
      setEditing(false);
    } catch {}
  }

  async function remove() {
    try {
      await fetch(`/api/agents/${agent.id}`, { method: "DELETE" });
      onDeleted?.(agent.id);
      try {
        window.dispatchEvent(new CustomEvent("atoa:clear-selection"));
      } catch {}
      setEditing(false);
    } catch {}
  }
  return (
    <div className="relative bg-[#0f1020] text-white ring-2 ring-[#4f46e5] p-4 shadow-[0_0_0_2px_#000]">
      <div className="absolute inset-0 pointer-events-none" style={{ boxShadow: "inset 0 0 80px rgba(79, 70, 229, 0.15)" }} />
      <div className="flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-[#a78bfa]">Agent Card</div>
        <div className="text-xs text-[#00F5D4]">Score {agent.score?.toFixed(2) ?? "—"}</div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        {editing ? (
          <input className="bg-[#11132a] ring-1 ring-white/15 px-2 py-1 text-white text-xl font-black" value={name} onChange={(e) => setName(e.target.value)} />
        ) : (
          <div className="text-2xl font-black text-white">{name}</div>
        )}
        <button className="text-xs underline" onClick={() => setEditing((v) => !v)}>{editing ? "Cancel" : "Edit"}</button>
      </div>
      <div className="mt-1 text-xs text-[#c4b5fd]">{agent.role ?? "Autonomous Service"}</div>
      <div className="mt-3">
        {editing ? (
          <textarea className="w-full bg-[#11132a] ring-1 ring-white/15 px-2 py-1 text-sm" placeholder="purpose" value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        ) : (
          <div className="text-xs text-[#a78bfa]">{purpose}</div>
        )}
      </div>
      <div className="mt-2">
        {editing ? (
          <textarea className="w-full bg-[#11132a] ring-1 ring-white/15 px-2 py-1 text-sm min-h-24" placeholder="context (capabilities, constraints, data sources)" value={context} onChange={(e) => setContext(e.target.value)} />
        ) : context ? (
          <div className="text-xs text-white/80 whitespace-pre-wrap">{context}</div>
        ) : null}
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2">
        {(agent.capabilities ?? ["route", "settle", "verify", "notify"]).slice(0,4).map((cap) => (
          <div key={cap} className="bg-[#11132a] text-[#a78bfa] ring-1 ring-[#4f46e5] px-2 py-1 text-xs">
            {cap}
          </div>
        ))}
      </div>
      <div className="mt-4 flex gap-2">
        {editing ? (
          <>
            <button className="bg-[#00F5D4] text-black ring-2 ring-black px-3 py-2 text-sm font-bold" onClick={save}>Save</button>
            <button className="bg-[#F15BB5] text-black ring-2 ring-black px-3 py-2 text-sm font-bold" onClick={remove}>Delete</button>
          </>
        ) : (
          <>
            <button className="bg-[#00BBF9] text-black ring-2 ring-black px-3 py-2 text-sm font-bold">Connect</button>
            <button className="bg-[#FEE440] text-black ring-2 ring-black px-3 py-2 text-sm font-bold" onClick={() => setEditing(true)}>Inspect</button>
          </>
        )}
      </div>
    </div>
  );
}
