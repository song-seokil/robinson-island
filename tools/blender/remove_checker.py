# -*- coding: utf-8 -*-
"""
JPG 로 받은 캐릭터 이미지 → 투명 PNG 로 변환 (체커보드 배경 제거)
  · 가장자리에서 flood fill 해서 "연결된 배경" 만 지운다
    (캐릭터 내부의 회색 Spear 등 은 살아남는다)
사용: blender -b --python tools/blender/remove_checker.py
환경변수: B3D_SRC(입력) B3D_DST(출력) B3D_TOL(색 허용오차, 기본 26)
"""
import bpy, os, array
import numpy as np

SRC = os.environ.get('B3D_SRC', r'C:\Users\oocss\AppData\Local\Temp\opencode\canva3.jpg')
DST = os.environ.get('B3D_DST', r'D:\02. 송서방\robinson\public\props\u_player1.png')
TOL = int(os.environ.get('B3D_TOL', '26'))


def main():
    if not os.path.exists(SRC):
        print('[cut] 입력 없음: %s' % SRC)
        return
    img = bpy.data.images.load(SRC)
    w, h = img.size
    buf = array.array('f', [0.0] * (w * h * 4))
    img.pixels.foreach_get(buf)
    px = np.array(buf, dtype=np.float32).reshape(h, w, 4)   # RGBA, 아래→위
    rgb = px[..., :3]
    a = px[..., 3]

    # 배경색 판정: 투명도가 이미 있는 픽셀은 그대로, 불투명하면 가장자리 색을 기준으로
    edge = np.concatenate([rgb[0, :, :], rgb[-1, :, :], rgb[:, 0, :], rgb[:, -1, :]], axis=0)
    if a.max() > 0.01 and a.min() > 0.01:      # JPG (전부 불투명) → 가장자리 평균을 배경색으로
        bg = edge.mean(axis=0)
        dist = np.abs(rgb - bg[None, None, :]).max(axis=2)
        bgmask = dist < (TOL / 255.0)
    else:                                       # 이미 PNG + 투명 → 알파만 사용
        bgmask = a < 0.02

    # flood fill (가장자리 연결만) — 스택 기반 BFS
    H, W = bgmask.shape
    from collections import deque
    q = deque()
    vis = np.zeros((H, W), dtype=bool)
    for x in range(W):
        for y in (0, H - 1):
            if bgmask[y, x] and not vis[y, x]:
                vis[y, x] = True; q.append((y, x))
    for y in range(H):
        for x in (0, W - 1):
            if bgmask[y, x] and not vis[y, x]:
                vis[y, x] = True; q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < H and 0 <= nx < W and not vis[ny, nx] and bgmask[ny, nx]:
                vis[ny, nx] = True
                q.append((ny, nx))

    # Feather(가장자리 부드럽게)
    soft = vis.astype(np.float32)
    # 2차 패스: 실루엣 '안쪽'에 남은 체커(발밑 그림자 자리) — 체커 두 색과 매우 가까운 픽셀은 지운다
    corner = np.concatenate([rgb[0, 0][None, :], rgb[0, -1][None, :],
                         rgb[-1, 0][None, :], rgb[-1, -1][None, :]], axis=0)
    c_lo, c_hi = corner.min(axis=0), corner.max(axis=0)
    if float(np.abs(c_hi - c_lo).max()) < 0.25:          # 두 색만 있으면 체커 판정
        hit = (np.abs(rgb - c_lo[None, None, :]).max(axis=2) < 0.035) | \
              (np.abs(rgb - c_hi[None, None, :]).max(axis=2) < 0.035)
        soft = np.clip(soft + hit.astype(np.float32), 0.0, 1.0)
    for _ in range(2):
        soft = (soft + np.roll(soft, 1, 0) + np.roll(soft, -1, 0) + np.roll(soft, 1, 1) + np.roll(soft, -1, 1)) / 5.0
    alpha = np.clip(1.0 - soft, 0.0, 1.0) * np.where(a < 0.02, 1.0, 1.0)
    out = np.zeros((h, w, 4), dtype=np.float32)
    out[..., :3] = rgb
    out[..., 3] = alpha

    res = bpy.data.images.new('cut', width=w, height=h, alpha=True)
    res.pixels.foreach_set(out.ravel())
    os.makedirs(os.path.dirname(DST), exist_ok=True)
    res.filepath_raw = DST
    res.file_format = 'PNG'
    res.save()
    bpy.data.images.remove(img)
    print('[cut] 저장 %s (%dx%d) 제거 픽셀 %.1f%%' % (DST, w, h, 100.0 * float(soft.mean())))


main()