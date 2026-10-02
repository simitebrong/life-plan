"""Build one-page exercise guides: HTML -> (render.js) -> PDF + WebP.  Run: python3 build.py && node render.js"""
import base64, html, os, json
import figures, content

OUT = os.path.join(os.path.dirname(__file__), 'build')
os.makedirs(OUT, exist_ok=True)
P = figures.poses()

CSS = """
*{box-sizing:border-box}html,body{margin:0}
body{width:480px;background:#F9FAF6;color:#1E231E;font:16px/1.45 'Figtree',system-ui,sans-serif;padding:22px 22px 18px}
.tags{display:flex;gap:8px;margin-bottom:8px}
.tag{font-size:13px;font-weight:700;padding:3px 11px;border-radius:999px;background:#F3E3C2;color:#8A5C08}
.tag.pts{background:#DDEBDF;color:#2E5B45}
h1{font:650 31px/1.1 'Bricolage Grotesque',sans-serif;letter-spacing:-0.01em;margin:0 0 14px}
.art{background:#fff;border-radius:18px;padding:8px 6px;display:flex;align-items:center;justify-content:center;gap:0;border:1.5px solid #E6EADF}
.art svg{width:46%;height:auto}.art.one svg{width:62%}
.art img{width:100%;height:auto;border-radius:12px;display:block}
.next{flex:none;width:8%;display:grid;place-items:center}
.next svg{width:26px;height:26px}
.cap{display:flex;justify-content:space-around;font-size:12.5px;font-weight:700;color:#848C82;margin:6px 0 0}
h2{font:650 18px/1.2 'Bricolage Grotesque',sans-serif;margin:18px 0 8px}
ol{margin:0;padding:0;list-style:none;counter-reset:s;display:grid;gap:8px}
li{counter-increment:s;display:grid;grid-template-columns:28px 1fr;gap:10px;align-items:start}
li::before{content:counter(s);width:28px;height:28px;border-radius:50%;background:#C98A17;color:#fff;font:700 15px/28px 'Bricolage Grotesque',sans-serif;text-align:center}
.tip{margin-top:14px;background:#F3E3C2;border-radius:14px;padding:11px 14px;font-size:15px}
.tip b{color:#8A5C08}
.facts{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:14px}
.fact{background:#EEF1EA;border-radius:14px;padding:10px 14px}
.fact span{display:block;font-size:12.5px;font-weight:700;color:#848C82}
.fact strong{font-size:16px}
.note{font-size:13px;color:#848C82;margin:10px 0 0}
.foot{margin-top:14px;font-size:12px;color:#A3AAA0;text-align:center}
"""
NEXT = '<div class="next"><svg viewBox="0 0 24 24"><path d="M3 12h15M12 5l7 7-7 7" fill="none" stroke="#C9D0C6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></svg></div>'


def art(g):
    if g['img']:
        b = base64.b64encode(open(os.path.join(os.path.dirname(__file__), 'src', f"src_{g['id']}.png"), 'rb').read()).decode()
        return f'<div class="art"><img alt="" src="data:image/png;base64,{b}"></div>'
    panels = P[g['id']]
    if len(panels) == 1:
        return f'<div class="art one">{figures.panel_svg(panels[0])}</div>'
    return (f'<div class="art">{figures.panel_svg(panels[0])}{NEXT}{figures.panel_svg(panels[1])}</div>'
            '<div class="cap"><span>Start</span><span>Move</span></div>')


def page(g):
    unit = 'second' if g['unit'] == 'sec' else 'rep'
    pts = f"{g['pts']} point{'s' if g['pts'] > 1 else ''} per {unit}"
    e = html.escape
    return f"""<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><title>{e(g['name'])}</title>
<link href="https://fonts.googleapis.com/css2?family=Figtree:wght@400;600;700&family=Bricolage+Grotesque:opsz,wght@12..96,500..700&display=swap" rel="stylesheet">
<style>{CSS}</style></head><body>
<div class="tags"><span class="tag">{e(g['group'])}</span><span class="tag pts">{pts}</span></div>
<h1>{e(g['name'])}</h1>
{art(g)}
<h2>How to do it</h2>
<ol>{''.join(f'<li><div>{e(s)}</div></li>' for s in g['steps'])}</ol>
<div class="tip"><b>Keep in mind:</b> {e(g['tip'])}</div>
<div class="facts"><div class="fact"><span>Start with</span><strong>{e(g['start'])}</strong></div><div class="fact"><span>Works your</span><strong>{e(g['targets'])}</strong></div></div>
<p class="foot">Life Plan · Home workout guide</p>
</body></html>"""


ids = []
for gid, g in content.G.items():
    open(os.path.join(OUT, gid + '.html'), 'w').write(page(g))
    ids.append(gid)
json.dump(ids, open(os.path.join(OUT, 'ids.json'), 'w'))
print(len(ids), 'pages written')
