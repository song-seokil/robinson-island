# -*- coding: utf-8 -*-
"""
에셋 시트 1장 → 개별 파일 자동 분할
  · 입력: tools/assets/sheet.png  (정사각형 권장 4096×4096, 투명 배경)
  · 방식: 알파가 있는 영역의 '빈 행/열'을 찾아 자동으로 칸을 나눈다
          (정확한 격자가 아니어도 됨 — 순서만 지켰으면 된다)
  · 출력: public/props/*.png · public/icons/*.png · tools/blender/tex/*.png (+ public/tex)
  · 빈 칸은 건너뛴다

사용: blender -b --python tools/blender/slice_sheet.py
"""
import bpy, os, array

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, '..', '..'))
SHEET = os.environ.get('B3D_SHEET', os.path.join(ROOT, 'tools', 'assets', 'sheet.png'))
GAP = 8          # 빈 간격으로 간주하는 픽셀(여백)
MIN_AREA = 0.0015  # 칸 넓이의 0.15% 미만이면 빈칸

# 배치 순서: 왼쪽→오른쪽, 위→아래
LAYOUT = [
    'n_tree', 'n_palm', 'n_bush', 'n_berry', 'n_rock', 'n_ore', 'n_tar', 'n_crystal',
    'b_campfire', 'b_wall', 'b_tower', 'b_spikes', 'b_hut', 'b_raft', 'b_chest',
    'u_player', 'u_sword', 'u_archer', 'u_bomber', 'u_boss', 'u_boar',
    'icon_chat', 'icon_axe', 'icon_hammer', 'icon_pickaxe', 'icon_sword', 'icon_raft',
    'icon_campfire', 'icon_flag', 'icon_chest', 'icon_target', 'icon_map', 'icon_pirate',
    'tex_grass', 'tex_sand', 'tex_rock', 'tex_dirt', 'tex_water',
]


def out_paths(key):
    if key.startswith('tex_'):
        n = key[4:] + '.png'
        return [os.path.join(ROOT, 'tools', 'blender', 'tex', n),
                os.path.join(ROOT, 'public', 'tex', n)]
    if key.startswith('icon_'):
        return [os.path.join(ROOT, 'public', 'icons', key + '.png')]
    return [os.path.join(ROOT, 'public', 'props', key + '.png')]


def runs(flags, gap):
    """연속된 True 구간들의 (시작, 끝) 목록"""
    out, start = [], None
    blank = 0
    for i, v in enumerate(flags):
        if v:
            if start is None:
                start = i
            blank = 0
        else:
            if start is not None:
                blank += 1
                if blank >= gap:
                    out.append((start, i - blank))
                    start = None
                    blank = 0
    if start is not None:
        out.append((start, len(flags) - 1))
    return out


def main():
    if not os.path.exists(SHEET):
        print('[slice] 시트 없음: %s' % SHEET)
        return
    img = bpy.data.images.load(SHEET)
    w, h = img.size
    px = array.array('f', [0.0] * (w * h * 4))
    img.pixels.foreach_get(px)
    print('[slice] sheet %dx%d' % (w, h))

    step = max(1, min(w, h) // 900)      # 큰 시트는 샘플링해서 빠르게
    # 행/열 점유율(알파 > 0.04)
    row_on = []
    for y in range(0, h, step):
        base = y * w
        on = 0
        for x in range(0, w, step):
            if px[(base + x) * 4 + 3] > 0.04:
                on += 1
        row_on.append(on > 0)
    col_on = []
    for x in range(0, w, step):
        on = 0
        for y in range(0, h, step):
            if px[(y * w + x) * 4 + 3] > 0.04:
                on += 1
        col_on.append(on > 0)

    gap = max(2, GAP // step)
    rr = runs(row_on, gap)
    cr = runs(col_on, gap)
    print('[slice] 칸 감지: 행 %d × 열 %d' % (len(rr), len(cr)))

    cells = []
    for (y0, y1) in rr:
        for (x0, x1) in cr:
            cells.append((x0 * step, y0 * step, (x1 + 1) * step, (y1 + 1) * step))
    cells.sort(key=lambda c: (c[1], c[0]))          # 위→아래, 왼쪽→오른쪽

    total = float(w * h)
    made, skipped = [], []
    for i, (cx0, cy0, cx1, cy1) in enumerate(cells):
        key = LAYOUT[i] if i < len(LAYOUT) else None
        if not key:
            continue
        area = float((cx1 - cx0) * (cy1 - cy0))
        if area / total < MIN_AREA:
            skipped.append(key)
            continue
        pad = max(2, int(0.02 * max(cx1 - cx0, cy1 - cy0)))
        cx0 = max(0, cx0 - pad); cy0 = max(0, cy0 - pad)
        cx1 = min(w, cx1 + pad); cy1 = min(h, cy1 + pad)
        cw, ch = cx1 - cx0, cy1 - cy0
        sub = [0.0] * (cw * ch * 4)
        for y in range(ch):
            srow = (cy0 + y) * w
            drow = y * cw
            for x in range(cw):
                si = (srow + cx0 + x) * 4
                di = (drow + x) * 4
                sub[di] = px[si]; sub[di + 1] = px[si + 1]
                sub[di + 2] = px[si + 2]; sub[di + 3] = px[si + 3]
        out = bpy.data.images.new(key, width=cw, height=ch, alpha=True)
        out.pixels.foreach_set(sub)
        for p in out_paths(key):
            os.makedirs(os.path.dirname(p), exist_ok=True)
            out.filepath_raw = p
            out.file_format = 'PNG'
            out.save()
        made.append(key)
        bpy.data.images.remove(out)

    bpy.data.images.remove(img)
    print('[slice] 생성 %d: %s' % (len(made), ', '.join(made)))
    if skipped:
        print('[slice] 칸이 비어서 건너뜀 %d: %s' % (len(skipped), ', '.join(skipped)))


main()