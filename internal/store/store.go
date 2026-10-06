// Package store keeps projects, and the operator's status for each, as JSON
// objects in a Buckets bucket: projects/<name>.json and status/<name>.json.
// platformd writes projects; the operator writes status. (On Kubernetes, the
// Project custom resource will take this place.)
package store

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"strings"

	"github.com/minio/minio-go/v7"
	"github.com/minio/minio-go/v7/pkg/credentials"

	"github.com/StorScale/storscale-platform/internal/project"
)

type Store struct {
	c      *minio.Client
	bucket string
}

// New connects to the bucket at endpoint (http://buckets:9000), with these keys.
func New(endpoint, accessKey, secretKey, bucket string) (*Store, error) {
	u, err := url.Parse(endpoint)
	if err != nil || u.Host == "" {
		return nil, errors.New("store endpoint " + endpoint + " isn't a URL")
	}
	c, err := minio.New(u.Host, &minio.Options{Creds: credentials.NewStaticV4(accessKey, secretKey, ""),
		Secure: u.Scheme == "https", Region: "us-east-1", BucketLookup: minio.BucketLookupPath})
	if err != nil {
		return nil, err
	}
	return &Store{c: c, bucket: bucket}, nil
}

func (s *Store) Projects(ctx context.Context) ([]*project.Project, error) {
	var out []*project.Project
	err := s.each(ctx, "projects/", func(data []byte) error {
		p, err := project.Parse(data)
		if err != nil {
			return err
		}
		out = append(out, p)
		return nil
	})
	return out, err
}

// Project is nil, with no error, when there's no such project.
func (s *Store) Project(ctx context.Context, name string) (*project.Project, error) {
	data, err := s.get(ctx, "projects/"+name+".json")
	if data == nil || err != nil {
		return nil, err
	}
	return project.Parse(data)
}

func (s *Store) PutProject(ctx context.Context, p *project.Project) error {
	return s.put(ctx, "projects/"+p.Metadata.Name+".json", p)
}

func (s *Store) DeleteProject(ctx context.Context, name string) error {
	return s.c.RemoveObject(ctx, s.bucket, "projects/"+name+".json", minio.RemoveObjectOptions{})
}

func (s *Store) Statuses(ctx context.Context) ([]*project.Status, error) {
	var out []*project.Status
	err := s.each(ctx, "status/", func(data []byte) error {
		var st project.Status
		if err := json.Unmarshal(data, &st); err != nil {
			return err
		}
		out = append(out, &st)
		return nil
	})
	return out, err
}

func (s *Store) Status(ctx context.Context, name string) (*project.Status, error) {
	data, err := s.get(ctx, "status/"+name+".json")
	if data == nil || err != nil {
		return nil, err
	}
	var st project.Status
	return &st, json.Unmarshal(data, &st)
}

func (s *Store) PutStatus(ctx context.Context, st *project.Status) error {
	return s.put(ctx, "status/"+st.Name+".json", st)
}

func (s *Store) DeleteStatus(ctx context.Context, name string) error {
	return s.c.RemoveObject(ctx, s.bucket, "status/"+name+".json", minio.RemoveObjectOptions{})
}

func (s *Store) each(ctx context.Context, prefix string, f func([]byte) error) error {
	for obj := range s.c.ListObjects(ctx, s.bucket, minio.ListObjectsOptions{Prefix: prefix}) {
		if obj.Err != nil {
			return obj.Err
		}
		if !strings.HasSuffix(obj.Key, ".json") {
			continue
		}
		data, err := s.get(ctx, obj.Key)
		if err != nil {
			return err
		}
		if data != nil {
			if err := f(data); err != nil {
				return errors.New(obj.Key + ": " + err.Error())
			}
		}
	}
	return nil
}

// get is nil, with no error, when there's no such object.
func (s *Store) get(ctx context.Context, key string) ([]byte, error) {
	obj, err := s.c.GetObject(ctx, s.bucket, key, minio.GetObjectOptions{})
	if err != nil {
		return nil, err
	}
	defer obj.Close()
	data, err := io.ReadAll(obj)
	if err != nil {
		if minio.ToErrorResponse(err).Code == "NoSuchKey" {
			return nil, nil
		}
		return nil, err
	}
	return data, nil
}

func (s *Store) put(ctx context.Context, key string, v any) error {
	data, err := json.MarshalIndent(v, "", "  ")
	if err != nil {
		return err
	}
	_, err = s.c.PutObject(ctx, s.bucket, key, bytes.NewReader(data), int64(len(data)),
		minio.PutObjectOptions{ContentType: "application/json"})
	return err
}
