#!/usr/bin/env python3
"""Build and verify a reproducible Chrome Web Store ZIP; Python stdlib only."""
import hashlib
import html
import json
from pathlib import Path
import re
import shutil
import struct
import zipfile

ROOT = Path(__file__).resolve().parents[1]
EXTENSION = ROOT / "extension"


def build():
    # The packaged, offline policy is generated from the same text used for hosting.
    policy = (ROOT / "docs/PRIVACY.md").read_text()
    blocks = []
    for block in policy.strip().split("\n\n"):
        level = len(block) - len(block.lstrip("#"))
        tag = f"h{level}" if level in (1, 2) else "p"
        text = html.escape(block.lstrip("# ") if level else block).replace("\n", " ")
        blocks.append(f"<{tag}>{text}</{tag}>")
    (EXTENSION / "privacy.html").write_text(
        '<!doctype html>\n<html lang="en"><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        '<title>FrameDeck privacy policy</title>\n'
        '<style>body{max-width:720px;margin:40px auto;padding:0 24px;'
        'font:16px/1.65 system-ui,sans-serif;color:#17251f;background:#f7faf5}'
        'h1,h2{line-height:1.2}h2{margin-top:32px}p{overflow-wrap:anywhere}'
        'a{color:#006b50}</style>\n<main>' + "\n".join(blocks) +
        '<p><a href="https://github.com/elbrielle/FrameDeck/issues" '
        'target="_blank" rel="noopener">FrameDeck support</a></p></main></html>\n'
    )
    manifest = json.loads((EXTENSION / "manifest.json").read_text())
    assert manifest.get("manifest_version") == 3, "Manifest V3 is required"
    assert 0 < len(manifest["description"]) <= 132, "Description must be 1–132 characters"
    version = manifest["version"]
    assert re.fullmatch(r"(?:0|[1-9]\d{0,4})(?:\.(?:0|[1-9]\d{0,4})){0,3}", version), "Invalid version"
    assert all(int(part) <= 65535 for part in version.split(".")), "Version component is too large"
    assert any(int(part) for part in version.split(".")), "Version cannot be all zeroes"
    files = {}
    for path in sorted(EXTENSION.rglob("*")):
        relative = path.relative_to(EXTENSION)
        if any(part.startswith(".") or part == "__pycache__" for part in relative.parts):
            continue
        assert not path.is_symlink(), f"Symlinks are not packaged: {relative}"
        if path.is_file():
            assert path.suffix.lower() in {".js", ".json", ".html", ".css", ".png", ".svg", ".woff", ".woff2", ".ttf", ".txt"}, f"Unexpected extension file: {relative}"
            files[relative.as_posix()] = path.read_bytes()
    required = [manifest["background"]["service_worker"], manifest["side_panel"]["default_path"]]
    required += list(manifest.get("icons", {}).values())
    required += list(manifest["action"].get("default_icon", {}).values())
    for script in manifest.get("content_scripts", []):
        required += script.get("js", []) + script.get("css", [])
    for name in required:
        assert name in files, f"Missing manifest resource: {name}"
    assert "128" in manifest.get("icons", {}), "A 128px icon is required"
    for size, name in manifest["icons"].items():
        png = files[name]
        assert png.startswith(b"\x89PNG\r\n\x1a\n"), f"Icon must be PNG: {name}"
        assert struct.unpack(">II", png[16:24]) == (int(size), int(size)), f"Wrong icon dimensions: {name}"
    files["LICENSE.txt"] = (ROOT / "LICENSE").read_bytes()
    destination = ROOT / "dist" / f"FrameDeck-{version}.zip"
    destination.parent.mkdir(exist_ok=True)
    with zipfile.ZipFile(destination, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
        for name, contents in sorted(files.items()):
            info = zipfile.ZipInfo(name, date_time=(2020, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = 0o100644 << 16
            info.compress_type = zipfile.ZIP_DEFLATED
            archive.writestr(info, contents, compresslevel=9)
    with zipfile.ZipFile(destination) as archive:
        assert archive.testzip() is None, "Corrupt ZIP entry"
        assert set(archive.namelist()) == set(files), "Unexpected ZIP contents"
        assert json.loads(archive.read("manifest.json")) == manifest, "Manifest must be at ZIP root"
        for name, contents in files.items():
            assert archive.read(name) == contents, f"Packaged content differs: {name}"
    digest = hashlib.sha256(destination.read_bytes()).hexdigest()
    destination.with_suffix(".zip.sha256").write_text(f"{digest}  {destination.name}\n")
    print(f"Verified {destination} ({len(files)} files, {destination.stat().st_size:,} bytes)")
    print(f"SHA-256 {digest}")

    bundle = destination.parent / f"FrameDeck-{version}-submission"
    bundle.mkdir(exist_ok=True)
    shutil.copy2(destination, bundle / destination.name)
    listing = (ROOT / "docs/STORE_LISTING.md").read_text()
    sections = dict(re.findall(r"^## ([^\n]+)\n\n(.*?)(?=^## |\Z)", listing, re.M | re.S))
    for heading, filename in {
        "Detailed description": "listing-description.txt",
        "Short description": "short-description.txt",
        "Single purpose": "single-purpose.txt",
        "Permission justifications": "permissions.md",
        "Reviewer test instructions": "reviewer-instructions.txt",
    }.items():
        (bundle / filename).write_text(sections[heading].strip() + "\n")
    assert sections["Short description"].strip() == manifest["description"], "Listing and manifest descriptions differ"
    assert len(sections["Reviewer test instructions"].strip()) <= 500, "Reviewer instructions exceed the dashboard's 500-character limit"
    for name in ["PRIVACY.md", "STORE_LISTING.md", "RELEASE.md", "QA.md", "SUBMISSION.md", "SUPPORT.md"]:
        shutil.copy2(ROOT / "docs" / name, bundle / name)
    shutil.copy2(EXTENSION / "privacy.html", bundle / "privacy.html")
    shutil.copy2(ROOT / "CHANGELOG.md", bundle / "CHANGELOG.md")
    assets = ROOT / "store_assets" / f"v{version}"
    (bundle / "store-assets").mkdir(exist_ok=True)
    for name, size in {
        "icon_128x128.png": (128, 128), "promo_tile_440x280.png": (440, 280),
        "marquee_1400x560.png": (1400, 560), "screenshot-setup.png": (1280, 800),
        "screenshot-playing.png": (1280, 800),
    }.items():
        assert struct.unpack(">II", (assets / name).read_bytes()[16:24]) == size, f"Wrong store asset size: {name}"
        shutil.copy2(assets / name, bundle / "store-assets" / name)
    (bundle / "START-HERE.md").write_text(
        f"# FrameDeck {version} submission files\n\n"
        f"Upload **{destination.name}** in the Chrome Web Store dashboard. "
        "Do not upload this entire folder as the extension.\n\n"
        "Price: free to install and use; no in-app purchases.\n\n"
        "Use `listing-description.txt` for the public description, `single-purpose.txt` "
        "and `permissions.md` for the privacy fields, and `reviewer-instructions.txt` "
        "for the reviewer. Upload the images in `store-assets` individually.\n\n"
        "Read `SUBMISSION.md` for the verified dashboard status and remaining release steps. "
        "These files alone do not establish review approval or extension publication.\n\n"
        f"Package SHA-256: `{digest}`\n"
    )
    inventory = []
    for file in sorted(bundle.rglob("*")):
        if file.is_file() and file.name != "SHA256SUMS.txt":
            inventory.append(f"{hashlib.sha256(file.read_bytes()).hexdigest()}  {file.relative_to(bundle).as_posix()}")
    (bundle / "SHA256SUMS.txt").write_text("\n".join(inventory) + "\n")
    print(f"Staged submission folder: {bundle}")


if __name__ == "__main__":
    build()
