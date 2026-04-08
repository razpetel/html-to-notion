#!/usr/bin/env python3
"""
HTML-to-Notion Markdown converter.

Converts rich HTML documents into Notion-compatible Markdown, extracting
Mermaid diagrams and registering CSS-heavy components for screenshotting.

Auto-detects element types by structural/style heuristics rather than
hardcoded CSS class names.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from typing import Optional

from bs4 import BeautifulSoup, NavigableString, Tag

# ---------------------------------------------------------------------------
# Heuristic class-name sets (used for auto-detection)
# ---------------------------------------------------------------------------
_CALLOUT_CLASSES = frozenset([
    "callout", "alert", "admonition", "notice", "warning",
    "note", "tip", "info", "danger", "success", "hint",
])
_CALLOUT_EMOJI = {
    "success": "\u2705",
    "danger": "\U0001f6a8",
    "warning": "\u26a0\ufe0f",
    "warn": "\u26a0\ufe0f",
    "tip": "\U0001f4a1",
    "hint": "\U0001f4a1",
    "insight": "\U0001f4a1",
    "info": "\u2139\ufe0f",
    "note": "\U0001f4cc",
}

# ---------------------------------------------------------------------------
# Inline text extraction
# ---------------------------------------------------------------------------

def inline_text(el: Tag) -> str:
    """Recursively extract text with inline Markdown formatting."""
    if isinstance(el, NavigableString):
        return str(el)
    if not isinstance(el, Tag):
        return ""
    parts: list[str] = []
    for ch in el.children:
        if isinstance(ch, NavigableString):
            parts.append(str(ch))
        elif ch.name in ("strong", "b"):
            parts.append(f"**{inline_text(ch)}**")
        elif ch.name in ("em", "i"):
            parts.append(f"*{inline_text(ch)}*")
        elif ch.name == "code":
            parts.append(f"`{ch.get_text()}`")
        elif ch.name == "a":
            parts.append(f"[{inline_text(ch)}]({ch.get('href', '')})")
        elif ch.name == "br":
            parts.append("\n")
        elif ch.name == "span":
            cls = ch.get("class", [])
            if "badge" in cls:
                parts.append(f"[{ch.get_text().strip()}]")
            else:
                parts.append(inline_text(ch))
        else:
            parts.append(inline_text(ch))
    return "".join(parts)


# ---------------------------------------------------------------------------
# GFM table conversion
# ---------------------------------------------------------------------------

def table_to_gfm(table: Tag) -> str:
    """Convert an HTML <table> to a GFM pipe table."""
    rows: list[list[str]] = []
    for tr in table.find_all("tr"):
        cells = []
        for td in tr.find_all(["td", "th"]):
            t = re.sub(r"\s+", " ", inline_text(td).strip()).replace("|", "\\|")
            cells.append(t)
        if cells:
            rows.append(cells)
    if not rows:
        return ""
    mx = max(len(r) for r in rows)
    for r in rows:
        r.extend([""] * (mx - len(r)))
    lines = [
        "| " + " | ".join(rows[0]) + " |",
        "| " + " | ".join(["---"] * mx) + " |",
    ]
    for row in rows[1:]:
        lines.append("| " + " | ".join(row) + " |")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Heuristic helpers
# ---------------------------------------------------------------------------

def _classes(el: Tag) -> list[str]:
    """Return the class list of an element (always a list)."""
    return el.get("class", [])


def _has_any_class(el: Tag, names: frozenset[str]) -> bool:
    """Return True if the element has any class whose name is in *names*."""
    return bool(set(_classes(el)) & names)


def _class_contains(el: Tag, substr: str) -> bool:
    """Return True if any class name contains *substr*."""
    return any(substr in c for c in _classes(el))


def _is_mermaid(el: Tag) -> bool:
    """Detect Mermaid diagram containers."""
    if el.name in ("pre", "div") and _class_contains(el, "mermaid"):
        return True
    # Also match a wrapper div that contains a mermaid pre/div
    if el.name == "div":
        child = el.find(["pre", "div"], class_=lambda c: c and any("mermaid" in x for x in (c if isinstance(c, list) else [c])))
        if child:
            return True
    return False


def _is_callout(el: Tag) -> bool:
    """Detect callout / admonition / alert boxes."""
    if el.name != "div":
        return False
    return _has_any_class(el, _CALLOUT_CLASSES)


def _is_progress_bar(el: Tag) -> bool:
    """Detect progress bars: divs with multiple child spans/divs that have background-color and flex/width styles."""
    if el.name != "div":
        return False
    children = [c for c in el.find_all(["span", "div"], recursive=False)]
    if len(children) < 2:
        return False
    styled = 0
    for c in children:
        s = c.get("style", "") or ""
        if ("background" in s or "background-color" in s) and ("width" in s or "flex" in s):
            styled += 1
    return styled >= 2


def _is_stat_cards(el: Tag) -> bool:
    """Detect stat-card containers: repeating children with value+description."""
    if el.name != "div":
        return False
    direct_divs = el.find_all("div", recursive=False)
    if len(direct_divs) < 2:
        return False
    pairs = 0
    for d in direct_divs:
        inner = d.find_all(["div", "span", "p", "h2", "h3", "h4"], recursive=False)
        if len(inner) >= 2:
            pairs += 1
    return pairs >= 2 and pairs == len(direct_divs)


def _is_timeline(el: Tag) -> bool:
    """Detect timeline containers: chronologically-ordered items with date/title/body."""
    if el.name != "div":
        return False
    if _class_contains(el, "timeline"):
        return True
    items = el.find_all("div", recursive=False)
    if len(items) < 3:
        return False
    dated = 0
    for it in items:
        has_date = bool(it.find(["time", "span", "div"], string=re.compile(r"\d{4}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", re.I)))
        if has_date:
            dated += 1
    return dated >= len(items) * 0.6


def _is_hero(el: Tag) -> bool:
    """Detect hero sections: <header> or large top-of-page sections with gradient/dark background."""
    if el.name == "header":
        return True
    if el.name in ("div", "section"):
        style = el.get("style", "") or ""
        if ("gradient" in style or "background" in style) and el.find("h1"):
            return True
    return False


def _is_code_block(el: Tag) -> bool:
    """Detect fenced code blocks: <pre><code> or standalone <pre>."""
    if el.name != "pre":
        return False
    if _class_contains(el, "mermaid"):
        return False
    return True


# ---------------------------------------------------------------------------
# Converter class
# ---------------------------------------------------------------------------

class HTMLToMarkdownConverter:
    """Stateful converter that walks an HTML tree and produces Markdown."""

    def __init__(self, output_dir: str):
        self.output_dir = output_dir
        self.mermaid_dir = os.path.join(output_dir, "mermaid_sources")
        self.mermaid_count = 0
        self.image_count = 0
        self.table_count = 0
        self.callout_count = 0
        self.screenshot_manifest: list[dict] = []

    # -- screenshot helper --------------------------------------------------

    def _add_screenshot(self, stype: str, selector: Optional[str] = None) -> str:
        self.image_count += 1
        fname = f"{stype}_{self.image_count:02d}.png"
        self.screenshot_manifest.append({
            "type": stype,
            "index": self.image_count,
            "filename": fname,
            "selector": selector,
        })
        return fname

    # -- element processors -------------------------------------------------

    def _process_hero(self, el: Tag) -> str:
        h1 = el.find("h1")
        sub = el.find("p")
        parts: list[str] = []
        if h1:
            parts.append(f"# {h1.get_text().strip()}")
        if sub:
            parts.append(f"\n*{sub.get_text().strip()}*\n")
        # Look for stat-like repeated children
        stat_children = el.find_all("div", recursive=False)
        value_label_pairs = []
        for sc in stat_children:
            inner = sc.find_all(["div", "span"], recursive=False)
            if len(inner) >= 2:
                value_label_pairs.append((inner[0].get_text().strip(), inner[1].get_text().strip()))
        if value_label_pairs:
            vs = [p[0] for p in value_label_pairs]
            ls = [p[1] for p in value_label_pairs]
            parts.append("| " + " | ".join(vs) + " |")
            parts.append("| " + " | ".join(["---"] * len(vs)) + " |")
            parts.append("| " + " | ".join(ls) + " |")
        fn = self._add_screenshot("hero")
        parts.insert(0, f"![Hero banner](images/{fn})\n")
        return "\n".join(parts)

    def _process_mermaid(self, el: Tag) -> str:
        pre = el.find("pre") if el.name == "div" else el
        if pre is None:
            return ""
        src = pre.get_text().strip()
        if not src:
            return ""
        self.mermaid_count += 1
        os.makedirs(self.mermaid_dir, exist_ok=True)
        mmd_path = os.path.join(self.mermaid_dir, f"mermaid_{self.mermaid_count:02d}.mmd")
        with open(mmd_path, "w") as f:
            f.write(src)
        fn = self._add_screenshot("mermaid")
        return f"```mermaid\n{src}\n```\n\n*Fallback image: ![Diagram](images/{fn})*"

    def _process_callout(self, el: Tag) -> str:
        self.callout_count += 1
        cls = _classes(el)
        emoji = "\U0001f4cc"  # default pin
        for c in cls:
            if c in _CALLOUT_EMOJI:
                emoji = _CALLOUT_EMOJI[c]
                break
        t = inline_text(el).strip()
        lines = t.split("\n")
        out_lines = []
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
            if i == 0:
                out_lines.append(f"> {emoji} {line}")
            else:
                out_lines.append(f"> {line}")
        return "\n".join(out_lines)

    def _process_progress_bar(self, el: Tag) -> str:
        segs = [s.get_text().strip() for s in el.find_all(["span", "div"], recursive=False) if s.get_text().strip()]
        fn = self._add_screenshot("progress_bar")
        return f"![Progress bar](images/{fn})\n\n`{' | '.join(segs)}`"

    def _process_stat_cards(self, el: Tag) -> str:
        cards = el.find_all("div", recursive=False)
        vs: list[str] = []
        ds: list[str] = []
        for c in cards:
            inner = c.find_all(["div", "span", "p", "h2", "h3", "h4"], recursive=False)
            if len(inner) >= 2:
                vs.append(inner[0].get_text().strip())
                ds.append(re.sub(r"\s+", " ", inner[1].get_text().strip()))
        fn = self._add_screenshot("stat_cards")
        if vs:
            tbl = "| " + " | ".join(vs) + " |\n"
            tbl += "| " + " | ".join(["---"] * len(vs)) + " |\n"
            tbl += "| " + " | ".join(ds) + " |"
            return f"![Stat cards](images/{fn})\n\n{tbl}"
        return f"![Stat cards](images/{fn})"

    def _process_timeline(self, el: Tag) -> str:
        fn = self._add_screenshot("timeline")
        items = el.find_all("div", recursive=False)
        lines = [f"![Timeline](images/{fn})\n"]
        for it in items:
            if not isinstance(it, Tag):
                continue
            icls = _classes(it)
            emoji = (
                "\U0001f534" if "fail" in icls
                else "\U0001f7e2" if "success" in icls
                else "\U0001f7e1" if "fix" in icls
                else "\u26aa"
            )
            # Find date, title, body by structure heuristics
            date_el = it.find(["time", "span", "div"], string=re.compile(r"\d{4}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b", re.I))
            children = it.find_all(["div", "span", "p", "h3", "h4"], recursive=False)
            date_text = date_el.get_text().strip() if date_el else ""
            title_text = ""
            body_text = ""
            for child in children:
                if child == date_el:
                    continue
                txt = inline_text(child).strip()
                if not txt:
                    continue
                if not title_text:
                    title_text = txt
                else:
                    body_text = txt
                    break
            lines.append(f"- {emoji} **{date_text}** \u2014 {title_text}")
            if body_text:
                for bl in body_text.split("\n"):
                    if bl.strip():
                        lines.append(f"  {bl.strip()}")
            lines.append("")
        return "\n".join(lines)

    def _process_code_block(self, el: Tag) -> str:
        code = el.find("code")
        text = code.get_text() if code else el.get_text()
        # Detect language from class
        lang = ""
        if code:
            for c in _classes(code):
                m = re.match(r"(?:language-|lang-)(.+)", c)
                if m:
                    lang = m.group(1)
                    break
        if not lang:
            for c in _classes(el):
                m = re.match(r"(?:language-|lang-)(.+)", c)
                if m:
                    lang = m.group(1)
                    break
        return f"```{lang}\n{text}\n```"

    def _process_table(self, el: Tag) -> str:
        self.table_count += 1
        return table_to_gfm(el)

    # -- main dispatch ------------------------------------------------------

    def process(self, el) -> str:
        """Process one element, return Markdown string."""
        if isinstance(el, NavigableString):
            return ""
        if not isinstance(el, Tag):
            return ""

        # Skip non-content elements
        if el.name in ("script", "style", "head", "link", "meta"):
            return ""

        style = el.get("style", "") or ""

        # --- HERO ---
        if _is_hero(el):
            return self._process_hero(el)

        # --- TOC ---
        if el.name == "nav":
            items = el.find_all("a")
            if items:
                lines = ["## Table of Contents\n"]
                for i, a in enumerate(items, 1):
                    lines.append(f"{i}. {a.get_text().strip()}")
                return "\n".join(lines)

        # --- SECTION containers ---
        if el.name == "section":
            return "\n\n".join(filter(None, (self.process(c) for c in el.children)))

        # --- HEADINGS ---
        if el.name in ("h1", "h2", "h3", "h4", "h5", "h6"):
            lvl = int(el.name[1])
            return f"{'#' * lvl} {inline_text(el).strip()}"

        # --- PARAGRAPHS ---
        if el.name == "p":
            t = inline_text(el).strip()
            return t if t else ""

        # --- LISTS ---
        if el.name in ("ul", "ol"):
            items = el.find_all("li", recursive=False)
            lines = []
            for i, li in enumerate(items, 1):
                prefix = f"{i}." if el.name == "ol" else "-"
                lines.append(f"{prefix} {inline_text(li).strip()}")
            return "\n".join(lines)

        # --- MERMAID ---
        if _is_mermaid(el):
            return self._process_mermaid(el)

        # --- CALLOUT ---
        if _is_callout(el):
            return self._process_callout(el)

        # --- PROGRESS BAR ---
        if _is_progress_bar(el):
            return self._process_progress_bar(el)

        # --- STAT CARDS ---
        if _is_stat_cards(el):
            return self._process_stat_cards(el)

        # --- TIMELINE ---
        if _is_timeline(el):
            return self._process_timeline(el)

        # --- CODE BLOCKS ---
        if _is_code_block(el):
            return self._process_code_block(el)

        # --- TABLES ---
        if el.name == "table":
            return self._process_table(el)

        # --- FOOTER ---
        if el.name == "footer":
            return f"---\n\n*{inline_text(el).strip()}*"

        # --- SIDE-BY-SIDE GRID CARDS ---
        if el.name == "div" and "grid-template-columns" in style:
            fn = self._add_screenshot("comparison")
            parts = [f"![Comparison](images/{fn})\n"]
            for child in el.find_all("div", recursive=False):
                for titled in child.find_all("div", style=lambda s: s and "text-transform" in s if s else False):
                    parts.append(f"**{titled.get_text().strip()}**")
                for p in child.find_all("p", recursive=False):
                    parts.append(inline_text(p).strip())
                for pre in child.find_all("pre"):
                    code = pre.find("code")
                    parts.append(f"```\n{(code or pre).get_text()}\n```")
                for callout in child.find_all("div", class_=lambda c: c and any(x in _CALLOUT_CLASSES for x in (c if isinstance(c, list) else [c]))):
                    parts.append(self._process_callout(callout))
                parts.append("")
            return "\n\n".join(filter(None, parts))

        # --- COMPLEX STYLED DIVS ---
        if el.name == "div" and style and ("border" in style or "background" in style):
            inner_tables = el.find_all("table")
            inner_grids = el.find_all("div", style=lambda s: s and "grid" in s if s else False)
            if inner_tables or inner_grids:
                fn = self._add_screenshot("visual_component")
                parts = [f"![Visual component](images/{fn})\n"]
                for t in inner_tables:
                    parts.append(table_to_gfm(t))
                for p in el.find_all("p", recursive=True):
                    t = inline_text(p).strip()
                    if t:
                        parts.append(t)
                return "\n\n".join(filter(None, parts))

        # --- CONTAINER/GENERIC DIVS ---
        if el.name == "div":
            parts = [self.process(c) for c in el.children]
            return "\n\n".join(filter(None, parts))

        return ""

    # -- public API ---------------------------------------------------------

    def convert(self, html: str) -> str:
        """Convert an HTML string to Markdown. Returns the Markdown text."""
        soup = BeautifulSoup(html, "html.parser")
        body = soup.find("body") or soup
        parts = [self.process(c) for c in body.children]
        md = "\n\n".join(filter(None, parts))
        md = re.sub(r"\n{3,}", "\n\n", md)
        return md

    def convert_file(self, input_path: str) -> dict:
        """Convert an HTML file and write all outputs. Returns a results dict."""
        with open(input_path, "r") as f:
            html = f.read()

        md = self.convert(html)

        os.makedirs(self.output_dir, exist_ok=True)
        os.makedirs(self.mermaid_dir, exist_ok=True)
        os.makedirs(os.path.join(self.output_dir, "images"), exist_ok=True)

        md_path = os.path.join(self.output_dir, "output.md")
        with open(md_path, "w") as f:
            f.write(md)

        manifest_path = os.path.join(self.output_dir, "screenshot_manifest.json")
        with open(manifest_path, "w") as f:
            json.dump(self.screenshot_manifest, f, indent=2)

        return {
            "markdown_path": md_path,
            "mermaid_count": self.mermaid_count,
            "screenshot_count": len(self.screenshot_manifest),
            "table_count": self.table_count,
            "callout_count": self.callout_count,
        }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(
        description="Convert an HTML document to Notion-compatible Markdown.",
    )
    parser.add_argument("input", help="Path to the HTML file to convert")
    parser.add_argument(
        "-o", "--output",
        default="./notion_export/",
        help="Output directory (default: ./notion_export/)",
    )
    args = parser.parse_args()

    if not os.path.isfile(args.input):
        print(f"Error: {args.input} not found", file=sys.stderr)
        sys.exit(1)

    converter = HTMLToMarkdownConverter(args.output)
    results = converter.convert_file(args.input)
    print(json.dumps(results))


if __name__ == "__main__":
    main()
