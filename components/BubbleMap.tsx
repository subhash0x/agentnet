"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";

type Agent = {
  id: string;
  label: string;
  x: number;
  y: number;
  radius: number;
  color: string;
};

type Link = {
  sourceId: string;
  targetId: string;
};

export type BubbleMapProps = {
  width?: number;
  height?: number;
  agents?: Agent[];
  links?: Link[];
  onAgentClick?: (agent: Agent) => void;
};

function randomColor(seed: number) {
  const palette = ["#00BBF9", "#FEE440", "#9B5DE5", "#F15BB5", "#00F5D4"]; // ATOA palette
  return palette[seed % palette.length];
}

export function BubbleMap({
  width = 900,
  height = 520,
  agents: providedAgents,
  links: providedLinks,
  onAgentClick,
}: BubbleMapProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const dragOffset = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 });

  const [agents, links] = useMemo(() => {
    const count = 16;
    const generatedAgents: Agent[] = providedAgents ?? Array.from({ length: count }, (_, i) => {
      const cx = Math.random() * (width - 120) + 60;
      const cy = Math.random() * (height - 120) + 60;
      const radius = 16 + Math.random() * 18;
      return {
        id: `agent-${i + 1}`,
        label: `Agent ${i + 1}`,
        x: cx,
        y: cy,
        radius,
        color: randomColor(i),
      };
    });
    const generatedLinks: Link[] = providedLinks ?? [];
    if (!providedLinks) {
      for (let i = 0; i < count; i++) {
        const connections = Math.floor(Math.random() * 3);
        for (let k = 0; k < connections; k++) {
          const j = Math.floor(Math.random() * count);
          if (j !== i) {
            generatedLinks.push({ sourceId: `agent-${i + 1}`, targetId: `agent-${j + 1}` });
          }
        }
      }
    }
    return [generatedAgents, generatedLinks];
  }, [providedAgents, providedLinks, width, height]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const maybeCtx = canvas.getContext("2d");
    if (!maybeCtx) return;
    const ctx: CanvasRenderingContext2D = maybeCtx;

    function draw() {
      ctx.clearRect(0, 0, width, height);

      // background frame
      ctx.save();
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, width, height);
      ctx.restore();

      // inner panel
      ctx.save();
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--color-background").trim() || "white";
      ctx.fillRect(8, 8, width - 16, height - 16);
      ctx.restore();

      // draw links first
      ctx.save();
      ctx.lineWidth = 1.5;
      links.forEach((l) => {
        const a = agents.find((ag) => ag.id === l.sourceId);
        const b = agents.find((ag) => ag.id === l.targetId);
        if (!a || !b) return;
        const isHovered = hoveredId === a.id || hoveredId === b.id;
        ctx.strokeStyle = isHovered ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.15)";
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
      });
      ctx.restore();

      // draw agents
      agents.forEach((a) => {
        const isHover = hoveredId === a.id;
        const r = isHover ? a.radius + 4 : a.radius;
        // outline box
        ctx.save();
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000000";
        ctx.fillStyle = a.color;
        ctx.beginPath();
        ctx.arc(a.x, a.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // label
        ctx.save();
        ctx.font = "700 10px ui-sans-serif, system-ui, sans-serif";
        ctx.fillStyle = "#000";
        ctx.textAlign = "center";
        ctx.textBaseline = "top";
        ctx.fillText(a.label, a.x, a.y + r + 6);
        ctx.restore();
      });
    }

    draw();

    // simple animation on hover highlight changes
    let raf = 0;
    function loop() {
      draw();
      raf = requestAnimationFrame(loop);
    }
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [agents, links, hoveredId, width, height]);

  function agentAt(x: number, y: number): Agent | null {
    for (let i = agents.length - 1; i >= 0; i--) {
      const a = agents[i];
      const dx = x - a.x;
      const dy = y - a.y;
      if (Math.hypot(dx, dy) <= a.radius + 6) return a;
    }
    return null;
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = agentAt(x, y);
    if (hit) {
      setDragId(hit.id);
      dragOffset.current = { dx: x - hit.x, dy: y - hit.y };
    }
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = agentAt(x, y);
    setHoveredId(hit?.id ?? null);

    if (dragId) {
      e.preventDefault();
      const idx = agents.findIndex((a) => a.id === dragId);
      if (idx >= 0) {
        const a = agents[idx];
        a.x = Math.min(Math.max(16, x - dragOffset.current.dx), width - 16);
        a.y = Math.min(Math.max(16, y - dragOffset.current.dy), height - 16);
      }
    }
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    const wasDragging = dragId !== null;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const hit = agentAt(x, y);
    if (!wasDragging && hit && onAgentClick) onAgentClick(hit);
    setDragId(null);
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="block w-full h-auto bg-transparent"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={() => setDragId(null)}
      />
    </div>
  );
}

export default BubbleMap;


