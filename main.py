#!/usr/bin/env python3
"""Walk a GCS bucket for llm-d-benchmark reports, write them as Prism-readable
YAML, and launch the Prism dev server pointed at them. Config via env vars:
GCP_PROJECT and GCS_BUCKET (required), GCS_PREFIX (optional)."""

import json
import os
import re
import socket
import subprocess
import sys
from pathlib import Path

import yaml

try:
    from google.cloud import storage
except ImportError:
    storage = None

def main():
    project, bucket, prefix = (os.environ.get(k, "") for k in ("GCP_PROJECT", "GCS_BUCKET", "GCS_PREFIX"))
    if not project or not bucket:
        sys.exit("ERROR: GCP_PROJECT and GCS_BUCKET must be set in the environment.")
    if storage is None:
        sys.exit("ERROR: pip install google-cloud-storage pyyaml")

    out = (Path(__file__).parent / "prism_upload").resolve()
    out.mkdir(parents=True, exist_ok=True)

    matched = written = 0
    skipped = []
    print(f"Scanning gs://{bucket}/{prefix} ...", file=sys.stderr)
    for blob in storage.Client(project=project).list_blobs(bucket, prefix=prefix or None, match_glob="**/logs/pod_logs/llmd_benchmark_report.json"):
        run_key = blob.name[:-len("/logs/pod_logs/llmd_benchmark_report.json")]
        matched += 1
        try:
            doc = json.loads(blob.download_as_text())
            assert isinstance(doc, dict), "not a JSON object"
            if str(doc.get("version")) == "0.2.1":  # additive superset; Prism wants a strict 0.2
                doc["version"] = "0.2"
            assert str(doc.get("version")) == "0.2", f"version {doc.get('version')!r} not readable by Prism"
            missing = [k for k in ("run", "results") if k not in doc]
            assert not missing, f"missing field(s): {', '.join(missing)}"
            if isinstance(doc["run"], dict):  # unique id per report so Prism treats each as its own run
                doc["run"]["uid"] = run_key
            reason = None
        except AssertionError as e:  # report parsed but is not Prism-readable
            reason = str(e)
        except Exception as e:  # malformed / unreadable report
            reason = f"download/parse error: {e}"
        if reason:
            skipped.append(f"{run_key}\t{reason}")
        else:
            sanitize = lambda run_key: re.sub(r"[^A-Za-z0-9._=-]+", "-", run_key.strip("/").replace("/", "__")) or "report"
            (out / f"benchmark_report_v0.2_{sanitize(run_key)}.yaml").write_text(
                yaml.safe_dump(doc, sort_keys=False, allow_unicode=True))
            written += 1
        print(f"  ... {matched} matched, {written} written, {len(skipped)} skipped", file=sys.stderr)

    if skipped:
        (out / "skipped.tsv").write_text("run_key\treason\n" + "\n".join(skipped) + "\n")
    print(f"\n=== {written} written, {len(skipped)} skipped" + (f" (see {out / 'skipped.tsv'})" if skipped else "") + " ===", file=sys.stderr)

    prism = Path(__file__).parent
    free_port = lambda: (lambda s: (s.bind(("", 0)), s.getsockname()[1])[1])(socket.socket())
    if not (prism / "node_modules").exists():
        subprocess.run(["npm", "install"], cwd=prism, check=True)
    port = free_port()
    env = {**os.environ, "PORT": str(port), "BACKEND_PORT": str(port), "BACKEND_PROFILES_DIR": str(out)}
    print(f"[*] Starting Prism on backend :{port} with profiles from {out}", file=sys.stderr)
    try:
        subprocess.run(["npx", "concurrently", "node server/server.js",
                        f"npx vite --host --port {free_port()}"], cwd=prism, env=env)
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
