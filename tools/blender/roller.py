"""
Models the platen assembly and exports it as a GLB for the web scene.

Run it through the addon's socket:

    python3 .context/blender.py execute_code --file tools/blender/roller.py

It only ever touches its own collection. Anything else already in the file is
left exactly where it was.

Units match `src/gl/sheet-metrics.ts`: one unit is the width of a US Letter
sheet, so the export drops into the three.js scene at scale 1 with nothing to
keep in sync.

Axes are converted on the way in. The web scene is y-up with +z towards the
viewer; Blender is z-up with -y forwards, and the glTF exporter maps Blender
(x, y, z) to (x, z, -y). `place()` does that conversion, so every number below
can be read straight off the web-side constants.
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

OUTPUT_PATH = (
    "/Users/alejopequeno/conductor/workspaces/typewriter-lettra/hyderabad"
    "/public/models/roller.glb"
)
COLLECTION = "Typewriter"

SHEET_WIDTH = 1.0
INCH = SHEET_WIDTH / 8.5

# The radius the paper wraps around, and the rubber just inside it.
ROLLER_RADIUS = 0.85 * INCH
PLATEN_RADIUS = ROLLER_RADIUS - 0.03 * INCH

PLATEN_LENGTH = SHEET_WIDTH * 1.18
FLANGE_RADIUS = ROLLER_RADIUS * 1.05
FLANGE_WIDTH = 0.16 * INCH
KNOB_RADIUS = ROLLER_RADIUS * 1.32
KNOB_WIDTH = 0.46 * INCH
KNOB_FLUTES = 40
KNOB_FLUTE_DEPTH = 0.04

BAIL_RADIUS = 0.05 * INCH
BAIL_DROP = 4.15 * INCH
BAIL_STANDOFF = 0.26 * INCH
BAIL_LENGTH = SHEET_WIDTH * 1.04
BAIL_WHEEL_RADIUS = BAIL_RADIUS * 2.1
BAIL_WHEEL_WIDTH = 0.5 * INCH
BAIL_WHEEL_OFFSET = SHEET_WIDTH * 0.26
BAIL_ARM_LENGTH = 0.95 * INCH

AXIS_Y = 0.0
AXIS_Z = -ROLLER_RADIUS
BAIL_Y = -BAIL_DROP


def place(x, y, z):
    """A web-scene point (y-up, +z at the viewer) in Blender's axes."""
    return Vector((x, -z, y))


def measure(width, height, depth):
    """A web-scene size in Blender's axes. Same swap as `place`, without the
    sign: a length has no direction to flip."""
    return (width, depth, height)


def fresh_collection():
    """Our own collection, emptied of our own objects and nothing else."""
    collection = bpy.data.collections.get(COLLECTION)
    if collection is None:
        collection = bpy.data.collections.new(COLLECTION)
        bpy.context.scene.collection.children.link(collection)

    for obj in list(collection.objects):
        mesh = obj.data
        bpy.data.objects.remove(obj, do_unlink=True)
        if isinstance(mesh, bpy.types.Mesh) and mesh.users == 0:
            bpy.data.meshes.remove(mesh)

    return collection


def material(name, color, roughness, metallic):
    mat = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes["Principled BSDF"]
    principled.inputs["Base Color"].default_value = (*color, 1.0)
    principled.inputs["Roughness"].default_value = roughness
    principled.inputs["Metallic"].default_value = metallic
    return mat


def smooth_sides(bm):
    """Smooth around the barrel, flat across the ends — a cylinder shaded any
    other way reads as a faceted prism or a dented disc."""
    for face in bm.faces:
        face.smooth = abs(face.normal.x) < 0.5


def bevel_rims(bm, offset):
    rims = [
        edge
        for edge in bm.edges
        if len(edge.link_faces) == 2 and edge.calc_face_angle(0) > 0.8
    ]
    if rims:
        bmesh.ops.bevel(
            bm, geom=rims, offset=offset, segments=3, affect="EDGES", profile=0.6
        )


def lying_cylinder(bm, radius, length, segments, centre, bevel=0.0):
    """A cylinder on the x axis — the way every part of a platen runs."""
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=length,
        matrix=Matrix.Translation(centre) @ Matrix.Rotation(math.pi / 2, 4, "Y"),
    )
    if bevel:
        bevel_rims(bm, bevel)
    smooth_sides(bm)


def fluted_cylinder(bm, radius, length, centre, flutes, depth):
    """The knurled knob you grip to roll the paper: the barrel's radius
    ripples, so it catches the light in bands instead of as one highlight."""
    lying_cylinder(bm, radius, length, flutes * 4, centre)

    for vert in bm.verts:
        offset = vert.co - centre
        across = Vector((offset.y, offset.z))
        if across.length < radius * 0.9:
            continue

        angle = math.atan2(offset.z, offset.y)
        ripple = 1 - depth * (0.5 - 0.5 * math.cos(angle * flutes))
        vert.co.y = centre.y + offset.y * ripple
        vert.co.z = centre.z + offset.z * ripple


def box(bm, size, centre):
    """`size` is already in Blender's axes — pass it through `measure`."""
    bmesh.ops.create_cube(
        bm,
        size=1.0,
        matrix=Matrix.Translation(centre) @ Matrix.Diagonal((*size, 1.0)),
    )


def add_mesh(collection, name, build_geometry, mat):
    mesh = bpy.data.meshes.new(name)
    bm = bmesh.new()
    build_geometry(bm)
    bm.normal_update()
    bm.to_mesh(mesh)
    bm.free()

    obj = bpy.data.objects.new(name, mesh)
    obj.data.materials.append(mat)
    collection.objects.link(obj)
    return obj


def build():
    collection = fresh_collection()

    rubber = material("Platen Rubber", (0.055, 0.045, 0.036), 0.5, 0.05)
    steel = material("Platen Steel", (0.15, 0.135, 0.112), 0.44, 0.82)
    dark_steel = material("Bail Steel", (0.075, 0.065, 0.055), 0.34, 0.9)

    add_mesh(
        collection,
        "Platen",
        lambda bm: lying_cylinder(
            bm, PLATEN_RADIUS, PLATEN_LENGTH, 96, place(0, AXIS_Y, AXIS_Z),
            bevel=0.09 * INCH,
        ),
        rubber,
    )

    for side, tag in ((-1, "L"), (1, "R")):
        flange_x = side * (PLATEN_LENGTH + FLANGE_WIDTH) / 2
        knob_x = side * (PLATEN_LENGTH + FLANGE_WIDTH * 2 + KNOB_WIDTH) / 2

        add_mesh(
            collection,
            f"Platen Flange {tag}",
            lambda bm, x=flange_x: lying_cylinder(
                bm, FLANGE_RADIUS, FLANGE_WIDTH, 64, place(x, AXIS_Y, AXIS_Z),
                bevel=0.02 * INCH,
            ),
            steel,
        )

        add_mesh(
            collection,
            f"Platen Knob {tag}",
            lambda bm, x=knob_x: fluted_cylinder(
                bm, KNOB_RADIUS, KNOB_WIDTH, place(x, AXIS_Y, AXIS_Z),
                KNOB_FLUTES, KNOB_FLUTE_DEPTH,
            ),
            steel,
        )

    add_mesh(
        collection,
        "Bail Rod",
        lambda bm: lying_cylinder(
            bm, BAIL_RADIUS, BAIL_LENGTH, 32, place(0, BAIL_Y, BAIL_STANDOFF)
        ),
        dark_steel,
    )

    for side, tag in ((-1, "L"), (1, "R")):
        add_mesh(
            collection,
            f"Bail Wheel {tag}",
            lambda bm, s=side: lying_cylinder(
                bm, BAIL_WHEEL_RADIUS, BAIL_WHEEL_WIDTH, 32,
                place(
                    s * BAIL_WHEEL_OFFSET,
                    BAIL_Y,
                    BAIL_STANDOFF - BAIL_RADIUS * 1.6,
                ),
                bevel=0.012 * INCH,
            ),
            rubber,
        )

        # The arm that carries the rod back towards the machine.
        add_mesh(
            collection,
            f"Bail Arm {tag}",
            lambda bm, s=side: box(
                bm,
                measure(BAIL_RADIUS * 1.5, BAIL_RADIUS * 1.5, BAIL_ARM_LENGTH),
                place(
                    s * BAIL_LENGTH / 2,
                    BAIL_Y,
                    BAIL_STANDOFF - BAIL_ARM_LENGTH / 2,
                ),
            ),
            dark_steel,
        )

    return collection


def export(collection, path):
    import os

    os.makedirs(os.path.dirname(path), exist_ok=True)

    bpy.ops.object.select_all(action="DESELECT")
    for obj in collection.objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = collection.objects[0]

    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
    )
    bpy.ops.object.select_all(action="DESELECT")
    return path


built = build()
print(f"built {len(built.objects)} objects: {[o.name for o in built.objects]}")
print(f"exported -> {export(built, OUTPUT_PATH)}")
