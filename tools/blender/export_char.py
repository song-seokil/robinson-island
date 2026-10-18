# -*- coding: utf-8 -*-
"""
Robinson Crusoe 3D character -> GLB (Three.js)
  · CHIBI (3등신) low-poly cartoon — Clash of Clans 비율
  · 큰 머리 / 짧고 굵은 팔다리 / 눈·눈썹 있는 카툰 얼굴
  · armature rig (hips/spine/chest/head/arms/legs)
  · animations: Idle / Walk / Attack / Hit  (+ Shipwreck at stage 0)
  · env: B3D_GLB (out)  B3D_STAGE (0 naked, 1 shirt, 2 full gear)

Usage:  blender -b --python tools/blender/export_char.py
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

# ---------------------------------------------------------------- proportions (chibi)
TOP = 1.28          # 전체 높이
HIPZ = 0.62
KNEE = 0.32
ANKLE = 0.11
CHEST_Z = 0.94
SHOULDER_Z = 0.98
SHOULDER_X = 0.235
HEAD_Z = 1.155
HEAD_R = 0.215
ELBOW_Z = 0.74
WRIST_Z = 0.565

# ---------------------------------------------------------------- materials
def mat(name, rgb, rough=0.8):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    b.inputs['Roughness'].default_value = rough
    m.diffuse_color = (rgb[0], rgb[1], rgb[2], 1.0)
    return m

SKIN = mat('skin', (0.96, 0.74, 0.58))
SKIN_D = mat('skin_d', (0.86, 0.62, 0.48))
HAIR = mat('hair', (0.24, 0.15, 0.10))
HAIR_S = mat('hair_s', (0.36, 0.28, 0.22))
EYE = mat('eye', (0.10, 0.09, 0.12))
SHIRT = mat('shirt', (0.95, 0.90, 0.78))
PANTS = mat('pants', (0.55, 0.44, 0.29))
PANTS_R = mat('pants_r', (0.46, 0.21, 0.14))
BOOT = mat('boot', (0.40, 0.31, 0.23))
COAT = mat('coat', (0.66, 0.45, 0.25))
FUR = mat('fur', (0.93, 0.88, 0.74))
LEATHER = mat('leather', (0.48, 0.30, 0.17))
POT = mat('pot', (0.36, 0.40, 0.48))
G_BACK = mat('g_back', (0.38, 0.23, 0.13))     # 背部装备（骨骼固定）
G_BELT = mat('g_belt', (0.34, 0.38, 0.46))     # 腰带工具（骨骼固定）
G_HEAD = mat('g_head', (0.90, 0.85, 0.70))     # 帽子（骨骼固定）

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
    p1, p2 = Vector(p1), Vector(p2)
    d = p2 - p1
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r1, radius2=r2,
                                    depth=d.length, location=(p1 + p2) * 0.5)
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

# ---------------------------------------------------------------- body (chibi)
LEG_MAT = PANTS_R if STAGE == 2 else PANTS
body_mat = SHIRT if STAGE >= 1 else SKIN

# 다리 — 짧고 굵게
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * 0.115
    cone('thigh' + tag, (sx, 0, HIPZ - 0.02), (sx, 0, KNEE), 0.150, 0.125, LEG_MAT, 10)
    cone('shin' + tag, (sx, 0, KNEE), (sx, 0, ANKLE), 0.125, 0.100, LEG_MAT, 10)
    if STAGE >= 1:
        box('boot' + tag, (sx, 0.055, 0.075), (0.165, 0.27, 0.15), BOOT, 0.04)
    else:
        box('foot' + tag, (sx, 0.070, 0.065), (0.150, 0.245, 0.13), SKIN, 0.045)
        cone('rag' + tag, (sx, 0, 0.40), (sx, 0, 0.16), 0.128, 0.115, PANTS, 8)
    if STAGE == 2:
        cone('wrap' + tag, (sx, 0, 0.38), (sx, 0, 0.15), 0.135, 0.115, FUR, 10)

# 골반 + 몸통 — 크고 넓게
box('pelvis', (0, 0, HIPZ), (0.44, 0.32, 0.30), LEG_MAT, 0.07)
box('torso', (0, 0, 0.82), (0.50, 0.36, 0.44), body_mat, 0.09)
box('chest', (0, 0.005, CHEST_Z), (0.54, 0.38, 0.20), body_mat, 0.08)
if STAGE >= 1:
    box('shirt_tail', (0, -0.01, 0.60), (0.52, 0.37, 0.22), SHIRT, 0.07)
    box('shirt_open', (0, -0.185, 0.88), (0.22, 0.06, 0.30), SHIRT, 0.03)

# 팔 — 짧고 굵게
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * SHOULDER_X
    ball('sh' + tag, (sx, 0, SHOULDER_Z), 0.115, (1, 1, 0.95), body_mat, 12)
    cone('uarm' + tag, (sx, 0, SHOULDER_Z), (sx * 1.10, 0.01, ELBOW_Z), 0.098, 0.082, body_mat, 10)
    cone('farm' + tag, (sx * 1.10, 0.01, ELBOW_Z), (sx * 1.16, 0.02, WRIST_Z), 0.082, 0.070, SKIN, 10)
    ball('hand' + tag, (sx * 1.16, 0.02, WRIST_Z - 0.025), 0.082, (1, 1.05, 1), SKIN, 10)

# 머리 — 크게 (3등신의 핵심)
cone('neck', (0, 0, 0.99), (0, 0, 1.03), 0.105, 0.110, SKIN_D, 10)
ball('head', (0, 0, HEAD_Z), HEAD_R, (1.0, 0.93, 1.02), SKIN, 24)
ball('hair', (0, 0.015, HEAD_Z + 0.055), HEAD_R * 1.02, (1.0, 0.99, 0.95), HAIR, 24)
ball('hair_back', (0, 0.085, HEAD_Z - 0.03), HEAD_R * 0.72, (1.20, 0.70, 1.25), HAIR, 14)
# 얼굴 — 눈·눈썹·코 (카툰 표정)
for s, tag in ((-1, 'L'), (1, 'R')):
    ball('eye' + tag, (s * 0.072, -0.176, HEAD_Z + 0.015), 0.030, (1.0, 0.55, 1.15), EYE, 10)
    ball('brow' + tag, (s * 0.076, -0.170, HEAD_Z + 0.082), 0.038, (1.5, 0.42, 0.30), HAIR, 8)
ball('nose', (0, -0.190, HEAD_Z - 0.018), 0.036, (0.85, 1.15, 0.8), SKIN, 8)

# 수염 — 생존자의 아크 (0 없음 → 1 회색 → 2 통짜)
if STAGE == 1:
    ball('stubble', (0, -0.095, HEAD_Z - 0.115), 0.125, (1.02, 0.90, 0.62), HAIR_S, 16)
elif STAGE == 2:
    ball('beard', (0, -0.088, HEAD_Z - 0.118), 0.150, (1.05, 0.94, 0.86), HAIR, 18)
    ball('beard_tip', (0, -0.115, HEAD_Z - 0.196), 0.100, (0.82, 0.82, 1.10), HAIR, 12)
    ball('moustache', (0, -0.190, HEAD_Z - 0.020), 0.090, (1.55, 0.55, 0.30), HAIR, 12)

# ---------------------------------------------------------------- gear
if STAGE >= 1:
    box('belt', (0, 0, 0.655), (0.46, 0.34, 0.10), LEATHER, 0.02)
    box('buckle', (0, -0.175, 0.655), (0.09, 0.03, 0.08), G_BELT, 0.012)
    box('pouch', (0.225, -0.02, 0.615), (0.12, 0.13, 0.15), G_BELT, 0.03)
    ball('flask', (0.250, 0.03, 0.545), 0.055, (1, 1, 1.30), G_BELT, 8)
    ball('flask2', (-0.250, 0.03, 0.565), 0.048, (1, 1, 1.22), G_BELT, 8)
    # 도끼 + 단검 (크루조는 창이 아니라 단검과 총을 썼다)
    cone('axe_handle', (0.268, -0.11, 0.64), (0.290, -0.14, 0.40), 0.018, 0.018, G_BELT, 6)
    box('axe_head', (0.290, -0.14, 0.38), (0.12, 0.04, 0.09), POT, 0.012)
    box('dagger_grip', (-0.268, -0.12, 0.68), (0.05, 0.05, 0.11), G_BELT, 0.015)
    cone('dagger_blade', (-0.268, -0.125, 0.625), (-0.271, -0.13, 0.45), 0.028, 0.002, POT, 6)
    box('dagger_guard', (-0.268, -0.12, 0.625), (0.08, 0.05, 0.024), POT, 0.008)

if STAGE == 2:
    box('coat', (0, 0.005, 0.80), (0.56, 0.42, 0.46), COAT, 0.10)
    box('coat_skirt', (0, 0.005, 0.55), (0.60, 0.44, 0.26), COAT, 0.09)
    ball('collar', (0, 0.02, 1.005), 0.245, (1.05, 0.95, 0.40), G_BACK, 16)
    box('coat_trim', (0, -0.215, 0.86), (0.22, 0.05, 0.44), G_BACK, 0.02)
    box('tool_saw', (0.255, -0.13, 0.64), (0.05, 0.03, 0.22), G_BELT, 0.01)
    ball('hat', (0, 0.01, 1.360), 0.200, (1.0, 1.0, 0.66), G_HEAD, 18)
    box('hatbrim', (0, 0.01, 1.270), (0.48, 0.48, 0.05), G_HEAD, 0.02)
    ball('hatband', (0, 0.01, 1.292), 0.205, (1.0, 1.0, 0.15), G_BACK, 14)
    ball('basket', (0, 0.265, 0.88), 0.185, (1.0, 0.60, 1.10), G_BACK, 12)
    ball('basket_in', (0, 0.365, 0.88), 0.135, (1.0, 0.5, 1.0), G_BACK, 10)
    ball('rope', (0, 0.400, 0.94), 0.100, (1.15, 0.35, 0.55), G_BACK, 10)
    box('strap_l', (-0.150, 0.14, 0.90), (0.07, 0.24, 0.10), G_BACK, 0.02)
    box('strap_r', (0.150, 0.14, 0.90), (0.07, 0.24, 0.10), G_BACK, 0.02)
    cone('gun_stock', (0.31, 0.27, 0.42), (0.15, 0.36, 0.86), 0.045, 0.036, G_BACK, 8)
    cone('gun_barrel', (0.14, 0.365, 0.84), (-0.10, 0.40, 1.30), 0.024, 0.020, G_BACK, 8)
    box('gun_lock', (0.15, 0.385, 0.84), (0.05, 0.03, 0.10), G_BACK, 0.01)

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

bone('Hips', (0, 0, HIPZ), (0, 0, 0.72))
bone('Spine', (0, 0, 0.72), (0, 0, 0.84))
bone('Chest', (0, 0, 0.84), (0, 0, CHEST_Z))
bone('Head', (0, 0, 0.99), (0, 0, HEAD_Z + 0.12))
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * SHOULDER_X
    bone('Shoulder.' + tag, (sx * 0.40, 0, 0.96), (sx, 0, SHOULDER_Z), 'Chest')
    bone('UpperArm.' + tag, (sx, 0, SHOULDER_Z), (sx * 1.10, 0.01, ELBOW_Z), 'Shoulder.' + tag, True)
    bone('ForeArm.' + tag, (sx * 1.10, 0.01, ELBOW_Z), (sx * 1.16, 0.02, WRIST_Z), 'UpperArm.' + tag, True)
    bone('Hand.' + tag, (sx * 1.16, 0.02, WRIST_Z), (sx * 1.19, 0.02, WRIST_Z - 0.13), 'ForeArm.' + tag, True)
for s, tag in ((-1, 'L'), (1, 'R')):
    sx = s * 0.115
    bone('Thigh.' + tag, (sx, 0, HIPZ), (sx, 0, KNEE), 'Hips')
    bone('Shin.' + tag, (sx, 0, KNEE), (sx, 0, ANKLE), 'Thigh.' + tag, True)
    bone('Foot.' + tag, (sx, 0, ANKLE), (sx, 0.16, 0.05), 'Shin.' + tag, True)

bpy.ops.object.mode_set(mode='OBJECT')

bpy.ops.object.select_all(action='DESELECT')
body.select_set(True)
rig.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.object.parent_set(type='ARMATURE_AUTO')
body.parent = rig

# ---- 刚性装备: 整件锁到单根骨骼，动画时绝不散架 ----
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

# ---------------------------------------------------------------- anim
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
    rig.animation_data_create()
    act = bpy.data.actions.new(name)
    rig.animation_data.action = None
    try:
        slot = act.slots.new(id_type='OBJECT', name=rig.name)
        rig.animation_data.action = act
        rig.animation_data.action_slot = slot
    except Exception as e:
        print('[char] slot api failed (%s)' % e)
        rig.animation_data.action = act
    return act

CLIPS = []
def D(deg):
    return math.radians(deg)

# --- Idle
new_action('Idle')
for f, amp, sh in ((1, 0.0, 0.0), (20, 1.0, 1.0), (40, 0.0, 0.0), (60, 1.0, -1.0), (80, 0.0, 0.0)):
    setpose(rot={
        'Spine': (D(3 * amp), 0, 0),
        'Chest': (D(4 * amp), 0, 0),
        'Head': (D(-3 * amp), D(5 * sh), 0),
        'Shoulder.L': (0, 0, D(-6 * amp)),
        'Shoulder.R': (0, 0, D(6 * amp)),
        'UpperArm.L': (D(-8 * amp), 0, D(-8)),
        'UpperArm.R': (D(-8 * amp), 0, D(8)),
        'ForeArm.L': (D(-18), 0, 0),
        'ForeArm.R': (D(-18), 0, 0),
        'Hips': (0, 0, D(2 * sh)),
    }, loc=(0, 0, 0.0), frame=f)
CLIPS.append('Idle')

# --- Walk : 짧은 다리에 걸맞게 각도 조정
new_action('Walk')
swing = 40.0
for f, s, up in ((1, 1, 0), (9, 0, 1), (17, -1, 0), (25, 0, -1), (33, 1, 0)):
    setpose(rot={
        'Hips': (D(3), D(3 * s), 0),
        'Spine': (D(4), 0, D(-3 * s)),
        'Chest': (D(3), D(-4 * s), 0),
        'Head': (D(-4), 0, 0),
        'Thigh.L': (D(-s * swing), 0, 0),
        'Shin.L': (D(max(0, s) * 50 + 8), 0, 0),
        'Foot.L': (D(-max(0, s) * 18 + (up * 12)), 0, 0),
        'Thigh.R': (D(s * swing), 0, 0),
        'Shin.R': (D(max(0, -s) * 50 + 8), 0, 0),
        'Foot.R': (D(-max(0, -s) * 18 - (up * 12)), 0, 0),
        'UpperArm.L': (D(s * 30), 0, D(-7)),
        'UpperArm.R': (D(-s * 30), 0, D(7)),
        'ForeArm.L': (D(-22 - max(0, s) * 18), 0, 0),
        'ForeArm.R': (D(-22 - max(0, -s) * 18), 0, 0),
    }, loc=(0, 0, 0), frame=f)
CLIPS.append('Walk')

# --- Attack
new_action('Attack')
for f, ua, chest, hz in ((1, 0, 0, 0), (10, -60, 0, 12), (18, -78, 0, -20),
                         (24, 85, 0, 6), (30, 34, 0, 0), (36, 0, 0, 0)):
    setpose(rot={
        'Chest': (D(-7 - chest * 0.2), 0, D(-hz * 0.6)),
        'Spine': (D(5), 0, D(-hz * 0.4)),
        'Head': (D(3), 0, D(hz * 0.4)),
        'Hips': (0, 0, D(hz * 0.5)),
        'UpperArm.R': (D(ua), 0, D(-10)),
        'ForeArm.R': (D(-12 if ua > 0 else -60), 0, 0),
        'UpperArm.L': (D(-22), 0, D(-16)),
        'ForeArm.L': (D(-45), 0, 0),
        'Thigh.L': (D(-12), 0, 0), 'Thigh.R': (D(12), 0, 0),
    }, loc=(0, 0, 0), frame=f)
CLIPS.append('Attack')

# --- Hit
new_action('Hit')
for f, bk, hd in ((1, 0, 0), (6, -18, -20), (14, 12, 12), (24, 0, 0)):
    setpose(rot={
        'Hips': (D(bk * 0.4), 0, 0),
        'Spine': (D(bk * 0.6), 0, 0),
        'Chest': (D(bk * 0.5), 0, 0),
        'Head': (D(hd * 0.8), 0, D(hd * 0.4)),
        'UpperArm.L': (D(-34 - abs(hd)), 0, D(-26)),
        'UpperArm.R': (D(-34 - abs(hd)), 0, D(26)),
        'ForeArm.L': (D(-60), 0, 0), 'ForeArm.R': (D(-60), 0, 0),
        'Thigh.L': (D(10), 0, 0), 'Thigh.R': (D(-8), 0, 0),
    }, loc=(0, -abs(bk) * 0.010, 0), frame=f)
CLIPS.append('Hit')

# --- Shipwreck (stage 0)
if STAGE == 0:
    new_action('Shipwreck')
    for f, sh in ((1, 0.0), (13, 1.0), (25, -1.0), (37, 0.4), (49, -0.4), (61, 0.0)):
        setpose(rot={
            'Hips': (D(12), 0, 0),
            'Spine': (D(18), 0, 0),
            'Chest': (D(14), 0, 0),
            'Head': (D(16), 0, 0),
            'UpperArm.L': (D(-58), 0, D(-38)),
            'UpperArm.R': (D(-58), 0, D(38)),
            'ForeArm.L': (D(-105), 0, D(-18)),
            'ForeArm.R': (D(-105), 0, D(18)),
            'Thigh.L': (D(-14), 0, D(-5)),
            'Thigh.R': (D(-14), 0, D(5)),
            'Shin.L': (D(28), 0, 0), 'Shin.R': (D(28), 0, 0),
        }, loc=(0, 0, sh * 0.005), frame=f)
    CLIPS.append('Shipwreck')

# ---------------------------------------------------------------- NLA + export
ad = rig.animation_data
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

bpy.ops.object.select_all(action='SELECT')
os.makedirs(os.path.dirname(OUT), exist_ok=True)
kw = dict(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
          export_animations=True, export_skins=True, export_materials='EXPORT')
try:
    bpy.ops.export_scene.gltf(**kw, export_animation_mode='ACTIONS')
except TypeError:
    bpy.ops.export_scene.gltf(**kw)
tris = sum(len(o.data.polygons) for o in bpy.data.objects if o.type == 'MESH')
print('[char] saved %s  stage=%d  faces=%d  h=%.2f  clips=%s' % (OUT, STAGE, tris, TOP, CLIPS))