# -*- coding: utf-8 -*-
"""
Resource nodes 3D -> GLB (Three.js)  —  CoC style low-poly
  · 8종: tree / palm / berry / shell / rock / ore / tar / crystal
  · 한 GLB 에 전부 담고, 메쉬 이름 = 노드 키 (tree, palm, ...)
  · 크기 기준: 생존자 1.28유닛 = 1.75m  →  야자수 ≈ 4.6

Usage:  blender -b --python tools/blender/export_props3d.py
env:    B3D_GLB (out)
"""
import bpy, bpy.ops, math, os, random
from mathutils import Vector

OUT = os.environ.get('B3D_GLB', r'C:\Users\oocss\AppData\Local\Temp\opencode\props3d.glb')
random.seed(7)

for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

BUILT = {}


def mat(name, rgb, rough=0.85):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return m


LEAF = mat('leaf', (0.30, 0.62, 0.20))
LEAF2 = mat('leaf2', (0.44, 0.76, 0.26))
LEAF_PALM = mat('leaf_palm', (0.24, 0.56, 0.26))
BARK = mat('bark', (0.42, 0.28, 0.17))
BARK2 = mat('bark2', (0.55, 0.38, 0.22))
STONE = mat('stone', (0.62, 0.60, 0.56))
STONE2 = mat('stone2', (0.48, 0.46, 0.43))
ORE = mat('ore', (0.62, 0.42, 0.22))
GOLD = mat('gold', (0.90, 0.68, 0.22))
TAR = mat('tar', (0.09, 0.08, 0.08), 0.35)
CRYST = mat('crystal', (0.30, 0.82, 0.95), 0.25)
CRYST2 = mat('crystal2', (0.62, 0.95, 1.0), 0.20)
BERRY = mat('berry', (0.86, 0.16, 0.18))
SHELL = mat('shell', (0.96, 0.88, 0.76))
SAND = mat('sand_node', (0.90, 0.82, 0.60))


def finish(ob, m=None, smooth=True, bevel=0.0):
    if m:
        ob.data.materials.append(m)
    if bevel > 0:
        md = ob.modifiers.new('bev', 'BEVEL')
        md.width = bevel
        md.segments = 2
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob


def cone(name, p1, p2, r1, r2, m, verts=8):
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
                                    depth=d.length, location=(p1 + p2) * 0.5)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    return finish(ob, m)


def ball(name, c, r, scale=(1, 1, 1), m=None, segs=10, smooth=True):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=max(6, segs // 2),
                                         radius=r, location=c)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    return finish(ob, m, smooth)


def box(name, c, size, m, bevel=0.0, rot=(0, 0, 0)):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=c)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    ob.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    return finish(ob, m, True, bevel)


def group(kind, builder):
    """종별 메쉬를 만들고 'kind' 이름으로 묶어서 반환"""
    before = {o.name for o in bpy.data.objects}
    builder()
    names = [o.name for o in bpy.data.objects if o.name not in before]
    bpy.ops.object.select_all(action='DESELECT')
    for n in names:
        bpy.data.objects[n].select_set(True)
    bpy.context.view_layer.objects.active = bpy.data.objects[names[0]]
    if len(names) > 1:
        bpy.ops.object.join()
    g = bpy.context.object
    g.name = kind
    g.location = (0, 0, 0)
    g.select_set(True)
    BUILT[kind] = g
    return g


# --------------------------------------------------------------- 나무
def build_tree():
    cone('trunk', (0, 0, 0), (0.04, 0.02, 2.10), 0.20, 0.15, BARK)
    cone('br1', (0.02, 0, 1.75), (-0.42, 0.10, 2.25), 0.10, 0.06, BARK)
    cone('br2', (0.02, 0, 1.95), (0.46, -0.12, 2.45), 0.09, 0.05, BARK)
    ball('crown1', (0, 0, 2.60), 0.86, (1.0, 1.0, 0.72), LEAF, 12)
    ball('crown2', (-0.52, 0.16, 2.30), 0.56, (1.0, 1.0, 0.75), LEAF2, 10)
    ball('crown3', (0.55, -0.18, 2.40), 0.52, (1.0, 1.0, 0.75), LEAF2, 10)


# --------------------------------------------------------------- 야자수
def build_palm():
    seg = 5
    pts = []
    for i in range(seg + 1):
        t = i / seg
        pts.append((0.55 * t * t, 0.0, 3.60 * t))
    for i in range(seg):
        cone('p%d' % i, pts[i], pts[i + 1], 0.17 - i * 0.018, 0.16 - i * 0.018, BARK2)
    top = pts[-1]
    for k in range(6):
        a = k * math.pi / 3 + 0.3
        tip = (top[0] + math.cos(a) * 1.35, top[1] + math.sin(a) * 1.35, top[2] - 0.55)
        mid = ((top[0] + tip[0]) / 2, (top[1] + tip[1]) / 2, top[2] + 0.16)
        cone('fr%d' % k, top, mid, 0.09, 0.13, LEAF_PALM, 6)
        cone('ft%d' % k, mid, tip, 0.13, 0.02, LEAF_PALM, 6)
    ball('co1', (top[0] + 0.12, top[1], top[2] - 0.22), 0.14, (1, 1, 1), BARK, 8)
    ball('co2', (top[0] - 0.13, top[1] + 0.08, top[2] - 0.26), 0.13, (1, 1, 1), BARK, 8)


# --------------------------------------------------------------- 열매 덤불
def build_berry():
    ball('b1', (0, 0, 0.32), 0.40, (1.15, 1.05, 0.85), LEAF, 10)
    ball('b2', (0.30, 0.12, 0.26), 0.28, (1.1, 1.0, 0.85), LEAF2, 10)
    ball('b3', (-0.28, -0.10, 0.24), 0.25, (1.1, 1.0, 0.85), LEAF2, 10)
    for i, (x, y, z) in enumerate([(0.20, 0.22, 0.42), (-0.18, 0.18, 0.38),
                                   (0.05, -0.26, 0.34), (-0.30, -0.10, 0.28)]):
        ball('r%d' % i, (x, y, z), 0.085, (1, 1, 1), BERRY, 8)


# --------------------------------------------------------------- 조개
def build_shell():
    ball('sand', (0, 0, 0.05), 0.42, (1.3, 1.3, 0.22), SAND, 10)
    ball('sh1', (-0.16, 0.06, 0.18), 0.17, (1.0, 1.0, 0.75), SHELL, 8)
    ball('sh2', (0.20, -0.12, 0.16), 0.14, (1.0, 1.0, 0.75), SHELL, 8)
    ball('sh3', (0.02, 0.24, 0.14), 0.12, (1.0, 1.0, 0.7), SHELL, 8)


# --------------------------------------------------------------- 바위
def build_rock():
    ball('r1', (0, 0, 0.34), 0.55, (1.15, 0.95, 0.85), STONE, 9, smooth=False)
    ball('r2', (0.42, 0.18, 0.18), 0.32, (1.1, 1.0, 0.8), STONE2, 8, smooth=False)
    ball('r3', (-0.40, -0.14, 0.16), 0.26, (1.1, 1.0, 0.8), STONE2, 8, smooth=False)


# --------------------------------------------------------------- 광맥
def build_ore():
    build_rock()
    for i, (x, y, z) in enumerate([(0.12, 0.30, 0.52), (-0.24, 0.22, 0.40), (0.34, -0.18, 0.34)]):
        ball('o%d' % i, (x, y, z), 0.11, (1, 1, 0.8), GOLD, 8)


# --------------------------------------------------------------- 타르
def build_tar():
    ball('pool', (0, 0, 0.06), 0.62, (1.25, 1.1, 0.18), TAR, 12)
    for i in range(5):
        a = i * 1.25
        ball('d%d' % i, (math.cos(a) * 0.52, math.sin(a) * 0.44, 0.10), 0.13, (1, 1, 0.55), TAR, 7)


# --------------------------------------------------------------- 수정
def build_crystal():
    ball('base', (0, 0, 0.12), 0.46, (1.2, 1.1, 0.42), STONE2, 9, smooth=False)
    specs = [(0.0, 0.0, 0.30, 0.62, 0.24), (0.32, 0.16, 0.24, 0.40, 0.18),
             (-0.28, -0.14, 0.22, 0.34, 0.16)]
    for i, (x, y, z, h, r) in enumerate(specs):
        cone('c%d' % i, (x, y, z), (x * 1.2, y * 1.2, z + h), r, r * 0.92, CRYST, 6)
        cone('t%d' % i, (x * 1.2, y * 1.2, z + h), (x * 1.25, y * 1.25, z + h * 1.30),
             r * 0.92, 0.01, CRYST2, 6)
    ball('gl', (0, -0.30, 0.42), 0.12, (1, 0.6, 1), CRYST2, 8)


# ============================================================ 건물
WOOD = mat('wood_b', (0.52, 0.35, 0.20))
WOOD2 = mat('wood_b2', (0.66, 0.47, 0.28))
ROOF = mat('roof', (0.46, 0.24, 0.14))
STONEW = mat('stone_w', (0.55, 0.53, 0.49))
FIRE = mat('fire', (1.0, 0.55, 0.12))
FIRE2 = mat('fire2', (1.0, 0.82, 0.30))
CLAY = mat('clay', (0.72, 0.42, 0.26))
CLAY2 = mat('clay2', (0.55, 0.30, 0.18))
GRASS = mat('grass_b', (0.44, 0.62, 0.26))
SOIL = mat('soil', (0.32, 0.22, 0.14))
CLAYPOT = mat('clay_pot', (0.60, 0.32, 0.20))
MELT = mat('melt', (1.0, 0.72, 0.22), 0.40)


def build_campfire():
    for i in range(7):
        a = i * 0.9
        box('s%d' % i, (math.cos(a) * 0.34, math.sin(a) * 0.34, 0.07),
            (0.14, 0.14, 0.13), STONE, 0.03, rot=(0, 0, a))
    cone('l1', (-0.16, -0.10, 0.08), (0.18, 0.12, 0.22), 0.055, 0.05, WOOD)
    cone('l2', (0.14, -0.14, 0.08), (-0.18, 0.14, 0.22), 0.055, 0.05, WOOD)
    cone('fl1', (0, 0, 0.16), (0.02, 0.01, 0.62), 0.16, 0.05, FIRE, 7)
    cone('fl2', (0, 0, 0.30), (-0.02, 0.02, 0.52), 0.10, 0.01, FIRE2, 6)


def build_hut():
    bpy.ops.mesh.primitive_cylinder_add(vertices=12, radius=0.86, depth=1.05, location=(0, 0, 0.52))
    ob = bpy.context.object; ob.name = 'wall'
    finish(ob, WOOD)
    bpy.ops.mesh.primitive_cone_add(vertices=12, radius1=1.16, radius2=0.0, depth=0.72, location=(0, 0, 1.40))
    ob2 = bpy.context.object; ob2.name = 'roof'
    finish(ob2, ROOF)
    box('door', (0, -0.84, 0.34), (0.34, 0.10, 0.68), BARK, 0.03)
    box('post', (0.70, -0.70, 0.60), (0.10, 0.10, 1.20), WOOD2, 0.02)


def build_storage():
    box('c1', (-0.32, 0.10, 0.26), (0.62, 0.62, 0.52), WOOD, 0.04)
    box('c2', (0.34, -0.12, 0.22), (0.54, 0.54, 0.44), WOOD2, 0.04)
    box('c3', (0.02, 0.06, 0.66), (0.66, 0.66, 0.30), WOOD, 0.04)
    cone('roof', (0, 0, 0.80), (0, 0, 1.34), 0.78, 0.05, ROOF, 4)


def build_wall():
    for i in range(4):
        cone('p%d' % i, (-0.72 + i * 0.48, 0, 0), (-0.72 + i * 0.48, 0, 0.86 + (0.08 if i % 2 else 0)),
             0.10, 0.075, WOOD, 6)
    box('rail', (0, 0, 0.52), (1.86, 0.12, 0.12), WOOD2, 0.02)


def build_tower():
    box('base', (0, 0, 0.16), (1.10, 1.10, 0.32), STONEW, 0.04)
    box('shaft', (0, 0, 0.90), (0.80, 0.80, 1.20), STONEW, 0.04)
    box('deck', (0, 0, 1.58), (1.14, 1.14, 0.16), WOOD, 0.03)
    for i, (dx, dy) in enumerate([(-0.48, -0.48), (0.48, -0.48), (-0.48, 0.48), (0.48, 0.48)]):
        box('p%d' % i, (dx, dy, 1.86), (0.14, 0.14, 0.44), WOOD2, 0.02)
    cone('roof', (0, 0, 2.02), (0, 0, 2.62), 0.92, 0.04, ROOF, 4)


# ---------- 一 손 : 풀침대 ----------
def build_bed():
    for i, (dx, dy) in enumerate([(-0.42, -0.30), (0.42, -0.30), (-0.42, 0.30), (0.42, 0.30)]):
        box('l%d' % i, (dx, dy, 0.10), (0.12, 0.12, 0.20), WOOD, 0.02)
    box('frame', (0, 0, 0.24), (1.10, 0.86, 0.10), WOOD2, 0.03)
    box('bed', (0, 0, 0.33), (0.98, 0.74, 0.10), GRASS, 0.04)
    box('pil', (0, -0.26, 0.40), (0.46, 0.24, 0.12), WOOD, 0.04)
    for i in range(5):                       # 풀 다발
        cone('s%d' % i, (-0.44 + i * 0.22, 0.26, 0.34), (-0.44 + i * 0.22, 0.30, 0.48),
             0.05, 0.01, GRASS, 5)


# ---------- 二 불 : 부엌 ----------
def build_kitchen():
    box('stove', (0.18, 0, 0.34), (0.74, 0.74, 0.68), CLAY, 0.05)
    cone('dome', (0.18, 0, 0.66), (0.18, 0, 0.94), 0.46, 0.34, CLAY2, 10)
    box('mou', (0.18, -0.34, 0.26), (0.30, 0.14, 0.26), CLAY2, 0.02)
    cone('flam', (0.18, -0.30, 0.30), (0.16, -0.30, 0.56), 0.11, 0.02, FIRE, 6)
    # 냄비
    ball('pot', (-0.36, 0.02, 0.30), 0.24, (1.0, 1.0, 0.72), CLAYPOT, 10)
    box('lid', (-0.36, 0.02, 0.46), (0.34, 0.34, 0.06), CLAY2, 0.02)
    box('bench', (-0.36, 0.40, 0.22), (0.62, 0.22, 0.44), WOOD, 0.03)


# ---------- 三 돌 : 가시 함정 ----------
def build_trap():
    cone('pit', (0, 0, 0.16), (0, 0, 0.01), 0.46, 0.34, SOIL, 10)
    for i in range(7):                       # 박힌 가시
        a = i * 0.897
        x, y = math.cos(a) * 0.30, math.sin(a) * 0.30
        cone('t%d' % i, (x, y, 0.02), (x * 0.35, y * 0.35, 0.40 + 0.06 * (i % 2)),
             0.055, 0.012, WOOD, 5)
    ball('bait', (0, 0, 0.26), 0.10, (1, 1, 0.8), BERRY, 8)


# ---------- 四 흙 : 밭 ----------
def build_farm():
    box('soil', (0, 0, 0.07), (1.22, 1.22, 0.14), SOIL, 0.03)
    for i in range(3):                       # 갈 줄
        y = -0.38 + i * 0.38
        cone('r%d' % i, (-0.56, y, 0.14), (0.56, y, 0.14), 0.11, 0.11, WOOD, 6)
        for j in range(4):                   # 싹
            x = -0.42 + j * 0.28
            cone('g%d_%d' % (i, j), (x, y, 0.14), (x + 0.04, y, 0.36), 0.05, 0.01, LEAF, 5)
    for i, (dx, dy) in enumerate([(-0.58, -0.58), (0.58, -0.58), (-0.58, 0.58), (0.58, 0.58)]):
        cone('f%d' % i, (dx, dy, 0.0), (dx, dy, 0.22), 0.07, 0.05, WOOD, 5)


# ---------- 五 청동 : 용광로 ----------
def build_furnace():
    box('base', (0, 0, 0.16), (1.06, 0.94, 0.32), STONEW, 0.05)
    cone('shaft', (0, 0, 0.30), (0, 0, 1.22), 0.42, 0.26, STONEW, 8)
    box('mouth', (0, -0.36, 0.34), (0.40, 0.16, 0.30), CLAY2, 0.02)
    cone('glow', (0, -0.36, 0.24), (0, -0.36, 0.50), 0.17, 0.09, MELT, 7)
    box('anvil', (0.44, 0.10, 0.22), (0.30, 0.30, 0.24), STONE2, 0.03)
    cone('bellows', (0.30, 0.40, 0.34), (0.06, 0.22, 0.44), 0.20, 0.05, WOOD, 7)


BUILDERS = {
    'tree': build_tree, 'palm': build_palm, 'berry': build_berry, 'shell': build_shell,
    'rock': build_rock, 'ore': build_ore, 'tar': build_tar, 'crystal': build_crystal,
    # 건물 — 一 손 / 二 불 / 三 돌 / 四 흙 / 五 청동 / 六 철기
    'b_bed': build_bed, 'b_storage': build_storage,
    'b_campfire': build_campfire, 'b_kitchen': build_kitchen,
    'b_wall': build_wall, 'b_trap': build_trap,
    'b_hut': build_hut, 'b_farm': build_farm,
    'b_furnace': build_furnace, 'b_tower': build_tower,
}
for kind, fn in BUILDERS.items():
    group(kind, fn)
    print('[props3d] %s verts=%d' % (kind, len(BUILT[kind].data.vertices)))

BUILDKINDS = [k for k in BUILDERS if k.startswith('b_')]

# 각 메쉬를 원점 위치에 맞춰 정렬 (glTF 로 붙일 때 튀지 않게)
for k, ob in BUILT.items():
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
kw = dict(filepath=OUT, export_format='GLB', export_apply=False, export_yup=True,
          export_materials='EXPORT', export_animations=False)
try:
    bpy.ops.export_scene.gltf(**kw)
except TypeError:
    bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_yup=True,
                              export_materials='EXPORT')
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('[props3d] saved %s  kinds=%d  faces=%d' % (OUT, len(BUILT), tris))

# ---- 선택적: 건축물 접촉시트 렌더 (B3D_PREVIEW 지정 시) ----
PV = os.environ.get('B3D_PREVIEW', '')
if PV:
    bcells = [k for k in BUILDKINDS]
    n = len(bcells)
    cols = 5
    for i, k in enumerate(bcells):
        g = BUILT.get(k)
        if g is None:
            continue
        g.location = ((i % cols - (cols - 1) / 2.0) * 3.4, -((i // cols) * 3.4), 0.0)
    bpy.ops.mesh.primitive_plane_add(size=40, location=(0, 0, -0.02))
    gm = bpy.data.materials.new('pv_ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.76, 0.45, 1)
    bpy.context.object.data.materials.append(gm)
    bpy.ops.object.select_all(action='DESELECT')
    for k in bcells:
        g = BUILT.get(k)
        if g:
            g.select_set(True)
    # 노드(자원) 그룹은 숨긴다 — 원점에 서서 셀을 가린다
    for k, g in BUILT.items():
        if k not in bcells:
            g.hide_render = True
            g.hide_viewport = True
    bpy.context.view_layer.objects.active = BUILT[bcells[0]]
    cam_data = bpy.data.cameras.new('PVCam')
    cam = bpy.data.objects.new('PVCam', cam_data)
    # 모든 건축물의 bounding box 로 프레이밍 (잘리지 않게)
    mn = [1e9] * 3
    mx = [-1e9] * 3
    for k in bcells:
        g = BUILT.get(k)
        if not g:
            continue
        for c in g.bound_box:
            w = g.matrix_world @ Vector(c)
            for a in range(3):
                mn[a] = min(mn[a], w[a])
                mx[a] = max(mx[a], w[a])
    cx = (mn[0] + mx[0]) / 2.0
    cy = (mn[1] + mx[1]) / 2.0
    span = max(mx[0] - mn[0], mx[1] - mn[1], 1.0)
    dist = span * 1.55
    cam.location = (cx, cy - dist * 0.78, dist * 0.62)
    cam.rotation_euler = (math.radians(52), 0, 0)
    cam_data.lens = 50
    bpy.context.scene.collection.objects.link(cam)
    bpy.context.scene.camera = cam
    sc = bpy.context.scene
    sc.render.engine = 'BLENDER_WORKBENCH'
    sc.render.resolution_x = 1500
    sc.render.resolution_y = 760
    sh = sc.display.shading
    sh.light = 'STUDIO'
    sh.color_type = 'MATERIAL'
    sh.show_cavity = True
    sh.show_object_outline = True
    sc.render.filepath = PV
    bpy.ops.render.render(write_still=True)
    print('[props3d] preview saved %s' % PV)
    for kind in bcells:
        g = BUILT.get(kind)
        if not g:
            continue
        bb = [g.matrix_world @ Vector(c) for c in g.bound_box]
        mn = [min(v[a] for v in bb) for a in range(3)]
        mx = [max(v[a] for v in bb) for a in range(3)]
        mats = [m.name for m in g.data.materials]
        print('[props3d] PV %-12s size=%.2f x %.2f x %.2f mats=%s'
              % (kind, mx[0] - mn[0], mx[1] - mn[1], mx[2] - mn[2], ','.join(mats)))