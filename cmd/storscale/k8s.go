package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strings"

	platform "github.com/StorScale/storscale-platform"
)

// The platform on a kind cluster of its own (storscale ... --k8s): the
// Helm chart, deploy/helm/storscale-platform, installed as the release
// "storscale" in the namespace "storscale".
const (
	kindCluster = "storscale"
	kubeContext = "kind-storscale"
	namespace   = "storscale"
	release     = "storscale"
	ociChart    = "oci://ghcr.io/storscale/charts/storscale-platform"
)

// kube is the platform on kind. checkout is the repository the stack is in,
// when it's a checkout's stack (--dir stack): then the images are built from
// it and the chart is its own. Otherwise the published chart is installed, at
// this storscale's version.
type kube struct{ checkout string }

func newKube(st *stack) *kube {
	root := filepath.Dir(st.dir)
	if _, err := os.Stat(filepath.Join(root, "deploy", "helm", "storscale-platform", "Chart.yaml")); err == nil {
		return &kube{checkout: root}
	}
	return &kube{}
}

func need(tools ...string) error {
	var missing []string
	for _, t := range tools {
		if _, err := exec.LookPath(t); err != nil {
			missing = append(missing, t)
		}
	}
	if len(missing) > 0 {
		return fmt.Errorf("--k8s needs %s on the PATH", strings.Join(missing, ", "))
	}
	return nil
}

func run1(name string, args ...string) error {
	c := exec.Command(name, args...)
	c.Stdin, c.Stdout, c.Stderr = os.Stdin, os.Stdout, os.Stderr
	return c.Run()
}

func kubectl(args ...string) error {
	return run1("kubectl", append([]string{"--context", kubeContext, "--namespace", namespace}, args...)...)
}

func helm(args ...string) error {
	return run1("helm", append([]string{"--kube-context", kubeContext, "--namespace", namespace}, args...)...)
}

// script writes one of deploy/kind's files out, to run or to pass to kind.
func script(name string) (string, error) {
	data, err := platform.Kind.ReadFile("deploy/kind/" + name)
	if err != nil {
		return "", err
	}
	f, err := os.CreateTemp("", "storscale-*-"+name)
	if err != nil {
		return "", err
	}
	defer f.Close()
	_, err = f.Write(data)
	return f.Name(), err
}

func (k *kube) up(st *stack) error {
	if err := need("docker", "kind", "kubectl", "helm"); err != nil {
		return err
	}
	if os.Getenv("STORSCALE_PORT") != "" && os.Getenv("STORSCALE_PORT") != "8800" {
		return errors.New("--k8s uses port 8800 (deploy/kind/cluster.yaml maps it)")
	}
	clusters, err := exec.Command("kind", "get", "clusters").Output()
	if err != nil {
		return err
	}
	if !slices.Contains(strings.Fields(string(clusters)), kindCluster) {
		cfg, err := script("cluster.yaml")
		if err != nil {
			return err
		}
		defer os.Remove(cfg)
		if err := run1("kind", "create", "cluster", "--name", kindCluster, "--config", cfg, "--wait", "180s"); err != nil {
			return err
		}
	}
	dns, err := script("dns.sh")
	if err != nil {
		return err
	}
	defer os.Remove(dns)
	c := exec.Command("bash", dns, st.setting("STORSCALE_DOMAIN"), namespace)
	c.Env = append(os.Environ(), "KUBECTL_CONTEXT="+kubeContext)
	c.Stdout, c.Stderr = os.Stdout, os.Stderr
	if err := c.Run(); err != nil {
		return fmt.Errorf("the cluster's DNS: %w", err)
	}

	chart, extra := ociChart, []string{"--version", version()}
	if k.checkout != "" {
		fmt.Println("building the platform's images from", k.checkout)
		if err := run1(filepath.Join(k.checkout, "deploy", "kind", "images.sh"), kindCluster); err != nil {
			return err
		}
		chart, extra = filepath.Join(k.checkout, "deploy", "helm", "storscale-platform"), []string{"--set", "images.tag=dev"}
		run1("helm", "repo", "add", "spark-operator", "https://kubeflow.github.io/spark-operator", "--force-update")
		if err := run1("helm", "dependency", "build", chart); err != nil {
			return err
		}
	}
	args := append([]string{"upgrade", "--install", release, chart, "--create-namespace", "--wait", "--timeout", "30m",
		"--set", "global.domain=" + st.setting("STORSCALE_DOMAIN")}, extra...)
	if err := helm(args...); err != nil {
		return fmt.Errorf("the platform didn't start: see `storscale status --k8s` and `storscale logs --k8s <service>` (%w)", err)
	}
	fmt.Println()
	printURLs(st)
	fmt.Println("\nOn kind, the people's password is in the cluster:")
	fmt.Printf("  kubectl --context %s -n %s get secret storscale-env -o jsonpath='{.data.LAKEHOUSE_USER_PASSWORD}' | base64 -d\n", kubeContext, namespace)
	return nil
}

// test runs the suites asked for (all of them when none are) as `helm
// test`; the ConfigMap storscale-tests says which.
func (k *kube) test(suites []string) error {
	if len(suites) == 0 {
		kubectl("delete", "configmap", "storscale-tests", "--ignore-not-found")
	} else {
		manifest, err := exec.Command("kubectl", "--context", kubeContext, "-n", namespace, "create", "configmap", "storscale-tests",
			"--from-literal=suites="+strings.Join(suites, " "), "--dry-run=client", "-o", "yaml").Output()
		if err != nil {
			return err
		}
		c := exec.Command("kubectl", "--context", kubeContext, "-n", namespace, "apply", "-f", "-")
		c.Stdin, c.Stderr = strings.NewReader(string(manifest)), os.Stderr
		if err := c.Run(); err != nil {
			return err
		}
	}
	return helm("test", release, "--logs", "--timeout", "60m")
}

func (k *kube) do(cmd string, st *stack, args []string, volumes bool) error {
	if err := need("kind", "kubectl", "helm"); err != nil {
		return err
	}
	switch cmd {
	case "up":
		return k.up(st)
	case "status":
		return kubectl("get", "pods,jobs,projects,bucketsclusters")
	case "urls":
		printURLs(st)
		return nil
	case "test":
		return k.test(args)
	case "logs":
		if len(args) == 0 {
			return errors.New("logs --k8s <service ...>: which service's (gateway, keycloak, trino, ...)")
		}
		for _, svc := range args {
			if err := kubectl("logs", "--tail", "100", "--all-containers", "deploy/"+svc); err != nil {
				return err
			}
		}
		return nil
	case "down":
		if volumes {
			return run1("kind", "delete", "cluster", "--name", kindCluster)
		}
		return helm("uninstall", release)
	}
	return fmt.Errorf("unknown command %q (see storscale help)", cmd)
}
