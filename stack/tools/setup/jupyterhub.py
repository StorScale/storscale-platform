"""Configure the notebooks' Buckets: everyone's own files.

  - `home`: everyone's own files, under home/<their Keycloak username>/. One
    policy statement covers everyone, through the policy variable
    ${jwt:preferred_username}, so nobody can read anyone else's prefix.

The policies are named after the Keycloak groups people sign in with
(MINIO_IDENTITY_OPENID_CLAIM_NAME=groups), so a person's groups are their
permissions. A project's files are the project's (its bucket, and the
policies of its groups): the platform operator makes those. There are no
service accounts: notebooks reach Buckets as the person who signed in. Safe
to run again.
"""
from lakekit import bucket_rw, log, setup_buckets

ME = "${jwt:preferred_username}"


def own_home():
    """Read and write home/<username>/, list only that prefix."""
    return [
        {"Effect": "Allow", "Action": ["s3:ListBucket"], "Resource": ["arn:aws:s3:::home"],
         "Condition": {"StringLike": {"s3:prefix": [f"{ME}/*", ME]}}},
        {"Effect": "Allow", "Action": ["s3:GetObject", "s3:PutObject", "s3:DeleteObject",
                                       "s3:AbortMultipartUpload", "s3:ListMultipartUploadParts"],
         "Resource": [f"arn:aws:s3:::home/{ME}/*"]},
    ]


if __name__ == "__main__":
    setup_buckets(buckets=["home"],
                  # The policies the lakehouse made for these groups, plus their homes.
                  policies={"analysts": bucket_rw("scratch") + own_home(),
                            "engineers": bucket_rw("scratch") + own_home()},
                  accounts=[])
    log("done")
