package reconcile

import (
	"context"
	"net/http"
	"net/url"
)

// Nessie is the catalog's Iceberg REST API.
type Nessie struct {
	URL, Warehouse string
}

func (n *Nessie) prefix(ctx context.Context) (string, error) {
	var cfg struct {
		Defaults  map[string]string `json:"defaults"`
		Overrides map[string]string `json:"overrides"`
	}
	if err := call(ctx, "GET", n.URL+"/iceberg/v1/config?warehouse="+url.QueryEscape(n.Warehouse), nil, nil, &cfg); err != nil {
		return "", err
	}
	if p := cfg.Overrides["prefix"]; p != "" {
		return p, nil
	}
	return cfg.Defaults["prefix"], nil
}

// ensureNamespace creates the namespace when it isn't there.
func (n *Nessie) ensureNamespace(ctx context.Context, namespace string) error {
	prefix, err := n.prefix(ctx)
	if err != nil {
		return err
	}
	base := n.URL + "/iceberg/v1/" + prefix + "/namespaces" // Nessie gives the prefix URL-encoded already
	err = call(ctx, "GET", base+"/"+url.PathEscape(namespace), nil, nil, nil)
	if !isStatus(err, http.StatusNotFound) {
		return err
	}
	err = call(ctx, "POST", base, nil, map[string]any{"namespace": []string{namespace}}, nil)
	if isStatus(err, http.StatusConflict) {
		return nil
	}
	return err
}
