import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ago, getPipelines, startRun, took, when } from "../api";
import { ErrorBanner, Spinner, StateDot, usePoll, useProject } from "../lib";

// Pipelines is a project's Airflow DAGs: their recent runs, the newest run's
// tasks, and (for editors) a way to start one. Writing them stays in Airflow.
export default function Pipelines() {
  const { name } = useProject();
  const [params, setParams] = useSearchParams();
  const { data, error, reload } = usePoll(() => getPipelines(name), [name], 5_000);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string>();
  const [started, setStarted] = useState<string>();

  if (error && !data) return <div className="page"><ErrorBanner error={error} /></div>;
  if (!data) return <div className="page"><Spinner /></div>;
  if (data.pipelines.length === 0) {
    return (
      <div className="page">
        <div className="empty">
          No pipelines yet. A pipeline belongs to this project when its Airflow DAG is tagged <code>project:{name}</code>.{" "}
          <Link to="/tools/pipelines">Open Airflow</Link>
        </div>
      </div>
    );
  }
  const p = data.pipelines.find((x) => x.id === params.get("pipeline")) ?? data.pipelines[0];
  const latest = p.runs[0];
  const run = async () => {
    setStarting(true);
    setStartError(undefined);
    try {
      setStarted((await startRun(name, p.id)).run);
      reload();
    } catch (e) {
      setStartError((e as Error).message);
    } finally {
      setStarting(false);
    }
  };

  // The newest run's tasks, on one time axis.
  const t0 = Math.min(...p.tasks.map((t) => when(t.started)?.getTime() ?? Infinity));
  const t1 = Math.max(...p.tasks.map((t) => (when(t.ended) ?? (when(t.started) ? new Date() : undefined))?.getTime() ?? -Infinity));
  const span = isFinite(t0) && isFinite(t1) && t1 > t0 ? t1 - t0 : 0;

  return (
    <div className="page">
      <div className="split">
        <nav className="side side-list" aria-label="Pipelines">
          <p className="eyebrow">Pipelines</p>
          {data.pipelines.map((x) => (
            <button key={x.id} className={x === p ? "active" : ""} onClick={() => setParams({ pipeline: x.id })} data-testid={`pipeline-${x.id}`}>
              <span className="mono">{x.id}</span><StateDot state={x.runs[0]?.state} />
            </button>
          ))}
        </nav>

        <section className="main stack">
          <div className="card">
            <div className="card-head" style={{ alignItems: "flex-start" }}>
              <div>
                <h2 className="mono" style={{ fontSize: 18 }}>{p.id}</h2>
                <p className="muted small" style={{ margin: "4px 0 0" }}>{p.description || "No description."}{p.paused && <> · <span className="pill">paused</span></>}</p>
              </div>
              <div className="row">
                <Link className="btn" to="/tools/pipelines">Edit in Airflow</Link>
                {data.canRun && <button className="btn primary" onClick={run} disabled={starting} data-testid="run-now">{starting ? "Starting…" : "Run now"}</button>}
              </div>
            </div>
            <ErrorBanner error={startError} />
            {started && <div className="banner info" data-testid="run-started">Started run <code>{started}</code>. It runs as the project's pipelines service account.</div>}
            {!data.canRun && <p className="small muted" style={{ margin: 0 }}>The project's editors can start runs.</p>}

            <p className="eyebrow" style={{ marginTop: 18 }}>Recent runs</p>
            <div className="runs" data-testid="runs">
              {[...p.runs].reverse().map((r) => (
                <button key={r.id} className={`${r.state}${r === latest ? " selected" : ""}`} title={`${r.state}, ${when(r.started)?.toLocaleString() ?? "not started"}`} aria-label={`${r.id}: ${r.state}`} />
              ))}
              {p.runs.length === 0 && <span className="small muted">No runs yet.</span>}
            </div>
          </div>

          {latest && (
            <div className="card">
              <div className="card-head">
                <h2>Latest run</h2>
                <span className="row small"><StateDot state={latest.state} /><strong>{latest.state}</strong>
                  <span className="muted">{ago(when(latest.started))}{took(when(latest.started), when(latest.ended)) && `, took ${took(when(latest.started), when(latest.ended))}`}{latest.requestedBy && `, started by ${latest.requestedBy}`}</span>
                </span>
              </div>
              <div className="gantt" data-testid="tasks">
                {p.tasks.map((t) => {
                  const a = when(t.started)?.getTime(), b = (when(t.ended) ?? (a ? new Date() : undefined))?.getTime();
                  return (
                    <div key={t.id} style={{ display: "contents" }}>
                      <span className="mono small">{t.id}</span>
                      <div className="track">
                        {a && b && span > 0 && <div className={`span ${t.state}`} style={{ left: `${((a - t0) / span) * 100}%`, width: `${((b - a) / span) * 100}%` }} />}
                      </div>
                      <span className="small muted">{t.state || "waiting"}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="card flush">
            <table className="t">
              <thead><tr><th>Run</th><th>Started</th><th>Took</th><th>By</th></tr></thead>
              <tbody>
                {p.runs.map((r) => (
                  <tr key={r.id}>
                    <td><span className="row" style={{ gap: 8 }}><StateDot state={r.state} /><span className="mono small">{r.id}</span></span></td>
                    <td className="small">{when(r.started)?.toLocaleString() ?? "–"}</td>
                    <td className="small muted">{took(when(r.started), when(r.ended)) || (r.state === "running" ? "running" : "–")}</td>
                    <td className="small muted">{r.requestedBy ?? (r.type === "scheduled" ? "schedule" : r.type)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
