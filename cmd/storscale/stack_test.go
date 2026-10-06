package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestOpenStackWritesTheBuiltInStack(t *testing.T) {
	t.Setenv("XDG_CACHE_HOME", t.TempDir())
	t.Setenv("HOME", t.TempDir()) // os.UserCacheDir on macOS
	st, err := openStack("")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range []string{"compose.yaml", ".env", "gateway/Caddyfile", "tests/run.py", "keycloak/realm.json"} {
		if _, err := os.Stat(filepath.Join(st.dir, f)); err != nil {
			t.Errorf("%s: %v", f, err)
		}
	}
	again, err := openStack("")
	if err != nil || again.dir != st.dir {
		t.Fatalf("second open: %v, %q (want %q)", err, again.dir, st.dir)
	}
	if got := st.setting("STORSCALE_PORT"); got != "8800" {
		t.Errorf("STORSCALE_PORT from .env = %q, want 8800", got)
	}
	t.Setenv("STORSCALE_PORT", "9999")
	if got := st.setting("STORSCALE_PORT"); got != "9999" {
		t.Errorf("STORSCALE_PORT from the environment = %q, want 9999", got)
	}
}

func TestOpenStackDir(t *testing.T) {
	if _, err := openStack(t.TempDir()); err == nil {
		t.Error("a directory without compose.yaml was accepted")
	}
	st, err := openStack("../../stack")
	if err != nil {
		t.Fatal(err)
	}
	if !filepath.IsAbs(st.dir) {
		t.Errorf("dir %q isn't absolute", st.dir)
	}
}
