import json, html
from weasyprint import HTML
P='/workspace/projects/63d46980-7164-4457-910d-060f812d1fca'
g=json.load(open(P+'/work/shizuku-guide/guide.json'))
F=P+'/wakil/app/src/main/res/font/'
from PIL import Image
Image.open(P+'/wakil/app/src/main/res/drawable-nodpi/wakil_robot_head.webp').save('/tmp/head.png')
COL={'Cyan':'#00a8c0','Blue':'#2f6bff','Violet':'#7b4dff','Green':'#12a86b','Amber':'#e08a00','Red':'#e0334f','Magenta':'#c22fd9'}
E=html.escape
css=f"""
@font-face {{ font-family: Plex; src: url(file://{F}plex_arabic_regular.ttf); font-weight: 400; }}
@font-face {{ font-family: Plex; src: url(file://{F}plex_arabic_semibold.ttf); font-weight: 600; }}
@font-face {{ font-family: Plex; src: url(file://{F}plex_arabic_bold.ttf); font-weight: 700; }}
@font-face {{ font-family: Mono; src: url(file://{F}jetbrains_mono_regular.ttf); }}
@page {{ size: A4; margin: 16mm 15mm 18mm 15mm; @bottom-center {{ content: "دليل Shizuku · وكيل — صفحة " counter(page); font-family: Plex; font-size: 8.5pt; color: #8a9bb5; }} }}
body {{ font-family: Plex; direction: rtl; font-size: 10.6pt; line-height: 1.75; color: #1b2433; }}
.hero {{ background: linear-gradient(120deg,#05070d,#0b1a3a 55%,#2a1052); color: #e8f4ff; border-radius: 16px; padding: 18px 22px; display: flex; align-items: center; gap: 18px; }}
.hero img {{ width: 92px; height: 92px; border-radius: 50%; border: 2px solid #00e5ff; background:#0a1630; }}
.hero h1 {{ margin: 0; font-size: 22pt; font-weight: 700; }}
.hero p {{ margin: 4px 0 0; color: #b9c8de; font-size: 10.5pt; }}
h2 {{ font-size: 13.5pt; font-weight: 700; margin: 18px 0 8px; padding: 6px 12px; border-right: 5px solid var(--c); background: #f3f6fb; border-radius: 8px; color: #0d1626; page-break-after: avoid; }}
h2 .n {{ color: var(--c); margin-left: 6px; }}
.links {{ border: 1px solid #dbe3ef; border-radius: 12px; padding: 6px 12px; }}
.link {{ padding: 7px 0; border-bottom: 1px solid #eef2f7; }}
.link:last-child {{ border-bottom: none; }}
.link b {{ font-weight: 600; }}
.badge {{ background: #ffe14d; color: #3a2c00; border-radius: 20px; padding: 1px 9px; font-size: 8.5pt; font-weight: 600; margin-right: 6px; }}
.url {{ direction: ltr; unicode-bidi: embed; font-family: Mono; font-size: 8.6pt; color: #2f6bff; display: block; text-align: left; }}
.why {{ background: #fff8e0; border: 1px solid #f5d77a; border-radius: 10px; padding: 8px 12px; margin-top: 10px; font-size: 10pt; }}
ol, ul {{ margin: 4px 0; padding-right: 22px; padding-left: 0; }}
li {{ margin: 3px 0; }}
ol li::marker {{ color: var(--c); font-weight: 700; }}
ul li::marker {{ color: var(--c); }}
pre {{ direction: ltr; text-align: left; font-family: Mono; font-size: 8.4pt; background: #0b0f18; color: #7cffb2; border-radius: 8px; padding: 8px 10px; white-space: pre-wrap; word-break: break-all; margin: 5px 0; }}
.sec {{ --c: #00a8c0; page-break-inside: auto; }}
.foot {{ margin-top: 18px; color: #6b7a90; font-size: 9pt; text-align: center; }}
"""
b=[f"<div class='hero'><img src='file:///tmp/head.png'/><div><h1>دليل تفعيل Shizuku</h1><p>لتطبيق وكيل · التنزيل، التشغيل بدون روت، ومنح الإذن — خطوة بخطوة. تستغرق العملية بضع دقائق مرة واحدة فقط.</p></div></div>"]
b.append("<div class='sec' style='--c:#00a8c0'><h2>روابط التنزيل</h2><div class='links'>")
for id_,t,u,d in g['links']:
    b.append(f"<div class='link'><b>{E(t)}</b>{'<span class=badge>موصى به</span>' if id_=='gh' else ''} — {E(d)}<span class='url'>{E(u)}</span></div>")
b.append(f"</div><div class='why'><b>نصيحة:</b> {E(g['why'])} حمّل دائماً أحدث إصدار من صفحة الإصدارات.</div></div>")
for i,s in enumerate(g['sections'],1):
    c=COL[s['color']]
    tag='ol' if s['kind']=='steps' else 'ul'
    b.append(f"<div class='sec' style='--c:{c}'><h2><span class='n'>{i} ·</span> {E(s['title'])}</h2><{tag}>")
    for it in s['items']:
        if isinstance(it,str): b.append(f"<li>{E(it)}</li>")
        else: b.append(f"<li>{E(it['t'])}<pre>{E(it['code'])}</pre></li>")
    b.append(f"</{tag}></div>")
b.append("<div class='foot'>يمكنك فتح هذا الدليل أيضاً من داخل التطبيق: الإعدادات ← «دليل Shizuku».</div>")
doc=f"<html lang='ar' dir='rtl'><head><meta charset='utf-8'><style>{css}</style></head><body>{''.join(b)}</body></html>"
open('/tmp/guide.html','w').write(doc)
HTML(string=doc, base_url='/').write_pdf(P+'/out/SHIZUKU-GUIDE-ar.pdf')
print('pdf ok')
