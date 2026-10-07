package pipelines

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func fakeAirflow(t *testing.T, started *map[string]any) *httptest.Server {
	reply := func(w http.ResponseWriter, v any) { json.NewEncoder(w).Encode(v) }
	authed := func(r *http.Request) bool { return r.Header.Get("Authorization") == "Bearer airflow-token" }
	mux := http.NewServeMux()
	mux.HandleFunc("POST /auth/token", func(w http.ResponseWriter, r *http.Request) {
		var in map[string]string
		json.NewDecoder(r.Body).Decode(&in)
		if in["username"] != "storscale-platform" || in["password"] != "secret" {
			http.Error(w, `{"detail":"Invalid credentials"}`, http.StatusUnauthorized)
			return
		}
		reply(w, map[string]string{"access_token": "airflow-token"})
	})
	mux.HandleFunc("GET /api/v2/dags", func(w http.ResponseWriter, r *http.Request) {
		if !authed(r) {
			http.Error(w, "no", http.StatusUnauthorized)
			return
		}
		if r.URL.Query().Get("tags") != "project:sales" {
			reply(w, map[string]any{"dags": []any{}})
			return
		}
		reply(w, map[string]any{"dags": []any{map[string]any{"dag_id": "sales_ingest", "description": "Land and load orders", "is_paused": false}}})
	})
	mux.HandleFunc("GET /api/v2/dags/sales_ingest/dagRuns", func(w http.ResponseWriter, r *http.Request) {
		reply(w, map[string]any{"dag_runs": []any{
			map[string]any{"dag_run_id": "manual__2", "state": "success", "start_date": "2026-10-07T10:00:00Z", "end_date": "2026-10-07T10:01:00Z",
				"run_type": "manual", "conf": map[string]any{"requested_by": "bob"}},
			map[string]any{"dag_run_id": "manual__1", "state": "failed", "start_date": "2026-10-06T10:00:00Z", "end_date": nil, "run_type": "manual", "conf": map[string]any{}},
		}})
	})
	mux.HandleFunc("GET /api/v2/dags/sales_ingest/dagRuns/manual__2/taskInstances", func(w http.ResponseWriter, r *http.Request) {
		reply(w, map[string]any{"task_instances": []any{
			map[string]any{"task_id": "land_orders", "state": "success", "start_date": "2026-10-07T10:00:00Z", "end_date": "2026-10-07T10:00:10Z"},
			map[string]any{"task_id": "load_orders", "state": nil},
		}})
	})
	mux.HandleFunc("POST /api/v2/dags/sales_ingest/dagRuns", func(w http.ResponseWriter, r *http.Request) {
		json.NewDecoder(r.Body).Decode(started)
		reply(w, map[string]string{"dag_run_id": "manual__3"})
	})
	ts := httptest.NewServer(mux)
	t.Cleanup(ts.Close)
	return ts
}

func TestOf(t *testing.T) {
	ts := fakeAirflow(t, &map[string]any{})
	ps, err := New(ts.URL, "storscale-platform", "secret").Of(context.Background(), "sales", 10)
	if err != nil {
		t.Fatal(err)
	}
	if len(ps) != 1 || ps[0].ID != "sales_ingest" || ps[0].Description != "Land and load orders" {
		t.Fatalf("pipelines: %+v", ps)
	}
	p := ps[0]
	if len(p.Runs) != 2 || p.Runs[0].RequestedBy != "bob" || p.Runs[1].State != "failed" || !p.Runs[1].Ended.IsZero() {
		t.Errorf("runs: %+v", p.Runs)
	}
	if len(p.Tasks) != 2 || p.Tasks[0].ID != "land_orders" || p.Tasks[1].State != "" {
		t.Errorf("the newest run's tasks: %+v", p.Tasks)
	}
	other, err := New(ts.URL, "storscale-platform", "secret").Of(context.Background(), "marketing", 10)
	if err != nil || len(other) != 0 {
		t.Errorf("another project: %+v, %v (want none)", other, err)
	}
}

func TestStart(t *testing.T) {
	started := map[string]any{}
	ts := fakeAirflow(t, &started)
	c := New(ts.URL, "storscale-platform", "secret")
	run, err := c.Start(context.Background(), "sales", "sales_ingest", "bob")
	if err != nil || run != "manual__3" {
		t.Fatalf("start: %q, %v", run, err)
	}
	if conf, _ := started["conf"].(map[string]any); conf["requested_by"] != "bob" {
		t.Errorf("the run's conf: %v, want who asked for it", started)
	}
	if _, err := c.Start(context.Background(), "sales", "someone_elses_dag", "bob"); err == nil || !strings.Contains(err.Error(), "no pipeline") {
		t.Errorf("a pipeline outside the project: %v, want refused", err)
	}
}

func TestWrongPassword(t *testing.T) {
	ts := fakeAirflow(t, &map[string]any{})
	if _, err := New(ts.URL, "storscale-platform", "wrong").Of(context.Background(), "sales", 10); err == nil {
		t.Error("a wrong password: no error")
	}
}
