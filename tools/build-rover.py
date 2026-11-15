"""
Builds the lunar rover model in Blender, headless, from the CC BY 4.0
Sketchfab model "Lunar Rover" by Versal (about 900,000 triangles, one
grey material, no textures). Step 1 of tools/build-rover.mjs, which
explains the rest.

    flatpak run org.blender.Blender --background --factory-startup \
        --python "$PWD/tools/build-rover.py" -- <lunar_rover.glb> <out.glb> [preview dir]

Run it headless, not in an open Blender: the source is heavy (an open
Blender ran out of memory on it), and the work is done in a fresh empty
file. Flatpak Blender needs full paths and can't read /tmp, so keep the
files in your home folder.

What it does:
  1. Deletes the screws (the "torni" parts: about half the triangles,
     too small to see in the game).
  2. Thins out every other part to about a sixth of its triangles,
     one part at a time.
  3. Colours the parts (the source is all one grey): aluminium frame,
     treaded tyres with dark rims, blue seat webbing, gold-foiled
     batteries, a white antenna dish, dark camera and console.
  4. Scales it so the wheels are WHEEL_RADIUS, stands it on the floor,
     centres it between the wheels and keeps it facing -z (the game's
     forward), like the old rover.
  5. Groups it for the game: one "Body", and per wheel a steering node
     ("wheel_fl", "wheel_fr", "wheel_rl", "wheel_rr", at the wheel's
     centre) holding the spinning tyre and rim ("spin_*") and the
     fender, which turns with the wheel but doesn't spin ("fender_*").
  6. Exports it, with the wheel layout and the driver's seat in a .json
     beside it, and optionally renders previews.
"""
import json
import math
import os
import sys

import bpy
from mathutils import Matrix, Vector

# The game's rover wheel radius (src/maps/outpost.ts), metres.
WHEEL_RADIUS = 0.42
# Fraction of each big part's triangles to keep; small parts keep more, tiny ones all.
KEEP_BIG = 0.16
KEEP_MID = 0.45
BIG = 2500
MID = 400

# The wheel groups in the source (neumatico is Spanish for tyre), and their parts that spin.
WHEEL_GROUPS = ('neuma', 'neuma1', 'neuma2', 'neumatico_')
FENDER = 'guard'

# Inside a wheel group the parts are named differently on each wheel ("llanta_mod", "llant1"...),
# so they are told apart by how their names start: tyre, tread, fender; the rest is rim and hub.
TYRE = 'llant'
WHEEL_COLOURS = [((TYRE,), '#77746c'), (('placa',), '#9a968c'), ((FENDER,), '#c4cad1')]
RIM_COLOUR = '#3b3f45'

# The body's colours (sRGB) by the first matching part or group name, nearest part first.
COLOURS = [
    (('hacie', 'haciento'), '#3d5a78'),  # seat webbing
    (('correas', 'cinta'), '#2b2f36'),   # belts and straps
    (('baterias', 'bolsa_prot', 'tela_tapa'), '#c9a24a'),  # foil-wrapped batteries and covers
    (('antena_rov', 'antena_pet'), '#e4e3dd'),  # antennas
    (('camara_tv', 'control_de'), '#2f333a'),   # TV camera, console and hand controller
    (('Nulo_2',), '#8c929a'),          # suspension arms
    (('compartimi', 'Cubo'), '#a8adb4'),  # boxes and the rear carrier
]
DEFAULT_COLOUR = '#cdd1d6'             # aluminium


def arguments():
    if '--' in sys.argv:
        return sys.argv[sys.argv.index('--') + 1:]
    return list(globals().get('ROVER_ARGS', []))


def srgb(hex_colour):
    def lin(c):
        return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    n = int(hex_colour[1:], 16)
    return (lin((n >> 16 & 255) / 255), lin((n >> 8 & 255) / 255), lin((n & 255) / 255), 1.0)


def ancestors(obj):
    out = []
    while obj:
        out.append(obj)
        obj = obj.parent
    return out


def colour_for(obj):
    if wheel_group(obj):
        for owner in ancestors(obj):
            for keys, colour in WHEEL_COLOURS:
                if any(owner.name.startswith(key) for key in keys):
                    return colour
        return RIM_COLOUR
    for owner in ancestors(obj):
        for keys, colour in COLOURS:
            if any(owner.name.startswith(key) for key in keys):
                return colour
    return DEFAULT_COLOUR


def wheel_group(obj):
    return next((a.name.split('.')[0] for a in ancestors(obj) if a.name.split('.')[0] in WHEEL_GROUPS), None)


def tris(obj):
    return sum(len(p.vertices) - 2 for p in obj.data.polygons)


def main():
    args = arguments()
    if len(args) < 2:
        raise SystemExit('Usage: blender --background --factory-startup --python tools/build-rover.py -- <lunar_rover.glb> <out.glb> [preview dir]')
    source, out_path = args[0], args[1]
    preview = args[2] if len(args) > 2 else None

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=source)
    scene = bpy.context.scene
    meshes = [o for o in scene.objects if o.type == 'MESH']
    before = sum(tris(o) for o in meshes)

    # 1. Screws first: half the triangles.
    screws = [o for o in meshes if any(a.name.startswith('torni') for a in ancestors(o))]
    screw_tris = sum(tris(o) for o in screws)
    for o in screws:
        bpy.data.meshes.remove(o.data)
    meshes = [o for o in scene.objects if o.type == 'MESH']
    print(f'source: {before} triangles; screws removed: {screw_tris}')

    # Remember each part's colour, wheel and role before the hierarchy goes. The meshes themselves are
    # called "Object_123"; what they are is in the names of the nodes above them.
    info = {}
    for o in meshes:
        path = [a.name for a in ancestors(o)]
        info[o.name] = {
            'colour': colour_for(o),
            'wheel': wheel_group(o),
            'fender': any(name.startswith(FENDER) for name in path),
            'tyre': any(name.startswith(TYRE) for name in path),
            'tread': wheel_group(o) is not None and any(name.startswith('placa') for name in path),
            'seat': any(name.startswith('hacie') for name in path),
        }
    names = [o.name for o in meshes]

    # Flatten: every part keeps where it is in the world, with no parents.
    for o in meshes:
        world = o.matrix_world.copy()
        o.parent = None
        o.matrix_world = world
    for o in [o for o in scene.objects if o.type != 'MESH']:
        bpy.data.objects.remove(o, do_unlink=True)
    for o in meshes:
        if o.data.users > 1:
            o.data = o.data.copy()
        o.data.transform(o.matrix_world)
        o.matrix_world = Matrix()

    # 2. Thin out, one part at a time.
    for o in meshes:
        n = tris(o)
        keep = KEEP_BIG if n > BIG else KEEP_MID if n > MID else 1
        # The tread's chevrons fall apart when thinned, and they are only 1,600 triangles a wheel.
        if info[o.name]['tread']:
            keep = 1
        if keep < 1:
            modifier = o.modifiers.new('Decimate', 'DECIMATE')
            modifier.ratio = keep
            modifier.use_collapse_triangulate = True
            with bpy.context.temp_override(object=o, active_object=o):
                bpy.ops.object.modifier_apply(modifier=modifier.name)
    after = sum(tris(o) for o in meshes)
    print(f'thinned: {before - screw_tris} -> {after} triangles')

    # 3. Colours, as vertex colours (one material for everything).
    for o in meshes:
        colour = srgb(info[o.name]['colour'])
        attribute = o.data.color_attributes.new('Col', 'BYTE_COLOR', 'CORNER')
        for loop in attribute.data:
            loop.color = colour
        o.data.materials.clear()

    # 4. Scale and place: wheels WHEEL_RADIUS, tyres on the floor, centred between the wheels.
    tyres = {}
    for o in meshes:
        if info[o.name]['wheel'] and info[o.name]['tyre']:
            tyres.setdefault(info[o.name]['wheel'], []).append(o)
    centres = {}
    radius = 0
    for group, parts in tyres.items():
        pts = [v.co for o in parts for v in o.data.vertices]
        lo = Vector((min(p.x for p in pts), min(p.y for p in pts), min(p.z for p in pts)))
        hi = Vector((max(p.x for p in pts), max(p.y for p in pts), max(p.z for p in pts)))
        centres[group] = (lo + hi) / 2
        radius = max(radius, (hi.z - lo.z) / 2)
    if len(centres) != 4:
        raise SystemExit(f'Expected four tyres, found {sorted(centres)}')
    middle = sum(centres.values(), Vector()) / 4
    floor = min(c.z for c in centres.values()) - radius
    scale = WHEEL_RADIUS / radius
    place = Matrix.Scale(scale, 4) @ Matrix.Translation(Vector((-middle.x, -middle.y, -floor)))
    for o in meshes:
        o.data.transform(place)
    for group in centres:
        centres[group] = place @ centres[group]
    print(f'scaled x{scale:.4f}: wheel radius {WHEEL_RADIUS} m')

    # 5. Group: one body; per wheel a steering node with the spinning parts and the fender.
    material = bpy.data.materials.new('Rover')
    material.use_nodes = True
    bsdf = next(n for n in material.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    bsdf.inputs['Roughness'].default_value = 0.6
    bsdf.inputs['Metallic'].default_value = 0.2
    attribute_node = material.node_tree.nodes.new('ShaderNodeVertexColor')
    attribute_node.layer_name = 'Col'
    material.node_tree.links.new(attribute_node.outputs['Color'], bsdf.inputs['Base Color'])

    def join(parts, name):
        bpy.ops.object.select_all(action='DESELECT')
        for o in parts:
            o.select_set(True)
        bpy.context.view_layer.objects.active = parts[0]
        if len(parts) > 1:
            bpy.ops.object.join()
        obj = bpy.context.view_layer.objects.active
        obj.name = name
        obj.data.name = name
        obj.data.materials.clear()
        obj.data.materials.append(material)
        with bpy.context.temp_override(object=obj, active_object=obj, selected_objects=[obj]):
            bpy.ops.mesh.customdata_custom_splitnormals_clear()
        bpy.ops.object.shade_smooth_by_angle(angle=math.radians(35))
        return obj

    # The driver sits on the left seat (-x): the top of its pan. Measured before joining frees the parts.
    seat_points = [v.co.copy() for o in meshes if info[o.name]['seat'] for v in o.data.vertices]

    def parts(keep):
        # Joining frees the merged objects, so look them up by their first names each time.
        return [bpy.data.objects[name] for name in names if name in bpy.data.objects and keep(info[name])]

    wheels = {}
    for group, centre in centres.items():
        side = 'l' if centre.x < 0 else 'r'
        end = 'f' if centre.y > 0 else 'r'   # the source's front (+y) becomes the game's forward (-z)
        key = end + side
        pivot = bpy.data.objects.new(f'wheel_{key}', None)
        scene.collection.objects.link(pivot)
        pivot.location = centre
        spin = join(parts(lambda i, g=group: i['wheel'] == g and not i['fender']), f'spin_{key}')
        fender = join(parts(lambda i, g=group: i['wheel'] == g and i['fender']), f'fender_{key}')
        for obj in (spin, fender):
            obj.data.transform(Matrix.Translation(-centre))
            obj.parent = pivot
            obj.location = (0, 0, 0)
        wheels[key] = (pivot, spin, fender)
    body = join(parts(lambda i: not i['wheel']), 'Body')

    left = [p for p in seat_points if p.x < 0] or seat_points
    seat_top = Vector((sum(p.x for p in left) / len(left), sum(p.y for p in left) / len(left), max(p.z for p in left)))

    def gltf(v):
        return [round(v.x, 4), round(v.z, 4), round(-v.y, 4)]

    layout = {
        'radius': WHEEL_RADIUS,
        'wheels': {key: gltf(pivot.location) for key, (pivot, _, _) in wheels.items()},
        'base': round(sum(wheels[k][0].location.y for k in ('fl', 'fr')) / 2 - sum(wheels[k][0].location.y for k in ('rl', 'rr')) / 2, 4),
        'track': round(sum(wheels[k][0].location.x for k in ('fr', 'rr')) / 2 - sum(wheels[k][0].location.x for k in ('fl', 'rl')) / 2, 4),
        'seat': gltf(seat_top),
        'front': round(-max(v.co.y for v in body.data.vertices), 4),
    }
    total = sum(tris(o) for o in scene.objects if o.type == 'MESH')
    print(f'layout: {json.dumps(layout)}')
    print(f'built: {total} triangles in {sum(1 for o in scene.objects if o.type == "MESH")} meshes')

    if preview:
        render_previews(scene, preview)

    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=out_path, export_format='GLB', use_selection=True, use_active_scene=True,
                              export_animations=False, export_vertex_color='MATERIAL', export_yup=True)
    with open(out_path.rsplit('.', 1)[0] + '.json', 'w') as file:
        json.dump(layout, file, indent=1)
    print(f'exported {out_path}')


def render_previews(scene, folder):
    os.makedirs(folder, exist_ok=True)
    camera = bpy.data.objects.new('Camera', bpy.data.cameras.new('Camera'))
    scene.collection.objects.link(camera)
    camera.data.type = 'ORTHO'
    scene.camera = camera
    scene.render.engine = 'BLENDER_WORKBENCH'
    shading = scene.display.shading
    shading.light = 'STUDIO'
    shading.color_type = 'VERTEX'
    shading.show_cavity = True
    scene.world = bpy.data.worlds.new('World')
    scene.world.color = (0.12, 0.13, 0.16)
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    for name, direction, size in (('three', (1, 0.9, 0.6), 4.8), ('side', (-1, 0, 0.05), 4.6), ('front', (0, 1, 0.1), 3.6), ('wheel', (-1, 0.4, 0.3), 1.6)):
        d = Vector(direction).normalized()
        target = Vector((0, 0, 0.6)) if name != 'wheel' else bpy.data.objects['wheel_fl'].location
        camera.data.ortho_scale = size
        camera.location = target + d * 20
        camera.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        scene.render.filepath = os.path.join(folder, f'{name}.png')
        bpy.ops.render.render(write_still=True)
    bpy.data.objects.remove(camera, do_unlink=True)


main()
