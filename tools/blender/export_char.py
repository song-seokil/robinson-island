# -*- coding: utf-8 -*-
"""
Robinson Crusoe 3D character -> GLB (Three.js)
  · low-poly cartoon (CoC style), flat color blocks
  · armature rig (hips/spine/chest/head/arms/legs)
  · animations: Idle / Walk / Attack / Hit
  · env: B3D_GLB (output)  B3D_STAGE (0 naked, 1 shirt, 2 full gear)

Usage:
  blender -b --python tools/blender/export_char.py
"""
import bpy, bpy.ops, math, os
from mathutils import Vector

OUT = os.environ.get('B3D_GLB', r'C:\Users\oocss\AppData\Local\Temp\opencode\robinson.glb')
STAGE = int(os.environ.get('B3D_STAGE', '2'))

# ---------------------------------------------------------------- reset
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)
for blk in (bpy.data.meshes, bpy.data.materials, bpy.data.armatures, bpy.data.actions):
    for b in list(blk):
        if b.users == 0:
            blk.remove(b)

PARTS = []

# ---------------------------------------------------------------- materials
def mat(name, rgb, rough=0.75):
    m = bpy.data.materials.get(name)
    if m is None:
        m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return m

SKIN = mat('skin', (0.92, 0.70, 0.55))
SKIN_D = mat('skin_d', (0.80, 0.58, 0.45))
HAIR = mat('hair', (0.26, 0.17, 0.11))
HAIR_S = mat('hair_s', (0.34, 0.26, 0.20))
SHIRT = mat('shirt', (0.90, 0.85, 0.74))     # 낡은 크림색 리넨
PANTS = mat('pants', (0.52, 0.42, 0.28))
PANTS_R = mat('pants_r', (0.40, 0.19, 0.13))  # stage 2 의 벽돌빨간 카고
BOOT = mat('boot', (0.38, 0.30, 0.22))
COAT = mat('coat', (0.60, 0.42, 0.24))
FUR = mat('fur', (0.88, 0.83, 0.70))
LEATHER = mat('leather', (0.45, 0.28, 0.16))
GUN = mat('gun', (0.20, 0.18, 0.16))
POT = mat('pot', (0.30, 0.34, 0.42))
WICK = mat('wicker', (0.62, 0.45, 0.24))
ROPE = mat('rope', (0.72, 0.64, 0.46))
WOOD = mat('wood', (0.36, 0.20, 0.11))

# 刚性装备专用材质 — 骨骼固定用(有一个材质就能在蒙皮后精确找到它的顶点)
G_BACK = mat('g_back', (0.34, 0.21, 0.12))     # 背后的枪/背篓/皮毛领
G_BELT = mat('g_belt', (0.30, 0.34, 0.42))     # 腰带工具
G_HEAD = mat('g_head', (0.86, 0.80, 0.66))     # 帽子

def link(ob, m):
    ob.data.materials.append(m)
    PARTS.append(ob)
    return ob

def finish(ob, smooth=True, bevel=0.0):
    if bevel > 0:
        md = ob.modifiers.new('bev', 'BEVEL')
        md.width = bevel
        md.segments = 2
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    return ob

# ---------------------------------------------------------------- primitives
def ball(name, c, r, scale=(1, 1, 1), m=None, segs=16):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=segs, ring_count=max(8, segs // 2),
                                         radius=r, location=c)
    ob = bpy.context.object
    ob.name = name
    ob.scale = scale
    if m: link(ob, m)
    return finish(ob)

def cone(name, p1, p2, r1, r2, m=None, verts=10):
    """tapered limb between two points"""
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    L = d.length
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
                                    depth=L, location=(p1 + p2) * 0.5)
    ob = bpy.context.object
    ob.name = name
    ob.rotation_mode = 'QUATERNION'
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    if m: link(ob, m)
    return finish(ob)

def box(name, c, size, m=None, bevel=0.02, rot=0.0):
    bpy.ops.mesh.primitive_cube_add(size=1.0, location=c)
    ob = bpy.context.object
    ob.name = name
    ob.scale = size
    ob.rotation_euler = (0, rot, 0)
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel > 0:
        md = ob.modifiers.new('bev', 'BEVEL')
        md.width = bevel
        md.segments = 2
    if m: link(ob, m)
    return finish(ob)

# ---------------------------------------------------------------- body
# 2번 이미지 기준: 높이 1.78, 0 = 발바닥, 얼굴은 -Y
LEG_MAT = PANTS_R if STAGE == 2 else PANTS        # stage 2 = 벽돌빨간 카고
HIPZ = 0.92
SHOULDER_Z = 1.40
SHOULDER_X = 0.235                            # 어깨 넓게

box('pelvis', (0, 0, HIPZ), (0.42, 0.30, 0.32), PANTS, 0.06)
body_mat = SHIRT if STAGE >= 1 else SKIN          # stage 0 = 상반신 벌거벗음
box('torso', (0, 0, 1.22), (0.50, 0.34, 0.56), body_mat, 0.08)
box('chest', (0, 0.005, 1.44), (0.56, 0.36, 0.20), body_mat, 0.07)
if STAGE >= 1:                                    # 찢어진 셔츠 자락
    box('shirt_tail', (0, -0.02, 0.95), (0.42, 0.29, 0.30), SHIRT, 0.06)
    box('shirt_open', (0, -0.14, 1.30), (0.20, 0.06, 0.40), SHIRT, 0.03)   # 앞이 벌어진 셔츠

# neck + head  (목 짧게)
cone('neck', (0, 0, 1.48), (0, 0, 1.585), 0.075, 0.080, SKIN_D, 8)
ball('head', (0, 0, 1.705), 0.158, (1.0, 0.95, 1.06), SKIN, 18)
ball('brow', (0, -0.128, 1.735), 0.075, (1.5, 0.42, 0.36), HAIR, 10)   # heavy brow (aged face)
ball('nose', (0, -0.150, 1.685), 0.035, (0.8, 1.2, 0.8), SKIN, 8)
ball('hair', (0, 0.012, 1.735), 0.163, (1.0, 0.98, 0.98), HAIR, 18)
ball('hair_back', (0, 0.075, 1.665), 0.115, (1.25, 0.75, 1.35), HAIR, 12)

# 수염 — 생존자의 아크(0 무 → 1 회색 수염 → 2 통짜 수염)
if STAGE == 1:
    ball('stubble', (0, -0.055, 1.615), 0.098, (1.02, 0.92, 0.72), HAIR_S, 14)
elif STAGE == 2:
    ball('beard', (0, -0.048, 1.600), 0.112, (1.05, 0.95, 0.95), HAIR, 16)      # 통짜 수염
    ball('beard_tip', (0, -0.075, 1.545), 0.075, (0.85, 0.85, 1.15), HAIR, 12)
    ball('moustache', (0, -0.132, 1.665), 0.070, (1.55, 0.55, 0.34), HAIR, 12)  #.handlebar

# arms
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * SHOULDER_X
    ball('sh' + tag, (sx, 0, SHOULDER_Z), 0.115, (1, 1, 0.95), SHIRT if STAGE >= 1 else SKIN, 10)
    cone('uarm' + tag, (sx, 0, SHOULDER_Z), (sx * 1.14, 0.01, 1.14), 0.082, 0.066,
         SHIRT if STAGE >= 1 else SKIN, 8)
    cone('farm' + tag, (sx * 1.14, 0.01, 1.14), (sx * 1.20, 0.02, 0.92), 0.066, 0.055,
         SKIN, 8)
    ball('hand' + tag, (sx * 1.20, 0.02, 0.885), 0.068, (1, 1.1, 1), SKIN, 8)

# legs
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * 0.105
    cone('thigh' + tag, (sx, 0, HIPZ - 0.02), (sx, 0, 0.52), 0.125, 0.100, LEG_MAT, 8)
    cone('shin' + tag, (sx, 0, 0.52), (sx, 0, 0.12), 0.100, 0.072, LEG_MAT, 8)
    if STAGE == 2:
        cone('wrap' + tag, (sx, 0, 0.44), (sx, 0, 0.14), 0.086, 0.070, FUR, 8)    # 사sense wraps
        box('boot' + tag, (sx, 0.045, 0.055), (0.13, 0.26, 0.11), BOOT, 0.03)
    elif STAGE == 1:
        box('boot' + tag, (sx, 0.045, 0.055), (0.13, 0.26, 0.11), BOOT, 0.03)
    else:
        box('foot' + tag, (sx, 0.065, 0.045), (0.115, 0.235, 0.09), SKIN, 0.035)   # 맨발
        cone('rag' + tag, (sx, 0, 0.40), (sx, 0, 0.14), 0.082, 0.070, PANTS, 6)    # 찢어진 바짓단
    if STAGE == 2:
        box('knee' + tag, (sx, -0.055, 0.50), (0.10, 0.03, 0.11), COAT, 0.02)      # 무릎 패치

# ---------------------------------------------------------------- gear
if STAGE >= 1:
    # 벨트 + 화약통
    box('belt', (0, 0, 1.045), (0.46, 0.32, 0.09), LEATHER, 0.02)
    box('buckle', (0, -0.17, 1.045), (0.08, 0.03, 0.07), G_BELT, 0.012)
    box('pouch', (0.21, -0.02, 0.99), (0.11, 0.12, 0.14), G_BELT, 0.03)
    ball('flask', (0.235, 0.03, 0.93), 0.050, (1, 1, 1.35), G_BELT, 8)
    ball('flask2', (-0.235, 0.03, 0.95), 0.044, (1, 1, 1.25), G_BELT, 8)
    # 허리 도끼 + 단검 (크루조는 창이 아니라 단검과 총을 썼다)
    cone('axe_handle', (0.255, -0.11, 0.98), (0.275, -0.14, 0.74), 0.016, 0.016, G_BELT, 6)
    box('axe_head', (0.275, -0.14, 0.72), (0.11, 0.035, 0.08), POT, 0.012)
    box('dagger_grip', (-0.255, -0.12, 1.02), (0.045, 0.045, 0.10), G_BELT, 0.015)
    cone('dagger_blade', (-0.255, -0.125, 0.965), (-0.258, -0.13, 0.80), 0.026, 0.002, POT, 6)
    box('dagger_guard', (-0.255, -0.12, 0.965), (0.075, 0.045, 0.022), POT, 0.008)

if STAGE == 2:
    # 곰모이 코트 + 깃털 깃 + 벨트 도구
    box('coat', (0, 0.005, 1.20), (0.56, 0.40, 0.60), COAT, 0.10)
    box('coat_skirt', (0, 0.005, 0.86), (0.60, 0.42, 0.30), COAT, 0.09)
    ball('collar', (0, 0.02, 1.515), 0.235, (1.05, 0.95, 0.42), G_BACK, 14)
    box('coat_trim', (0, -0.205, 1.30), (0.22, 0.05, 0.56), G_BACK, 0.02)
    box('tool_saw', (0.245, -0.13, 1.00), (0.045, 0.03, 0.22), G_BELT, 0.01)
    # 청단 사냥모자
    ball('hat', (0, 0.01, 1.895), 0.190, (1.0, 1.0, 0.68), G_HEAD, 16)
    box('hatbrim', (0, 0.01, 1.800), (0.46, 0.46, 0.05), G_HEAD, 0.02)
    ball('hatband', (0, 0.01, 1.822), 0.194, (1.0, 1.0, 0.16), G_BACK, 14)
    # 바구니 등롱 + 밧줄 (등에 붙는 것 = 모두 강체)
    ball('basket', (0, 0.255, 1.24), 0.175, (1.0, 0.62, 1.15), G_BACK, 12)
    ball('basket_in', (0, 0.35, 1.24), 0.130, (1.0, 0.5, 1.0), G_BACK, 10)
    ball('rope', (0, 0.385, 1.30), 0.095, (1.15, 0.35, 0.55), G_BACK, 10)
    box('strap_l', (-0.145, 0.13, 1.32), (0.07, 0.24, 0.10), G_BACK, 0.02)
    box('strap_r', (0.145, 0.13, 1.32), (0.07, 0.24, 0.10), G_BACK, 0.02)
    # 플린트록 musket — 등 위로 비스듬히 (강체)
    cone('gun_stock', (0.30, 0.26, 0.70), (0.14, 0.35, 1.18), 0.042, 0.034, G_BACK, 8)
    cone('gun_barrel', (0.13, 0.355, 1.16), (-0.11, 0.39, 1.68), 0.022, 0.019, G_BACK, 8)
    box('gun_lock', (0.14, 0.375, 1.16), (0.05, 0.03, 0.10), G_BACK, 0.01)

# ---------------------------------------------------------------- join
bpy.ops.object.select_all(action='DESELECT')
for ob in PARTS:
    ob.select_set(True)
bpy.context.view_layer.objects.active = PARTS[0]
bpy.ops.object.join()
body = bpy.context.object
body.name = 'Robinson'

# ---------------------------------------------------------------- rig
arm_data = bpy.data.armatures.new('rig')
rig = bpy.data.objects.new('rig', arm_data)
bpy.context.collection.objects.link(rig)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.mode_set(mode='EDIT')

def bone(name, h, t, parent=None, connect=False):
    b = arm_data.edit_bones.new(name)
    b.head = h
    b.tail = t
    if parent:
        b.parent = arm_data.edit_bones[parent]
        b.use_connect = connect
    return b

bone('Hips', (0, 0, 0.92), (0, 0, 1.02))
bone('Spine', (0, 0, 1.02), (0, 0, 1.20), 'Hips', True)
bone('Chest', (0, 0, 1.20), (0, 0, 1.44), 'Spine', True)
bone('Head', (0, 0, 1.46), (0, 0, 1.70), 'Chest')
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * SHOULDER_X
    bone('Shoulder.' + tag, (sx * 0.40, 0, 1.41), (sx, 0, 1.38), 'Chest')
    bone('UpperArm.' + tag, (sx, 0, 1.38), (sx * 1.14, 0.01, 1.14), 'Shoulder.' + tag, True)
    bone('ForeArm.' + tag, (sx * 1.14, 0.01, 1.14), (sx * 1.20, 0.02, 0.92), 'UpperArm.' + tag, True)
    bone('Hand.' + tag, (sx * 1.20, 0.02, 0.92), (sx * 1.23, 0.02, 0.78), 'ForeArm.' + tag, True)
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * 0.105
    bone('Thigh.' + tag, (sx, 0, 0.92), (sx, 0, 0.52), 'Hips')
    bone('Shin.' + tag, (sx, 0, 0.52), (sx, 0, 0.12), 'Thigh.' + tag, True)
    bone('Foot.' + tag, (sx, 0, 0.12), (sx, 0.17, 0.05), 'Shin.' + tag, True)

bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
body.parent = rig

# ---- 刚性装备固定: 枪/背篓/帽/工具 整体绑到单根骨骼, 动画时绝不散架 ----
RIGID = {'g_back': 'Chest', 'g_belt': 'Hips', 'g_head': 'Head'}
def lock_rigid(mat_name, bone_name):
    me = body.data
    slots = [i for i, m in enumerate(me.materials) if m and m.name == mat_name]
    if not slots:
        return 0
    vids = set()
    for p in me.polygons:
        if p.material_index in slots:
            vids.update(p.vertices)
    if not vids:
        return 0
    lst = sorted(vids)
    vg = body.vertex_groups.get(bone_name) or body.vertex_groups.new(name=bone_name)
    for other in body.vertex_groups:
        if other.name != bone_name:
            other.remove(lst)
    vg.add(lst, 1.0, 'REPLACE')
    return len(lst)

locked = 0
for mname, bname in RIGID.items():
    locked += lock_rigid(mname, bname)
print('[char] rigid verts locked: %d' % locked)

# ---------------------------------------------------------------- anim helpers
def setpose(rot=None, loc=None, frame=0):
    if loc:
        rig.location = loc
        rig.keyframe_insert('location', frame=frame)
    if rot:
        for k, v in rot.items():
            pb = rig.pose.bones[k]
            pb.rotation_mode = 'XYZ'
            pb.rotation_euler = v
            pb.keyframe_insert('rotation_euler', frame=frame)

def new_action(name):
    """start a fresh action on the rig (Blender 4.4+ slotted actions)"""
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    rig.animation_data.action = None
    try:
        slot = act.slots.new(id_type='OBJECT', name=rig.name)
        rig.animation_data.action = act
        rig.animation_data.action_slot = slot
    except Exception as e:
        print('[char] slot api failed (%s) -> fallback' % e)
        rig.animation_data.action = act
    return act

CLIPS = []

def D(deg):
    return math.radians(deg)

# --- Idle : breathing + weight shift
new_action('Idle')
for f, amp, sh in ((1, 0.0, 0.0), (24, 1.0, 1.0), (48, 0.0, 0.0), (72, 1.0, -1.0), (96, 0.0, 0.0)):
    setpose(rot={
        'Spine': (D(2 * amp), 0, 0),
        'Chest': (D(3 * amp), 0, 0),
        'Head': (D(-2 * amp), D(3 * sh), 0),
        'Shoulder.L': (0, 0, D(-4 * amp)),
        'Shoulder.R': (0, 0, D(4 * amp)),
        'UpperArm.L': (D(-6 * amp), 0, D(-6)),
        'UpperArm.R': (D(-6 * amp), 0, D(6)),
        'ForeArm.L': (D(-14), 0, 0),
        'ForeArm.R': (D(-14), 0, 0),
        'Hips': (0, 0, D(1.5 * sh)),
    }, loc=(0, 0, 0.0), frame=f)
CLIPS.append('Idle')

# --- Walk : 32 frame cycle (0,8,16,24,32)
new_action('Walk')
swing = 34.0
for f, s, up in ((1, 1, 0), (9, 0, 1), (17, -1, 0), (25, 0, -1), (33, 1, 0)):
    setpose(rot={
        'Hips': (D(2), D(2 * s), 0),
        'Spine': (D(3), 0, D(-2 * s)),
        'Chest': (D(2), D(-3 * s), 0),
        'Head': (D(-3), 0, 0),
        'Thigh.L': (D(-s * swing), 0, 0),
        'Shin.L': (D(max(0, s) * 42 + 6), 0, 0),
        'Foot.L': (D(-max(0, s) * 16 + (up * 10)), 0, 0),
        'Thigh.R': (D(s * swing), 0, 0),
        'Shin.R': (D(max(0, -s) * 42 + 6), 0, 0),
        'Foot.R': (D(-max(0, -s) * 16 - (up * 10)), 0, 0),
        'UpperArm.L': (D(s * 24), 0, D(-5)),
        'UpperArm.R': (D(-s * 24), 0, D(5)),
        'ForeArm.L': (D(-18 - max(0, s) * 16), 0, 0),
        'ForeArm.R': (D(-18 - max(0, -s) * 16), 0, 0),
    }, loc=(0, 0, abs(s) * 0.0), frame=f)
CLIPS.append('Walk')

# --- Attack : wind-up -> thrust -> recover (frames 1..36)
new_action('Attack')
KEYS = [
    (1,  0, 0, 0), (10, -55, 0, 10), (18, -70, 0, -18), (24, 75, 0, 5), (30, 30, 0, 0), (36, 0, 0, 0),
]
for f, ua, chest, hz in KEYS:
    setpose(rot={
        'Chest': (D(-6 - chest * 0.2), 0, D(-hz * 0.6)),
        'Spine': (D(4), 0, D(-hz * 0.4)),
        'Head': (D(2), 0, D(hz * 0.4)),
        'Hips': (0, 0, D(hz * 0.5)),
        'UpperArm.R': (D(ua), 0, D(-8)),
        'ForeArm.R': (D(-10 if ua > 0 else -55), 0, 0),
        'UpperArm.L': (D(-18), 0, D(-14)),
        'ForeArm.L': (D(-40), 0, 0),
        'Thigh.L': (D(-10), 0, 0), 'Thigh.R': (D(10), 0, 0),
    }, loc=(0, 0, 0), frame=f)
CLIPS.append('Attack')

# --- Hit : recoil back
new_action('Hit')
for f, bk, hd in ((1, 0, 0), (6, -16, -18), (14, 10, 10), (26, 0, 0)):
    setpose(rot={
        'Hips': (D(bk * 0.4), 0, 0),
        'Spine': (D(bk * 0.6), 0, 0),
        'Chest': (D(bk * 0.5), 0, 0),
        'Head': (D(hd * 0.8), 0, D(hd * 0.4)),
        'UpperArm.L': (D(-30 - abs(hd)), 0, D(-22)),
        'UpperArm.R': (D(-30 - abs(hd)), 0, D(22)),
        'ForeArm.L': (D(-55), 0, 0), 'ForeArm.R': (D(-55), 0, 0),
        'Thigh.L': (D(8), 0, 0), 'Thigh.R': (D(-6), 0, 0),
    }, loc=(0, -abs(bk) * 0.012, 0), frame=f)
CLIPS.append('Hit')

# --- Shipwreck (stage 0) : 웅크린 자세 + 추위에 떨림
if STAGE == 0:
    new_action('Shipwreck')
    for f, sh in ((1, 0.0), (13, 1.0), (25, -1.0), (37, 0.4), (49, -0.4), (61, 0.0)):
        setpose(rot={
            'Hips': (D(10), 0, 0),
            'Spine': (D(16), 0, 0),
            'Chest': (D(12), 0, 0),
            'Head': (D(14), 0, 0),                      # 고개를 숙인다
            'UpperArm.L': (D(-52), 0, D(-34)),
            'UpperArm.R': (D(-52), 0, D(34)),
            'ForeArm.L': (D(-96), 0, D(-16)),            # 팔을 가슴에 감싼다
            'ForeArm.R': (D(-96), 0, D(16)),
            'Thigh.L': (D(-12), 0, D(-4)),
            'Thigh.R': (D(-12), 0, D(4)),
            'Shin.L': (D(24), 0, 0), 'Shin.R': (D(24), 0, 0),
        }, loc=(0, 0, sh * 0.006), frame=f)
    CLIPS.append('Shipwreck')

# park every clip on its own NLA track so the glTF exporter emits 4 animations
ad = rig.animation_data
active = ad.action
ad.action = None
tracks = []
for name in CLIPS:
    act = bpy.data.actions.get(name)
    if not act:
        continue
    tr = ad.nla_tracks.new()
    tr.name = name
    st = tr.strips.new(name, 1, act)
    st.action_frame_start = 1.0
    st.action_frame_end = 96.0
    st.frame_start = 1.0
    st.frame_end = 96.0
    tracks.append(tr)
print('[char] nla tracks: %s' % [t.name for t in tracks])

# ---------------------------------------------------------------- export
bpy.ops.object.select_all(action='SELECT')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
          export_animations=True, export_skins=True, export_materials='EXPORT')
try:
    bpy.ops.export_scene.gltf(**kw, export_animation_mode='ACTIONS')
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('[char] saved %s  stage=%d  faces=%d  clips=%s' % (OUT, STAGE, tris, CLIPS))