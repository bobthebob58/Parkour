#!/usr/bin/env python3
"""Assemble the final game.js: base engine + 15 world kits + realistic character + 15 levels.

Usage: python3 assemble.py <game.js in> <game.js out>
Reads kits from ../kits/*.js, the character from ../character/character.js and levels from
../levels/L01.json .. L15.json (relative to this file). Idempotent: markers are replaced, so it can
be run again on an already assembled game.js.
"""
import json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCR = os.path.dirname(HERE)
KIT_ORDER = ['meadow', 'rooftops', 'candy', 'glacier', 'harbor', 'skatemesa', 'clockwork', 'jungle',
             'stormships', 'starfield', 'temple', 'neoncity', 'volcano', 'skyreef', 'crystalspire']

KITS_BEGIN = '/* ===== VERDENSSÆT START (genereret – se dokumentationen) ===== */'
KITS_END = '/* ===== VERDENSSÆT SLUT ===== */'
CHAR_BEGIN = '/* ===== FIGUR START ===== */'
CHAR_END = '/* ===== FIGUR SLUT ===== */'


def js_value(v, indent=0):
    """Compact, readable JS literal (unquoted keys where possible)."""
    if isinstance(v, dict):
        parts = []
        for k, x in v.items():
            key = k if re.match(r'^[A-Za-z_$][A-Za-z0-9_$]*$', k) else json.dumps(k, ensure_ascii=False)
            parts.append(f'{key}: {js_value(x, indent)}')
        return '{ ' + ', '.join(parts) + ' }' if parts else '{}'
    if isinstance(v, list):
        return '[' + ', '.join(js_value(x, indent) for x in v) + ']'
    if isinstance(v, str):
        return "'" + v.replace('\\', '\\\\').replace("'", "\\'") + "'"
    if isinstance(v, bool):
        return 'true' if v else 'false'
    if v is None:
        return 'null'
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    return json.dumps(v)


def level_js(i, lv):
    head = {k: lv[k] for k in lv if k not in ('segs', 'notes')}
    lv = dict(lv, segs=[{k: x for k, x in s.items() if k != 'look'} for s in lv['segs']])
    lines = [f'  // ------------------------------------------------------------------ {i + 1}', '  {']
    for k, x in head.items():
        lines.append(f'    {k}: {js_value(x)},')
    lines.append('    segs: [')
    for s in lv['segs']:
        lines.append(f'      {js_value(s)},')
    lines.append('    ],')
    lines.append('  },')
    return '\n'.join(lines)


LEVELS_DOC = """/* =====================================================================
   4. DE 15 BANER
   Hver bane er en liste af segmenter, som banebyggeren (afsnit 9)
   omsætter til platforme og hjælpere. Udseendet kommer fra banens
   verdenssæt (kit, afsnit 9c) – fysikken er altid kasser og cylindre.
   Platform-felter:
     t     : 'start' | 'p' | 'ice' | 'crumble' | 'move' | 'swing' | 'bounce' |
             'spin' | 'conveyor' | 'rot' | 'vent' | 'finish' |
             (skateboard:) 'ramp' | 'rail' | 'boost'
     g     : hul (kant til kant) fra forrige platform i meter
     w, d  : bredde (på tværs) og dybde (langs banen); shape:'cyl' = rund
     dy    : højdeforskel på topfladen i forhold til forrige platform
     x     : sideforskydning; turn: drej banens retning (grader, + = højre)
     v     : verdenssættets variant (kun udseende)
     mv/sw : enhver platform kan bevæge sig ({ax, amp, per, ph}) eller svinge
     grab  : en kant, man er tænkt at gribe med hænderne; slick: glat kant
     cp    : kontrolpunkt; hint: tekst, der vises første gang man lander
     coin  : mønt over platformen
   Hjælpere (placeres ud fra forrige platform: at = meter ud fra kanten,
   y = højde over dens top, x = sideforskydning):
     bar (hængestang; ang, len, sw = trapez, mv = bevægelig), zip (svævebane;
     len, drop), anchor (krogpunkt til rebet), coin, wind (opvindssøjle)
   ===================================================================== */
"""


def main():
    src_path, out_path = sys.argv[1], sys.argv[2]
    s = open(src_path, encoding='utf8').read()

    # ---- levels
    levels = []
    for i in range(1, 16):
        p = os.path.join(SCR, 'levels', f'L{i:02d}.json')
        levels.append(json.load(open(p, encoding='utf8')))
    start = s.index('/* =====================================================================\n   4. DE ')
    end = s.index('/* =====================================================================\n   5. HJÆLPEFUNKTIONER')
    body = LEVELS_DOC + 'const LEVELS = [\n' + '\n'.join(level_js(i, lv) for i, lv in enumerate(levels)) + '\n];\n\n'
    s = s[:start] + body + s[end:]

    # ---- kits (after the sten kit, before section 10)
    kit_code = [KITS_BEGIN, """/* =====================================================================
   9c. VERDENERNE – ét verdenssæt (og ét himmeltema) pr. bane
   ===================================================================== */"""]
    for k in KIT_ORDER:
        code = open(os.path.join(SCR, 'kits', f'{k}.js'), encoding='utf8').read().strip()
        kit_code.append(f'// ---------------------------------------------------------------- {k}\n{code}')
    kit_code.append(KITS_END)
    kit_block = '\n\n'.join(kit_code) + '\n\n'
    if KITS_BEGIN in s:
        a = s.index(KITS_BEGIN); b = s.index(KITS_END) + len(KITS_END)
        s = s[:a] + kit_block.rstrip('\n') + s[b:]
    else:
        anchor = '/* =====================================================================\n   10. BANEOBJEKTER I DRIFT'
        i = s.index(anchor)
        s = s[:i] + kit_block + s[i:]

    # ---- character: replace buildCharacter/animateCharacter/let CHARACTER
    ch = open(os.path.join(SCR, 'character', 'character.js'), encoding='utf8').read().strip()
    ch = re.sub(r'window\.createCharacterModule\s*=\s*function\s*\(THREE\)', 'function createCharacterModule(THREE)', ch, count=1)
    ch = re.sub(r'\};\s*$', '}', ch)
    char_block = f'{CHAR_BEGIN}\n{ch}\n\nlet CHARACTER = createCharacterModule(THREE);\n{CHAR_END}'
    if CHAR_BEGIN in s:
        a = s.index(CHAR_BEGIN); b = s.index(CHAR_END) + len(CHAR_END)
        s = s[:a] + char_block + s[b:]
    else:
        a = s.index('function buildCharacter() {')
        b = s.index('let CHARACTER = { build: buildCharacter, animate: animateCharacter };')
        b += len('let CHARACTER = { build: buildCharacter, animate: animateCharacter };')
        s = s[:a] + char_block + s[b:]

    # ---- header contents
    s = s.replace('     4.  De 10 baner (hårdkodede segmentlister)', '     4.  De 15 baner (hårdkodede segmentlister)')
    if '9c. Verdenerne' not in s.split('(() => {')[0]:
        s = s.replace('     9.  Banebygger (segmenter -> platforme, ankre, mønter, portal)',
                      '     9.  Banebygger (segmenter -> platforme, ankre, mønter, portal)\n'
                      '     9b. Verdenssæt-systemet (standardsættet "sten")\n'
                      '     9c. Verdenerne (15 verdenssæt med egne himmeltemaer)')
    open(out_path, 'w', encoding='utf8').write(s)
    print('assembled', out_path, len(s.splitlines()), 'lines')


if __name__ == '__main__':
    main()
