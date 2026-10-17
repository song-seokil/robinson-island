# -*- coding: utf-8 -*-
"""
프로프(수목 · 바위 · 건물 · 유닛) 3D → 2D 스프라이트 렌더 (만화풍)
  · 게임과 같은 태양 방향(화면 좌상단) · 낮은 각도 정사영 → 빌보드 스프라이트
  · 그림자는 그림자 캣처 평면에 자연스럽게烘焙 → 스프라이트에 그림자가 들어간다
  · 결과: PNG(알파) — 게임의 캔버스 드로잉 텍스처를 대체한다

사용: blender -b --python render_props.py
환경변수: B3D_OUT(출력 폴더) B3D_SIZE B3D_SAMPLES B3D_SHEET
"""
import bpy, math, os, random
import numpy as np
from mathutils import Vector

OUT = os.environ.get('B3D_OUT', r'C:\Users\oocss\AppData\Local\Temp\opencode\b3d\props')
SIZE = int(os.environ.get('B3D_SIZE', '256'))
SAMPLES = int(os.environ.get('B3D_SAMPLES', '24'))
SHEET = os.environ.get('B3D_SHEET', '1') == '1'
SHEET_ONLY = os.environ.get('B3D_SHEET_ONLY', '0') == '1'
os.makedirs(OUT, exist_ok=True)

# 카메라: 지평선 47° · 뒤쪽-왼쪽 위 → 몸체와 무기가 잘 보이는 각도(CoC 유닛 느낌)
CAM_DIR = Vector((-0.45, 0.52, 0.73)).normalized()      # 대상 → 카메라 방향
SUN_DIR = Vector((1.0, -1.0, -0.85)).normalized()        # 태양 빛이 진행하는 방향


# ---------------------------------------------------------------
# 재질 · 프리미티브 헬퍼
# ---------------------------------------------------------------
def toon_mat(name, color, emit=0.0, size=0.62, smooth=0.12):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    if emit > 0.0:
        e = nt.nodes.new('ShaderNodeEmission')
        e.inputs['Color'].default_value = (color[0], color[1], color[2], 1.0)
        e.inputs['Strength'].default_value = emit
        nt.links.new(e.outputs['Emission'], o.inputs['Surface'])
    else:
        t = nt.nodes.new('ShaderNodeBsdfToon')
        t.inputs['Color'].default_value = (color[0], color[1], color[2], 1.0)
        t.inputs['Size'].default_value = size
        t.inputs['Smooth'].default_value = smooth
        nt.links.new(t.outputs['BSDF'], o.inputs['Surface'])
    return m


def add_mat(o, mat):
    o.data.materials.append(mat)
    return o


def ico(loc, r, mat, sub=2, jitter=0.0, seed=1, scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_ico_sphere_add(subdivisions=sub, radius=r, location=loc)
    o = bpy.context.object
    if jitter > 0.0:
        rng = random.Random(seed)
        for v in o.data.vertices:
            v.co *= (1.0 + rng.uniform(-jitter, jitter))
    o.scale = scale
    o.data.shade_flat()
    return add_mat(o, mat)


def cyl(loc, r, depth, mat, verts=10, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    o.data.shade_flat()
    return add_mat(o, mat)


def cone(loc, r1, r2, depth, mat, verts=10, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2, depth=depth,
                                    location=loc, rotation=rot)
    o = bpy.context.object
    o.data.shade_flat()
    return add_mat(o, mat)


def cube(loc, size, mat, rot=(0, 0, 0), scale=(1, 1, 1)):
    bpy.ops.mesh.primitive_cube_add(size=size, location=loc, rotation=rot)
    o = bpy.context.object
    o.scale = scale
    o.data.shade_flat()
    return add_mat(o, mat)


# 색상 팔레트(만화풍 · 채도 높음)
C_LEAF = (0.24, 0.60, 0.26)
C_LEAF_D = (0.13, 0.42, 0.20)
C_LEAF_L = (0.40, 0.76, 0.32)
C_WOOD = (0.46, 0.30, 0.18)
C_WOOD_L = (0.62, 0.42, 0.25)
C_STONE = (0.55, 0.56, 0.60)
C_STONE_D = (0.38, 0.39, 0.44)
C_SAND = (0.92, 0.84, 0.62)
C_FIRE = (1.0, 0.55, 0.15)
C_CRY = (0.45, 0.90, 1.0)
C_GOLD = (1.0, 0.80, 0.25)
C_SKIN = (0.98, 0.80, 0.62)
C_SHIRT = (0.20, 0.55, 0.85)
C_RED = (0.85, 0.25, 0.22)
C_BLACK = (0.12, 0.12, 0.15)
C_TAR = (0.08, 0.08, 0.10)
C_METAL = (0.70, 0.74, 0.80)


# ---------------------------------------------------------------
# 프로프 정의 — 각각 (만드는 함수)
# ---------------------------------------------------------------
def mk_tree(rng):
    m_trunk = toon_mat('wood', C_WOOD)
    m_leaf = toon_mat('leaf', C_LEAF)
    m_leaf2 = toon_mat('leaf2', C_LEAF_L)
    h = rng.uniform(0.34, 0.46)
    cyl((0, 0, h / 2), 0.055, h, m_trunk, verts=7)
    ico((0, 0, h + 0.16), 0.26, m_leaf, sub=2, jitter=0.10, seed=rng.randint(1, 99), scale=(1, 1, 0.85))
    ico((0.10, -0.05, h + 0.05), 0.17, m_leaf2, sub=2, jitter=0.12, seed=rng.randint(1, 99), scale=(1, 1, 0.8))
    ico((-0.09, 0.07, h + 0.02), 0.15, m_leaf, sub=2, jitter=0.12, seed=rng.randint(1, 99), scale=(1, 1, 0.8))


def mk_palm(rng):
    m_trunk = toon_mat('wood', C_WOOD_L)
    m_leaf = toon_mat('leaf', C_LEAF_L)
    seg = 5
    h = rng.uniform(0.46, 0.56)
    lean = rng.uniform(-0.12, 0.12)
    for i in range(seg):
        t = i / (seg - 1.0)
        z = t * h
        x = lean * t * t
        cyl((x, 0, z + h / seg / 2), 0.042 - 0.012 * t, h / seg + 0.02, m_trunk,
            verts=6, rot=(0, 0.12 * (1 if i % 2 else -1), 0))
    top = (lean, 0, h)
    for k in range(6):
        a = math.pi * 2 * k / 6 + rng.uniform(-0.2, 0.2)
        droop = rng.uniform(0.35, 0.6)
        cone((top[0] + math.cos(a) * 0.17, top[1] + math.sin(a) * 0.17, top[2] + 0.03),
             0.10, 0.01, 0.34, m_leaf, verts=5,
             rot=(math.sin(a) * droop, -math.cos(a) * droop, 0))
    ico((top[0], top[1], top[2] + 0.02), 0.07, toon_mat('coconut', (0.35, 0.24, 0.12)), sub=1)


def mk_bush(rng):
    m1 = toon_mat('leaf', C_LEAF_D)
    m2 = toon_mat('leaf2', C_LEAF)
    ico((0, 0, 0.13), 0.17, m1, sub=2, jitter=0.12, seed=rng.randint(1, 99), scale=(1.1, 1.0, 0.8))
    ico((0.11, 0.04, 0.10), 0.11, m2, sub=2, jitter=0.12, seed=rng.randint(1, 99), scale=(1, 1, 0.8))


def mk_berry(rng):
    mk_bush(rng)
    m = toon_mat('berry', (0.88, 0.20, 0.25))
    for k in range(4):
        a = math.pi * 2 * k / 4 + 0.4
        ico((math.cos(a) * 0.11, math.sin(a) * 0.09, 0.19 + rng.uniform(0, 0.04)), 0.035, m, sub=1)


def mk_rock(rng):
    m1 = toon_mat('rock', C_STONE)
    m2 = toon_mat('rockd', C_STONE_D)
    ico((0, 0, 0.13), 0.21, m1, sub=2, jitter=0.18, seed=rng.randint(1, 99), scale=(1.15, 1.0, 0.75))
    ico((0.14, 0.06, 0.07), 0.10, m2, sub=1, jitter=0.2, seed=rng.randint(1, 99), scale=(1, 1, 0.7))


def mk_ore(rng):
    mk_rock(rng)
    m = toon_mat('copper', (0.72, 0.45, 0.25), size=0.5)
    for k in range(3):
        a = rng.uniform(0, 3.14)
        cone((math.cos(a) * 0.08, math.sin(a) * 0.07, 0.16), 0.045, 0.005, 0.10, m, verts=5,
             rot=(rng.uniform(-0.4, 0.4), rng.uniform(-0.4, 0.4), 0))


def mk_crystal(rng):
    m = toon_mat('crystal', C_CRY, emit=0.35)
    m2 = toon_mat('crystal2', (0.70, 0.98, 1.0), emit=0.5)
    for k in range(3):
        a = math.pi * 2 * k / 3
        cone((math.cos(a) * 0.08, math.sin(a) * 0.07, 0.14), 0.055, 0.01, 0.28, m if k else m2, verts=6,
             rot=(rng.uniform(-0.25, 0.25), rng.uniform(-0.25, 0.25), 0))


def mk_tar(rng):
    m = toon_mat('tar', C_TAR, size=0.35, smooth=0.35)
    cyl((0, 0, 0.012), 0.24, 0.03, m, verts=12)
    ico((0.02, -0.01, 0.03), 0.13, m, sub=2, jitter=0.15, seed=rng.randint(1, 99), scale=(1.1, 1.0, 0.35))


def mk_campfire(rng):
    m_stone = toon_mat('stone', C_STONE_D)
    m_log = toon_mat('wood', C_WOOD)
    m_fire = toon_mat('fire', C_FIRE, emit=2.4)
    for k in range(7):
        a = math.pi * 2 * k / 7
        ico((math.cos(a) * 0.19, math.sin(a) * 0.17, 0.035), 0.055, m_stone, sub=1, jitter=0.15,
            seed=rng.randint(1, 99), scale=(1, 1, 0.7))
    for k in range(3):
        a = math.pi * k / 3
        cyl((0, 0, 0.05), 0.028, 0.30, m_log, verts=6, rot=(math.pi / 2 - 0.25, 0, a))
    cone((0, 0, 0.16), 0.10, 0.01, 0.22, m_fire, verts=7)
    cone((0, 0, 0.12), 0.06, 0.01, 0.14, toon_mat('fire2', (1.0, 0.85, 0.35), emit=3.0), verts=7)


def mk_wall(rng):
    m = toon_mat('wood', C_WOOD)
    m2 = toon_mat('wood2', C_WOOD_L)
    for k in range(3):
        cyl((-0.12 + k * 0.12, 0, 0.17), 0.045, 0.34, m if k % 2 == 0 else m2, verts=7)
        cone((-0.12 + k * 0.12, 0, 0.37), 0.048, 0.004, 0.08, m2, verts=7)
    cube((0, 0.02, 0.15), 0.30, m2, scale=(1, 0.35, 1))


def mk_tower(rng):
    m_stone = toon_mat('stone', C_STONE)
    m_stone_d = toon_mat('stoned', C_STONE_D)
    m_wood = toon_mat('wood', C_WOOD)
    m_roof = toon_mat('roof', (0.70, 0.28, 0.22))
    cyl((0, 0, 0.05), 0.24, 0.10, m_stone_d, verts=12, scale=(1, 1, 1))
    for k in range(6):
        a = math.pi * 2 * k / 6
        cyl((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.24), 0.036, 0.30, m_stone, verts=6)
    cyl((0, 0, 0.40), 0.19, 0.05, m_wood, verts=12)
    for k in range(4):
        a = math.pi * 2 * k / 4 + 0.78
        cyl((math.cos(a) * 0.15, math.sin(a) * 0.15, 0.52), 0.028, 0.24, m_wood, verts=6)
    cone((0, 0, 0.68), 0.24, 0.02, 0.20, m_roof, verts=8)


def mk_spikes(rng):
    m = toon_mat('wood', (0.40, 0.26, 0.16))
    m2 = toon_mat('metal', C_METAL)
    cube((0, 0, 0.03), 0.26, m, scale=(1.3, 1.3, 0.5))
    for k in range(4):
        a = math.pi * 2 * k / 4 + 0.7
        cone((math.cos(a) * 0.08, math.sin(a) * 0.08, 0.14), 0.045, 0.004, 0.20, m2, verts=6,
             rot=(math.sin(a) * 0.3, -math.cos(a) * 0.3, 0))


def mk_hut(rng):
    m_wall = toon_mat('wall', (0.85, 0.78, 0.60))
    m_roof = toon_mat('roof', (0.72, 0.32, 0.22))
    m_wood = toon_mat('wood', C_WOOD)
    cyl((0, 0, 0.16), 0.26, 0.32, m_wall, verts=12)
    cyl((0, 0, 0.33), 0.28, 0.04, m_wood, verts=12)
    cone((0, 0, 0.50), 0.36, 0.03, 0.30, m_roof, verts=12)
    cube((0, -0.24, 0.10), 0.14, toon_mat('door', (0.40, 0.26, 0.14)), scale=(1, 0.4, 1.6))


def mk_raft(rng):
    m_log = toon_mat('log', C_WOOD_L)
    m_leaf = toon_mat('leaf', C_LEAF_L)
    for k in range(5):
        cyl((-0.20 + k * 0.10, 0, 0.05), 0.048, 0.46, m_log, verts=7, rot=(math.pi / 2, 0, 0))
    for k in range(4):
        a = math.pi * 2 * k / 4 + 0.5
        cone((math.cos(a) * 0.17, math.sin(a) * 0.14, 0.07), 0.10, 0.02, 0.22, m_leaf, verts=5,
             rot=(math.sin(a) * 0.8, -math.cos(a) * 0.8, 0))


def mk_chest(rng):
    m_wood = toon_mat('wood', (0.45, 0.28, 0.16))
    m_gold = toon_mat('gold', C_GOLD)
    cube((0, 0, 0.10), 0.28, m_wood, scale=(1, 0.8, 0.7))
    cube((0, 0, 0.20), 0.28, m_gold, scale=(1, 0.8, 0.22))
    cube((0, -0.12, 0.15), 0.05, m_gold, scale=(1, 0.4, 1))


def mk_human(rng, cloth, hat=True, weapon=None, k=1.0, skin=(0.98, 0.80, 0.62), hair=None):
    """공통 인물 — 어깨/팔이 보이는 각도(47°) 기준"""
    m_skin = toon_mat('skin', skin)
    m_cloth = toon_mat('cloth', cloth)
    m_pants = toon_mat('pants', (0.28, 0.30, 0.38))
    m_metal = toon_mat('metal', C_METAL)
    # 다리
    for dx in (-0.055 * k, 0.055 * k):
        cyl((dx, 0, 0.085 * k), 0.036 * k, 0.17 * k, m_pants, verts=6)
    # 몸통(어깨 넓게)
    ico((0, 0, 0.24 * k), 0.115 * k, m_cloth, sub=2, scale=(1.05, 0.85, 1.0))
    # 팔
    for dx in (-0.125 * k, 0.125 * k):
        cyl((dx, 0.01, 0.23 * k), 0.033 * k, 0.17 * k, m_cloth, verts=6, rot=(0, 0.18 * (1 if dx > 0 else -1), 0))
        ico((dx + 0.02 * k, 0.01, 0.15 * k), 0.038 * k, m_skin, sub=1, scale=(1, 1, 0.9))
    # 머리
    ico((0, 0, 0.375 * k), 0.082 * k, m_skin, sub=2, scale=(1, 0.95, 1.05))
    if hat:
        cyl((0, 0, 0.425 * k), 0.105 * k, 0.022 * k, m_cloth, verts=12, scale=(1, 1, 1))
        cyl((0, 0, 0.465 * k), 0.078 * k, 0.075 * k, m_cloth, verts=12)
    elif hair is not None:
        ico((0, -0.01, 0.40 * k), 0.085 * k, toon_mat('hair', hair), sub=1, scale=(1, 1, 0.65))
    # 무기
    if weapon == 'sword':
        cube((0.17 * k, 0, 0.28 * k), 0.03 * k, m_metal, scale=(0.35, 0.35, 2.6))
    elif weapon == 'bow':
        cyl((0.17 * k, 0, 0.26 * k), 0.013 * k, 0.34 * k, m_metal, verts=5, rot=(0, 0.3, 0))
        cube((0.17 * k, 0, 0.26 * k), 0.22 * k, toon_mat('string', (0.92, 0.92, 0.88)), scale=(0.1, 0.04, 1))
    elif weapon == 'bomb':
        ico((0.17 * k, 0.02, 0.22 * k), 0.075 * k, toon_mat('bomb', C_BLACK), sub=2)
        cyl((0.17 * k, 0.02, 0.32 * k), 0.012 * k, 0.08 * k, toon_mat('fuse', (1.0, 0.75, 0.3), emit=0.8), verts=5)
    elif weapon == 'horns':
        for dx in (-0.09 * k, 0.09 * k):
            cone((dx, 0, 0.45 * k), 0.03 * k, 0.004 * k, 0.14 * k, toon_mat('horn', (0.95, 0.93, 0.85)), verts=6,
                 rot=(0, dx * 6, 0))


def mk_player(rng):
    mk_human(rng, C_SHIRT, hat=True, weapon='sword', skin=C_SKIN, hair=(0.35, 0.24, 0.15))


def mk_pirate(rng, hat=True, bow=False, bomb=False, big=False):
    mk_human(rng, C_RED if not bow else (0.28, 0.48, 0.32),
             hat=hat, weapon='bow' if bow else ('bomb' if bomb else ('horns' if big else 'sword')),
             k=1.30 if big else 1.0, skin=(0.90, 0.72, 0.55),
             hair=(0.25, 0.18, 0.12) if not hat else None)


def mk_boar(rng):
    m_body = toon_mat('body', (0.40, 0.28, 0.20))
    m_dark = toon_mat('dark', (0.26, 0.18, 0.13))
    m_tusk = toon_mat('tusk', (0.95, 0.93, 0.85))
    # 다리
    for dx in (-0.09, 0.09):
        for dy in (-0.07, 0.07):
            cyl((dx, dy, 0.055), 0.028, 0.11, m_dark, verts=5)
    # 몸통 · 머리 · 주둥이
    ico((-0.04, 0, 0.17), 0.16, m_body, sub=2, scale=(1.30, 0.95, 0.90))
    ico((0.15, 0, 0.15), 0.10, m_body, sub=2, scale=(1.15, 0.95, 0.95))
    ico((0.26, 0, 0.13), 0.055, m_dark, sub=1, scale=(1.1, 1.0, 0.9))
    # 귀 · 눈 · 송아리
    for dy in (-0.06, 0.06):
        cone((0.10, dy, 0.24), 0.035, 0.004, 0.09, m_dark, verts=5, rot=(0.5 * (1 if dy > 0 else -1), 0, 0))
    for dy in (-0.06, 0.06):
        ico((0.21, dy, 0.19), 0.020, toon_mat('eye', C_BLACK), sub=1)
    for dy in (-0.05, 0.05):
        cone((0.30, dy, 0.115), 0.022, 0.003, 0.10, m_tusk, verts=5, rot=(0, 1.25, 0))
    cone((-0.22, 0, 0.20), 0.018, 0.003, 0.10, m_dark, verts=5, rot=(0, -1.2, 0))


PROPS = [
    ('n_tree', mk_tree), ('n_palm', mk_palm), ('n_bush', mk_bush), ('n_berry', mk_berry),
    ('n_rock', mk_rock), ('n_ore', mk_ore), ('n_crystal', mk_crystal), ('n_tar', mk_tar),
    ('b_campfire', mk_campfire), ('b_wall', mk_wall), ('b_tower', mk_tower), ('b_spikes', mk_spikes),
    ('b_hut', mk_hut), ('b_raft', mk_raft), ('b_chest', mk_chest),
    ('u_player', mk_player), ('u_sword', lambda r: mk_pirate(r)),
    ('u_archer', lambda r: mk_pirate(r, hat=False, bow=True)),
    ('u_bomber', lambda r: mk_pirate(r, bow=False, bomb=True)),
    ('u_boss', lambda r: mk_pirate(r, big=True)),
    ('u_boar', mk_boar),
]


# ---------------------------------------------------------------
# 렌더 루프
# ---------------------------------------------------------------
def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = SAMPLES
    sc.cycles.use_denoising = True
    sc.cycles.max_bounces = 3
    sc.cycles.diffuse_bounces = 1
    sc.cycles.glossy_bounces = 1
    sc.cycles.transmission_bounces = 1
    sc.view_settings.view_transform = 'Standard'
    sc.render.film_transparent = True
    sc.render.resolution_x = SIZE
    sc.render.resolution_y = SIZE
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'

    sun_d = bpy.data.lights.new('sun', type='SUN')
    sun_d.energy = 4.2
    sun_d.angle = math.radians(5.0)
    sun_d.color = (1.0, 0.97, 0.90)
    sun = bpy.data.objects.new('sun', sun_d)
    sc.collection.objects.link(sun)
    sun.location = (-30, 30, 30)
    sun.rotation_euler = SUN_DIR.to_track_quat('-Z', 'Y').to_euler()

    world = bpy.data.worlds.new('world')
    sc.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.55, 0.74, 0.92, 1.0)
    bg.inputs[1].default_value = 0.55

    cam_d = bpy.data.cameras.new('cam')
    cam_d.type = 'ORTHO'
    cam_d.clip_start = 0.05
    cam_d.clip_end = 100.0
    cam = bpy.data.objects.new('cam', cam_d)
    sc.collection.objects.link(cam)
    sc.camera = cam
    return sc, cam


def frame(cam, objs, margin=1.22):
    pts = []
    for o in objs:
        for c in o.bound_box:
            pts.append(o.matrix_world @ Vector(c))
    mn = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
    mx = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
    ctr = (mn + mx) * 0.5
    span = max((mx - mn).x, (mx - mn).y, (mx - mn).z) * margin
    cam.location = ctr + CAM_DIR * 40.0
    cam.rotation_euler = (-CAM_DIR).to_track_quat('-Z', 'Y').to_euler()
    cam.data.ortho_scale = span


def add_shadow_plane(sc):
    bpy.ops.mesh.primitive_plane_add(size=20.0, location=(0, 0, 0.0))
    p = bpy.context.object
    p.is_shadow_catcher = True
    return p


sc, cam = setup_scene()
sheets = []
tiles = {}

for idx, (name, fn) in enumerate(PROPS):
    path = os.path.join(OUT, '%s.png' % name)
    if SHEET_ONLY and os.path.exists(path):
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)[::-1]
        bpy.data.images.remove(img)
        print('[b3d] prop(cached) %d/%d %s' % (idx + 1, len(PROPS), name))
    else:
        bpy.ops.wm.read_factory_settings(use_empty=True)
        sc, cam = setup_scene()
        rng = random.Random(1000 + idx * 17)
        fn(rng)
        objs = [o for o in bpy.context.scene.objects if o.type == 'MESH']
        add_shadow_plane(sc)
        frame(cam, objs)
        sc.render.filepath = path
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(path)
        px = np.array(img.pixels[:], dtype=np.float32).reshape(SIZE, SIZE, 4)
        px = px[::-1]          # Blender 이미지는 아래→위
        bpy.data.images.remove(img)
        print('[b3d] prop %d/%d %s' % (idx + 1, len(PROPS), name))
    checker = np.zeros((SIZE, SIZE, 3), dtype=np.float32)
    q = SIZE // 8
    for yy in range(0, SIZE, q):
        for xx in range(0, SIZE, q):
            c = 0.25 if ((xx // q + yy // q) % 2 == 0) else 0.35
            checker[yy:yy + q, xx:xx + q] = (c, c, c)
    a = px[..., 3:4]
    comp = px[..., :3] * a + checker * (1.0 - a)
    sheets.append(comp)

# --- 검토용 컨택트 시트 ---
if SHEET and sheets:
    cols = 6
    rows = int(math.ceil(len(sheets) / cols))
    pad = 6
    W = cols * SIZE + (cols + 1) * pad
    H = rows * SIZE + (rows + 1) * pad
    sheet = np.zeros((H, W, 4), dtype=np.float32)
    sheet[..., :3] = 0.08
    sheet[..., 3] = 1.0
    for i, s in enumerate(sheets):
        r, c = divmod(i, cols)
        y = H - (r + 1) * SIZE - r * pad - pad
        x = c * (SIZE + pad) + pad
        sheet[y:y + SIZE, x:x + SIZE, :3] = s
    out_img = bpy.data.images.new('sheet', width=W, height=H, alpha=True)
    flip = sheet[::-1].reshape(-1)
    out_img.pixels.foreach_set(flip)
    out_img.filepath_raw = os.path.join(OUT, '_sheet.png')
    out_img.file_format = 'PNG'
    out_img.save()
    print('[b3d] sheet %dx%d -> %s' % (W, H, out_img.filepath_raw))