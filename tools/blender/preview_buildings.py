# -*- coding: utf-8 -*-
# Render a contact sheet of building models from props3d.glb (workbench, fast).
import bpy, os, math

GLB = os.environ.get('B3D_GLB_IN', r'D:\02. 송서방\robinson\public\glb\props3d.glb')
OUT = os.environ.get('B3D_PREVIEW', r'C:\Users\oocss\AppData\Local\Temp\opencode\bpreview.png')
KINDS = os.environ.get('B3D_PREVIEW_SET',
                       'b_bed,b_storage,b_campfire,b_kitchen,b_wall,b_trap,b_hut,b_farm,b_furnace,b_tower').split(',')

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=GLB)

root = None
for ob in bpy.context.scene.objects:
    if ob.parent is None and ob.name != 'camera':
        root = ob
        break

# hide the original root, clone one of each building kind into a grid
src = {}
for ob in bpy.context.scene.objects:
    key = ob.name.split('.')[0].lower()
    if key in KINDS:
        src.setdefault(key, ob)
print('[prev] found', sorted(src.keys()))

groups = {}
for ob in list(src.keys()):
    pass


def collect_top(name):
    """return the top-level ancestor of obj named `name`"""
    ob = src.get(name)
    while ob is not None and ob.parent is not None:
        ob = ob.parent
    return ob


tops = []
for i, k in enumerate(KINDS):
    t = collect_top(k)
    if t is None:
        print('[prev] MISSING', k)
        continue
    dup = t.copy()
    dup.data = t.data          # geometry is shared, transform is ours
    dup.name = 'cell_' + k
    bpy.context.scene.collection.objects.link(dup)
    col, row = i % 5, i // 5
    dup.location = ((col - 2) * 3.6, -(row - 0.5) * 3.6, 0.0)
    tops.append(dup)
    print('[prev] cell', k, 'ok')

# hide originals
for ob in list(src.values()):
    t = collect_top(ob.name.split('.')[0].lower())
for ob in bpy.context.scene.objects:
    if ob.name.startswith('cell_'):
        continue
    ob.hide_render = True
    ob.hide_viewport = True

# ground
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, -0.001))
g = bpy.context.object
g.name = 'zz_ground'
gm = bpy.data.materials.new('g')
gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.76, 0.45, 1)
g.data.materials.append(gm)

d = bpy.context.scene
d.render.engine = 'BLENDER_WORKBENCH'
d.render.resolution_x = 1500
d.render.resolution_y = 700
sh = d.display.shading
sh.light = 'STUDIO'
sh.color_type = 'MATERIAL'
sh.show_cavity = True
sh.show_object_outline = True

bpy.ops.object.select_all(action='DESELECT')
for ob in tops:
    ob.select_set(True)
bpy.context.view_layer.objects.active = tops[0] if tops else None
bpy.ops.view3d.view_axis(type='TOP')
bpy.ops.view3d.camera_to_view_selected()
cam = d.camera
cam.data.lens = 50
cam.location = (0, 0, 18)
cam.rotation_euler = (0, 0, 0)

d.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('[prev] saved', OUT)