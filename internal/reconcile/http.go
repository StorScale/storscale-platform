package reconcile

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

var client = &http.Client{Timeout: 30 * time.Second}

// HTTPError is a reply other than 2xx.
type HTTPError struct {
	Method, URL string
	Status      int
	Body        string
}

func (e *HTTPError) Error() string {
	return fmt.Sprintf("%s %s: HTTP %d %s", e.Method, e.URL, e.Status, e.Body)
}

func isStatus(err error, status int) bool {
	he, ok := err.(*HTTPError)
	return ok && he.Status == status
}

// call sends a JSON request (body may be nil) and decodes a JSON reply into out
// (which may be nil). auth sets the request's credentials.
func call(ctx context.Context, method, url string, auth func(*http.Request), body, out any) error {
	var rd io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return err
		}
		rd = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, rd)
	if err != nil {
		return err
	}
	req.Header.Set("Accept", "application/json")
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if auth != nil {
		auth(req)
	}
	res, err := client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(res.Body, 1<<22))
	if res.StatusCode/100 != 2 {
		if len(data) > 300 {
			data = data[:300]
		}
		return &HTTPError{Method: method, URL: url, Status: res.StatusCode, Body: string(data)}
	}
	if out != nil && len(bytes.TrimSpace(data)) > 0 {
		return json.Unmarshal(data, out)
	}
	return nil
}

func decode(res *http.Response, out any) error {
	return json.NewDecoder(io.LimitReader(res.Body, 1<<22)).Decode(out)
}
