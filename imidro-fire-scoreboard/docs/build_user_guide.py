"""Build the Persian GitHub user guide as a styled PDF."""

from pathlib import Path
import markdown
from weasyprint import HTML

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "USER_GUIDE_FA.md"
OUTPUT = ROOT / "IMIDRO-Fire-Scoreboard-User-Guide-FA.pdf"

body = markdown.markdown(
    SOURCE.read_text(encoding="utf-8"),
    extensions=["extra", "tables", "fenced_code", "sane_lists"],
)

css = r"""
@page {
  size: A4;
  margin: 18mm 16mm 18mm 16mm;
  @top-right { content: "سامانه امتیازدهی المپیاد آتش‌نشانی ایمیدرو"; color: #6f7782; font-size: 8.5pt; }
  @bottom-left { content: "امور آموزش و توسعه شایستگی مجتمع مس سرچشمه"; color: #7b838d; font-size: 7.5pt; }
  @bottom-right { content: "صفحه " counter(page) " از " counter(pages); color: #7b838d; font-size: 8pt; }
}
@page:first {
  margin: 15mm 18mm 18mm 18mm;
  @top-right { content: none; }
  @bottom-left { content: none; }
  @bottom-right { content: none; }
}
html { direction: rtl; }
body {
  font-family: "DejaVu Sans", sans-serif;
  direction: rtl;
  text-align: right;
  color: #17202a;
  font-size: 10.3pt;
  line-height: 1.82;
}
.brand-row {
  width: 100%;
  border-collapse: separate;
  min-height: 38mm;
  margin-bottom: 5mm;
}
.brand-row td { border: 0; background: white; vertical-align: top; padding: 0; }
.brand-nicico { width: 45%; text-align: right; }
.brand-nicico img { width: 28mm; height: 28mm; object-fit: contain; }
.brand-credit {
  width: 45%;
  text-align: left;
  color: #5d2222;
  background: #fff5f3;
  border-left: 3px solid #c71920;
  padding: 4mm 5mm;
  border-radius: 2mm;
  font-size: 9pt;
  line-height: 1.7;
}
p[align="center"] { text-align: center; margin: 4mm 0 2mm; }
p[align="center"] img { width: 78mm; height: 78mm; object-fit: contain; }
h1 {
  color: #111820;
  text-align: center;
  font-size: 21pt;
  line-height: 1.55;
  margin: 5mm 7mm 3mm;
  page-break-after: avoid;
}
h1 + p { text-align: center; color: #a11218; font-weight: bold; font-size: 11.5pt; }
h2 {
  color: #9f1118;
  font-size: 15pt;
  margin: 8mm 0 3mm;
  padding-right: 4mm;
  border-right: 4px solid #d43b24;
  page-break-after: avoid;
}
h3 {
  color: #253342;
  font-size: 12pt;
  margin: 6mm 0 2mm;
  page-break-after: avoid;
}
p { margin: 0 0 3mm; orphans: 3; widows: 3; }
ul, ol { margin: 1mm 4mm 4mm 0; padding-right: 5mm; }
li { margin: 0 0 1.5mm; padding-right: 1mm; }
strong { color: #151a20; }
hr { border: 0; height: 1px; background: #d8dde3; margin: 7mm 0; }
.cover-break { break-after: page; }
table {
  width: 100%;
  border-collapse: collapse;
  margin: 4mm 0 6mm;
  font-size: 8.7pt;
  page-break-inside: auto;
}
thead { display: table-header-group; }
tr { page-break-inside: avoid; }
th {
  background: #242d38;
  color: white;
  border: 1px solid #3e4955;
  padding: 2.4mm 2.2mm;
  text-align: right;
  font-weight: bold;
}
td {
  border: 1px solid #d8dde3;
  padding: 2.2mm;
  vertical-align: middle;
}
tbody tr:nth-child(even) { background: #f7f8fa; }
code {
  direction: ltr;
  unicode-bidi: embed;
  font-family: "DejaVu Sans Mono", monospace;
  color: #8d1118;
  background: #f3f4f6;
  padding: 0.3mm 1mm;
  border-radius: 1mm;
  font-size: 8.3pt;
}
pre {
  direction: ltr;
  text-align: left;
  background: #151b23;
  color: #f7f7f7;
  padding: 4mm;
  border-radius: 2mm;
  overflow-wrap: anywhere;
  white-space: pre-wrap;
  font-size: 7.8pt;
  line-height: 1.55;
  page-break-inside: avoid;
}
pre code { background: transparent; color: inherit; padding: 0; }
input[type="checkbox"] { margin-left: 2mm; }
blockquote { margin: 4mm 0; padding: 3mm 5mm; border-right: 3px solid #c71920; background: #fff7f5; }
body > p:last-of-type { text-align: center; color: #5b626a; }
"""

html = f"""<!doctype html>
<html lang="fa" dir="rtl">
<head><meta charset="utf-8"><title>راهنمای سامانه امتیازدهی المپیاد آتش‌نشانی ایمیدرو</title><style>{css}</style></head>
<body>{body}</body>
</html>"""

HTML(string=html, base_url=str(ROOT)).write_pdf(str(OUTPUT))
print(OUTPUT)
