import figures, sys
P = figures.poses()
cells = ''
for k, panels in P.items():
    cells += f'<div class="c"><b>{k}</b><div class="r">' + ''.join(figures.panel_svg(p) for p in panels) + '</div></div>'
open(sys.argv[1], 'w').write(f'<html><body style="margin:8px;font:12px sans-serif;background:#fff"><style>.c{{display:inline-block;margin:4px;border:1px solid #ddd;vertical-align:top}}.r{{display:flex}}svg{{background:#F7F8F4}}</style>{cells}</body></html>')
