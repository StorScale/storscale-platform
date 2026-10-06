import { useEffect, useState } from "react";
import { Tool } from "../api";

// ToolFrames shows the active tool in a frame. A tool's frame stays loaded
// once opened, so switching between tools keeps each one where it was.
export default function ToolFrames({ tools, active }: { tools: Tool[]; active?: string }) {
  const [opened, setOpened] = useState<string[]>([]);
  const [reloads, setReloads] = useState<Record<string, number>>({});
  useEffect(() => {
    if (active && !opened.includes(active)) setOpened((o) => [...o, active]);
  }, [active, opened]);

  const tool = tools.find((t) => t.id === active);
  if (active && !tool) return <p>No tool called {active}.</p>;
  return (
    <>
      {tool && (
        <div className="tool-bar">
          <strong>{tool.name}</strong>
          <span className="muted">{tool.description}</span>
          <span className="grow" />
          <button className="link" onClick={() => setReloads((r) => ({ ...r, [tool.id]: (r[tool.id] ?? 0) + 1 }))}>Reload</button>
          <a href={tool.url} target="_blank" rel="noreferrer">Open in a new tab ↗</a>
        </div>
      )}
      {opened.map((id) => {
        const t = tools.find((t) => t.id === id);
        if (!t?.embedUrl) return null;
        return (
          <iframe
            key={`${id}-${reloads[id] ?? 0}`}
            name={`tool-${id}`}
            data-testid={`frame-${id}`}
            title={t.name}
            src={t.embedUrl}
            className="tool-frame"
            hidden={id !== active}
            allow="clipboard-read; clipboard-write; fullscreen"
          />
        );
      })}
    </>
  );
}
