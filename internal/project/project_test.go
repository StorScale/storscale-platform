package project

import (
	"strings"
	"testing"
)

const sales = `{
  "apiVersion": "platform.storscale.io/v1alpha1", "kind": "Project",
  "metadata": {"name": "sales"},
  "spec": {
    "members": [{"group": "engineers", "role": "editor"}, {"group": "analysts", "role": "reader"}],
    "tables": {"readers": {"tables": ["orders"],
                           "rowFilters": [{"table": "orders", "filter": "region = 'EU'"}],
                           "masks": [{"table": "orders", "column": "card_number", "type": "MASK_SHOW_LAST_4"}]}},
    "files": {},
    "pipelines": {"serviceAccount": "airflow-pipelines"}
  }
}`

func TestParseFillsInDefaults(t *testing.T) {
	p, err := Parse([]byte(sales))
	if err != nil {
		t.Fatal(err)
	}
	if p.Spec.Tables.Catalog != "iceberg" || p.Spec.Tables.Namespace != "sales" || p.Spec.Files.Bucket != "sales" {
		t.Errorf("defaults: %+v %+v", p.Spec.Tables, p.Spec.Files)
	}
	if g := p.Groups(); strings.Join(g, ",") != "sales-readers,sales-editors,sales-pipelines" {
		t.Errorf("groups: %v", g)
	}
}

func TestADashedNameMakesAnIdentifierNamespace(t *testing.T) {
	p, err := Parse([]byte(strings.Replace(sales, `"name": "sales"`, `"name": "sales-eu"`, 1)))
	if err != nil {
		t.Fatal(err)
	}
	if p.Spec.Tables.Namespace != "sales_eu" || p.Spec.Files.Bucket != "sales-eu" {
		t.Errorf("namespace %q, bucket %q", p.Spec.Tables.Namespace, p.Spec.Files.Bucket)
	}
}

func TestValidateSaysEverythingThatsWrong(t *testing.T) {
	_, err := Parse([]byte(`{"metadata": {"name": "X"}, "spec": {
	  "members": [{"group": "a", "user": "b", "role": "owner"}],
	  "tables": {"namespace": "Bad Name", "readers": {"masks": [{"table": "t", "column": "c", "type": "SCRAMBLE"}]}}}}`))
	if err == nil {
		t.Fatal("accepted")
	}
	for _, want := range []string{`name "X"`, "not both", `role "owner"`, `namespace "Bad Name"`, `mask type "SCRAMBLE"`} {
		if !strings.Contains(err.Error(), want) {
			t.Errorf("error %q doesn't mention %s", err, want)
		}
	}
	if _, err := Parse([]byte(`{"metadata": {"name": "sales"}, "spec": {"members": [], "surprise": 1}}`)); err == nil ||
		!strings.Contains(err.Error(), "surprise") {
		t.Errorf("an unknown field: %v", err)
	}
}

func TestBucketsPolicies(t *testing.T) {
	p, _ := Parse([]byte(sales))
	pol := p.BucketsPolicies()
	if len(pol) != 3 {
		t.Fatalf("policies: %v", pol)
	}
	if got := pol["sales-readers"][1].Action; len(got) != 1 || got[0] != "s3:GetObject" {
		t.Errorf("readers only read: %v", got)
	}
	if got := pol["sales-pipelines"][2].Resource[0]; got != "arn:aws:s3:::sales/landing/*" {
		t.Errorf("pipelines write landing/ only: %v", got)
	}
}

func TestRangerPolicies(t *testing.T) {
	p, _ := Parse([]byte(sales))
	byName := map[string]RangerPolicy{}
	for _, rp := range p.RangerPolicies() {
		if !strings.HasPrefix(rp.Name, "project:sales:") {
			t.Errorf("policy %q doesn't carry the project's prefix", rp.Name)
		}
		key := ""
		for _, k := range []string{"catalog", "schema", "table", "column"} {
			if r, ok := rp.Resources[k]; ok {
				key += k + "=" + r.Values[0] + " "
			}
		}
		key += string(rune('0' + rp.PolicyType))
		for _, other := range byName {
			if other.Name == rp.Name {
				t.Errorf("two policies called %q", rp.Name)
			}
		}
		byName[key] = rp
	}
	if len(byName) != 5 {
		t.Fatalf("want namespace, tables, read:orders, a mask and a row filter, one per resource: %v", byName)
	}
	tables := byName["catalog=iceberg schema=sales table=* column=* 0"]
	for _, it := range tables.PolicyItems {
		if it.Groups[0] == "sales-readers" {
			t.Error("readers limited to orders must not get every table")
		}
	}
	if f := byName["catalog=iceberg schema=sales table=orders 2"]; f.RowFilterPolicyItems[0].RowFilterInfo.FilterExpr != "region = 'EU'" {
		t.Errorf("row filter: %+v", f)
	}
	if m := byName["catalog=iceberg schema=sales table=orders column=card_number 1"]; m.DataMaskPolicyItems[0].DataMaskInfo.DataMaskType != "MASK_SHOW_LAST_4" {
		t.Errorf("mask: %+v", m)
	}
}

func TestHashFollowsTheSpec(t *testing.T) {
	a, _ := Parse([]byte(sales))
	b, _ := Parse([]byte(strings.Replace(sales, "EU", "US", 1)))
	if a.Hash() == b.Hash() {
		t.Error("a changed spec kept its hash")
	}
	c, _ := Parse([]byte(sales))
	if a.Hash() != c.Hash() {
		t.Error("the same spec changed its hash")
	}
}
