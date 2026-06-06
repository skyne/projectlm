#!/usr/bin/env python3
"""Batch image generation for ProjectLM visual assets (Gemini or Pollinations)."""

from __future__ import annotations

import argparse
import os
import sys
import time
import urllib.parse
import urllib.request
from io import BytesIO
from pathlib import Path

import yaml
from dotenv import load_dotenv
from PIL import Image

from normalize import normalize_image
from register_catalog import register_asset

ROOT = Path(__file__).resolve().parents[2]
STYLE_GUIDE = ROOT / "configs" / "asset_style_guide.txt"
PROMPTS_PATH = Path(__file__).parent / "prompts.yaml"
PART_DEFS_PATH = Path(__file__).parent / "part_defs.yaml"
SCRATCH_DIR = Path(__file__).parent / "output" / "_scratch"
PUBLIC_ASSETS = ROOT / "viewer" / "public" / "assets"

# Free tier: ~10 RPM — stay under with a small delay between calls.
RATE_LIMIT_SEC = 6.5


def load_style() -> str:
    return STYLE_GUIDE.read_text(encoding="utf-8").strip()


def load_part_defs() -> dict:
    if not PART_DEFS_PATH.exists():
        return {}
    return yaml.safe_load(PART_DEFS_PATH.read_text(encoding="utf-8")) or {}


def resolve_part_desc(job: dict, part_defs: dict) -> str:
    category = job["category"]
    part_id = job["part_id"]
    bucket = part_defs.get(category, {})
    entry = bucket.get(part_id, {})
    if job.get("layer_type") == "chassis_base":
        return entry.get("bare", entry.get("part", f"{part_id} chassis"))
    return entry.get("part", f"{part_id} component")


def load_jobs(set_name: str) -> list[dict]:
    data = yaml.safe_load(PROMPTS_PATH.read_text(encoding="utf-8"))
    if set_name == "assembly":
        jobs = data.get("assembly", []) + data.get("assembly_expansion", [])
    else:
        jobs = data.get(set_name, [])
    if not jobs:
        raise SystemExit(f"No jobs in prompts.yaml set '{set_name}'")
    part_defs = load_part_defs()
    resolved: list[dict] = []
    for job in jobs:
        j = dict(job)
        j["part_desc"] = resolve_part_desc(j, part_defs)
        resolved.append(j)
    return resolved


def filter_missing_jobs(jobs: list[dict]) -> list[dict]:
    import json

    catalog_path = ROOT / "configs" / "visual_catalog.json"
    if not catalog_path.exists():
        return jobs
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    missing: list[dict] = []
    for job in jobs:
        category = job["category"]
        part_id = job["part_id"]
        bucket = catalog.get(category, {})
        entry = bucket.get(part_id) if isinstance(bucket, dict) else None
        if not entry:
            missing.append(job)
            continue
        layer = entry.get("layer")
        if not layer or not (ROOT / "viewer" / "public" / layer).exists():
            missing.append(job)
    return missing


def extract_image_bytes_gemini(response) -> bytes:
    if not response.candidates:
        raise RuntimeError("No candidates in Gemini response")
    content = response.candidates[0].content
    if not content or not content.parts:
        raise RuntimeError("No image in Gemini response")
    for part in content.parts:
        if part.inline_data and part.inline_data.data:
            return part.inline_data.data
    raise RuntimeError("No image in Gemini response")


def load_reference_image(chassis_id: str) -> bytes | None:
    catalog_path = ROOT / "configs" / "visual_catalog.json"
    if not catalog_path.exists():
        return None
    import json

    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    entry = catalog.get("chassis", {}).get(chassis_id)
    if not entry:
        return None
    path = ROOT / "viewer" / "public" / entry["layer"]
    if not path.exists():
        return None
    return path.read_bytes()


def generate_gemini(
    client,
    model: str,
    prompt: str,
    scratch_path: Path,
    *,
    aspect_ratio: str | None = None,
    reference_bytes: bytes | None = None,
) -> Path:
    from google.genai import types

    image_config = None
    if aspect_ratio:
        image_config = types.ImageConfig(aspect_ratio=aspect_ratio)

    ref_note = ", +chassis ref" if reference_bytes else ""
    print(f"  → Gemini ({model}{f', {aspect_ratio}' if aspect_ratio else ''}{ref_note})…")

    contents: list = []
    if reference_bytes:
        contents.append(types.Part.from_bytes(data=reference_bytes, mime_type="image/png"))
    contents.append(prompt)

    response = client.models.generate_content(
        model=model,
        contents=contents,
        config=types.GenerateContentConfig(
            response_modalities=["IMAGE"],
            image_config=image_config,
        ),
    )
    raw = extract_image_bytes_gemini(response)
    scratch_path.parent.mkdir(parents=True, exist_ok=True)
    scratch_path.write_bytes(raw)
    Image.open(BytesIO(raw)).verify()
    return scratch_path


def shorten_prompt(prompt: str, max_len: int = 900) -> str:
    """Pollinations encodes the prompt in the URL — keep it short."""
    compact = " ".join(prompt.split())
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 3] + "..."


def generate_pollinations(
    prompt: str,
    scratch_path: Path,
    *,
    width: int,
    height: int,
) -> Path:
    print("  → Pollinations (flux)…")
    short = shorten_prompt(prompt)
    q = urllib.parse.urlencode(
        {
            "width": width,
            "height": height,
            "model": "flux",
            "nologo": "true",
        }
    )
    url = f"https://image.pollinations.ai/prompt/{urllib.parse.quote(short)}?{q}"
    req = urllib.request.Request(
        url,
        headers={"User-Agent": "ProjectLM-AssetGen/1.0"},
    )
    with urllib.request.urlopen(req, timeout=180) as resp:
        raw = resp.read()
    scratch_path.parent.mkdir(parents=True, exist_ok=True)
    scratch_path.write_bytes(raw)
    Image.open(BytesIO(raw)).verify()
    return scratch_path


def generate_one(
    backend: str,
    prompt: str,
    scratch_path: Path,
    *,
    width: int,
    height: int,
    gemini_client=None,
    gemini_model: str = "",
    aspect_ratio: str | None = None,
    reference_bytes: bytes | None = None,
) -> Path:
    if backend == "gemini":
        if gemini_client is None:
            raise RuntimeError("Gemini client not configured")
        return generate_gemini(
            gemini_client,
            gemini_model,
            prompt,
            scratch_path,
            aspect_ratio=aspect_ratio,
            reference_bytes=reference_bytes,
        )
    if backend == "pollinations":
        return generate_pollinations(prompt, scratch_path, width=width, height=height)
    raise ValueError(f"Unknown backend: {backend}")


def asset_rel_path(category: str, part_id: str, digest: str) -> str:
    return f"assets/{category}/{part_id}.{digest}.png"


def run_job(
    backend: str,
    gemini_model: str,
    job: dict,
    style: str,
    *,
    dry_run: bool,
    register: bool,
    gemini_client=None,
) -> None:
    job_id = job["id"]
    category = job["category"]
    part_id = job["part_id"]
    width = int(job.get("width", 1024))
    height = int(job.get("height", 512))
    aspect_ratio = job.get("aspect_ratio")
    stretch = bool(job.get("stretch", False))
    norm_mode = job.get("normalize", "sprite" if job.get("layer_type") == "sprite" else "fit")
    remove_bg = bool(
        job.get(
            "remove_background",
            category in {"chassis", "front_aero", "rear_aero", "wheel_package", "hybrid_system"},
        )
    )
    prompt = job["prompt"].format(style=style, part_desc=job.get("part_desc", ""))

    print(f"\n[{job_id}] {width}×{height}")
    if dry_run:
        print(prompt[:200] + "…")
        return

    reference_bytes = None
    ref_chassis = job.get("reference_chassis")
    if ref_chassis:
        reference_bytes = load_reference_image(ref_chassis)
        if reference_bytes:
            print(f"  ref: chassis/{ref_chassis}")
        if reference_bytes and job.get("layer_type") == "chassis_base":
            prompt = (
                f"{prompt}\n"
                "Match the reference image: identical canvas scale, ground line height, "
                "and wheel arch centers. Only change body shape details as described."
            )

    scratch = SCRATCH_DIR / f"{job_id}.raw.png"
    generate_one(
        backend,
        prompt,
        scratch,
        width=width,
        height=height,
        gemini_client=gemini_client,
        gemini_model=gemini_model,
        aspect_ratio=aspect_ratio,
        reference_bytes=reference_bytes,
    )

    out_dir = PUBLIC_ASSETS / category
    digest = normalize_image(
        scratch,
        out_dir / f"{part_id}.png",
        width=width,
        height=height,
        remove_background=remove_bg,
        stretch=stretch,
        mode=norm_mode,
    )
    rel = asset_rel_path(category, part_id, digest)
    print(f"  ✓ {rel}")

    if register:
        extra: dict = {}
        if job.get("layer_type"):
            extra["layerType"] = job["layer_type"]
        if job.get("slot"):
            extra["slot"] = job["slot"]
        if job.get("socket"):
            extra["socket"] = job["socket"]
        if job.get("z") is not None:
            extra["z"] = int(job["z"])
        if job.get("compatible_chassis"):
            extra["compatibleChassis"] = job["compatible_chassis"]
        if category == "chassis":
            extra.setdefault("classId", job.get("class_id", "Hypercar"))
            extra.setdefault("anchor", {"x": width // 2, "y": int(height * 0.55)})
            extra.setdefault("layerType", "chassis_base")
            extra.setdefault("z", 10)
        register_asset(
            category=category,
            part_id=part_id,
            asset_path=rel,
            width=width,
            height=height,
            extra=extra or None,
        )


def main() -> None:
    load_dotenv(ROOT / ".env")

    parser = argparse.ArgumentParser(description="Generate ProjectLM assets via Gemini")
    parser.add_argument("--set", default="mvp", help="Prompt set in prompts.yaml")
    parser.add_argument(
        "--backend",
        default=os.getenv("IMAGE_GEN_BACKEND", "auto"),
        choices=["auto", "gemini", "pollinations"],
    )
    parser.add_argument("--model", default=os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image"))
    parser.add_argument("--dry-run", action="store_true", help="Print prompts only")
    parser.add_argument("--no-register", action="store_true", help="Skip visual_catalog.json update")
    parser.add_argument("--job", help="Run single job id from the set")
    parser.add_argument(
        "--missing",
        action="store_true",
        help="Only run assembly jobs with no registered asset file yet",
    )
    args = parser.parse_args()

    api_key = os.getenv("GEMINI_API_KEY")
    backend = args.backend
    if backend == "auto":
        backend = "gemini" if api_key else "pollinations"
    if backend == "gemini" and not api_key and not args.dry_run:
        print("GEMINI_API_KEY missing — use --backend pollinations or add .env", file=sys.stderr)
        sys.exit(1)

    style = load_style()
    jobs = load_jobs(args.set)
    if args.job:
        jobs = [j for j in jobs if j["id"] == args.job]
        if not jobs:
            raise SystemExit(f"Job '{args.job}' not found in set '{args.set}'")
    elif args.missing:
        jobs = filter_missing_jobs(jobs)
        if not jobs:
            print("No missing assets for this set.")
            return
        print(f"Missing assets ({len(jobs)}):")
        for job in jobs:
            print(f"  - {job['id']}")

    gemini_client = None
    if api_key and backend == "gemini":
        from google import genai

        gemini_client = genai.Client(api_key=api_key)

    delay = RATE_LIMIT_SEC if backend == "gemini" else 16.0

    for i, job in enumerate(jobs):
        if args.dry_run:
            run_job(backend, args.model, job, style, dry_run=True, register=False)
            continue
        try:
            run_job(
                backend,
                args.model,
                job,
                style,
                dry_run=False,
                register=not args.no_register,
                gemini_client=gemini_client,
            )
        except Exception as exc:
            if backend == "gemini" and args.backend == "auto":
                print(f"  ! Gemini failed ({exc}) — falling back to Pollinations")
                run_job(
                    "pollinations",
                    args.model,
                    job,
                    style,
                    dry_run=False,
                    register=not args.no_register,
                )
                delay = 16.0
            else:
                raise
        if i < len(jobs) - 1:
            time.sleep(delay)

    print("\nDone.")


if __name__ == "__main__":
    main()
