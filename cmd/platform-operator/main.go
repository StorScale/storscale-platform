// platform-operator applies StorScale Platform's projects to the systems they
// live in: Keycloak, Apache Ranger, Buckets and Nessie. It reads projects from
// the store (a Buckets bucket, which platformd writes to; on Kubernetes,
// Project resources) and writes back each project's status.
//
// Configuration comes from the environment:
//
//	PROJECT_STORE                        bucket (the default), or kubernetes: Project resources
//	                                     in the pod's namespace, with a copy kept in the bucket
//	STORE_URL, STORE_BUCKET              the store: Buckets, and the bucket (storscale-platform)
//	BUCKETS_ACCESS_KEY, BUCKETS_SECRET_KEY  Buckets credentials that may make buckets and policies
//	KEYCLOAK_DIRECT_URL, KEYCLOAK_REALM  Keycloak, as the operator reaches it, and the realm
//	OPERATOR_CLIENT_ID, OPERATOR_CLIENT_SECRET  the operator's Keycloak client (a service account)
//	RANGER_URL, RANGER_USER, RANGER_PASSWORD, RANGER_SERVICE  Ranger's admin API, and Trino's service
//	NESSIE_URL, NESSIE_WAREHOUSE         Nessie, and its warehouse
//	PLATFORM_LISTEN                      health checks (:8081)
//
// `platform-operator healthcheck` checks a running operator.
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/StorScale/storscale-platform/internal/reconcile"
	"github.com/StorScale/storscale-platform/internal/store"
)

func main() {
	listen := env("PLATFORM_LISTEN", ":8081")
	if len(os.Args) > 1 && os.Args[1] == "healthcheck" {
		c := http.Client{Timeout: 3 * time.Second}
		res, err := c.Get("http://127.0.0.1" + listen[strings.LastIndex(listen, ":"):] + "/healthz")
		if err != nil || res.StatusCode != 200 {
			os.Exit(1)
		}
		return
	}
	log := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	missing := []string{}
	need := func(k string) string {
		v := os.Getenv(k)
		if v == "" {
			missing = append(missing, k)
		}
		return v
	}
	storeURL, accessKey, secretKey := need("STORE_URL"), need("BUCKETS_ACCESS_KEY"), need("BUCKETS_SECRET_KEY")
	kcURL, kcSecret := need("KEYCLOAK_DIRECT_URL"), need("OPERATOR_CLIENT_SECRET")
	rangerURL, rangerPassword := need("RANGER_URL"), need("RANGER_PASSWORD")
	nessieURL := need("NESSIE_URL")
	if len(missing) > 0 {
		log.Error("configuration", "error", "set "+strings.Join(missing, ", "))
		os.Exit(2)
	}
	// Projects: in the bucket (Compose), or Project resources with a copy in
	// the bucket for the services that read them there (Kubernetes).
	st, err := store.Open(os.Getenv("PROJECT_STORE"), storeURL, accessKey, secretKey, env("STORE_BUCKET", "storscale-platform"))
	if err != nil {
		log.Error("store", "error", err)
		os.Exit(2)
	}
	r := &reconcile.Reconciler{
		Keycloak: &reconcile.Keycloak{URL: strings.TrimRight(kcURL, "/"), Realm: env("KEYCLOAK_REALM", "lakehouse"),
			ClientID: env("OPERATOR_CLIENT_ID", "platform-operator"), Secret: kcSecret},
		Ranger: &reconcile.Ranger{URL: strings.TrimRight(rangerURL, "/"), User: env("RANGER_USER", "admin"),
			Password: rangerPassword, Service: env("RANGER_SERVICE", "lakehouse")},
		Buckets:            &reconcile.Buckets{URL: strings.TrimRight(storeURL, "/"), AccessKey: accessKey, SecretKey: secretKey},
		Nessie:             &reconcile.Nessie{URL: strings.TrimRight(nessieURL, "/"), Warehouse: env("NESSIE_WAREHOUSE", "warehouse")},
		Store:              st,
		Log:                log,
		RangerUserPassword: rangerPassword,
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	go func() {
		mux := http.NewServeMux()
		mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, _ *http.Request) { fmt.Fprintln(w, "ok") })
		hs := &http.Server{Addr: listen, Handler: mux, ReadHeaderTimeout: 5 * time.Second}
		go func() { <-ctx.Done(); hs.Close() }()
		hs.ListenAndServe()
	}()
	log.Info("platform-operator running")
	r.Run(ctx, 3*time.Second, time.Minute, 10*time.Second)
}

func env(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}
