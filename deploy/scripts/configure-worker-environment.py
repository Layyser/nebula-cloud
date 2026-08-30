#!/usr/bin/env python3
"""Atomically update the production Worker/Cloud environment contract.

This utility intentionally never prints secret values. Run it as root because
the production environment files are root-owned and contain credentials.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
import secrets
import tempfile


DEFAULT_WORKER_ENV = Path("/etc/nubols/worker.env")
DEFAULT_CLOUD_ENV = Path("/etc/nubols/cloud.env")


def upsert(path: Path, values: dict[str, str]) -> None:
    stat = path.stat()
    lines = path.read_text(encoding="utf-8").splitlines()
    remaining = dict(values)
    updated: list[str] = []

    for line in lines:
        key, separator, _ = line.partition("=")
        if separator and key in remaining:
            updated.append(f"{key}={remaining.pop(key)}")
        else:
            updated.append(line)

    if remaining:
        if updated and updated[-1]:
            updated.append("")
        updated.extend(f"{key}={value}" for key, value in remaining.items())

    with tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=path.parent,
        prefix=f".{path.name}.",
        delete=False,
    ) as temporary:
        temporary.write("\n".join(updated) + "\n")
        temporary_path = Path(temporary.name)

    try:
        os.chown(temporary_path, stat.st_uid, stat.st_gid)
        os.chmod(temporary_path, stat.st_mode & 0o7777)
        os.replace(temporary_path, path)
    finally:
        temporary_path.unlink(missing_ok=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--browser-image", required=True)
    parser.add_argument("--rotate-token", action="store_true")
    parser.add_argument("--worker-env", type=Path, default=DEFAULT_WORKER_ENV)
    parser.add_argument("--cloud-env", type=Path, default=DEFAULT_CLOUD_ENV)
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    worker_values = {"NEBULA_WORKER_BROWSER_IMAGE": args.browser_image}

    if args.rotate_token:
        token = secrets.token_hex(64)
        worker_values["NEBULA_WORKER_TOKEN"] = token
        upsert(args.cloud_env, {"NEBULA_WORKER_TOKEN": token})

    upsert(args.worker_env, worker_values)
    print("Worker environment updated; no secret values were displayed.")


if __name__ == "__main__":
    main()
