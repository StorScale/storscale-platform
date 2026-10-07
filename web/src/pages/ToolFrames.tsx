import { useEffect, useState } from "react";
import { Tool } from "../api";

// ToolFrames shows the active tool in a frame. The last few tools used stay
// loaded, so switching between them keeps each where it was; older ones are
// let go (each is a whole app), and load again when opened.
const KEEP = 2;
export default function ToolFrames({ tools, active }: { tools: Tool[]; active?: string }) {
  const [opened, setOpened] = useState<string[]>([]);
  const [reloads, setReloads] = useState<Record<string, number>>({});
  useEffect(() => {
    if (active && opened[opened.length - 1] !== active) setOpened((o) => [...o.filter((id) => id !== active), active].slice(-KEEP));
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
