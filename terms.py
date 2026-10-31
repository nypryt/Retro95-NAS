"""Win95 NAS - Terms and Conditions.

``TERMS.md`` in the application folder is the single source of truth. This
module loads it, renders a plain-text copy for the setup wizard (Tkinter and
console), and records/checks acceptance in ``data/setup.json``.

Acceptance is stored as three keys next to the other setup values::

    "termsAccepted": true,
    "termsVersion": "1.0",
    "termsAcceptedAt": "2026-10-30T12:34:56"

If ``termsVersion`` no longer matches the current version the wizard asks
again, so a new release can require a fresh acceptance.
"""

from __future__ import annotations

import re
from datetime import datetime
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
TERMS_FILE = BASE_DIR / "TERMS.md"

# Bump this when the published terms change.
TERMS_VERSION = "1.0"
TERMS_EFFECTIVE = "October 30, 2026"

FALLBACK = (
    "Retro 95 NAS - Terms and Conditions (version %s, effective %s)\n"
    "\n"
    "The full text could not be found. It should be in TERMS.md next to this\n"
    "application, and online at the project page.\n"
    "\n"
    "In short: this is an independent project, not affiliated with Microsoft.\n"
    "It is heavily AI-assisted and provided AS IS, without warranty of any\n"
    "kind. You are responsible for your own backups, your network exposure and\n"
    "any Docker or Tailscale actions you take. It is licensed under the\n"
    "PolyForm Noncommercial License 1.0.0.\n"
    "\n"
    "Copyright (c) 2026 Nypr. All rights reserved.\n"
) % (TERMS_VERSION, TERMS_EFFECTIVE)

_plain_cache = None


def markdown() -> str:
    """The raw Markdown terms, or a short fallback if the file is missing."""
    try:
        return TERMS_FILE.read_text(encoding="utf-8")
    except OSError:
        return FALLBACK


def _clean(text: str) -> str:
    text = re.sub(r"!\[[^\]]*\]\([^)]*\)", "", text)          # images / badges
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)  # links
    text = text.replace("**", "")
    text = re.sub(r"(?<!\*)\*(?!\*)", "", text)                 # italics
    text = re.sub(r"[\U0001F000-\U0001FAFF\u2600-\u27BF]", "", text)  # emoji
    return text.strip()


def plain() -> str:
    """A readable plain-text rendering of the terms for dialogs and consoles."""
    global _plain_cache
    if _plain_cache is not None:
        return _plain_cache
    lines = []
    for raw in markdown().splitlines():
        line = raw.rstrip()
        if line.lstrip().startswith("!["):
            continue
        if re.fullmatch(r"\s*-{3,}\s*", line):
            lines.extend(["", "-" * 66, ""])
            continue
        if line.startswith("#"):
            title = _clean(line.lstrip("#"))
            lines.append("")
            lines.append(title)
            lines.append("=" * max(8, min(66, len(title))))
            lines.append("")
            continue
        lines.append(_clean(line))
    text = "\n".join(lines)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    _plain_cache = text + "\n"
    return _plain_cache


def acceptance() -> dict:
    """The setup.json keys that record an acceptance of the current terms."""
    return {
        "termsAccepted": True,
        "termsVersion": TERMS_VERSION,
        "termsAcceptedAt": datetime.now().isoformat(timespec="seconds"),
    }


def is_accepted(config: dict) -> bool:
    """True when this config already accepted the current version of the terms."""
    if not isinstance(config, dict):
        return False
    if not config.get("termsAccepted"):
        return False
    return str(config.get("termsVersion") or "") == TERMS_VERSION
