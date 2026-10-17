# -*- coding: utf-8 -*-
"""
섬 지형 3D 렌더 → PNG (만화풍 / NPR)
  · 탑다운 정사영 카메라라 게임 월드 좌표(x, y)와 정확히 1:1로 맞는다
  · 지형은 실제 3D 메시(해저 · 해변 · 구릉 · 절벽 고원 · 봉우리) → 빛과 그림자가 진짜
  · 재질은 Toon BSDF + 정점색 → 만화 애니메이션 느낌
  · 결과는 게임의 island_paint 텍스처를 대체한다

사용:
  blender -b --python render_island.py
환경변수: B3D_DATA(입력) B3D_OUT(출력) B3D_SEED B3D_SIZE B3D_GRID B3D_SAMPLES B3D_FREESTYLE B3D_SMOOTH
"""
import bpy, json, math, os
import numpy as np
from mathutils import Vector

DATA = os.environ.get('B3D_DATA', r'C:\Users\oocss\AppData\Local\Temp\opencode\b3d\data')
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('B3D_OUT', r'C:\Users\oocss\AppData\Local\Temp\opencode\b3d\out')
SEED = int(os.environ.get('B3D_SEED', '824934'))
SIZE = int(os.environ.get('B3D_SIZE', '1024'))
GRID = int(os.environ.get('B3D_GRID', '0'))   # 0 이면 덤프된 해상도를 그대로 쓴다
SAMPLES = int(os.environ.get('B3D_SAMPLES', '48'))
FREESTYLE = os.environ.get('B3D_FREESTYLE', '0') == '1'
SMOOTH = os.environ.get('B3D_SMOOTH', '0') == '1'
WATER_GRID = int(os.environ.get('B3D_WGRID', '512'))
ELEV = math.radians(float(os.environ.get('B3D_ELEV', '0')))   # 카메라 기울기(0 = 탑다운)

MAP = 68
WORLD = float(MAP)          # 1 타일 = 1 BU
os.makedirs(OUT, exist_ok=True)


# ---------------------------------------------------------------
# 헬퍼
# ---------------------------------------------------------------
def srgb_to_lin(c):
    def f(u):
        u = float(u)
        return u / 12.92 if u <= 0.04045 else ((u + 0.055) / 1.055) ** 2.4
    return (f(c[0]), f(c[1]), f(c[2]), 1.0)


def smoothstep(a, b, x):
    t = np.clip((x - a) / (b - a), 0.0, 1.0)
    return t * t * (3.0 - 2.0 * t)


def blur(a, iters=1):
    out = a.astype(np.float64)
    for _ in range(iters):
        p = np.pad(out, 1, mode='edge')
        out = (p[:-2, :-2] + p[:-2, 1:-1] + p[:-2, 2:] +
               p[1:-1, :-2] + p[1:-1, 1:-1] + p[1:-1, 2:] +
               p[2:, :-2] + p[2:, 1:-1] + p[2:, 2:]) / 9.0
    return out


def vnoise(res, cells, seed=1):
    """값 노이즈 (0..1) — numpy 값만"""
    rng = np.random.default_rng(seed)
    g = rng.random((cells + 2, cells + 2))
    idx = np.linspace(0, cells, res)
    i0 = np.clip(np.floor(idx).astype(int), 0, cells)
    t = idx - np.floor(idx)
    t = t * t * (3.0 - 2.0 * t)
    a = g[i0][:, i0]
    b = g[i0][:, i0 + 1]
    c = g[i0 + 1][:, i0]
    d = g[i0 + 1][:, i0 + 1]
    tt = t[None, :]
    top = a * (1 - tt) + b * tt
    bot = c * (1 - tt) + d * tt
    ty = t[:, None]
    return top * (1 - ty) + bot * ty


def mix(a, b, t):
    """a, b = 색(3,) 또는 이미지(H,W,3) / t = (H,W) 또는 스칼라"""
    a = np.asarray(a, dtype=np.float64)
    b = np.asarray(b, dtype=np.float64)
    if a.ndim == 1:
        a = a[None, None, :]
    if b.ndim == 1:
        b = b[None, None, :]
    t = np.clip(t, 0.0, 1.0)
    if t.ndim == 0:
        t = np.array([[t]])
    return a * (1.0 - t[..., None]) + b * t[..., None]


def to_lin_rgb(arr):
    """sRGB(0..1) → 선형"""
    return np.where(arr <= 0.04045, arr / 12.92, ((arr + 0.055) / 1.055) ** 2.4)


def load_texture(name):
    """tex/<name>.png 가 있으면 읽는다 (없으면 None → 색만 사용)"""
    for d in (os.path.join(HERE, 'tex'), os.path.join(DATA, 'tex'),
              os.path.join(HERE, '..', '..', 'public', 'tex')):
        p = os.path.join(d, name)
        if os.path.exists(p):
            try:
                img = bpy.data.images.load(p)
                n = len(img.pixels)
                w, h = img.size
                buf = np.empty(n, dtype=np.float32)
                img.pixels.foreach_get(buf)
                a = buf.reshape(h, w, 4)[::-1]     # Blender 이미지는 아래→위
                bpy.data.images.remove(img)
                return a[..., :3]
            except Exception:
                return None
    return None


# ============================================================
# 1. 데이터 로드 + 높이/색 필드 계산
# ============================================================
meta = json.load(open(os.path.join(DATA, 'meta.json'), encoding='utf-8'))
if GRID <= 0:
    GRID = int(meta['res'])
S = np.fromfile(os.path.join(DATA, 'shape.f32'), dtype=np.float32).reshape(GRID, GRID).astype(np.float64)
M = np.fromfile(os.path.join(DATA, 'moist.f32'), dtype=np.float32).reshape(GRID, GRID).astype(np.float64)

# --- 필드를 한 번 다듬는다 (해안선·능선을 매끄럽게 → 만화풍) ---
S = blur(S, 2)
M = blur(M, 2)

# --- 높이 = 연속 필드(평활) + 게임의 계간 램프를 실제로 파 넣는다 ---
# 1) 연속 shape 에서 고지를 만든다 (절벽·봉우리가 또렷하게 선다)
depth = np.clip((0.40 - S) / 0.40, 0.0, 1.0)
SEA = -0.08 - 2.10 * depth ** 1.10
t_l = np.clip((S - 0.495) / 0.505, 0.0, 1.0)
undul = ((vnoise(GRID, 24, 21) - 0.5) * 0.55 + (vnoise(GRID, 64, 22) - 0.5) * 0.22)
land_h = 0.28 + 0.50 * t_l ** 1.5 + undul * 0.22 * smoothstep(0.50, 0.63, S)
beach_h = np.clip((S - 0.40) / 0.055, 0.0, 1.0) ** 1.25 * 0.30
H = beach_h * (1 - smoothstep(0.452, 0.505, S)) + land_h * smoothstep(0.452, 0.505, S)
H = np.where(S >= 0.40, H, SEA)
H += (vnoise(GRID, 90, 7) - 0.5) * 0.05 * smoothstep(0.47, 0.57, S)

ROCK_TH = float(os.environ.get('B3D_ROCKTH', '0.78'))
rock = ((S > ROCK_TH) & (M > 0.38)).astype(np.float64)
rock = blur(rock, 1)
MSK = smoothstep(0.48, 0.52, rock)                     # 거의 0/1 → 수직 절벽
MAX_H = float(os.environ.get('B3D_MAXH', '2.4'))
mesa_top = 1.25 + 0.60 * np.clip((S - ROCK_TH) / (1 - ROCK_TH), 0.0, 1.0)
H = np.where(MSK > 0.5, np.maximum(H, mesa_top), H)

# 봉우리 — 고원 위 산 (고도 상한 이내)
yy, xx = np.mgrid[0:GRID, 0:GRID]
PX = xx / (GRID - 1) * WORLD
PY = (1 - yy / (GRID - 1)) * WORLD
cell = max(1, GRID // MAP)
cands = []
for by in range(0, MAP, 6):
    for bx in range(0, MAP, 6):
        ys, ye = by * cell, min(GRID, (by + 6) * cell)
        xs, xe = bx * cell, min(GRID, (bx + 6) * cell)
        sub_m = MSK[ys:ye, xs:xe]
        if sub_m.size == 0 or sub_m.mean() < 0.25:
            continue
        sub_s = np.where(sub_m > 0.5, S[ys:ye, xs:xe], -1.0)
        k = int(np.argmax(sub_s))
        y0, x0 = divmod(k, sub_s.shape[1])
        cands.append((float(S[ys + y0, xs + x0]), ys + y0, xs + x0))
cands.sort(reverse=True)
peaks = []
for val, gi, gj in cands:
    pi = gj / (GRID - 1) * WORLD
    pj = (1 - gi / (GRID - 1)) * WORLD
    if all(math.hypot(pi - a, pj - b) > 6.5 for a, b, _v in peaks):
        peaks.append((pi, pj, val))
    if len(peaks) >= 4:
        break
for (pi, pj, val) in peaks:
    amp = 0.85 + 0.85 * float(np.clip((val - 0.82) / 0.18, 0.0, 1.0))
    H += amp * np.exp(-((PX - pi) ** 2 + (PY - pj) ** 2) / (2 * 0.95 ** 2)) * np.clip(MSK * 2.0, 0.0, 1.0)
H = np.where(S >= 0.40, np.minimum(H, MAX_H), H)

# 2) 게임이 판정한 계간(램프)을 그대로 파서 실제로 오를 수 있는 길로 만든다
E68 = np.fromfile(os.path.join(DATA, 'elev.f32'), dtype=np.float32).reshape(MAP, MAP).astype(np.float64)
_E = np.linspace(0.0, MAP - 1.0, GRID)
_i0 = np.clip(np.floor(_E).astype(int), 0, MAP - 2)
_fx = (_E - _i0)[None, :]
_fy = (_E - _i0)[:, None]
_left = E68[np.ix_(_i0, _i0)] * (1 - _fx) + E68[np.ix_(_i0, _i0 + 1)] * _fx
_right = E68[np.ix_(_i0 + 1, _i0)] * (1 - _fx) + E68[np.ix_(_i0 + 1, _i0 + 1)] * _fx
E_UP = _left * (1 - _fy) + _right * _fy
try:
    R68 = np.fromfile(os.path.join(DATA, 'ramp.u8'), dtype=np.uint8).reshape(MAP, MAP)
    _ri = np.clip(np.round(_E).astype(int), 0, MAP - 1)
    R_UP = blur(R68[np.ix_(_ri, _ri)].astype(np.float64), 2)
    ramp_mix = smoothstep(0.25, 0.75, R_UP)
    H = H * (1 - ramp_mix) + np.minimum(blur(E_UP, 3), MAX_H) * ramp_mix
except Exception:
    pass

DEP = np.maximum(0.0, -H)

# --- 색(만화풍 · 채도 높은 3톤) ---
n1 = vnoise(GRID, 80, 3)
n2 = vnoise(GRID, 200, 5)
n3 = vnoise(GRID, 40, 9)
sand_wet = (0.86, 0.77, 0.58)
sand = (0.99, 0.91, 0.68)
grass_a = (0.53, 0.80, 0.34)
grass_b = (0.36, 0.67, 0.28)
jungle_a = (0.18, 0.56, 0.26)
jungle_b = (0.10, 0.40, 0.19)
rock_a = (0.78, 0.74, 0.66)
rock_b = (0.60, 0.55, 0.48)

wet = smoothstep(0.402, 0.432, S)
C = mix(sand_wet, sand, wet)
gv = np.clip(0.35 + n1 * 0.5 + (M - 0.5) * 0.6, 0.0, 1.0)
grass = mix(grass_b, grass_a, gv)
jungle = mix(jungle_b, jungle_a, np.clip(gv * 0.7 + 0.25, 0.0, 1.0))
jungle_t = smoothstep(0.575, 0.68, M)
ground = mix(grass, jungle, jungle_t)
ground = mix(ground, (0.72, 0.72, 0.74), smoothstep(0.46, 0.54, MSK) * 0.35)   # 고원 위 밝은 이끼/석회
rockcol = mix(rock_b, rock_a, np.clip(0.35 + n1 * 0.7, 0.0, 1.0))
rockcol = mix(rockcol, ground, 0.25 + 0.25 * (1 - smoothstep(0.46, 0.54, MSK)))
C = mix(C, ground, smoothstep(0.492, 0.53, S))
C = mix(C, rockcol, smoothstep(0.47, 0.53, MSK))
# --- 절벽면(급경사)은 바위색 ---
gy, gx = np.gradient(H)
slope_bu = np.hypot(gx, gy) * (GRID / WORLD)      # BU 당 높이 변화
C = mix(C, (0.55, 0.51, 0.47), smoothstep(0.55, 1.45, slope_bu) * smoothstep(0.40, 0.45, S) * 0.85)

# ============================================================
# 질감 · 밀도 — CoC 식 "빈틈없는 지면". 색칠을 거친다.
# ============================================================
ground_t = smoothstep(0.492, 0.53, S) * (1 - smoothstep(0.47, 0.53, MSK))   # 풀밭 마스크
rock_t = smoothstep(0.47, 0.53, MSK)
sand_t = smoothstep(0.402, 0.44, S) * (1 - smoothstep(0.48, 0.51, S))


def tint(mask2d, color):
    """2D 마스크로 색을 조금 얹는다"""
    return np.clip(mask2d, 0.0, 1.0)[..., None] * np.array(color, dtype=np.float64)


# 1) 잔디 결 — 잎처럼 얇은 밝고 어두운 무늬
blade = np.clip(vnoise(GRID, 520, 31) + 0.45 * vnoise(GRID, 900, 32) - 0.72, 0.0, 1.0) * ground_t
C += tint(blade, (0.10, 0.16, 0.05))

# 2) 풀잎 얼룩 — 곱슬곱슬한 점
leafdot = np.clip((vnoise(GRID, 300, 41) - 0.72) * 7.0, 0.0, 1.0) * ground_t
C = mix(C, (0.30, 0.58, 0.22), leafdot * 0.55)

# 3) 바위·모래 알갱이
grit = vnoise(GRID, 700, 51)
C += tint(np.clip(grit - 0.50, 0, 1) * rock_t, (0.16, 0.15, 0.13))
C += tint(np.clip(grit - 0.55, 0, 1) * sand_t, (0.14, 0.13, 0.10))

# 4) 큰 얼룩 — 평평해 보이지 않게
C = C * (0.90 + 0.20 * vnoise(GRID, 34, 61))[..., None]
C = np.clip(C, 0.0, 1.0)

# ============================================================
# 지면 텍스처(외부 자산) — tools/blender/tex/*.png 가 있으면 색에 결을 입힌다
# ============================================================
_tex_used = []


def apply_tex(C2d, tex_name, mask2d, strength=0.55, tint_mul=1.0):
    t = load_texture(tex_name)
    if t is None:
        return C2d
    th, tw = t.shape[0], t.shape[1]
    # 월드 좌표 기준 UV 로 샘플 (정사영/투영과 무관하게 지면에 붙는다)
    xs = np.clip((np.arange(GRID) / (GRID - 1) * (WORLD * 0.42)).astype(int), 0, tw - 1)
    ys = np.clip((np.arange(GRID) / (GRID - 1) * (WORLD * 0.42)).astype(int), 0, th - 1)
    sub = t[np.ix_(ys, xs)]
    lum = sub.mean(axis=2)
    lo, hi = np.percentile(lum, 2), np.percentile(lum, 98)
    norm = np.clip((lum - lo) / max(1e-5, (hi - lo)), 0.0, 1.0)
    detail = (0.70 + 0.60 * norm) * tint_mul
    _tex_used.append(tex_name)
    out = C2d * (1.0 - strength * mask2d[..., None]) + C2d * detail[..., None] * (strength * mask2d)[..., None]
    return out


C = apply_tex(C, 'grass.png', ground_t, 0.55, 1.0)
C = apply_tex(C, 'sand.png', sand_t, 0.50, 1.0)
C = apply_tex(C, 'rock.png', rock_t, 0.60, 1.0)
print('[b3d] textures applied: %s' % (', '.join(_tex_used) if _tex_used else 'none'))

# --- 수심(물 색) ---
w_shallow = (0.30, 0.83, 0.80)
w_mid = (0.13, 0.56, 0.72)
w_deep = (0.04, 0.20, 0.45)
W = mix(w_shallow, w_mid, smoothstep(0.04, 0.30, DEP))
W = mix(W, w_deep, smoothstep(0.28, 1.10, DEP))
W = mix(W, (0.92, 0.99, 1.00), smoothstep(0.10, 0.015, DEP) * 0.60)   # 해안 거품
W = W * (0.94 + 0.10 * (vnoise(GRID, 260, 13) - 0.5) * 2)[..., None]

CLIN = to_lin_rgb(C)
WLIN = to_lin_rgb(np.clip(W, 0.0, 1.0))

# ---------------------------------------------------------------
# 2. 씬 구축
# ---------------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.cycles.max_bounces = 4
scene.cycles.diffuse_bounces = 2
scene.cycles.glossy_bounces = 2
scene.cycles.transmission_bounces = 1
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'
scene.render.film_transparent = False
scene.render.resolution_x = SIZE
# 3/4 뷰에서는 세로가 sin(elev) 만큼 압축된다 → 렌더 비율도 그에 맞춘다(게임 투영과 1:1)
scene.render.resolution_y = int(round(SIZE * (math.sin(ELEV) if ELEV > 0.001 else 1.0)))
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.render.image_settings.color_mode = 'RGB'

# --- 지형 메시 (원점 생성 → 메시 좌표를 월드 0..WORLD 로 옮긴다) ---
bpy.ops.mesh.primitive_grid_add(x_subdivisions=GRID, y_subdivisions=GRID, size=WORLD)
ground = bpy.context.object
ground.location = (0.0, 0.0, 0.0)
gme = ground.data
n = len(gme.vertices)
co = np.empty(n * 3, dtype=np.float32)
gme.vertices.foreach_get('co', co)
co = co.reshape(-1, 3).astype(np.float64)
co[:, 0] += WORLD / 2.0
co[:, 1] += WORLD / 2.0
ii = np.clip(np.round(co[:, 0] / WORLD * (GRID - 1)).astype(np.int32), 0, GRID - 1)
jj = np.clip(np.round((1.0 - co[:, 1] / WORLD) * (GRID - 1)).astype(np.int32), 0, GRID - 1)
co[:, 2] = H[jj, ii]
gme.vertices.foreach_set('co', co.ravel().astype(np.float32))

attr = gme.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
colarr = np.ones((n, 4), dtype=np.float32)
colarr[:, :3] = CLIN[jj, ii]
attr.data.foreach_set('color', colarr.ravel())
if SMOOTH:
    gme.shade_smooth()
else:
    gme.shade_flat()

# --- 지형 재질: Toon ---
gmat = bpy.data.materials.new('toon_ground')
gmat.use_nodes = True
nt = gmat.node_tree
nt.nodes.clear()
out = nt.nodes.new('ShaderNodeOutputMaterial')
toon = nt.nodes.new('ShaderNodeBsdfToon')
toon.inputs['Size'].default_value = 0.62
toon.inputs['Smooth'].default_value = 0.10
vcol = nt.nodes.new('ShaderNodeVertexColor')
vcol.layer_name = 'Col'
nt.links.new(vcol.outputs['Color'], toon.inputs['Color'])
nt.links.new(toon.outputs['BSDF'], out.inputs['Surface'])
ground.data.materials.append(gmat)

# --- 물 (카메라 기울여도 프레임 전체를 덮도록 크게) ---
bpy.ops.mesh.primitive_grid_add(x_subdivisions=WATER_GRID, y_subdivisions=WATER_GRID,
                                size=WORLD * (3.0 if ELEV > 0.001 else 1.0))
water = bpy.context.object
water.location = (0.0, 0.0, 0.0)
wme = water.data
wn = len(wme.vertices)
wco = np.empty(wn * 3, dtype=np.float32)
wme.vertices.foreach_get('co', wco)
wco = wco.reshape(-1, 3).astype(np.float64)
wco[:, 0] += WORLD / 2.0
wco[:, 1] += WORLD / 2.0
wi = np.clip(np.round(wco[:, 0] / WORLD * (GRID - 1)).astype(np.int32), 0, GRID - 1)
wj = np.clip(np.round((1.0 - wco[:, 1] / WORLD) * (GRID - 1)).astype(np.int32), 0, GRID - 1)
wme.vertices.foreach_set('co', wco.ravel().astype(np.float32))   # 메시도 월드 좌표로 이동
wattr = wme.color_attributes.new(name='Col', type='FLOAT_COLOR', domain='POINT')
wcol = np.ones((wn, 4), dtype=np.float32)
wcol[:, :3] = WLIN[wj, wi]
wattr.data.foreach_set('color', wcol.ravel())

wmat = bpy.data.materials.new('water')
wmat.use_nodes = True
wnt = wmat.node_tree
wnt.nodes.clear()
wout = wnt.nodes.new('ShaderNodeOutputMaterial')
wpr = wnt.nodes.new('ShaderNodeBsdfPrincipled')
wpr.inputs['Roughness'].default_value = 0.22
wv = wnt.nodes.new('ShaderNodeVertexColor')
wv.layer_name = 'Col'
wnt.links.new(wv.outputs['Color'], wpr.inputs['Base Color'])
wnt.links.new(wpr.outputs['BSDF'], wout.inputs['Surface'])
water.data.materials.append(wmat)

# --- 태양(게임 화면 기준 좌상단에서) ---
ELEV = math.radians(float(os.environ.get('B3D_ELEV', '0')))
_sun_dir = Vector((1.0, 1.0 if ELEV > 0.001 else -1.0, -0.52)).normalized()   # 낮은 태양 = 긴 그림자 = 입체감
sun_d = bpy.data.lights.new('sun', type='SUN')
sun_d.energy = 4.0
sun_d.angle = math.radians(3.0)
sun_d.color = (1.0, 0.97, 0.90)
sun = bpy.data.objects.new('sun', sun_d)
scene.collection.objects.link(sun)
sun.location = (-30.0, -30.0 if ELEV > 0.001 else 30.0, 30.0)
sun.rotation_euler = _sun_dir.to_track_quat('-Z', 'Y').to_euler()

# --- 환경광(그림자가 검게 죽지 않게) ---
world = bpy.data.worlds.new('world')
scene.world = world
world.use_nodes = True
bg = world.node_tree.nodes['Background']
bg.inputs[0].default_value = (0.62, 0.80, 0.96, 1.0)
bg.inputs[1].default_value = 0.62

# --- 카메라(기본은 정사영 탑다운. B3D_ELEV 로 3/4 뷰 가능) ---
cam_d = bpy.data.cameras.new('cam')
cam_d.type = 'ORTHO'
cam_d.ortho_scale = WORLD
cam_d.clip_start = 0.1
cam_d.clip_end = 400.0
cam = bpy.data.objects.new('cam', cam_d)
scene.collection.objects.link(cam)
from mathutils import Vector
if ELEV > 0.001:
    # 남쪽(-Y)에서 elevation 만큼 위를 보며 내려다본다 → 게임의 Y축만 sin(e) 로 압축
    dir_cam = Vector((0.0, -math.cos(ELEV), math.sin(ELEV))).normalized()
    cam.location = Vector((WORLD / 2.0, WORLD / 2.0, 0.0)) + dir_cam * 160.0
    cam.rotation_euler = (-dir_cam).to_track_quat('-Z', 'Y').to_euler()
else:
    cam.location = (WORLD / 2.0, WORLD / 2.0, 120.0)
    cam.rotation_euler = (0.0, 0.0, 0.0)
scene.camera = cam

# --- 외곽선(선택) ---
if FREESTYLE:
    scene.render.use_freestyle = True
    vl = bpy.context.view_layer
    vl.use_freestyle = True
    fs = vl.freestyle_settings
    ls = fs.linesets[0] if len(fs.linesets) > 0 else fs.linesets.new('outline')
    ls.select_silhouette = True
    ls.select_border = True
    ls.select_crease = True
    ls.select_edge_mark = False
    ls.select_material_boundary = False
    ls.linestyle.color = (0.06, 0.05, 0.04)
    ls.linestyle.thickness = 1.1

# ---------------------------------------------------------------
# 3. 렌더
# ---------------------------------------------------------------
out_path = os.path.join(OUT, 'island_%d.png' % SEED)
scene.render.filepath = out_path
print('[b3d] debug S[%.3f..%.3f] H[%.2f..%.2f] C[%.3f] peaks=%d' % (
    S.min(), S.max(), H.min(), H.max(), float(C.mean()), len(peaks)))
bpy.ops.render.render(write_still=True)
print('[b3d] rendered %s  peaks=%d  size=%d  grid=%d' % (out_path, len(peaks), SIZE, GRID))