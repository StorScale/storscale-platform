import { useLayoutEffect, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Flow as FlowData, FlowTable, getFlow } from "../api";

// levels puts each table in a column: sources first, then what's made from them.
function levels(flow: FlowData): FlowTable[][] {
  const level: Record<string, number> = {};
  for (const t of flow.tables) level[t.fqn] = 0;
  for (let pass = 0; pass < flow.tables.length; pass++) {
    for (const e of flow.edges) {
      if (level[e.from] !== undefined && level[e.to] !== undefined && level[e.to] <= level[e.from]) level[e.to] = level[e.from] + 1;
    }
  }
  const cols: FlowTable[][] = [];
  for (const t of flow.tables) (cols[level[t.fqn]] ??= []).push(t);
  return cols.filter(Boolean);
}

function CheckPill({ status }: { status: string }) {
  const cls = status === "Success" ? "pill ok" : status === "Failed" ? "pill bad" : "pill";
  return <span className={cls}>{status === "Success" ? "passing" : status === "Failed" ? "failing" : status ? status.toLowerCase() : "not run yet"}</span>;
}

export default function Flow() {
  const { name = "" } = useParams();
  const [flow, setFlow] = useState<FlowData>();
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<number>();
  const box = useRef<HTMLDivElement>(null);
  const [lines, setLines] = useState<{ d: string; i: number; x: number; y: number }[]>([]);

  useEffect(() => {
    const load = () => getFlow(name).then(setFlow).catch((e) => setError(e.message));
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [name]);

  // The arrows between tables, drawn once the cards have their places.
  useLayoutEffect(() => {
    if (!flow || !box.current) return;
    const at = (fqn: string) => box.current!.querySelector<HTMLElement>(`[data-fqn="${CSS.escape(fqn)}"]`);
    const origin = box.current.getBoundingClientRect();
    setLines(flow.edges.flatMap((e, i) => {
      const a = at(e.from)?.getBoundingClientRect(), b = at(e.to)?.getBoundingClientRect();
      if (!a || !b) return [];
      const x1 = a.right - origin.left, y1 = a.top + a.height / 2 - origin.top;
      const x2 = b.left - origin.left, y2 = b.top + b.height / 2 - origin.top;
      const mx = (x1 + x2) / 2;
      return [{ d: `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 6},${y2}`, i, x: mx, y: (y1 + y2) / 2 }];
    }));
  }, [flow]);

  if (error) return <p className="bad">{error}</p>;
  if (!flow) return <div className="spinner" />;
  const cols = levels(flow);
  const failing = flow.tables.flatMap((t) => t.checks.filter((c) => c.status === "Failed").map((c) => ({ t, c })));
  const edge = selected !== undefined ? flow.edges[selected] : undefined;
  const short = (fqn: string) => flow.tables.find((t) => t.fqn === fqn)?.name ?? fqn;

  return (
    <div className="page flow-page">
      <div className="page-head">
        <h1><Link to={`/projects/${name}`}>{name}</Link> / Flow</h1>
        <a className="button" href={`${location.protocol}//catalog.${location.host}/_storscale/launch.html`} target="_blank" rel="noreferrer">Open the catalog ↗</a>
      </div>
      <p className="muted lead">
        The project's tables, the pipelines between them, column by column, and their checks: from the catalog,
        which learns of each pipeline run as it happens.
      </p>
      {failing.length > 0 && (
        <div className="banner error" data-testid="failing-checks">
          {failing.map(({ t, c }) => <div key={t.fqn + c.name}><strong>{t.name}</strong>: {c.name} is failing. {c.result}</div>)}
        </div>
      )}
      {flow.tables.length === 0 ? (
        <div className="card"><p>The catalog hasn't seen this project's tables yet. It looks every minute.</p></div>
      ) : (
        <div className="flow" ref={box} data-testid="flow">
          <svg className="flow-lines">
            <defs><marker id="arrow" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0,0 L10,5 L0,10 z" /></marker></defs>
            {lines.map((l) => (
              <g key={l.i} className={selected === l.i ? "selected" : ""} onClick={() => setSelected(l.i)}>
                <path d={l.d} markerEnd="url(#arrow)" />
              </g>
            ))}
          </svg>
          {cols.map((col, i) => (
            <div className="flow-col" key={i}>
              {col.map((t) => (
                <div key={t.fqn} className={`flow-table${t.external ? " external" : ""}`} data-fqn={t.fqn} data-testid={`table-${t.name}`}>
                  <h3>{t.name}{t.external && <span className="muted"> (another project)</span>}</h3>
                  <ul className="cols">{t.columns.map((c) => <li key={c}>{c}</li>)}</ul>
                  {t.checks.length > 0 && (
                    <ul className="checks-list">
                      {t.checks.map((c) => <li key={c.name} title={c.result}><CheckPill status={c.status} /> {c.name.replace(`${name}_${t.name}_`, "")}</li>)}
                    </ul>
                  )}
                </div>
              ))}
            </div>
          ))}
          {lines.map((l) => {
            const e = flow.edges[l.i];
            return e.pipeline ? (
              <button key={l.i} className={`flow-label${selected === l.i ? " selected" : ""}`} style={{ left: l.x, top: l.y }} onClick={() => setSelected(l.i)} data-testid="flow-pipeline">
                {e.pipeline}
              </button>
            ) : null;
          })}
        </div>
      )}
      <h2>How data flows</h2>
      {flow.edges.length === 0 ? (
        <p className="muted">No pipeline has reported reading or writing these tables yet.</p>
      ) : (
        <table data-testid="edges">
          <thead><tr><th>From</th><th>To</th><th>Pipeline</th><th>Columns</th></tr></thead>
          <tbody>
            {flow.edges.map((e, i) => (
              <tr key={i} className={edge === e ? "selected" : ""} onClick={() => setSelected(i)}>
                <td>{short(e.from)}</td>
                <td>{short(e.to)}</td>
                <td>{e.pipeline ?? <span className="muted">unknown</span>}</td>
                <td>{e.columns.map((c) => <div key={c.to}><code>{c.to}</code> ← {c.from.map((f) => <code key={f}>{short(e.from)}.{f}</code>)}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
