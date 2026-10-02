"""Two-pose exercise figures drawn as SVG (a simple jointed mannequin).

Angles: 0 = pointing down, 90 = right, 180 = up, -90 = left. y grows downward.
"""
import math

TH, SH, FT, TO, UA, FA = 44, 42, 15, 58, 30, 28
FLOOR = 199
C = {
    'skin': '#E7B996', 'skin_far': '#D3A482', 'top': '#5B84C4', 'top_far': '#4D73AE',
    'leg': '#4A4F57', 'leg_far': '#3A3F46', 'shoe': '#EEF1F5', 'shoe_line': '#9AA3AE',
    'hair': '#4A3428', 'floor': '#C9D0C6', 'prop': '#B9C2B5', 'prop_dark': '#8E9A8B',
    'arrow': '#D08A14', 'mat': '#DDE5D8', 'bell': '#3B4047',
}


def vec(a, l):
    r = math.radians(a)
    return (math.sin(r) * l, math.cos(r) * l)


def add(p, v):
    return (p[0] + v[0], p[1] + v[1])


def ik(root, target, l1, l2, bend):
    """Two-bone IK. Returns the middle joint. bend = +1 / -1 picks the side."""
    dx, dy = target[0] - root[0], target[1] - root[1]
    d = math.hypot(dx, dy)
    d = max(abs(l1 - l2) + 0.01, min(d, l1 + l2 - 0.01))
    a = math.atan2(dy, dx)
    cos_a = (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d)
    off = math.acos(max(-1, min(1, cos_a)))
    ang = a + bend * off
    return (root[0] + math.cos(ang) * l1, root[1] + math.sin(ang) * l1)


def line(p, q, w, col):
    return f'<line x1="{p[0]:.1f}" y1="{p[1]:.1f}" x2="{q[0]:.1f}" y2="{q[1]:.1f}" stroke="{col}" stroke-width="{w}" stroke-linecap="round"/>'


def limb(root, spec, l1, l2):
    """spec = ('a', ang1, ang2) or ('t', (x, y), bend). Returns (mid, end)."""
    if spec[0] == 'a':
        mid = add(root, vec(spec[1], l1 * (spec[3] if len(spec) > 3 else 1)))
        return mid, add(mid, vec(spec[2], l2))
    mid = ik(root, spec[1], l1, l2, spec[2])
    ang = math.atan2(spec[1][1] - mid[1], spec[1][0] - mid[0])
    return mid, (mid[0] + math.cos(ang) * l2, mid[1] + math.sin(ang) * l2)


def figure(p):
    view = p.get('view', 'side')
    hip = p['hip']
    torso = p.get('torso', 180)
    neck = add(hip, vec(torso, TO))
    head = add(neck, vec(p.get('head', torso), 18))
    sw = p.get('sw', 21 if view == 'front' else 2)   # half shoulder width
    hw = p.get('hw', 11 if view == 'front' else 2)   # half hip width
    # perpendicular to the torso for shoulder / hip offsets
    px, py = vec(torso - 90, 1)
    sh = {'near': (neck[0] + px * sw, neck[1] + py * sw + 5 * (view == 'front')), 'far': (neck[0] - px * sw, neck[1] - py * sw + 5 * (view == 'front'))}
    hp = {'near': (hip[0] + px * hw, hip[1] + py * hw), 'far': (hip[0] - px * hw, hip[1] - py * hw)}
    out = {'far_arm': '', 'far_leg': '', 'torso': '', 'head': '', 'near_leg': '', 'near_arm': ''}

    def leg(side):
        spec = p['legs'][side]
        knee, ankle = limb(hp[side], spec, TH, SH)
        far = side == 'far' and view == 'side'
        col = C['leg_far'] if far else C['leg']
        fa = p.get('feet', {}).get(side, 90 if view == 'side' else (40 if side == 'near' else -40))
        fl = FT if view == 'side' else 10
        toe = add(ankle, vec(fa, fl))
        s = line(hp[side], knee, 16, col) + line(knee, ankle, 13, col)
        s += line(ankle, toe, 11.5, C['shoe_line']) + line(ankle, toe, 9, C['shoe'])
        return s

    def arm(side):
        spec = p['arms'][side]
        elbow, wrist = limb(sh[side], spec, UA, FA)
        far = side == 'far' and view == 'side'
        col = C['skin_far'] if far else C['skin']
        s = line(sh[side], elbow, 10.5, col) + line(elbow, wrist, 9, col)
        s += f'<circle cx="{wrist[0]:.1f}" cy="{wrist[1]:.1f}" r="5.2" fill="{col}"/>'
        if p.get('bells'):
            ang = math.atan2(wrist[1] - elbow[1], wrist[0] - elbow[0]) + math.pi / 2
            if view == 'front' and p.get('bells') == 'h':
                ang = 0
            dx, dy = math.cos(ang) * 9, math.sin(ang) * 9
            a_, b_ = (wrist[0] - dx, wrist[1] - dy), (wrist[0] + dx, wrist[1] + dy)
            s += line(a_, b_, 4, C['bell'])
            s += f'<circle cx="{a_[0]:.1f}" cy="{a_[1]:.1f}" r="5" fill="{C["bell"]}"/><circle cx="{b_[0]:.1f}" cy="{b_[1]:.1f}" r="5" fill="{C["bell"]}"/>'
        return s

    out['far_leg'] = leg('far')
    out['near_leg'] = leg('near')
    out['far_arm'] = arm('far')
    out['near_arm'] = arm('near')
    if view == 'front':
        pts = [sh['far'], sh['near'], (hp['near'][0] + px * 5, hp['near'][1] + py * 5), (hp['far'][0] - px * 5, hp['far'][1] - py * 5)]
        d = ' '.join(f'{x:.1f},{y:.1f}' for x, y in pts)
        out['torso'] = f'<polygon points="{d}" fill="{C["top"]}" stroke="{C["top"]}" stroke-width="12" stroke-linejoin="round"/>'
        out['torso'] += line(hp['far'], hp['near'], 17, C['leg'])
    else:
        chest = add(hip, vec(torso, TO - 6))
        out['torso'] = line(hip, chest, 27, C['top']) + line(hip, add(hip, vec(torso, 6)), 24, C['leg'])
    # head: hair disc with the face set slightly forward
    fwd = vec(p.get('face', torso - 90 if view == 'side' else torso + 180), 3)
    out['head'] = line(neck, head, 8, C['skin'])
    out['head'] += f'<circle cx="{head[0]:.1f}" cy="{head[1]:.1f}" r="12.5" fill="{C["hair"]}"/>'
    out['head'] += f'<circle cx="{head[0] + fwd[0]:.1f}" cy="{head[1] + fwd[1]:.1f}" r="10.2" fill="{C["skin"]}"/>'
    order = p.get('order') or (['far_leg', 'near_leg', 'torso', 'head', 'far_arm', 'near_arm'] if view == 'front'
                               else ['far_arm', 'far_leg', 'torso', 'head', 'near_leg', 'near_arm'])
    return ''.join(out[k] for k in order)


def arrow(x1, y1, x2, y2, curve=0, double=False):
    mx, my = (x1 + x2) / 2, (y1 + y2) / 2
    dx, dy = x2 - x1, y2 - y1
    L = math.hypot(dx, dy) or 1
    cx, cy = mx - dy / L * curve, my + dx / L * curve
    ms = ' marker-start="url(#ah2)"' if double else ''
    return f'<path d="M{x1:.1f},{y1:.1f} Q{cx:.1f},{cy:.1f} {x2:.1f},{y2:.1f}" fill="none" stroke="{C["arrow"]}" stroke-width="4" stroke-linecap="round" marker-end="url(#ah)"{ms}/>'


def floor(x1=8, x2=212, y=FLOOR + 5):
    return f'<line x1="{x1}" y1="{y}" x2="{x2}" y2="{y}" stroke="{C["floor"]}" stroke-width="3" stroke-linecap="round"/>'


def mat(x1=14, x2=206):
    return f'<rect x="{x1}" y="{FLOOR}" width="{x2 - x1}" height="6" rx="3" fill="{C["mat"]}"/>'


def box(x, y, w, h):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="5" fill="{C["prop"]}"/><rect x="{x}" y="{y}" width="{w}" height="7" rx="3.5" fill="{C["prop_dark"]}"/>'


def chair(x, seat_y, w=52):
    s = f'<rect x="{x}" y="{seat_y}" width="{w}" height="8" rx="4" fill="{C["prop_dark"]}"/>'
    s += f'<rect x="{x + 3}" y="{seat_y + 8}" width="6" height="{FLOOR + 5 - seat_y - 8}" fill="{C["prop"]}"/><rect x="{x + w - 9}" y="{seat_y + 8}" width="6" height="{FLOOR + 5 - seat_y - 8}" fill="{C["prop"]}"/>'
    s += f'<rect x="{x}" y="{seat_y - 52}" width="7" height="56" rx="3.5" fill="{C["prop"]}"/>'
    return s


def clock(x, y, label):
    return (f'<circle cx="{x}" cy="{y}" r="11" fill="none" stroke="{C["arrow"]}" stroke-width="3"/>'
            f'<path d="M{x},{y - 6} V{y} H{x + 5}" fill="none" stroke="{C["arrow"]}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>'
            f'<text x="{x}" y="{y + 27}" text-anchor="middle" font-family="Figtree, sans-serif" font-weight="700" font-size="12" fill="{C["arrow"]}">{label}</text>')


STAND = (110, FLOOR - 5 - TH - SH)  # hip position when standing
HX, HY = STAND


def standing(**kw):
    p = {'view': 'side', 'hip': STAND, 'legs': {'near': ('a', 2, 0), 'far': ('a', -2, 0)}, 'arms': {'near': ('a', 4, 6), 'far': ('a', -2, 2)}}
    p.update(kw)
    return p


def front(**kw):
    p = {'view': 'front', 'hip': STAND, 'legs': {'near': ('a', 9, 2), 'far': ('a', -9, -2)}, 'arms': {'near': ('a', 10, 5), 'far': ('a', -10, -5)}}
    p.update(kw)
    return p


def both(spec):
    return {'near': spec, 'far': spec}


# Each entry: list of panels. A panel = dict(pose=..., extra=svg string drawn under/over).
def poses():
    P = {}
    lying_hip = (118, FLOOR - 14)
    A4 = (88, 152)  # all-fours hip

    P['shoulderPress'] = [
        dict(pose=front(arms={'near': ('a', 112, 178), 'far': ('a', -112, -178)}, bells='h'), under=floor()),
        dict(pose=front(arms={'near': ('a', 162, 176), 'far': ('a', -162, -176)}, bells='h'), under=floor(),
             over=arrow(160, 88, 160, 40) + arrow(60, 88, 60, 40)),
    ]
    P['sideRaises'] = [
        dict(pose=front(arms={'near': ('a', 9, 5), 'far': ('a', -9, -5)}, bells=True), under=floor()),
        dict(pose=front(arms={'near': ('a', 86, 88), 'far': ('a', -86, -88)}, bells=True), under=floor(),
             over=arrow(160, 118, 196, 84, -14) + arrow(60, 118, 24, 84, 14)),
    ]
    P['bicepCurls'] = [
        dict(pose=front(arms={'near': ('a', 9, 5), 'far': ('a', -9, -5)}, bells='h'), under=floor()),
        dict(pose=front(arms={'near': ('a', 8, 165), 'far': ('a', -8, -165)}, bells='h'), under=floor(),
             over=arrow(166, 108, 162, 72, -12) + arrow(54, 108, 58, 72, 12)),
    ]
    P['rhomboidPulls'] = [
        dict(pose=standing(arms={'near': ('a', 88, 90), 'far': ('a', 84, 88)}), under=floor()),
        dict(pose=standing(arms={'near': ('a', -70, 82), 'far': ('a', -62, 80)}), under=floor(),
             over=arrow(168, 66, 132, 66) + arrow(74, 48, 62, 62, -8)),
    ]
    dips_up = dict(view='side', hip=(96, 139), torso=190, legs={'near': ('t', (136, 194), -1), 'far': ('t', (130, 194), -1)},
                   arms={'near': ('t', (80, 136), 1), 'far': ('t', (76, 136), 1)})
    dips_down = dict(view='side', hip=(110, 170), torso=186, legs={'near': ('t', (150, 194), -1), 'far': ('t', (144, 194), -1)},
                     arms={'near': ('t', (80, 136), 1), 'far': ('t', (76, 136), 1)})
    P['tricepDips'] = [
        dict(pose=dips_up, under=floor() + chair(34, 140)),
        dict(pose=dips_down, under=floor() + chair(34, 140), over=arrow(140, 96, 140, 132)),
    ]

    def pushup(theta, bend=1):
        ankle = (48, 194)
        r = math.radians(theta)
        ux, uy = math.cos(r), -math.sin(r)
        shoulder = (ankle[0] + 144 * ux, ankle[1] + 144 * uy)
        hip = (shoulder[0] - TO * ux, shoulder[1] - TO * uy)
        tors = math.degrees(math.atan2(ux, uy))
        return dict(view='side', hip=hip, torso=tors, legs={'near': ('t', ankle, 1), 'far': ('t', (ankle[0] + 4, ankle[1]), 1)},
                    arms={'near': ('t', (158, 150), bend), 'far': ('t', (162, 150), bend)}, feet={'near': 50, 'far': 50})
    P['inclinePushUps'] = [
        dict(pose=pushup(45), under=floor() + box(150, 155, 58, 49)),
        dict(pose=pushup(36, -1), under=floor() + box(150, 155, 58, 49), over=arrow(120, 62, 138, 92)),
    ]

    def lying(torso=-90, legs=None, arms=None, hip=lying_hip, **kw):
        return dict(view='side', hip=hip, torso=torso,
                    legs=legs or {'near': ('t', (176, 194), -1), 'far': ('t', (170, 194), -1)},
                    arms=arms or {'near': ('a', 80, 86), 'far': ('a', 78, 84)}, **kw)

    def hands_head(torso):
        neck = add(lying_hip, vec(torso, TO)); head = add(neck, vec(torso, 18))
        return {'near': ('t', (head[0] + 2, head[1] - 6), 1), 'far': ('t', (head[0], head[1] - 8), 1)}
    P['crunches'] = [
        dict(pose=lying(arms=hands_head(-90)), under=floor() + mat()),
        dict(pose=lying(torso=-118, arms=hands_head(-118)), under=floor() + mat(), over=arrow(24, 174, 32, 138, -8)),
    ]
    P['heelTouches'] = [
        dict(pose=lying(torso=-100, arms={'near': ('t', (140, 190), -1), 'far': ('t', (136, 190), -1)}), under=floor() + mat()),
        dict(pose=lying(torso=-104, arms={'near': ('t', (166, 188), -1), 'far': ('t', (140, 190), -1)}), under=floor() + mat(),
             over=arrow(134, 168, 166, 168, 0, True)),
    ]
    flat_hip = (92, FLOOR - 14)
    arms_down = {'near': ('a', 84, 88), 'far': ('a', 82, 86)}
    P['legLifts'] = [
        dict(pose=lying(hip=flat_hip, legs={'near': ('a', 90, 90), 'far': ('a', 88, 88)}, arms=arms_down, feet={'near': 165, 'far': 165}), under=floor() + mat()),
        dict(pose=lying(hip=flat_hip, legs={'near': ('a', 172, 174), 'far': ('a', 168, 170)}, arms=arms_down, feet={'near': -100, 'far': -100}), under=floor() + mat(),
             over=arrow(176, 168, 128, 112, 26)),
    ]
    P['hipLifts'] = [
        dict(pose=lying(hip=flat_hip, legs={'near': ('a', 176, 178), 'far': ('a', 172, 174)}, arms=arms_down, feet={'near': -100, 'far': -100}), under=floor() + mat()),
        dict(pose=dict(view='side', hip=(88, FLOOR - 36), torso=-66, legs={'near': ('a', 178, 180), 'far': ('a', 174, 176)},
                       arms={'near': ('t', (104, 192), 1), 'far': ('t', (100, 192), 1)}, feet={'near': -100, 'far': -100}), under=floor() + mat(),
             over=arrow(116, 186, 116, 160)),
    ]
    seat_hip = (96, FLOOR - 14)
    seat_legs = {'near': ('a', 122, 74), 'far': ('a', 118, 70)}
    P['russianTwists'] = [
        dict(pose=dict(view='side', hip=seat_hip, torso=-152, legs=seat_legs, arms={'near': ('t', (116, 150), 1), 'far': ('t', (118, 152), 1)}), under=floor() + mat()),
        dict(pose=dict(view='side', hip=seat_hip, torso=-152, legs=seat_legs, arms={'near': ('t', (106, 176), 1), 'far': ('t', (110, 174), 1)}), under=floor() + mat(),
             over=arrow(132, 138, 124, 172, -14, True)),
    ]
    plank_hi = dict(view='side', hip=(104, 160), torso=108, legs={'near': ('t', (38, 194), 1), 'far': ('t', (42, 194), 1)},
                    arms={'near': ('a', 4, 0), 'far': ('a', 8, 2)}, feet={'near': 40, 'far': 40})
    climb = dict(plank_hi); climb['legs'] = {'near': ('t', (118, 188), -1), 'far': ('t', (38, 194), 1)}
    P['mountainClimbers'] = [
        dict(pose=plank_hi, under=floor()),
        dict(pose=climb, under=floor(), over=arrow(70, 132, 106, 132)),
    ]
    P['plank'] = [
        dict(pose=dict(view='side', hip=(98, 176), torso=102.5, legs={'near': ('t', (18, 194), 1), 'far': ('t', (22, 194), 1)},
                       arms={'near': ('a', 0, 90), 'far': ('a', 4, 90)}, feet={'near': 40, 'far': 40}), under=floor() + mat(8, 212),
             over=clock(96, 112, 'hold')),
    ]
    P['squats'] = [
        dict(pose=standing(), under=floor()),
        dict(pose=dict(view='side', hip=(92, 150), torso=158, legs={'near': ('t', (112, 194), -1), 'far': ('t', (106, 194), -1)},
                       arms={'near': ('a', 92, 92), 'far': ('a', 88, 90)}), under=floor(), over=arrow(62, 104, 62, 142)),
    ]
    P['backwardLunges'] = [
        dict(pose=standing(), under=floor()),
        dict(pose=dict(view='side', hip=(112, 138), torso=180, legs={'near': ('t', (132, 194), -1), 'far': ('t', (58, 190), 1)},
                       arms={'near': ('t', (114, 130), 1), 'far': ('t', (110, 130), 1)}, feet={'near': 90, 'far': 40}), under=floor(),
             over=arrow(100, 178, 66, 178)),
    ]
    allfours = dict(view='side', hip=A4, torso=97, face=10, legs={'near': ('a', 0, -90), 'far': ('a', 4, -88)},
                    arms={'near': ('t', (146, 196), -1), 'far': ('t', (150, 196), -1)}, feet={'near': -92, 'far': -92})
    hyd = dict(allfours); hyd['legs'] = {'near': ('a', 20, -90, 0.42), 'far': ('a', 4, -88)}
    P['hydrants'] = [
        dict(pose=allfours, under=floor() + mat()),
        dict(pose=hyd, under=floor() + mat(), over=arrow(48, 192, 40, 160, 16)),
    ]
    don = dict(allfours); don['legs'] = {'near': ('a', -104, 176), 'far': ('a', 4, -88)}; don['feet'] = {'near': -92, 'far': -92}
    P['donkeyKicks'] = [
        dict(pose=allfours, under=floor() + mat()),
        dict(pose=don, under=floor() + mat(), over=arrow(22, 150, 22, 108)),
    ]
    side_hip = (122, FLOOR - 15)
    side_base = dict(view='side', hip=side_hip, torso=-90, face=-180, sw=1, hw=5,
                     arms={'near': ('t', (92, 196), 1), 'far': ('a', -90, -90)}, feet={'near': 170, 'far': 170})
    s1 = dict(side_base); s1['legs'] = {'near': ('a', 90, 90), 'far': ('a', 91, 91)}
    s2 = dict(side_base); s2['legs'] = {'near': ('a', 118, 118), 'far': ('a', 91, 91)}
    P['lyingLegRaises'] = [
        dict(pose=s1, under=floor() + mat()),
        dict(pose=s2, under=floor() + mat(), over=arrow(208, 170, 204, 132, 10)),
    ]
    up = 12
    P['calfRaises'] = [
        dict(pose=standing(), under=floor()),
        dict(pose=standing(hip=(HX, HY - up), feet={'near': 38, 'far': 38}), under=floor(), over=arrow(74, 196, 74, 170)),
    ]
    sumo_legs = {'near': ('t', (160, 194), -1), 'far': ('t', (60, 194), 1)}
    sumo_arms = {'near': ('t', (128, 126), -1), 'far': ('t', (92, 126), 1)}
    P['sumoCalfRaises'] = [
        dict(pose=front(hip=(110, 140), legs=sumo_legs, arms=sumo_arms, feet={'near': 70, 'far': -70}), under=floor()),
        dict(pose=front(hip=(110, 131), legs={'near': ('t', (160, 185), -1), 'far': ('t', (60, 185), 1)}, arms=sumo_arms, feet={'near': 20, 'far': -20}), under=floor(),
             over=arrow(184, 198, 184, 176) + arrow(36, 198, 36, 176)),
    ]
    return P


DEFS = (f'<defs><marker id="ah" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{C["arrow"]}"/></marker>'
        f'<marker id="ah2" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse">'
        f'<path d="M0,0 L10,5 L0,10 z" fill="{C["arrow"]}"/></marker></defs>')


def panel_svg(panel, w=220, h=246):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 -34 {w} {h}" width="{w}" height="{h}">{DEFS}'
            f'{panel.get("under", "")}{figure(panel["pose"])}{panel.get("over", "")}</svg>')
