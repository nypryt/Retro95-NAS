"""Win95 NAS - Microsoft Office document reader.

Reads .docx / .xlsx / .pptx (and .rtf, plus a best-effort preview of the old
binary .doc/.xls/.ppt formats) using only the Python standard library, and
returns a small JSON-friendly model that the Win95 Word / Excel / PowerPoint
windows render.

Also creates brand new, valid OOXML documents for the "New" menus.
"""

from __future__ import annotations

import datetime as _dt
import io
import mimetypes
import posixpath
import re
import struct
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

NS_W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NS_R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
NS_A = "http://schemas.openxmlformats.org/drawingml/2006/main"
NS_P = "http://schemas.openxmlformats.org/presentationml/2006/main"
NS_X = "http://schemas.openxmlformats.org/spreadsheetml/2006/main"
NS_WP = "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"
NS_PIC = "http://schemas.openxmlformats.org/drawingml/2006/picture"
NS_V = "urn:schemas-microsoft-com:vml"
NS_CP = "http://schemas.openxmlformats.org/package/2006/metadata/core-properties"
NS_DC = "http://purl.org/dc/elements/1.1/"
NS_DCTERMS = "http://purl.org/dc/terms/"

EMU_PER_PX = 9525.0
TWIPS_PER_PX = 15.0

EXTENSIONS = {
    "word": (".docx",),
    "excel": (".xlsx",),
    "powerpoint": (".pptx",),
}

DEFAULT_NAMES = {
    "word": "New Word Document.docx",
    "excel": "New Excel Worksheet.xlsx",
    "powerpoint": "New PowerPoint Presentation.pptx",
}

MIME = {
    "word": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "powerpoint": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
}

THEME_FALLBACK = {
    "dk1": "#000000", "lt1": "#ffffff", "dk2": "#44546a", "lt2": "#e7e6e6",
    "accent1": "#4472c4", "accent2": "#ed7d31", "accent3": "#a5a5a5",
    "accent4": "#ffc000", "accent5": "#5b9bd5", "accent6": "#70ad47",
    "hlink": "#0563c1", "folHlink": "#954f72",
}

SCHEME_ALIASES = {"tx1": "dk1", "bg1": "lt1", "tx2": "dk2", "bg2": "lt2"}


class OfficeError(Exception):
    pass


# --------------------------------------------------------------------------- utils
def _q(ns: str, tag: str) -> str:
    return "{%s}%s" % (ns, tag)


def _find(el, ns, tag):
    return el.find(_q(ns, tag)) if el is not None else None


def _findall(el, ns, tag):
    return el.findall(_q(ns, tag)) if el is not None else []


def _val(el, ns, tag, default=""):
    child = _find(el, ns, tag)
    if child is None:
        return default
    return child.get(_q(ns, "val"), default)


def _on(el, ns, tag) -> bool:
    child = _find(el, ns, tag)
    if child is None:
        return False
    value = child.get(_q(ns, "val"))
    return value is None or value.lower() not in ("0", "false", "off", "none")


def _attr(el, ns, tag, default=""):
    return el.get(_q(ns, tag), default) if el is not None else default


def _hex(value: str, default: str = "") -> str:
    value = (value or "").strip()
    if not value or value.lower() == "auto":
        return default
    if re.fullmatch(r"[0-9a-fA-F]{6}", value):
        return "#" + value.lower()
    if re.fullmatch(r"[0-9a-fA-F]{8}", value):
        return "#" + value[-6:].lower()
    named = {
        "black": "#000000", "white": "#ffffff", "red": "#ff0000", "green": "#008000",
        "blue": "#0000ff", "yellow": "#ffff00", "gray": "#808080", "grey": "#808080",
        "darkblue": "#000080", "darkred": "#800000", "darkgreen": "#008000",
        "lightgray": "#d3d3d3", "lightgrey": "#d3d3d3", "orange": "#ffa500",
        "purple": "#800080", "cyan": "#00ffff", "magenta": "#ff00ff",
    }
    return named.get(value.lower(), default)


def _twips(value, default=0.0) -> float:
    try:
        return float(value) / TWIPS_PER_PX
    except (TypeError, ValueError):
        return default


def _emu(value, default=0.0) -> float:
    try:
        return float(value) / EMU_PER_PX
    except (TypeError, ValueError):
        return default


def _rels(zf: zipfile.ZipFile, part: str) -> dict:
    base = posixpath.dirname(part)
    relpath = posixpath.join(base, "_rels", posixpath.basename(part) + ".rels")
    if relpath not in zf.namelist():
        return {}
    try:
        root = ET.fromstring(zf.read(relpath))
    except ET.ParseError:
        return {}
    out = {}
    for rel in root:
        rid = rel.get("Id")
        target = rel.get("Target", "")
        mode = rel.get("TargetMode", "")
        if not target:
            continue
        if mode == "External":
            resolved = target
        elif target.startswith("/"):
            resolved = target[1:]
        else:
            resolved = posixpath.normpath(posixpath.join(base, target))
        out[rid] = {"target": resolved, "type": rel.get("Type", ""), "mode": mode}
    return out


def _core_props(zf: zipfile.ZipFile) -> dict:
    meta = {}
    try:
        root = ET.fromstring(zf.read("docProps/core.xml"))
    except Exception:
        return meta
    for key, tag, ns in (
        ("title", "title", NS_DC), ("subject", "subject", NS_DC),
        ("creator", "creator", NS_DC), ("lastModifiedBy", "lastModifiedBy", NS_CP),
        ("created", "created", NS_DCTERMS), ("modified", "modified", NS_DCTERMS),
        ("description", "description", NS_DC),
    ):
        el = root.find(_q(ns, tag))
        if el is not None and el.text:
            meta[key] = el.text.strip()
    return meta


def _image_size(data: bytes) -> tuple[int, int] | None:
    try:
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            w, h = struct.unpack(">II", data[16:24])
            return int(w), int(h)
        if data[:6] in (b"GIF87a", b"GIF89a"):
            w, h = struct.unpack("<HH", data[6:10])
            return int(w), int(h)
        if data[:2] == b"BM":
            w, h = struct.unpack("<ii", data[18:26])
            return int(abs(w)), int(abs(h))
        if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
            if data[12:16] == b"VP8X":
                w = int.from_bytes(data[24:27], "little") + 1
                h = int.from_bytes(data[27:30], "little") + 1
                return w, h
        if data[:2] == b"\xff\xd8":
            i = 2
            while i < len(data) - 9:
                if data[i] != 0xFF:
                    i += 1
                    continue
                marker = data[i + 1]
                if marker in (0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF):
                    h, w = struct.unpack(">HH", data[i + 5:i + 9])
                    return int(w), int(h)
                if marker in (0xD8, 0xD9):
                    i += 2
                    continue
                length = struct.unpack(">H", data[i + 2:i + 4])[0]
                i += 2 + length
    except Exception:
        return None
    return None


def _theme_colors(zf: zipfile.ZipFile, path: str) -> dict:
    colors = dict(THEME_FALLBACK)
    try:
        root = ET.fromstring(zf.read(path))
    except Exception:
        return colors
    scheme = root.find(".//" + _q(NS_A, "clrScheme"))
    if scheme is None:
        return colors
    for child in scheme:
        name = child.tag.split("}")[-1]
        value = ""
        for sub in child:
            tag = sub.tag.split("}")[-1]
            if tag == "srgbClr":
                value = _hex(sub.get("val", ""))
            elif tag == "sysClr":
                value = _hex(sub.get("lastClr", ""))
        if value:
            colors[name] = value
    return colors


def _color_from(el, theme: dict, default: str = "") -> str:
    if el is None:
        return default
    for sub in el.iter():
        tag = sub.tag.split("}")[-1]
        if tag == "srgbClr":
            return _hex(sub.get("val", ""), default)
        if tag == "schemeClr":
            name = sub.get("val", "")
            name = SCHEME_ALIASES.get(name, name)
            return theme.get(name, default)
        if tag == "sysClr":
            return _hex(sub.get("lastClr", ""), default)
        if tag == "prstClr":
            return _hex(sub.get("val", ""), default)
    return default


def _solid_fill(parent, theme: dict, default: str = "") -> str:
    """Return a CSS colour for the first solidFill under parent."""
    if parent is None:
        return default
    for child in parent:
        tag = child.tag.split("}")[-1]
        if tag == "solidFill":
            return _color_from(child, theme, default)
        if tag == "gradFill":
            stops = list(child.iter(_q(NS_A, "gs")))
            if stops:
                return _color_from(stops[0], theme, default)
    return default


# --------------------------------------------------------------------------- word
class _Word:
    def __init__(self, zf: zipfile.ZipFile, name: str):
        self.zf = zf
        self.name = name
        self.theme = _theme_colors(zf, "word/theme/theme1.xml")
        self.rels = _rels(zf, "word/document.xml")
        self.styles = self._styles()
        self.numbering = self._numbering()
        self.root = ET.fromstring(zf.read("word/document.xml"))
        self.meta = _core_props(zf)

    def _styles(self) -> dict:
        out = {}
        if "word/styles.xml" not in self.zf.namelist():
            return out
        try:
            root = ET.fromstring(self.zf.read("word/styles.xml"))
        except ET.ParseError:
            return out
        for style in _findall(root, NS_W, "style"):
            sid = style.get(_q(NS_W, "styleId"), "")
            name = _val(style, NS_W, "name", sid)
            based = _val(style, NS_W, "basedOn", "")
            out[sid] = {"name": name, "based": based}
        return out

    def _numbering(self) -> dict:
        out = {}
        if "word/numbering.xml" not in self.zf.namelist():
            return out
        try:
            root = ET.fromstring(self.zf.read("word/numbering.xml"))
        except ET.ParseError:
            return out
        abstract = {}
        for an in _findall(root, NS_W, "abstractNum"):
            aid = an.get(_q(NS_W, "abstractNumId"), "")
            levels = {}
            for lvl in _findall(an, NS_W, "lvl"):
                ilvl = lvl.get(_q(NS_W, "ilvl"), "0")
                levels[ilvl] = _val(lvl, NS_W, "numFmt", "decimal")
            abstract[aid] = levels
        for num in _findall(root, NS_W, "num"):
            nid = num.get(_q(NS_W, "numId"), "")
            aid = _val(num, NS_W, "abstractNumId", "")
            out[nid] = abstract.get(aid, {})
        return out

    # -- runs ----------------------------------------------------------
    def _run(self, el, ctx) -> dict:
        rpr = _find(el, NS_W, "rPr")
        text_parts = []
        for child in list(el):
            tag = child.tag
            if tag == _q(NS_W, "t"):
                text_parts.append(child.text or "")
            elif tag == _q(NS_W, "tab"):
                text_parts.append("\t")
            elif tag == _q(NS_W, "br"):
                text_parts.append("\n" if child.get(_q(NS_W, "type")) != "page" else "\f")
            elif tag == _q(NS_W, "cr"):
                text_parts.append("\n")
            elif tag == _q(NS_W, "noBreakHyphen"):
                text_parts.append("-")
        text = "".join(text_parts)
        if not text:
            return None
        run = {"text": text}
        if _on(rpr, NS_W, "b"):
            run["bold"] = True
        if _on(rpr, NS_W, "i"):
            run["italic"] = True
        if _on(rpr, NS_W, "u"):
            run["underline"] = True
        if _on(rpr, NS_W, "strike") or _on(rpr, NS_W, "dstrike"):
            run["strike"] = True
        if _on(rpr, NS_W, "caps"):
            run["text"] = text.upper()
        color = _hex(_val(rpr, NS_W, "color", ""))
        if color:
            run["color"] = color
        size = _val(rpr, NS_W, "sz", "")
        if size:
            try:
                run["size"] = round(float(size) * 2 / 3, 1)
            except ValueError:
                pass
        fonts = _find(rpr, NS_W, "rFonts")
        if fonts is not None:
            face = fonts.get(_q(NS_W, "ascii")) or fonts.get(_q(NS_W, "hAnsi"))
            if face:
                run["font"] = face
        highlight = _val(rpr, NS_W, "highlight", "")
        if highlight:
            run["background"] = _hex(highlight, "#ffff00")
        shd = _find(rpr, NS_W, "shd")
        if shd is not None:
            fill = _hex(shd.get(_q(NS_W, "fill"), ""))
            if fill:
                run["background"] = fill
        vert = _val(rpr, NS_W, "vertAlign", "")
        if vert == "superscript":
            run["script"] = "super"
        elif vert == "subscript":
            run["script"] = "sub"
        if ctx.get("href"):
            run["href"] = ctx["href"]
            run.setdefault("color", "#0000ee")
            run.setdefault("underline", True)
        return run

    def _runs(self, node, ctx=None) -> list:
        ctx = ctx or {}
        out = []

        def walk(parent, current):
            for child in list(parent):
                tag = child.tag
                if tag == _q(NS_W, "r"):
                    run = self._run(child, current)
                    if run:
                        out.append(run)
                elif tag == _q(NS_W, "hyperlink"):
                    rid = child.get(_q(NS_R, "id"), "")
                    href = self.rels.get(rid, {}).get("target", "")
                    walk(child, dict(current, href=href))
                elif tag in (_q(NS_W, "ins"), _q(NS_W, "smartTag"), _q(NS_W, "sdt"),
                             _q(NS_W, "sdtContent"), _q(NS_W, "fldSimple")):
                    walk(child, current)

        walk(node, ctx)
        return out

    def _paragraph(self, p) -> dict:
        ppr = _find(p, NS_W, "pPr")
        style_id = _val(ppr, NS_W, "pStyle", "")
        style_name = self.styles.get(style_id, {}).get("name", "")
        block = {"type": "p", "runs": self._runs(p)}
        if style_name:
            block["style"] = style_name
            match = re.match(r"(?i)heading\s*(\d)", style_name)
            if match:
                block["heading"] = int(match.group(1))
            if style_name.lower() == "title":
                block["heading"] = 0
        align = _val(ppr, NS_W, "jc", "")
        if align:
            block["align"] = {"both": "justify"}.get(align, align)
        ind = _find(ppr, NS_W, "ind")
        if ind is not None:
            left = _twips(ind.get(_q(NS_W, "left"), ind.get(_q(NS_W, "start"), "0")))
            if left:
                block["indent"] = round(left, 1)
        spacing = _find(ppr, NS_W, "spacing")
        if spacing is not None:
            before = _twips(spacing.get(_q(NS_W, "before"), "0"))
            after = _twips(spacing.get(_q(NS_W, "after"), "0"))
            line = spacing.get(_q(NS_W, "line"))
            if before:
                block["before"] = round(before, 1)
            if after:
                block["after"] = round(after, 1)
            if line:
                try:
                    block["lineHeight"] = round(float(line) / 240, 2)
                except ValueError:
                    pass
        shd = _find(ppr, NS_W, "shd")
        if shd is not None:
            fill = _hex(shd.get(_q(NS_W, "fill"), ""))
            if fill:
                block["background"] = fill
        numpr = _find(ppr, NS_W, "numPr")
        if numpr is not None:
            nid = _val(numpr, NS_W, "numId", "")
            ilvl = _val(numpr, NS_W, "ilvl", "0")
            fmt = self.numbering.get(nid, {}).get(ilvl, "decimal")
            block["list"] = "bullet" if fmt in ("bullet", "none") else "number"
            block["level"] = int(ilvl) if ilvl.isdigit() else 0
        if _on(ppr, NS_W, "pageBreakBefore"):
            block["pageBreakBefore"] = True
        if not block["runs"] and not block.get("list"):
            block["blank"] = True
        return block

    def _images(self, el) -> list:
        out = []
        for drawing in el.iter(_q(NS_W, "drawing")):
            blip = next(iter(drawing.iter(_q(NS_A, "blip"))), None)
            if blip is None:
                continue
            rid = blip.get(_q(NS_R, "embed"), "")
            target = self.rels.get(rid, {}).get("target", "")
            if not target:
                continue
            width = height = 0
            extent = next(iter(drawing.iter(_q(NS_WP, "extent"))), None)
            if extent is not None:
                width = _emu(extent.get("cx", "0"))
                height = _emu(extent.get("cy", "0"))
            if not width:
                xfrm = next(iter(drawing.iter(_q(NS_A, "xfrm"))), None)
                ext = next(iter(xfrm.iter(_q(NS_A, "ext"))), None) if xfrm is not None else None
                if ext is not None:
                    width = _emu(ext.get("cx", "0"))
                    height = _emu(ext.get("cy", "0"))
            item = {"type": "image", "src": target, "width": round(width), "height": round(height)}
            out.append(item)
        for pict in el.iter(_q(NS_W, "pict")):
            data = next(iter(pict.iter(_q(NS_V, "imagedata"))), None)
            if data is None:
                continue
            rid = data.get(_q(NS_R, "id"), "")
            target = self.rels.get(rid, {}).get("target", "")
            if target:
                out.append({"type": "image", "src": target, "width": 0, "height": 0})
        return out

    def _table(self, tbl) -> dict:
        rows = []
        for tr in _findall(tbl, NS_W, "tr"):
            cells = []
            for tc in _findall(tr, NS_W, "tc"):
                tcpr = _find(tc, NS_W, "tcPr")
                span = 1
                vmerge = None
                if tcpr is not None:
                    grid = _find(tcpr, NS_W, "gridSpan")
                    if grid is not None:
                        try:
                            span = max(1, int(grid.get(_q(NS_W, "val"), "1")))
                        except ValueError:
                            span = 1
                    vm = _find(tcpr, NS_W, "vMerge")
                    if vm is not None:
                        vmerge = vm.get(_q(NS_W, "val"), "continue")
                text_parts = []
                bold = False
                for p in _findall(tc, NS_W, "p"):
                    runs = self._runs(p)
                    text_parts.append("".join(r["text"] for r in runs))
                    if any(r.get("bold") for r in runs):
                        bold = True
                cell = {"text": "\n".join(text_parts).strip(), "colspan": span}
                if bold:
                    cell["bold"] = True
                if vmerge == "restart":
                    cell["vmerge"] = "start"
                elif vmerge == "continue":
                    cell["vmerge"] = "continue"
                if tcpr is not None:
                    shd = _find(tcpr, NS_W, "shd")
                    if shd is not None:
                        fill = _hex(shd.get(_q(NS_W, "fill"), ""))
                        if fill:
                            cell["background"] = fill
                    width = _find(tcpr, NS_W, "tcW")
                    if width is not None and width.get(_q(NS_W, "type")) == "dxa":
                        cell["width"] = round(_twips(width.get(_q(NS_W, "w"), "0")), 1)
                cells.append(cell)
            rows.append(cells)
        return {"type": "table", "rows": rows}

    def render(self) -> dict:
        body = _find(self.root, NS_W, "body")
        blocks = []

        def walk(parent):
            for child in list(parent):
                tag = child.tag
                if tag == _q(NS_W, "p"):
                    block = self._paragraph(child)
                    images = self._images(child)
                    text = "".join(r["text"] for r in block["runs"])
                    if text.strip() or block.get("list"):
                        blocks.append(block)
                    for image in images:
                        blocks.append(image)
                elif tag == _q(NS_W, "tbl"):
                    blocks.append(self._table(child))
                elif tag in (_q(NS_W, "sdt"), _q(NS_W, "sdtContent"), _q(NS_W, "ins"),
                             _q(NS_W, "customXml"), _q(NS_W, "smartTag")):
                    walk(child)

        walk(body)
        sect = None
        for candidate in body.iter(_q(NS_W, "sectPr")):
            sect = candidate
        page_w, page_h = 8.5, 11.0
        margins = {"top": 1.0, "right": 1.0, "bottom": 1.0, "left": 1.0}
        if sect is not None:
            size = _find(sect, NS_W, "pgSz")
            if size is not None:
                page_w = _twips(size.get(_q(NS_W, "w"), "12240")) / 96.0
                page_h = _twips(size.get(_q(NS_W, "h"), "15840")) / 96.0
                if size.get(_q(NS_W, "orient")) == "landscape" and page_h > page_w:
                    page_w, page_h = page_h, page_w
            mar = _find(sect, NS_W, "pgMar")
            if mar is not None:
                for side in ("top", "right", "bottom", "left"):
                    value = mar.get(_q(NS_W, side))
                    if value:
                        margins[side] = round(_twips(value) / 96.0, 2)
        # normalise image widths to the text column
        content_w = max(120.0, (page_w - margins["left"] - margins["right"]) * 96.0)
        for block in blocks:
            if block["type"] != "image":
                continue
            if block["width"] <= 0:
                block["width"] = 320
            if block["height"] <= 0:
                block["height"] = round(block["width"] * 0.66)
            if block["width"] > content_w:
                ratio = content_w / block["width"]
                block["width"] = round(content_w)
                block["height"] = round(block["height"] * ratio)
            block["width"] = int(block["width"])
            block["height"] = int(block["height"])
        return {
            "type": "word",
            "name": self.name,
            "meta": self.meta,
            "page": {"width": round(page_w, 2), "height": round(page_h, 2),
                     "margins": margins},
            "blocks": blocks,
        }


def _render_rtf(path: Path) -> dict:
    raw = path.read_bytes()
    text = raw.decode("latin-1", "replace")
    # Drop destinations that are not document text.
    for dest in ("fonttbl", "colortbl", "stylesheet", "info", "pict", "object",
                 "header", "footer", "footnote", "annotation", "listtable",
                 "listoverridetable", "rsidtbl", "generator", "themedata",
                 "colorschememapping", "latentstyles", "datastore", "xmlnstbl"):
        text = re.sub(r"\{\\\*?" + dest + r"\b.*?\}", "", text, flags=re.S)
    text = re.sub(r"\\'([0-9a-fA-F]{2})", lambda m: bytes([int(m.group(1), 16)]).decode("cp1252", "replace"), text)
    text = re.sub(r"\\u(-?\d+)\??", lambda m: chr(int(m.group(1)) % 65536), text)
    text = re.sub(r"\\par[d]?\b", "\n", text)
    text = re.sub(r"\\line\b", "\n", text)
    text = re.sub(r"\\tab\b", "\t", text)
    text = re.sub(r"\\[a-zA-Z]+-?\d* ?", "", text)
    text = text.replace("\\{", "{").replace("\\}", "}").replace("\\\\", "\\")
    text = re.sub(r"[{}]", "", text)
    paragraphs = []
    for line in text.replace("\r", "").split("\n"):
        line = line.strip()
        paragraphs.append({"type": "p", "runs": [{"text": line}] if line else [], "blank": not line})
    return {
        "type": "word", "name": path.name, "meta": {},
        "page": {"width": 8.5, "height": 11, "margins": {"top": 1, "right": 1, "bottom": 1, "left": 1}},
        "blocks": paragraphs,
    }


def _legacy_text(path: Path) -> str:
    data = path.read_bytes()
    # Old .doc files keep most text as UTF-16LE runs. Pull out long printable runs.
    try:
        decoded = data.decode("utf-16-le", "ignore")
    except Exception:
        decoded = ""
    chunks = re.findall(r"[\x20-\x7e\u00a0-\uffff]{4,}", decoded)
    text = "\n".join(chunk.strip() for chunk in chunks if len(chunk.strip()) > 3)
    if len(text) < 20:
        chunks = re.findall(rb"[\x20-\x7e]{4,}", data)
        text = "\n".join(chunk.decode("latin-1") for chunk in chunks)
    return text[:20000]


# --------------------------------------------------------------------------- excel
class _Excel:
    def __init__(self, zf: zipfile.ZipFile, name: str):
        self.zf = zf
        self.name = name
        self.theme = _theme_colors(zf, "xl/theme/theme1.xml")
        self.shared = self._shared_strings()
        self.fonts, self.fills, self.numfmts, self.xfs = self._styles()
        self.workbook = ET.fromstring(zf.read("xl/workbook.xml"))
        self.rels = _rels(zf, "xl/workbook.xml")
        self.meta = _core_props(zf)
        self.date1904 = False
        pr = _find(self.workbook, NS_X, "workbookPr")
        if pr is not None and str(pr.get("date1904", "")).lower() in ("1", "true"):
            self.date1904 = True

    def _shared_strings(self) -> list:
        if "xl/sharedStrings.xml" not in self.zf.namelist():
            return []
        try:
            root = ET.fromstring(self.zf.read("xl/sharedStrings.xml"))
        except ET.ParseError:
            return []
        out = []
        for si in _findall(root, NS_X, "si"):
            out.append("".join(t.text or "" for t in si.iter(_q(NS_X, "t"))))
        return out

    def _color(self, el) -> str:
        if el is None:
            return ""
        rgb = el.get("rgb")
        if rgb:
            return _hex(rgb)
        theme = el.get("theme")
        if theme is not None:
            names = ["lt1", "dk1", "lt2", "dk2", "accent1", "accent2", "accent3",
                     "accent4", "accent5", "accent6", "hlink", "folHlink"]
            try:
                return self.theme.get(names[int(theme)], "")
            except (ValueError, IndexError):
                return ""
        indexed = el.get("indexed")
        if indexed is not None:
            return {64: "#000000", 65: "#ffffff"}.get(int(indexed), "")
        return ""

    def _styles(self):
        fonts = []
        fills = []
        numfmts = {
            0: "General", 1: "0", 2: "0.00", 3: "#,##0", 4: "#,##0.00",
            9: "0%", 10: "0.00%", 11: "0.00E+00", 14: "mm-dd-yy",
            15: "d-mmm-yy", 16: "d-mmm", 17: "mmm-yy", 18: "h:mm AM/PM",
            19: "h:mm:ss AM/PM", 20: "h:mm", 21: "h:mm:ss", 22: "m/d/yy h:mm",
            37: "#,##0 ;(#,##0)", 38: "#,##0 ;[Red](#,##0)",
            39: "#,##0.00;(#,##0.00)", 40: "#,##0.00;[Red](#,##0.00)",
            45: "mm:ss", 46: "[h]:mm:ss", 47: "mmss.0", 48: "##0.0E+0", 49: "@",
        }
        xfs = []
        if "xl/styles.xml" not in self.zf.namelist():
            return fonts, fills, numfmts, xfs
        try:
            root = ET.fromstring(self.zf.read("xl/styles.xml"))
        except ET.ParseError:
            return fonts, fills, numfmts, xfs
        numfmt_root = _find(root, NS_X, "numFmts")
        for nf in _findall(numfmt_root, NS_X, "numFmt"):
            try:
                numfmts[int(nf.get("numFmtId"))] = nf.get("formatCode", "General")
            except (TypeError, ValueError):
                pass
        fonts_root = _find(root, NS_X, "fonts")
        for font in _findall(fonts_root, NS_X, "font"):
            item = {
                "bold": _find(font, NS_X, "b") is not None,
                "italic": _find(font, NS_X, "i") is not None,
                "underline": _find(font, NS_X, "u") is not None,
                "strike": _find(font, NS_X, "strike") is not None,
                "color": "",
                "size": 11,
                "name": "Calibri",
            }
            color = _find(font, NS_X, "color")
            if color is not None:
                item["color"] = self._color(color)
            sz = _find(font, NS_X, "sz")
            if sz is not None:
                try:
                    item["size"] = float(sz.get("val", "11"))
                except ValueError:
                    pass
            name = _find(font, NS_X, "name")
            if name is not None:
                item["name"] = name.get("val", "Calibri")
            fonts.append(item)
        fills_root = _find(root, NS_X, "fills")
        for fill in _findall(fills_root, NS_X, "fill"):
            pattern = _find(fill, NS_X, "patternFill")
            color = ""
            if pattern is not None:
                fg = _find(pattern, NS_X, "fgColor")
                if fg is not None:
                    color = self._color(fg)
            fills.append(color)
        cellxfs = _find(root, NS_X, "cellXfs")
        if cellxfs is not None:
            for xf in _findall(cellxfs, NS_X, "xf"):
                align = _find(xf, NS_X, "alignment")
                item = {
                    "font": int(xf.get("fontId", "0") or 0),
                    "fill": int(xf.get("fillId", "0") or 0),
                    "numFmt": int(xf.get("numFmtId", "0") or 0),
                    "h": align.get("horizontal", "") if align is not None else "",
                    "v": align.get("vertical", "") if align is not None else "",
                    "wrap": bool(align is not None and str(align.get("wrapText", "")).lower() in ("1", "true")),
                }
                xfs.append(item)
        return fonts, fills, numfmts, xfs

    def _font(self, index: int) -> dict:
        if 0 <= index < len(self.fonts):
            return self.fonts[index]
        return {"bold": False, "italic": False, "underline": False, "strike": False,
                "color": "", "size": 11, "name": "Calibri"}

    def _fill(self, index: int) -> str:
        if 0 <= index < len(self.fills):
            return self.fills[index]
        return ""

    def _numfmt(self, xf: dict) -> str:
        return self.numfmts.get(xf.get("numFmt", 0), "General")

    def _format(self, value, xf: dict) -> str:
        code = self._numfmt(xf)
        if value is None:
            return ""
        if isinstance(value, str):
            return value
        if isinstance(value, bool):
            return "TRUE" if value else "FALSE"
        low = code.lower()
        if low.strip() in ("", "general", "@"):
            if isinstance(value, float):
                return f"{value:.10g}"
            return str(value)
        if any(ch in low for ch in ("yy", "dd", "mm:", "h:", "am/pm")) and "%" not in low:
            try:
                return _excel_date(float(value), self.date1904, low)
            except Exception:
                pass
        if "%" in code:
            decimals = len(code.split(".")[1].split("%")[0]) if "." in code else 0
            try:
                return f"{float(value) * 100:.{decimals}f}%"
            except Exception:
                return str(value)
        currency = ""
        for symbol in ("$", "€", "£", "¥"):
            if symbol in code:
                currency = symbol
                break
        decimals = 0
        if "." in code:
            decimals = len(re.findall(r"0", code.split(".")[1].split(";")[0]))
        thousands = "#,##" in code
        try:
            number = float(value)
        except Exception:
            return str(value)
        if abs(number - int(number)) < 1e-9 and decimals == 0:
            text = f"{int(number):,}" if thousands else str(int(number))
        else:
            text = f"{number:,.{decimals}f}" if thousands else f"{number:.{decimals}f}"
        return currency + text

    def _cell_value(self, cell) -> tuple:
        ctype = cell.get("t", "")
        formula = _find(cell, NS_X, "f")
        formula_text = formula.text if formula is not None and formula.text else ""
        value_el = _find(cell, NS_X, "v")
        raw = value_el.text if value_el is not None and value_el.text is not None else ""
        if ctype == "s":
            try:
                return self.shared[int(raw)], formula_text, "s"
            except (ValueError, IndexError):
                return "", formula_text, "s"
        if ctype == "inlineStr":
            inline = _find(cell, NS_X, "is")
            return ("".join(t.text or "" for t in inline.iter(_q(NS_X, "t"))) if inline is not None else "",
                    formula_text, "s")
        if ctype == "b":
            return raw == "1", formula_text, "b"
        if ctype == "e":
            return raw, formula_text, "e"
        if ctype == "str":
            return raw, formula_text, "s"
        if raw == "":
            return None, formula_text, "n"
        try:
            number = float(raw)
            return (int(number) if number.is_integer() and abs(number) < 1e15 else number,
                    formula_text, "n")
        except ValueError:
            return raw, formula_text, "s"

    def _sheet(self, part: str, title: str) -> dict:
        try:
            root = ET.fromstring(self.zf.read(part))
        except Exception as exc:
            raise OfficeError(f"Sheet '{title}' is damaged: {exc}")
        widths = {}
        cols = _find(root, NS_X, "cols")
        if cols is not None:
            for col in _findall(cols, NS_X, "col"):
                try:
                    lo = int(col.get("min", "1"))
                    hi = int(col.get("max", str(lo)))
                    width = float(col.get("width", "8.43"))
                except ValueError:
                    continue
                for idx in range(lo, min(hi, 60) + 1):
                    widths[idx] = round(max(32, width * 7 + 5), 1)
        merges = []
        merge_root = _find(root, NS_X, "mergeCells")
        if merge_root is not None:
            for merge in _findall(merge_root, NS_X, "mergeCell"):
                ref = merge.get("ref", "")
                if ":" in ref:
                    a, b = ref.split(":", 1)
                    try:
                        c1, r1 = _ref_to_cell(a)
                        c2, r2 = _ref_to_cell(b)
                    except ValueError:
                        continue
                    merges.append((r1, c1, r2, c2))
        covered = set()
        span_map = {}
        for (r1, c1, r2, c2) in merges:
            span_map[(r1, c1)] = (c2 - c1 + 1, r2 - r1 + 1)
            for rr in range(r1, r2 + 1):
                for cc in range(c1, c2 + 1):
                    if (rr, cc) != (r1, c1):
                        covered.add((rr, cc))
        rows = []
        max_row = 0
        max_col = 0
        truncated = False
        sheet_data = _find(root, NS_X, "sheetData")
        if sheet_data is not None:
            for row in _findall(sheet_data, NS_X, "row"):
                try:
                    rindex = int(row.get("r", "0"))
                except ValueError:
                    continue
                if rindex <= 0:
                    continue
                if rindex > 2000:
                    truncated = True
                    break
                cells = []
                for cell in _findall(row, NS_X, "c"):
                    ref = cell.get("r", "")
                    try:
                        cindex, rr = _ref_to_cell(ref)
                    except ValueError:
                        continue
                    if rr != rindex:
                        rindex = rr
                    if cindex > 80:
                        truncated = True
                        continue
                    if (rindex, cindex) in covered:
                        continue
                    value, formula, kind = self._cell_value(cell)
                    if value is None and not formula:
                        continue
                    try:
                        xf = self.xfs[int(cell.get("s", "0") or 0)]
                    except (ValueError, IndexError):
                        xf = {"font": 0, "fill": 0, "numFmt": 0, "h": "", "v": "", "wrap": False}
                    font = self._font(xf.get("font", 0))
                    display = self._format(value, xf) if kind == "n" else (
                        "TRUE" if value is True else ("FALSE" if value is False else str(value)))
                    item = {
                        "c": cindex,
                        "v": display,
                        "raw": value if isinstance(value, (int, float, str, bool)) else str(value),
                    }
                    if formula:
                        item["f"] = formula
                    if xf.get("h"):
                        item["align"] = xf["h"]
                    if xf.get("wrap"):
                        item["wrap"] = True
                    if font.get("bold"):
                        item["bold"] = True
                    if font.get("italic"):
                        item["italic"] = True
                    if font.get("underline"):
                        item["underline"] = True
                    if font.get("color"):
                        item["color"] = font["color"]
                    if font.get("size") and abs(font["size"] - 11) > 0.1:
                        item["size"] = font["size"]
                    fill = self._fill(xf.get("fill", 0))
                    if fill:
                        item["background"] = fill
                    span = span_map.get((rindex, cindex))
                    if span:
                        item["colspan"] = span[0]
                        item["rowspan"] = span[1]
                    cells.append(item)
                    max_col = max(max_col, cindex + (span[0] - 1 if span else 0))
                if cells:
                    max_row = max(max_row, rindex)
                    rows.append({"r": rindex, "cells": cells})
        return {
            "name": title,
            "rows": rows,
            "widths": {str(k): v for k, v in widths.items()},
            "maxRow": max_row,
            "maxCol": max_col,
            "truncated": truncated,
        }

    def render(self) -> dict:
        sheets = []
        for sheet in _findall(_find(self.workbook, NS_X, "sheets"), NS_X, "sheet"):
            rid = sheet.get(_q(NS_R, "id"), "")
            target = self.rels.get(rid, {}).get("target", "")
            if not target or "/worksheets/" not in target:
                continue
            if target not in self.zf.namelist():
                continue
            sheets.append(self._sheet(target, sheet.get("name", "Sheet")))
        if not sheets:
            raise OfficeError("This workbook has no readable sheets")
        return {
            "type": "excel",
            "name": self.name,
            "meta": self.meta,
            "sheets": sheets,
            "active": 0,
        }


def _ref_to_cell(ref: str) -> tuple[int, int]:
    match = re.match(r"([A-Za-z]+)(\d+)$", ref)
    if not match:
        raise ValueError(ref)
    col = 0
    for ch in match.group(1).upper():
        col = col * 26 + (ord(ch) - 64)
    return col, int(match.group(2))


def _excel_date(serial: float, date1904: bool, code: str) -> str:
    base = _dt.datetime(1904, 1, 1) if date1904 else _dt.datetime(1899, 12, 30)
    value = base + _dt.timedelta(days=serial)
    low = code.lower()
    if any(token in low for token in ("h:", "hh", "am/pm", "mm:ss", "ss")):
        if any(token in low for token in ("d", "y")):
            return value.strftime("%Y-%m-%d %H:%M")
        return value.strftime("%H:%M:%S") if "ss" in low else value.strftime("%H:%M")
    return value.strftime("%Y-%m-%d")


# --------------------------------------------------------------------------- powerpoint
class _PowerPoint:
    def __init__(self, zf: zipfile.ZipFile, name: str):
        self.zf = zf
        self.name = name
        self.theme = _theme_colors(zf, "ppt/theme/theme1.xml")
        self.rels = _rels(zf, "ppt/presentation.xml")
        self.slide_rels = {}
        self.root = ET.fromstring(zf.read("ppt/presentation.xml"))
        self.meta = _core_props(zf)
        self.size = self._size()

    def _size(self):
        sz = _find(self.root, NS_P, "sldSz")
        if sz is None:
            return 960, 720
        return round(_emu(sz.get("cx", "9144000"))), round(_emu(sz.get("cy", "6858000")))

    def _find_xfrm(self, el):
        for ns in (NS_A, NS_P):
            for child in el.iter(_q(ns, "xfrm")):
                return child
        return None

    def _shape_xfrm(self, el, group=None):
        xfrm = self._find_xfrm(el)
        if xfrm is None:
            return 0, 0, 0, 0, None
        off = _find(xfrm, NS_A, "off")
        ext = _find(xfrm, NS_A, "ext")
        x = _emu(off.get("x", "0")) if off is not None else 0
        y = _emu(off.get("y", "0")) if off is not None else 0
        w = _emu(ext.get("cx", "0")) if ext is not None else 0
        h = _emu(ext.get("cy", "0")) if ext is not None else 0
        rot = 0
        if xfrm.get("rot"):
            try:
                rot = float(xfrm.get("rot")) / 60000.0
            except ValueError:
                rot = 0
        if group:
            gx, gy, gw, gh, gchx, gchy, gchw, gchh = group
            if gchw and gchh:
                x = gx + (x - gchx) * (gw / gchw)
                y = gy + (y - gchy) * (gh / gchh)
                w *= gw / gchw
                h *= gh / gchh
        return round(x), round(y), round(w), round(h), rot

    def _text(self, txbody):
        if txbody is None:
            return [], "", ""
        paragraphs = []
        align = ""
        for p in _findall(txbody, NS_A, "p"):
            ppr = _find(p, NS_A, "pPr")
            palign = ppr.get("algn", "") if ppr is not None else ""
            bullet = ""
            level = 0
            if ppr is not None:
                if _find(ppr, NS_A, "buChar") is not None:
                    bullet = "bullet"
                elif _find(ppr, NS_A, "buAutoNum") is not None:
                    bullet = "number"
                try:
                    level = int(ppr.get("lvl", "0"))
                except ValueError:
                    level = 0
                if palign and not align:
                    align = {"ctr": "center", "r": "right", "just": "justify"}.get(palign, palign)
            runs = []
            for r in _findall(p, NS_A, "r"):
                rpr = _find(r, NS_A, "rPr")
                t = _find(r, NS_A, "t")
                text = t.text if t is not None and t.text else ""
                if not text:
                    continue
                run = {"text": text}
                if rpr is not None:
                    if str(rpr.get("b", "")).lower() in ("1", "true"):
                        run["bold"] = True
                    if str(rpr.get("i", "")).lower() in ("1", "true"):
                        run["italic"] = True
                    if str(rpr.get("u", "")).lower() not in ("", "none"):
                        run["underline"] = True
                    if rpr.get("sz"):
                        try:
                            run["size"] = round(float(rpr.get("sz")) * 4 / 3 / 100, 1)
                        except ValueError:
                            pass
                    color = _solid_fill(rpr, self.theme, "")
                    if color:
                        run["color"] = color
                    latin = _find(rpr, NS_A, "latin")
                    if latin is not None and latin.get("typeface"):
                        run["font"] = latin.get("typeface")
                runs.append(run)
            if not runs:
                para = {"runs": []}
                end = _find(p, NS_A, "endParaRPr")
                if end is not None and end.get("sz"):
                    try:
                        para["size"] = round(float(end.get("sz")) * 4 / 3 / 100, 1)
                    except ValueError:
                        pass
                if bullet:
                    para["bullet"] = bullet
                    para["level"] = level
                paragraphs.append(para)
                continue
            para = {"runs": runs}
            if bullet:
                para["bullet"] = bullet
                para["level"] = level
            paragraphs.append(para)
        body_pr = _find(txbody, NS_A, "bodyPr")
        anchor = body_pr.get("anchor", "") if body_pr is not None else ""
        return paragraphs, align, anchor

    def _shape(self, sp, group=None) -> dict | None:
        x, y, w, h, rot = self._shape_xfrm(sp, group)
        if w <= 0 or h <= 0:
            return None
        sppr = _find(sp, NS_P, "spPr")
        geom = "rect"
        if sppr is not None:
            prst = _find(sppr, NS_A, "prstGeom")
            if prst is not None:
                geom = prst.get("prst", "rect")
        fill = _solid_fill(sppr, self.theme, "") if sppr is not None else ""
        line = ""
        line_w = 0
        if sppr is not None:
            ln = _find(sppr, NS_A, "ln")
            if ln is not None:
                line = _solid_fill(ln, self.theme, "")
                if ln.get("w"):
                    try:
                        line_w = round(float(ln.get("w")) / EMU_PER_PX, 1)
                    except ValueError:
                        line_w = 0
        txbody = _find(sp, NS_P, "txBody")
        paragraphs, align, anchor = self._text(txbody)
        text = "\n".join("".join(r["text"] for r in p["runs"]) for p in paragraphs)
        if not text and not fill and not line:
            return None
        shape = {
            "type": "shape", "x": x, "y": y, "w": w, "h": h, "geom": geom,
            "paragraphs": paragraphs, "align": align, "valign": anchor,
        }
        if fill:
            shape["fill"] = fill
        if line:
            shape["line"] = line
            shape["lineWidth"] = line_w or 1
        if rot:
            shape["rot"] = rot
        return shape

    def _picture(self, pic, group=None) -> dict | None:
        x, y, w, h, rot = self._shape_xfrm(pic, group)
        blip = next(iter(pic.iter(_q(NS_A, "blip"))), None)
        if blip is None:
            return None
        rid = blip.get(_q(NS_R, "embed"), "")
        target = self.slide_rels.get(rid, {}).get("target", "")
        if not target:
            return None
        shape = {"type": "image", "x": x, "y": y, "w": w, "h": h, "src": target}
        if rot:
            shape["rot"] = rot
        return shape

    def _table(self, frame, group=None) -> dict | None:
        x, y, w, h, rot = self._shape_xfrm(frame, group)
        tbl = next(iter(frame.iter(_q(NS_A, "tbl"))), None)
        if tbl is None:
            return None
        rows = []
        for tr in _findall(tbl, NS_A, "tr"):
            cells = []
            for tc in _findall(tr, NS_A, "tc"):
                text = "".join(t.text or "" for t in tc.iter(_q(NS_A, "t")))
                cells.append(text)
            rows.append(cells)
        return {"type": "table", "x": x, "y": y, "w": w, "h": h, "rows": rows}

    def _shapes(self, tree, group=None) -> list:
        out = []
        for child in list(tree):
            tag = child.tag
            if tag == _q(NS_P, "sp"):
                shape = self._shape(child, group)
                if shape:
                    out.append(shape)
            elif tag == _q(NS_P, "pic"):
                shape = self._picture(child, group)
                if shape:
                    out.append(shape)
            elif tag == _q(NS_P, "graphicFrame"):
                shape = self._table(child, group)
                if shape:
                    out.append(shape)
            elif tag == _q(NS_P, "grpSp"):
                gx, gy, gw, gh, _rot = self._shape_xfrm(child, group)
                gxfrm = self._find_xfrm(child)
                ch_off = _find(gxfrm, NS_A, "chOff") if gxfrm is not None else None
                ch_ext = _find(gxfrm, NS_A, "chExt") if gxfrm is not None else None
                g = (gx, gy, gw, gh,
                     _emu(ch_off.get("x", "0")) if ch_off is not None else 0,
                     _emu(ch_off.get("y", "0")) if ch_off is not None else 0,
                     _emu(ch_ext.get("cx", "0")) if ch_ext is not None else 0,
                     _emu(ch_ext.get("cy", "0")) if ch_ext is not None else 0)
                out.extend(self._shapes(child, g))
        return out

    def _slide(self, part: str) -> dict:
        self.slide_rels = _rels(self.zf, part)
        root = ET.fromstring(self.zf.read(part))
        csld = _find(root, NS_P, "cSld")
        background = "#ffffff"
        bg = _find(csld, NS_P, "bg") if csld is not None else None
        if bg is not None:
            bgpr = _find(bg, NS_P, "bgPr")
            if bgpr is not None:
                background = _solid_fill(bgpr, self.theme, background)
        tree = _find(csld, NS_P, "spTree") if csld is not None else None
        shapes = self._shapes(tree) if tree is not None else []
        return {"background": background, "shapes": shapes}

    def render(self) -> dict:
        slides = []
        lst = _find(self.root, NS_P, "sldIdLst")
        for sld in _findall(lst, NS_P, "sldId"):
            rid = sld.get(_q(NS_R, "id"), "")
            target = self.rels.get(rid, {}).get("target", "")
            if not target or target not in self.zf.namelist():
                continue
            try:
                slides.append(self._slide(target))
            except Exception:
                slides.append({"background": "#ffffff", "shapes": []})
        if not slides:
            raise OfficeError("This presentation has no readable slides")
        return {
            "type": "powerpoint",
            "name": self.name,
            "meta": self.meta,
            "size": {"w": self.size[0], "h": self.size[1]},
            "slides": slides,
        }


# --------------------------------------------------------------------------- public
def render(path: Path) -> dict:
    suffix = path.suffix.lower()
    if suffix == ".rtf":
        return _render_rtf(path)
    if suffix in (".docx", ".docm", ".xlsx", ".xlsm", ".pptx", ".ppsx", ".pptm"):
        try:
            zf = zipfile.ZipFile(path)
        except zipfile.BadZipFile:
            raise OfficeError("This file is not a valid Office document")
        with zf:
            if suffix in (".docx", ".docm"):
                return _Word(zf, path.name).render()
            if suffix in (".xlsx", ".xlsm"):
                return _Excel(zf, path.name).render()
            return _PowerPoint(zf, path.name).render()
    # old binary formats: give a best-effort text preview
    if suffix in (".doc", ".xls", ".ppt", ".pps"):
        text = _legacy_text(path) if suffix == ".doc" else ""
        return {
            "type": {"doc": "word", "xls": "excel", "ppt": "powerpoint", "pps": "powerpoint"}[suffix[1:]],
            "name": path.name,
            "meta": {},
            "unsupported": True,
            "text": text,
        }
    raise OfficeError("Unsupported document type")


def read_part(path: Path, name: str) -> tuple[bytes, str]:
    name = (name or "").replace("\\", "/").strip()
    if not name:
        raise OfficeError("No document part requested")
    norm = posixpath.normpath(name)
    if norm.startswith("../") or norm.startswith("/") or ".." in norm.split("/"):
        raise OfficeError("Invalid document part")
    if path.suffix.lower() not in (".docx", ".xlsx", ".pptx"):
        raise OfficeError("Not an Office package")
    try:
        with zipfile.ZipFile(path) as zf:
            if norm not in zf.namelist():
                raise OfficeError("Document part not found")
            data = zf.read(norm)
    except zipfile.BadZipFile:
        raise OfficeError("This file is not a valid Office document")
    ctype = mimetypes.guess_type(norm)[0] or "application/octet-stream"
    if ctype.startswith("text/") or ctype in ("application/xml",):
        ctype += "; charset=utf-8"
    return data, ctype


# --------------------------------------------------------------------------- creation
CONTENT_TYPES_HEAD = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
    '<Default Extension="xml" ContentType="application/xml"/>'
)

ROOT_RELS = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="%s"/>'
    '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>'
    '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>'
    '</Relationships>'
)

CORE_XML = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" '
    'xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" '
    'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">'
    '<dc:title>%s</dc:title><dc:creator>Win95 NAS</dc:creator>'
    '<cp:lastModifiedBy>Win95 NAS</cp:lastModifiedBy>'
    '<dcterms:created xsi:type="dcterms:W3CDTF">%s</dcterms:created>'
    '<dcterms:modified xsi:type="dcterms:W3CDTF">%s</dcterms:modified>'
    '</cp:coreProperties>'
)

APP_XML = (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
    '<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" '
    'xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes">'
    '<Application>Win95 NAS</Application></Properties>'
)


def _now() -> str:
    return _dt.datetime.now(_dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _docx_bytes() -> bytes:
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<w:body><w:p/><w:sectPr><w:pgSz w:w="12240" w:h="15840"/>'
        '<w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" '
        'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr></w:body></w:document>'
    )
    types = CONTENT_TYPES_HEAD + (
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", types)
        zf.writestr("_rels/.rels", ROOT_RELS % "word/document.xml")
        zf.writestr("word/document.xml", document)
        zf.writestr("docProps/core.xml", CORE_XML % ("Document", _now(), _now()))
        zf.writestr("docProps/app.xml", APP_XML)
    return buf.getvalue()


def _xlsx_bytes() -> bytes:
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>'
    )
    workbook_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '</Relationships>'
    )
    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<dimension ref="A1"/><sheetViews><sheetView workbookViewId="0"/></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/><sheetData/></worksheet>'
    )
    types = CONTENT_TYPES_HEAD + (
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", types)
        zf.writestr("_rels/.rels", ROOT_RELS % "xl/workbook.xml")
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", workbook_rels)
        zf.writestr("xl/worksheets/sheet1.xml", sheet)
        zf.writestr("docProps/core.xml", CORE_XML % ("Workbook", _now(), _now()))
        zf.writestr("docProps/app.xml", APP_XML)
    return buf.getvalue()


def _pptx_bytes() -> bytes:
    ns = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
          'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
    presentation = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:presentation {ns}>'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        '<p:sldIdLst><p:sldId id="256" r:id="rId2"/></p:sldIdLst>'
        '<p:sldSz cx="9144000" cy="6858000" type="screen4x3"/>'
        '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
    )
    pres_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>'
        '<Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>'
        '<Relationship Id="rId5" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>'
        '<Relationship Id="rId6" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>'
        '</Relationships>'
    )
    empty_tree = (
        '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>'
    )
    master = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:sldMaster {ns}><p:cSld>{empty_tree}</p:cSld>'
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" '
        'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" '
        'accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
        '<p:txStyles/></p:sldMaster>'
    )
    master_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
        '</Relationships>'
    )
    layout = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:sldLayout {ns} type="blank" preserve="1"><p:cSld name="Blank">{empty_tree}</p:cSld>'
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    )
    layout_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
        '</Relationships>'
    )
    slide = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:sld {ns}><p:cSld>{empty_tree}</p:cSld>'
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    )
    slide_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '</Relationships>'
    )
    theme = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">'
        '<a:themeElements>'
        '<a:clrScheme name="Office">'
        '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
        '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
        '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
        '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>'
        '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>'
        '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>'
        '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>'
        '</a:clrScheme>'
        '<a:fontScheme name="Office">'
        '<a:majorFont><a:latin typeface="Calibri Light"/><a:ea typeface=""/><a:cs typeface=""/></a:majorFont>'
        '<a:minorFont><a:latin typeface="Calibri"/><a:ea typeface=""/><a:cs typeface=""/></a:minorFont>'
        '</a:fontScheme>'
        '<a:fmtScheme name="Office">'
        '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
        '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
        '<a:ln w="25400"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln>'
        '<a:ln w="38100"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
        '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle>'
        '<a:effectStyle><a:effectLst/></a:effectStyle>'
        '<a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
        '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill>'
        '<a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
        '</a:fmtScheme></a:themeElements></a:theme>'
    )
    types = CONTENT_TYPES_HEAD + (
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        '<Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>'
        '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>'
        '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", types)
        zf.writestr("_rels/.rels", ROOT_RELS % "ppt/presentation.xml")
        zf.writestr("ppt/presentation.xml", presentation)
        zf.writestr("ppt/_rels/presentation.xml.rels", pres_rels)
        zf.writestr("ppt/slideMasters/slideMaster1.xml", master)
        zf.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", master_rels)
        zf.writestr("ppt/slideLayouts/slideLayout1.xml", layout)
        zf.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout_rels)
        zf.writestr("ppt/slides/slide1.xml", slide)
        zf.writestr("ppt/slides/_rels/slide1.xml.rels", slide_rels)
        zf.writestr("ppt/theme/theme1.xml", theme)
        zf.writestr("ppt/presProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
        zf.writestr("ppt/viewProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:viewPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
        zf.writestr("ppt/tableStyles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>')
        zf.writestr("docProps/core.xml", CORE_XML % ("Presentation", _now(), _now()))
        zf.writestr("docProps/app.xml", APP_XML)
    return buf.getvalue()


def create(kind: str) -> bytes:
    if kind == "word":
        return _docx_bytes()
    if kind == "excel":
        return _xlsx_bytes()
    if kind == "powerpoint":
        # Start with a real title + body slide so the editor has something to
        # click and type into straight away.
        return build_pptx({
            "size": {"w": 960, "h": 720},
            "slides": [{
                "background": "#ffffff",
                "shapes": [
                    {
                        "x": 80, "y": 80, "w": 800, "h": 150, "geom": "rect", "valign": "t",
                        "paragraphs": [{
                            "align": "center",
                            "runs": [{"text": "Click to add a title", "size": 40, "bold": True,
                                      "color": "#000080"}],
                        }],
                    },
                    {
                        "x": 80, "y": 270, "w": 800, "h": 300, "geom": "rect", "valign": "t",
                        "paragraphs": [{
                            "align": "center",
                            "runs": [{"text": "Click to add text", "size": 24, "color": "#000000"}],
                        }],
                    },
                ],
            }],
        })
    raise OfficeError("Unknown document type")


def default_name(kind: str) -> str:
    return DEFAULT_NAMES.get(kind, "New Document")


# ===========================================================================
# Saving: rebuild valid OOXML from the small models the editors produce.
# ===========================================================================

from html.parser import HTMLParser  # noqa: E402
from xml.sax.saxutils import escape as _esc  # noqa: E402


def _num(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return _esc(str(value))
    if number == int(number):
        return str(int(number))
    return repr(number)


def _to_hex(color):
    """Turn #rrggbb / rgb(...) into a bare 6-digit hex string."""
    if not color:
        return None
    color = str(color).strip()
    if color.startswith("#"):
        value = color[1:]
        if len(value) == 3:
            value = "".join(ch * 2 for ch in value)
        if re.match(r"^[0-9a-fA-F]{6}$", value):
            return value.upper()
    match = re.match(r"rgba?\(([^)]+)\)", color)
    if match:
        parts = [p.strip() for p in match.group(1).split(",")]
        if len(parts) >= 3:
            try:
                return "".join("%02X" % max(0, min(255, int(float(p)))) for p in parts[:3])
            except ValueError:
                return None
    names = {"black": "000000", "white": "FFFFFF", "red": "FF0000", "blue": "0000FF",
             "green": "008000", "yellow": "FFFF00", "gray": "808080", "grey": "808080"}
    return names.get(color.lower())


# --------------------------------------------------------------- Word (HTML -> docx)
class _WordHTML(HTMLParser):
    BLOCKS = {"p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "li",
              "blockquote", "pre", "td", "th"}
    FMT_TAGS = {"b": "bold", "strong": "bold", "i": "italic", "em": "italic",
                "u": "underline", "s": "strike", "strike": "strike"}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.blocks = []
        self.cur = None
        self.runs = []
        self.fmt = {"bold": 0, "italic": 0, "underline": 0, "strike": 0,
                    "color": None, "size": None, "background": None, "font": None}
        self.stack = []
        self.align = None
        self.heading = None
        self.list_kind = None
        self.level = 0

    def _push(self, tag):
        self.stack.append((tag, dict(self.fmt)))

    def _pop(self, tag):
        for index in range(len(self.stack) - 1, -1, -1):
            if self.stack[index][0] == tag:
                self.fmt = self.stack[index][1]
                del self.stack[index:]
                return

    def _start_block(self, tag, attrs):
        self._flush()
        self.cur = tag
        self.runs = []
        self.align = None
        self.heading = None
        self.list_kind = None
        self.level = 0
        info = dict(attrs)
        cls = info.get("class") or ""
        style = info.get("style") or ""
        heading = re.search(r"doc-h(\d)", cls)
        if heading:
            self.heading = int(heading.group(1))
        elif tag in ("h1", "h2", "h3", "h4", "h5", "h6"):
            self.heading = int(tag[1])
        if tag == "li":
            self.list_kind = "bullet"
        align = re.search(r"text-align\s*:\s*(left|right|center|justify)", style, re.I)
        if align:
            self.align = align.group(1).lower()
        margin = re.search(r"margin-left\s*:\s*(\d+)px", style, re.I)
        if margin:
            self.level = max(0, min(8, int(margin.group(1)) // 22))

    def _flush(self):
        if self.cur is None and not self.runs:
            return
        merged = []
        for run in self.runs:
            text = run.get("text", "")
            if not text:
                continue
            if merged:
                last = merged[-1]
                same = all(last.get(k) == run.get(k) for k in
                           ("bold", "italic", "underline", "strike", "color", "size", "background", "font"))
                if same:
                    last["text"] += text
                    continue
            merged.append(dict(run))
        if merged and any(r["text"].strip() for r in merged) or self.cur:
            self.blocks.append({
                "runs": merged,
                "text": "".join(r["text"] for r in merged),
                "align": self.align,
                "heading": self.heading,
                "list": self.list_kind,
                "level": self.level,
            })
        self.cur = None
        self.runs = []
        self.align = None
        self.heading = None
        self.list_kind = None
        self.level = 0

    def handle_starttag(self, tag, attrs):
        tag = tag.lower()
        if tag in ("br",):
            self.runs.append({"text": "\n"})
            return
        if tag in self.BLOCKS:
            self._start_block(tag, attrs)
            return
        if tag == "span":
            self._push(tag)
            info = dict(attrs)
            style = info.get("style") or ""
            weight = re.search(r"font-weight\s*:\s*(\d+|bold)", style, re.I)
            if weight:
                value = weight.group(1).lower()
                if value == "bold" or int(value) >= 600:
                    self.fmt["bold"] += 1
            if re.search(r"font-style\s*:\s*italic", style, re.I):
                self.fmt["italic"] += 1
            if re.search(r"text-decoration[^;]*underline", style, re.I):
                self.fmt["underline"] += 1
            if re.search(r"text-decoration[^;]*line-through", style, re.I):
                self.fmt["strike"] += 1
            color = re.search(r"(?:^|;)\s*color\s*:\s*([^;]+)", style, re.I)
            if color:
                self.fmt["color"] = color.group(1).strip()
            background = re.search(r"background(?:-color)?\s*:\s*([^;]+)", style, re.I)
            if background:
                self.fmt["background"] = background.group(1).strip()
            size = re.search(r"font-size\s*:\s*([\d.]+)px", style, re.I)
            if size:
                self.fmt["size"] = float(size.group(1))
            font = re.search(r"font-family\s*:\s*([^;]+)", style, re.I)
            if font:
                self.fmt["font"] = font.group(1).strip().strip("'\"")
            return
        if tag in self.FMT_TAGS:
            self._push(tag)
            self.fmt[self.FMT_TAGS[tag]] += 1

    def handle_endtag(self, tag):
        tag = tag.lower()
        if tag in self.BLOCKS:
            if tag in ("table",):
                return
            self._flush()
            return
        if tag in ("span",) or tag in self.FMT_TAGS:
            self._pop(tag)

    def handle_data(self, data):
        if not data:
            return
        if self.cur is None:
            self.cur = "p"
        text = data.replace("\xa0", " ")
        self.runs.append({
            "text": text,
            "bold": self.fmt["bold"] > 0,
            "italic": self.fmt["italic"] > 0,
            "underline": self.fmt["underline"] > 0,
            "strike": self.fmt["strike"] > 0,
            "color": _to_hex(self.fmt["color"]),
            "background": _to_hex(self.fmt["background"]),
            "size": self.fmt["size"],
            "font": self.fmt["font"],
        })


def _word_runs_xml(runs):
    out = []
    for run in runs or []:
        text = run.get("text", "")
        if text == "":
            continue
        props = []
        if run.get("bold"):
            props.append("<w:b/>")
        if run.get("italic"):
            props.append("<w:i/>")
        if run.get("underline"):
            props.append('<w:u w:val="single"/>')
        if run.get("strike"):
            props.append("<w:strike/>")
        color = _to_hex(run.get("color"))
        if color:
            props.append(f'<w:color w:val="{color}"/>')
        if run.get("background"):
            bg = _to_hex(run.get("background"))
            if bg:
                props.append(f'<w:shd w:val="clear" w:color="auto" w:fill="{bg}"/>')
        size = run.get("size")
        if size:
            props.append(f'<w:sz w:val="{max(2, int(round(float(size) * 1.5)))}"/>')
        font = run.get("font")
        if font:
            props.append(f'<w:rFonts w:ascii="{_esc(font)}" w:hAnsi="{_esc(font)}"/>')
        rpr = "<w:rPr>" + "".join(props) + "</w:rPr>" if props else ""
        pieces = text.split("\n")
        body = []
        for index, piece in enumerate(pieces):
            if index:
                body.append("<w:br/>")
            if piece:
                body.append(f'<w:t xml:space="preserve">{_esc(piece)}</w:t>')
        out.append(f"<w:r>{rpr}{''.join(body)}</w:r>")
    return "".join(out)


def _word_paragraph(block, counters):
    ppr = []
    heading = block.get("heading")
    if heading:
        ppr.append(f'<w:pStyle w:val="Heading{min(4, int(heading))}"/>')
    align = block.get("align")
    if align in ("left", "center", "right", "justify"):
        ppr.append(f'<w:jc w:val="{align}"/>')
    if block.get("level"):
        ppr.append(f'<w:ind w:left="{int(block["level"]) * 440}"/>')
    runs = list(block.get("runs") or [])
    if block.get("list"):
        level = int(block.get("level") or 0)
        if block["list"] == "number":
            counters[level] = counters.get(level, 0) + 1
            for key in list(counters):
                if key > level:
                    del counters[key]
            marker = f"{counters[level]}.  "
        else:
            marker = "\u2022  "
        runs = [{"text": marker}] + runs
    ppr_xml = "<w:pPr>" + "".join(ppr) + "</w:pPr>" if ppr else ""
    return f"<w:p>{ppr_xml}{_word_runs_xml(runs)}</w:p>"


def build_docx(model):
    parser = _WordHTML()
    html = model.get("html")
    if html:
        parser.feed(html)
        parser.close()
        parser._flush()
        blocks = parser.blocks
    else:
        blocks = model.get("blocks") or []
    counters = {}
    paragraphs = [_word_paragraph(block, counters) for block in blocks]
    if not paragraphs:
        paragraphs.append("<w:p/>")
    page = model.get("page") or {}
    width = int((page.get("width") or 8.5) * 1440)
    height = int((page.get("height") or 11) * 1440)
    margins = page.get("margins") or {}
    top = int((margins.get("top", 1) or 1) * 1440)
    right = int((margins.get("right", 1) or 1) * 1440)
    bottom = int((margins.get("bottom", 1) or 1) * 1440)
    left = int((margins.get("left", 1) or 1) * 1440)
    sect = (
        f'<w:sectPr><w:pgSz w:w="{width}" w:h="{height}"/>'
        f'<w:pgMar w:top="{top}" w:right="{right}" w:bottom="{bottom}" w:left="{left}" '
        'w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>'
    )
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<w:body>{"".join(paragraphs)}{sect}</w:body></w:document>'
    )
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        '<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri"/>'
        '<w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults>'
        + "".join(
            f'<w:style w:type="paragraph" w:styleId="Heading{n}"><w:name w:val="heading {n}"/>'
            f'<w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>'
            f'<w:rPr><w:b/><w:sz w:val="{max(24, 40 - n * 4)}"/></w:rPr></w:style>'
            for n in (1, 2, 3, 4)
        )
        + '<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>'
        '</w:styles>'
    )
    types = CONTENT_TYPES_HEAD + (
        '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>'
    )
    doc_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", types)
        zf.writestr("_rels/.rels", ROOT_RELS % "word/document.xml")
        zf.writestr("word/document.xml", document)
        zf.writestr("word/styles.xml", styles)
        zf.writestr("word/_rels/document.xml.rels", doc_rels)
        zf.writestr("docProps/core.xml", CORE_XML % ("Document", _now(), _now()))
        zf.writestr("docProps/app.xml", APP_XML)
    return buf.getvalue()


# -------------------------------------------------------------- Excel -> xlsx
def _col_letter(index: int) -> str:
    out = ""
    n = int(index)
    while n > 0:
        n, rem = divmod(n - 1, 26)
        out = chr(65 + rem) + out
    return out or "A"


def _cell_style_key(cell):
    return (
        bool(cell.get("bold")), bool(cell.get("italic")), bool(cell.get("underline")),
        _to_hex(cell.get("color")) or "", _to_hex(cell.get("background")) or "",
        cell.get("align") or "", int(cell.get("size") or 0), bool(cell.get("wrap")),
    )


def _xlsx_styles(cells):
    keys = []
    seen = {}
    for cell in cells:
        key = _cell_style_key(cell)
        if key not in seen:
            seen[key] = len(keys) + 1  # 0 is the default xf
            keys.append(key)
    fonts = ['<font><sz val="11"/><name val="Calibri"/></font>']
    fills = ['<fill><patternFill patternType="none"/></fill>',
             '<fill><patternFill patternType="gray125"/></fill>']
    xfs = ['<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>']
    for bold, italic, underline, color, background, align, size, wrap in keys:
        props = [f'<sz val="{size or 11}"/>', '<name val="Calibri"/>']
        if bold:
            props.append("<b/>")
        if italic:
            props.append("<i/>")
        if underline:
            props.append("<u/>")
        if color:
            props.append(f'<color rgb="FF{color}"/>')
        fonts.append("<font>" + "".join(props) + "</font>")
        font_id = len(fonts) - 1
        fill_id = 0
        if background:
            fills.append(f'<fill><patternFill patternType="solid"><fgColor rgb="FF{background}"/><bgColor indexed="64"/></patternFill></fill>')
            fill_id = len(fills) - 1
        alignment = ""
        if align or wrap:
            attrs = ""
            if align in ("left", "center", "right"):
                attrs += f' horizontal="{align}"'
            if wrap:
                attrs += ' wrapText="1"'
            alignment = f"<alignment{attrs}/>"
        xfs.append(f'<xf numFmtId="0" fontId="{font_id}" fillId="{fill_id}" borderId="0" xfId="0" applyFont="1" applyFill="1">{alignment}</xf>')
    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<fonts count="{len(fonts)}">{"".join(fonts)}</fonts>'
        f'<fills count="{len(fills)}">{"".join(fills)}</fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        f'<cellXfs count="{len(xfs)}">{"".join(xfs)}</cellXfs>'
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )
    return styles, seen


def _sheet_xml(sheet, style_index):
    rows = sheet.get("rows") or []
    row_xml = []
    max_row = 0
    max_col = 0
    for row in sorted(rows, key=lambda item: int(item.get("r") or 0)):
        r = int(row.get("r") or 0)
        if r <= 0:
            continue
        cell_xml = []
        for cell in sorted(row.get("cells") or [], key=lambda item: int(item.get("c") or 0)):
            c = int(cell.get("c") or 0)
            if c <= 0:
                continue
            max_row = max(max_row, r)
            max_col = max(max_col, c)
            ref = _col_letter(c) + str(r)
            style = style_index.get(_cell_style_key(cell), 0)
            s_attr = f' s="{style}"' if style else ""
            formula = cell.get("f")
            value = cell.get("v")
            kind = cell.get("t")
            if formula:
                body = f"<f>{_esc(str(formula))}</f>"
                if value is not None and str(value) != "":
                    if kind == "n" or isinstance(value, (int, float)):
                        body += f"<v>{_num(value)}</v>"
                    else:
                        body += f"<v>{_esc(str(value))}</v>"
                cell_xml.append(f'<c r="{ref}"{s_attr}>{body}</c>')
            elif value is None or value == "":
                if style:
                    cell_xml.append(f'<c r="{ref}"{s_attr}/>')
            elif kind == "n" or isinstance(value, (int, float)):
                cell_xml.append(f'<c r="{ref}"{s_attr}><v>{_num(value)}</v></c>')
            else:
                cell_xml.append(
                    f'<c r="{ref}"{s_attr} t="inlineStr"><is><t xml:space="preserve">{_esc(str(value))}</t></is></c>'
                )
        if cell_xml:
            row_xml.append(f'<row r="{r}">{"".join(cell_xml)}</row>')
    cols = []
    widths = sheet.get("widths") or {}
    for key, px in sorted(widths.items(), key=lambda kv: int(kv[0]) if str(kv[0]).isdigit() else 0):
        try:
            index = int(key)
            width = max(4, min(80, float(px) / 7.0))
        except (TypeError, ValueError):
            continue
        cols.append(f'<col min="{index}" max="{index}" width="{width:.2f}" customWidth="1"/>')
    cols_xml = f"<cols>{''.join(cols)}</cols>" if cols else ""
    dimension = "A1" if not max_row else f"A1:{_col_letter(max_col)}{max_row}"
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        f'<dimension ref="{dimension}"/>'
        '<sheetViews><sheetView workbookViewId="0"/></sheetViews>'
        '<sheetFormatPr defaultRowHeight="15"/>'
        f'{cols_xml}<sheetData>{"".join(row_xml)}</sheetData></worksheet>'
    )


def build_xlsx(model):
    sheets = model.get("sheets") or [{"name": "Sheet1", "rows": []}]
    if not sheets:
        sheets = [{"name": "Sheet1", "rows": []}]
    all_cells = []
    for sheet in sheets:
        for row in sheet.get("rows") or []:
            all_cells.extend(row.get("cells") or [])
    styles, style_index = _xlsx_styles(all_cells)

    sheet_entries = []
    for index, sheet in enumerate(sheets, start=1):
        name = _esc(str(sheet.get("name") or f"Sheet{index}"))[:31]
        sheet_entries.append(f'<sheet name="{name}" sheetId="{index}" r:id="rId{index}"/>')
    workbook = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        f'<sheets>{"".join(sheet_entries)}</sheets></workbook>'
    )
    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">']
    for index in range(1, len(sheets) + 1):
        rels.append(
            f'<Relationship Id="rId{index}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet{index}.xml"/>'
        )
    rels.append(
        f'<Relationship Id="rId{len(sheets) + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
    )
    rels.append("</Relationships>")
    overrides = "".join(
        f'<Override PartName="/xl/worksheets/sheet{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        for index in range(1, len(sheets) + 1)
    )
    types = CONTENT_TYPES_HEAD + (
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        + overrides +
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", types)
        zf.writestr("_rels/.rels", ROOT_RELS % "xl/workbook.xml")
        zf.writestr("xl/workbook.xml", workbook)
        zf.writestr("xl/_rels/workbook.xml.rels", "".join(rels))
        zf.writestr("xl/styles.xml", styles)
        for index, sheet in enumerate(sheets, start=1):
            zf.writestr(f"xl/worksheets/sheet{index}.xml", _sheet_xml(sheet, style_index))
        zf.writestr("docProps/core.xml", CORE_XML % ("Workbook", _now(), _now()))
        zf.writestr("docProps/app.xml", APP_XML)
    return buf.getvalue()


# --------------------------------------------------------- PowerPoint -> pptx
def _to_emu(px):
    try:
        return int(round(float(px) * EMU_PER_PX))
    except (TypeError, ValueError):
        return 0


def _ppt_run_xml(run):
    size = run.get("size")
    sz = max(100, int(round(float(size) * 75))) if size else 1800
    attrs = [f'lang="en-US" sz="{sz}"']
    if run.get("bold"):
        attrs.append('b="1"')
    if run.get("italic"):
        attrs.append('i="1"')
    if run.get("underline"):
        attrs.append('u="sng"')
    color = _to_hex(run.get("color"))
    fill = f'<a:solidFill><a:srgbClr val="{color}"/></a:solidFill>' if color else ""
    font = run.get("font")
    latin = f'<a:latin typeface="{_esc(font)}"/>' if font else ""
    text = _esc(str(run.get("text", "")))
    return f'<a:r><a:rPr {" ".join(attrs)}>{fill}{latin}</a:rPr><a:t>{text}</a:t></a:r>'


def _ppt_para_xml(para):
    align = para.get("align") or "left"
    algn = {"left": "l", "center": "ctr", "right": "r", "justify": "just"}.get(align, "l")
    level = int(para.get("level") or 0)
    ppr = [f'<a:pPr algn="{algn}"']
    marl = 342900 * (level + 1)
    ppr[0] += f' marL="{marl}" indent="-342900"'
    ppr[0] += ">"
    if para.get("bullet") == "number":
        ppr.append('<a:buFont typeface="+mj-lt"/><a:buAutoNum type="arabicPeriod"/>')
    elif para.get("bullet"):
        ppr.append('<a:buFont typeface="Arial"/><a:buChar char="\u2022"/>')
    else:
        ppr.append("<a:buNone/>")
    ppr.append("</a:pPr>")
    runs = "".join(_ppt_run_xml(run) for run in (para.get("runs") or []))
    if not runs:
        runs = '<a:endParaRPr lang="en-US"/>'
    return f"<a:p>{''.join(ppr)}{runs}</a:p>"


def _ppt_shape_xml(shape, shape_id):
    x = _to_emu(shape.get("x", 0))
    y = _to_emu(shape.get("y", 0))
    w = max(1, _to_emu(shape.get("w", 10)))
    h = max(1, _to_emu(shape.get("h", 10)))
    rot = int(float(shape.get("rot") or 0) * 60000)
    rot_attr = f' rot="{rot}"' if rot else ""
    geom = shape.get("geom") or "rect"
    prst = "ellipse" if geom == "ellipse" else ("roundRect" if str(geom).lower().startswith("round") else "rect")
    fill = _to_hex(shape.get("fill"))
    line = _to_hex(shape.get("line"))
    fill_xml = f'<a:solidFill><a:srgbClr val="{fill}"/></a:solidFill>' if fill else "<a:noFill/>"
    line_xml = f'<a:ln w="{int(float(shape.get("lineWidth") or 1) * 12700)}"><a:solidFill><a:srgbClr val="{line}"/></a:solidFill></a:ln>' if line else "<a:ln><a:noFill/></a:ln>"
    sp_pr = (
        f'<p:spPr><a:xfrm{rot_attr}><a:off x="{x}" y="{y}"/><a:ext cx="{w}" cy="{h}"/></a:xfrm>'
        f'<a:prstGeom prst="{prst}"><a:avLst/></a:prstGeom>{fill_xml}{line_xml}</p:spPr>'
    )
    paragraphs = shape.get("paragraphs") or []
    if paragraphs:
        anchor = {"top": "t", "ctr": "ctr", "b": "b"}.get(shape.get("valign") or "top", "t")
        body = "".join(_ppt_para_xml(para) for para in paragraphs)
        tx = (
            f'<p:txBody><a:bodyPr wrap="square" lIns="91440" tIns="45720" rIns="91440" bIns="45720" anchor="{anchor}"/>'
            f'<a:lstStyle/>{body}</p:txBody>'
        )
    else:
        tx = ""
    return (
        f'<p:sp><p:nvSpPr><p:cNvPr id="{shape_id}" name="Shape {shape_id}"/>'
        f'<p:cNvSpPr{" txBox=\"1\"" if paragraphs else ""}/><p:nvPr/></p:nvSpPr>'
        f'{sp_pr}{tx}</p:sp>'
    )


def _slide_xml(slide, slide_index):
    ns = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
          'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
    background = _to_hex(slide.get("background")) or "FFFFFF"
    shapes = "".join(_ppt_shape_xml(shape, index + 2)
                     for index, shape in enumerate(slide.get("shapes") or []))
    tree = (
        '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>'
        f'{shapes}</p:spTree>'
    )
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:sld {ns}><p:cSld>'
        f'<p:bg><p:bgPr><a:solidFill><a:srgbClr val="{background}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>'
        f'{tree}</p:cSld>'
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>'
    )


def build_pptx(model):
    ns = ('xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" '
          'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" '
          'xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"')
    size = model.get("size") or {}
    width_px = float(size.get("w") or 960)
    height_px = float(size.get("h") or 720)
    slides = model.get("slides") or [{"shapes": []}]
    if not slides:
        slides = [{"shapes": []}]
    count = len(slides)
    sld_ids = "".join(f'<p:sldId id="{256 + i}" r:id="rId{i + 2}"/>' for i in range(count))
    presentation = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:presentation {ns}>'
        '<p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst>'
        f'<p:sldIdLst>{sld_ids}</p:sldIdLst>'
        f'<p:sldSz cx="{_to_emu(width_px)}" cy="{_to_emu(height_px)}"/>'
        '<p:notesSz cx="6858000" cy="9144000"/></p:presentation>'
    )
    rels = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>']
    for index in range(1, count + 1):
        rels.append(f'<Relationship Id="rId{index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide{index}.xml"/>')
    next_id = count + 2
    rels.append(f'<Relationship Id="rId{next_id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="theme/theme1.xml"/>')
    rels.append(f'<Relationship Id="rId{next_id + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/presProps" Target="presProps.xml"/>')
    rels.append(f'<Relationship Id="rId{next_id + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/viewProps" Target="viewProps.xml"/>')
    rels.append(f'<Relationship Id="rId{next_id + 3}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/tableStyles" Target="tableStyles.xml"/>')
    rels.append("</Relationships>")

    empty_tree = (
        '<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>'
        '<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/>'
        '<a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree>'
    )
    master = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:sldMaster {ns}><p:cSld>{empty_tree}</p:cSld>'
        '<p:clrMap bg1="lt1" tx1="dk1" bg2="lt2" tx2="dk2" accent1="accent1" '
        'accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" '
        'accent6="accent6" hlink="hlink" folHlink="folHlink"/>'
        '<p:sldLayoutIdLst><p:sldLayoutId id="2147483649" r:id="rId1"/></p:sldLayoutIdLst>'
        '<p:txStyles/></p:sldMaster>'
    )
    master_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/>'
        '</Relationships>'
    )
    layout = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        f'<p:sldLayout {ns} type="blank" preserve="1"><p:cSld name="Blank">{empty_tree}</p:cSld>'
        '<p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>'
    )
    layout_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/>'
        '</Relationships>'
    )
    slide_rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/>'
        '</Relationships>'
    )
    theme = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n'
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">'
        '<a:themeElements><a:clrScheme name="Office">'
        '<a:dk1><a:sysClr val="windowText" lastClr="000000"/></a:dk1>'
        '<a:lt1><a:sysClr val="window" lastClr="FFFFFF"/></a:lt1>'
        '<a:dk2><a:srgbClr val="44546A"/></a:dk2><a:lt2><a:srgbClr val="E7E6E6"/></a:lt2>'
        '<a:accent1><a:srgbClr val="4472C4"/></a:accent1><a:accent2><a:srgbClr val="ED7D31"/></a:accent2>'
        '<a:accent3><a:srgbClr val="A5A5A5"/></a:accent3><a:accent4><a:srgbClr val="FFC000"/></a:accent4>'
        '<a:accent5><a:srgbClr val="5B9BD5"/></a:accent5><a:accent6><a:srgbClr val="70AD47"/></a:accent6>'
        '<a:hlink><a:srgbClr val="0563C1"/></a:hlink><a:folHlink><a:srgbClr val="954F72"/></a:folHlink>'
        '</a:clrScheme>'
        '<a:fontScheme name="Office"><a:majorFont><a:latin typeface="Calibri Light"/></a:majorFont>'
        '<a:minorFont><a:latin typeface="Calibri"/></a:minorFont></a:fontScheme>'
        '<a:fmtScheme name="Office">'
        '<a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst>'
        '<a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst>'
        '<a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst>'
        '<a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst>'
        '</a:fmtScheme></a:themeElements></a:theme>'
    )
    slide_overrides = "".join(
        f'<Override PartName="/ppt/slides/slide{index}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>'
        for index in range(1, count + 1)
    )
    types = CONTENT_TYPES_HEAD + (
        '<Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/>'
        '<Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/>'
        '<Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/>'
        + slide_overrides +
        '<Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'
        '<Override PartName="/ppt/presProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presProps+xml"/>'
        '<Override PartName="/ppt/viewProps.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.viewProps+xml"/>'
        '<Override PartName="/ppt/tableStyles.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.tableStyles+xml"/>'
        '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'
        '<Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>'
        '</Types>'
    )
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml", types)
        zf.writestr("_rels/.rels", ROOT_RELS % "ppt/presentation.xml")
        zf.writestr("ppt/presentation.xml", presentation)
        zf.writestr("ppt/_rels/presentation.xml.rels", "".join(rels))
        zf.writestr("ppt/slideMasters/slideMaster1.xml", master)
        zf.writestr("ppt/slideMasters/_rels/slideMaster1.xml.rels", master_rels)
        zf.writestr("ppt/slideLayouts/slideLayout1.xml", layout)
        zf.writestr("ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout_rels)
        for index, slide in enumerate(slides, start=1):
            zf.writestr(f"ppt/slides/slide{index}.xml", _slide_xml(slide, index))
            zf.writestr(f"ppt/slides/_rels/slide{index}.xml.rels", slide_rels)
        zf.writestr("ppt/theme/theme1.xml", theme)
        zf.writestr("ppt/presProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:presentationPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
        zf.writestr("ppt/viewProps.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:viewPr xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"/>')
        zf.writestr("ppt/tableStyles.xml", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<a:tblStyleLst xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" def="{5C22544A-7EE6-4342-B048-85BDC9FD1C3A}"/>')
        zf.writestr("docProps/core.xml", CORE_XML % ("Presentation", _now(), _now()))
        zf.writestr("docProps/app.xml", APP_XML)
    return buf.getvalue()


def build(kind: str, model: dict) -> bytes:
    if kind == "word":
        return build_docx(model or {})
    if kind == "excel":
        return build_xlsx(model or {})
    if kind == "powerpoint":
        return build_pptx(model or {})
    raise OfficeError("Unknown document type")
