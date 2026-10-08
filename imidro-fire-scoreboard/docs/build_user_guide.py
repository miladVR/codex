"""Render the Markdown guide as a Persian PDF with embedded B Zar fonts.

Install docs/requirements-guide.txt, then run this script. Original TTF files
are not required; the bundled webfonts are decoded in memory.
"""
from pathlib import Path
from io import BytesIO
import re
from xml.sax.saxutils import unescape
import arabic_reshaper
from bidi.algorithm import get_display
from fontTools.ttLib import TTFont as FontToolsFont
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor, white
from reportlab.lib.utils import ImageReader
from reportlab.lib.pagesizes import A4

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "IMIDRO-Fire-Scoreboard-User-Guide-FA.pdf"
CREDIT = "امور آموزش و توسعه شایستگی مجتمع مس سرچشمه رفسنجان"
for name, filename in [("Zar", "BZar.woff"), ("ZarBold", "BZar-Bold.woff")]:
    font = FontToolsFont(ROOT.parent / "assets" / "fonts" / filename)
    font.flavor = None
    stream = BytesIO(); font.save(stream); stream.seek(0)
    pdfmetrics.registerFont(TTFont(name, stream))

W, H = A4
LEFT, RIGHT, TOP, BOTTOM = 45, W - 45, H - 60, 58
INK, MUTED, RED, LINE = map(HexColor, ["#18283e", "#566b82", "#a51d2d", "#ccd6e1"])
c = canvas.Canvas(str(OUTPUT), pagesize=A4)
c.setTitle("راهنمای سامانه امتیازدهی آتش‌نشانان ایمیدرو - نسخه ۱.۴.۲")
c.setAuthor(CREDIT)
y = TOP
page = 1

def fa(text):
    return get_display(arabic_reshaper.reshape(str(text)))

def clean(text):
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r"\1 (\2)", text)
    return unescape(text.replace("**", "").replace("`", "").strip())

def width(text, size=12.5, font="Zar"):
    return sum(pdfmetrics.stringWidth(run, face, size) for face, run in runs(text, font))

def runs(text, font):
    # B Zar has no usable Latin alphabet: keep Persian shaped in B Zar and
    # render Latin UI labels/URLs with an embedded PDF standard font.
    result=[]
    for char in fa(text):
        face=("Helvetica-Bold" if font=="ZarBold" else "Helvetica") if ord(char)<256 else font
        if result and result[-1][0]==face:result[-1]=(face,result[-1][1]+char)
        else:result.append((face,char))
    return result

def drawtext(text, x, baseline, font="Zar", size=12.5, align="right"):
    parts=runs(text,font);total=sum(pdfmetrics.stringWidth(run,face,size) for face,run in parts)
    left=x-total if align=="right" else x-total/2 if align=="center" else x
    for face,run in parts:
        c.setFont(face,size);c.drawString(left,baseline,run)
        left+=pdfmetrics.stringWidth(run,face,size)

def wrap(text, available, size=12.5, font="Zar"):
    result=[]; current=""
    for word in text.split():
        if width(word,size,font)>available:
            if current: result.append(current); current=""
            chunk=""
            for char in word:
                if chunk and width(chunk+char,size,font)>available:
                    result.append(chunk); chunk=""
                chunk+=char
            current=chunk
        elif current and width(current+" "+word,size,font)>available:
            result.append(current); current=word
        else: current=(current+" "+word).strip()
    if current:result.append(current)
    return result or [""]

def footer():
    c.setStrokeColor(LINE); c.line(LEFT,44,RIGHT,44)
    c.setFillColor(MUTED); c.setFont("Zar",10)
    drawtext(CREDIT,W/2,29,size=10,align="center")
    drawtext(str(page).translate(str.maketrans('0123456789','۰۱۲۳۴۵۶۷۸۹')),LEFT,29,size=9,align="left")

def newpage():
    global y,page
    footer();c.showPage();page+=1;y=TOP
    c.setFillColor(MUTED);c.setFont("Zar",10)
    drawtext("راهنمای سامانه امتیازدهی آتش‌نشانان ایمیدرو | نسخه ۱.۴.۲",RIGHT,H-31,size=10)

def ensure(height):
    if y-height<BOTTOM:newpage()

def paragraph(text,size=12.5,bold=False,indent=0,gap=6):
    global y
    font="ZarBold" if bold else "Zar";leading=size*1.75
    lines=wrap(clean(text),RIGHT-LEFT-indent,size,font)
    ensure(min(2,len(lines))*leading+gap)
    for line in lines:
        ensure(leading);c.setFont(font,size);c.setFillColor(INK)
        drawtext(line,RIGHT-indent,y-size,font,size);y-=leading
    y-=gap

def heading(text,level):
    global y
    size=19 if level==2 else 15
    lines=wrap(clean(text),RIGHT-LEFT-15,size,"ZarBold")
    ensure(len(lines)*size*1.6+65);y-=9
    c.setFillColor(RED if level==2 else INK);c.setFont("ZarBold",size)
    if level==2:c.rect(RIGHT-3,y-size*1.5,3,size*1.5,fill=1,stroke=0)
    for line in lines:drawtext(line,RIGHT-12,y-size,"ZarBold",size);y-=size*1.6
    y-=6

def table(rows):
    global y
    count=len(rows[0]);sizes=[(RIGHT-LEFT)/count]*count
    if count==3 and rows[0][0]=="مرحله":sizes=[45,(RIGHT-LEFT-45)/2,(RIGHT-LEFT-45)/2]
    size=10.5;leading=18
    def row(cells,header=False):
        global y
        font="ZarBold" if header else "Zar"
        lines=[wrap(clean(cell),sizes[i]-14,size,font) for i,cell in enumerate(cells)]
        height=max(map(len,lines))*leading+14
        if y-height<BOTTOM:
            newpage()
            if not header:row(rows[0],True)
        x=RIGHT
        for i,parts in enumerate(lines):
            w=sizes[i];x-=w
            c.setFillColor(INK if header else HexColor("#f3f6f9"));c.setStrokeColor(LINE)
            c.rect(x,y-height,w,height,fill=1,stroke=1)
            c.setFont(font,size);c.setFillColor(white if header else INK)
            for j,line in enumerate(parts):drawtext(line,x+w-7,y-12-j*leading,font,size)
        y-=height
    ensure(65)
    for i,cells in enumerate(rows):row(cells,i==0)
    y-=12

def codeblock(lines):
    global y
    for line in lines:
        ensure(17);c.setFillColor(HexColor("#edf1f5"));c.rect(LEFT,y-17,RIGHT-LEFT,17,fill=1,stroke=0)
        size=min(8.7,8.7*(RIGHT-LEFT-16)/max(1,pdfmetrics.stringWidth(line,"Courier",8.7)))
        c.setFillColor(INK);c.setFont("Courier",size);c.drawString(LEFT+8,y-12,line);y-=17
    y-=12

# Cover: keep the provided image intact, including its Persian lettering.
c.setFillColor(RED);c.rect(0,H-16,W,16,fill=1,stroke=0)
c.drawImage(ImageReader(str(ROOT/'assets/nicico-logo.jpg')),LEFT,H-104,65,65,preserveAspectRatio=True,anchor='c',mask='auto')
c.setFont("ZarBold",12);c.setFillColor(RED);drawtext("توسعه‌دهنده و حامی",RIGHT,H-57,"ZarBold",12)
for i,line in enumerate(wrap(CREDIT,330,12,"Zar")):
    drawtext(line,RIGHT,H-80-i*20,size=12)
c.drawImage(ImageReader(str(ROOT/'assets/competition-logo.jpg')),W/2-130,H-400,260,260,preserveAspectRatio=True,mask='auto')
y=H-426
for text in ["راهنمای نصب و استفاده", "سامانه امتیازدهی مسابقات", "آتش‌نشانان ایمیدرو"]:
    c.setFillColor(INK);drawtext(text,W/2,y,"ZarBold",27,"center");y-=46
c.setFillColor(RED);drawtext("نسخه ۱.۴.۲ | از نصب تا پایان مسابقه",W/2,y-8,size=16,align="center")
c.setFillColor(MUTED);drawtext("قرعه‌کشی • ثبت و تأیید نتایج • نمایش زنده • گزارش PDF",W/2,y-46,size=13,align="center")
newpage()
source=(ROOT/'USER_GUIDE_FA.md').read_text(encoding='utf-8').splitlines()
start=next(i for i,line in enumerate(source) if line.startswith('## '))
i=start
while i<len(source):
    line=source[i].strip()
    if not line or line=='---' or line.startswith('<'):i+=1;continue
    if line.startswith('```'):
        block=[];i+=1
        while i<len(source) and not source[i].startswith('```'):block.append(source[i]);i+=1
        codeblock(block);i+=1;continue
    if line.startswith('|'):
        rows=[]
        while i<len(source) and source[i].strip().startswith('|'):
            cells=[x.strip() for x in source[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[:\- ]+',x) for x in cells):rows.append(cells)
            i+=1
        table(rows);continue
    if line.startswith('### '):heading(line[4:],3);i+=1;continue
    if line.startswith('## '):heading(line[3:],2);i+=1;continue
    if line.startswith('- '):paragraph('• '+line[2:],indent=10);i+=1;continue
    if re.match(r'^[۰-۹0-9]+[.،)]',line):paragraph(line,indent=8);i+=1;continue
    paragraph(line);i+=1
footer();c.save()
print(f'{OUTPUT} ({page} pages)')

