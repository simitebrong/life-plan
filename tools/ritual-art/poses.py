"""Ritual pose cards: the workout mannequin, re-dressed in gold on a midnight 'masculine' sky
(a rayed sun and an upward triangle, counterparts to the moon and vesica in her picture).
Run: python3 poses.py && node render.js   ->  ../../guides/ritual/<id>.webp
"""
import json, math, os, random, sys
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'guides'))
import figures as F
from figures import FLOOR, TH, SH, TO, front, standing, vec, add

F.C.update({
    'skin': '#EBCB90', 'skin_far': '#B99660', 'top': '#DDB877', 'top_far': '#B18F5A',
    'leg': '#C29E63', 'leg_far': '#94764A', 'shoe': '#EBCB90', 'shoe_line': '#B99660',
    'hair': '#8C6B3C', 'arrow': '#F4D9A0',
})
F.DEFS = F.DEFS.replace('#D08A14', F.C['arrow'])
OUT = os.path.join(os.path.dirname(__file__), 'build'); os.makedirs(OUT, exist_ok=True)

def heart_hands(hip=F.STAND):
    neck = add(hip, vec(180, TO)); c = (hip[0], neck[1] + 24)
    return {'near': ('t', (c[0] + 3, c[1]), -1), 'far': ('t', (c[0] - 3, c[1]), 1)}

def kneel(hip=(92, FLOOR - 17), **kw):
    p = dict(view='side', hip=hip, torso=180, legs={'near': ('a', 74, -90), 'far': ('a', 72, -88)},
             arms={'near': ('t', (hip[0] + 34, hip[1] - 4), 1), 'far': ('t', (hip[0] + 30, hip[1] - 4), 1)},
             feet={'near': -96, 'far': -96})
    p.update(kw); return p

def glow(x, y, r=14):
    return f'<circle cx="{x}" cy="{y}" r="{r}" fill="url(#hg)"/>'

def poses():
    P = {}
    P['m-arrive'] = dict(pose=front(arms=heart_hands()), over=glow(110, 78))
    P['m-rise'] = dict(pose=front(arms={'near': ('a', 158, 176), 'far': ('a', -158, -176)}),
                       over=F.arrow(178, 128, 170, 46, 18) + F.arrow(42, 128, 50, 46, -18))
    allfours = dict(view='side', hip=(84, 152), torso=97, face=10, legs={'near': ('a', 0, -90), 'far': ('a', 4, -88)},
                    arms={'near': ('t', (144, 196), -1), 'far': ('t', (148, 196), -1)}, feet={'near': -92, 'far': -92})
    P['m-catcow'] = dict(pose=allfours, over=F.arrow(112, 128, 112, 98, 0, True))
    P['m-kneel'] = dict(pose=kneel(), over=glow(92, 126, 18))
    lunge = dict(view='side', hip=(100, 158), torso=180,
                 legs={'near': ('t', (150, 194), -1), 'far': ('a', -43, -90)},
                 arms={'near': ('a', 172, 178), 'far': ('a', 168, 176)}, feet={'near': 90, 'far': -96})
    P['m-lunge'] = dict(pose=lunge, over=F.arrow(76, 150, 112, 150))
    P['m-close'] = dict(pose=front(arms={'near': ('a', 24, 18), 'far': ('a', -24, -18)}), over=glow(110, 78, 16))
    seat_hip = (92, FLOOR - 14)
    P['n-settle'] = dict(pose=dict(view='side', hip=seat_hip, torso=180, legs={'near': ('a', 96, -84), 'far': ('a', 100, -80)},
                                   arms={'near': ('t', (132, 176), 1), 'far': ('t', (128, 176), 1)}, feet={'near': -90, 'far': -90}), over=glow(92, 110, 16))
    P['n-gratitude'] = dict(pose=kneel(arms={'near': ('t', (124, 178), 1), 'far': ('t', (120, 178), 1)}), over=glow(92, 116, 24))
    child_hip = (58, FLOOR - 22)
    P['n-child'] = dict(pose=dict(view='side', hip=child_hip, torso=80, face=0, legs={'near': ('a', 60, -90), 'far': ('a', 62, -90)},
                                  arms={'near': ('a', 82, 86), 'far': ('a', 80, 86)}, feet={'near': -96, 'far': -96}))
    lie_hip = (122, FLOOR - 14)
    P['n-twist'] = dict(pose=dict(view='side', hip=lie_hip, torso=-90, face=-180,
                                  legs={'near': ('a', 150, 80), 'far': ('a', 146, 78)},
                                  arms={'near': ('a', -150, -180), 'far': ('a', -146, -176)}, feet={'near': 120, 'far': 120}),
                        over=F.arrow(166, 120, 196, 176, -20))
    wall_hip = (96, FLOOR - 14)
    P['n-wall'] = dict(pose=dict(view='side', hip=wall_hip, torso=-90, face=-180, legs={'near': ('a', 180, 180), 'far': ('a', 178, 178)},
                                 arms={'near': ('a', -84, -90), 'far': ('a', -80, -88)}, feet={'near': 90, 'far': 90}),
                       under='<rect x="112" y="64" width="9" height="140" rx="3" fill="#2A3A66" stroke="#C9A96C" stroke-opacity=".5"/>')
    P['n-rest'] = dict(pose=dict(view='side', hip=(110, FLOOR - 14), torso=-90, face=-180, legs={'near': ('a', 90, 90), 'far': ('a', 91, 91)},
                                 arms={'near': ('a', 86, 90), 'far': ('a', 88, 90)}, feet={'near': 170, 'far': 170}))
    return P

def backdrop(seed):
    r = random.Random(seed)
    stars = ''.join(f'<circle cx="{r.uniform(4,216):.1f}" cy="{r.uniform(-20,170):.1f}" r="{r.choice([0.5,0.6,0.8,1.0,1.3])}" fill="#FFF3DA" opacity="{r.uniform(.35,.95):.2f}"/>' for _ in range(70))
    rays = ''.join(
        f'<line x1="{110 + 62*math.cos(a):.1f}" y1="{96 + 62*math.sin(a):.1f}" x2="{110 + (84 if k % 2 == 0 else 74)*math.cos(a):.1f}" y2="{96 + (84 if k % 2 == 0 else 74)*math.sin(a):.1f}" stroke="#E8C88C" stroke-width="1.2" stroke-linecap="round" opacity=".55"/>'
        for k, a in ((k, k * math.pi / 12) for k in range(24)))
    return f'''<defs>
  <radialGradient id="sky" cx="50%" cy="45%" r="75%"><stop offset="0" stop-color="#22386A"/><stop offset=".55" stop-color="#121B3C"/><stop offset="1" stop-color="#090D20"/></radialGradient>
  <radialGradient id="sun" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#F7DCA2" stop-opacity=".55"/><stop offset=".7" stop-color="#E8B86E" stop-opacity=".18"/><stop offset="1" stop-color="#E8B86E" stop-opacity="0"/></radialGradient>
  <radialGradient id="hg" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#FFF0C8" stop-opacity=".9"/><stop offset="1" stop-color="#FFE2A0" stop-opacity="0"/></radialGradient>
  <linearGradient id="hz" x1="0" x2="1"><stop offset="0" stop-color="#E8C88C" stop-opacity="0"/><stop offset=".5" stop-color="#E8C88C"/><stop offset="1" stop-color="#E8C88C" stop-opacity="0"/></linearGradient>
</defs>
<rect x="0" y="-34" width="220" height="246" fill="url(#sky)"/>
{stars}
<polygon points="110,-14 18,{FLOOR+5} 202,{FLOOR+5}" fill="none" stroke="#E8C88C" stroke-width="1" opacity=".38"/>
<polygon points="110,18 46,{FLOOR+5} 174,{FLOOR+5}" fill="none" stroke="#E8C88C" stroke-width=".8" opacity=".2"/>
<circle cx="110" cy="96" r="58" fill="url(#sun)"/>
<circle cx="110" cy="96" r="56" fill="none" stroke="#E8C88C" stroke-width="1" opacity=".45"/>
{rays}
<rect x="0" y="{FLOOR+5}" width="220" height="12" fill="#070A18" opacity=".55"/>
<line x1="6" y1="{FLOOR+5}" x2="214" y2="{FLOOR+5}" stroke="url(#hz)" stroke-width="1.6"/>'''

def svg(pid, panel, i):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -34 220 246" width="440" height="492">{F.DEFS}{backdrop(i * 7 + 3)}'
            f'{panel.get("under", "")}{F.figure(panel["pose"])}{panel.get("over", "")}</svg>')

P = poses(); ids = []
for i, (pid, panel) in enumerate(P.items()):
    open(os.path.join(OUT, pid + '.html'), 'w').write(f'<!doctype html><html><body style="margin:0;background:#090D20">{svg(pid, panel, i)}</body></html>')
    ids.append(pid)
json.dump(ids, open(os.path.join(OUT, 'ids.json'), 'w'))
print(len(ids), 'poses')
