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
BAIL_DROP = 5.4 * INCH
BAIL_STANDOFF = 0.26 * INCH
BAIL_LENGTH = SHEET_WIDTH * 1.04
BAIL_WHEEL_RADIUS = BAIL_RADIUS * 2.1
BAIL_WHEEL_WIDTH = 0.5 * INCH
BAIL_WHEEL_OFFSET = SHEET_WIDTH * 0.26
BAIL_ARM_LENGTH = 0.95 * INCH

# Typing geometry, mirrored from sheet-metrics.ts.
CHAR_WIDTH = INCH / 10
LEFT_MARGIN = 1.15 * INCH
COLUMNS = 62
PRINT_LINE_DROP = 3.4 * INCH

# The scale rides below the line being typed. The gap has to clear the
# tallest tick as well as the descenders, or the two tangle.
SCALE_DROP = PRINT_LINE_DROP + 0.46 * INCH
SCALE_STANDOFF = 0.1 * INCH
SCALE_THICKNESS = 0.028 * INCH
SCALE_HEIGHT = 0.17 * INCH
TICK_WIDTH = 0.012 * INCH
TICK_SHORT = 0.055 * INCH
TICK_MEDIUM = 0.09 * INCH
TICK_LONG = 0.13 * INCH

# The fork that marks the exact printing point. It straddles the cell the next
# character lands in, on the print line itself — the letter is struck inside
# it — and a stem runs down to the slider it rides on the scale.
GUIDE_NOTCH = 1.2 * CHAR_WIDTH
GUIDE_CHEEK = 0.42 * CHAR_WIDTH
GUIDE_WIDTH = GUIDE_NOTCH + GUIDE_CHEEK * 2
GUIDE_HEIGHT = 0.2 * INCH
GUIDE_THICKNESS = 0.025 * INCH
GUIDE_STANDOFF = SCALE_STANDOFF + 0.045 * INCH
GUIDE_BELOW_BASELINE = 0.06 * INCH
GUIDE_STEM_WIDTH = 0.5 * CHAR_WIDTH
GUIDE_SLIDER_WIDTH = 1.5 * CHAR_WIDTH
GUIDE_SLIDER_HEIGHT = SCALE_HEIGHT * 1.35

# The line-space lever on the left end of the carriage, and the gold
# pinstripes along the frames: what every machine of the period wore.
LEVER_LENGTH = 1.1 * INCH
LEVER_WIDTH = 0.2 * INCH
LEVER_THICKNESS = 0.035 * INCH
LEVER_TIP_RADIUS = 0.09 * INCH
PINSTRIPE_WIDTH = 0.018 * INCH
PINSTRIPE_INSET = 0.09 * INCH

# What a scale carries besides ticks: a number every ten columns, and the two
# margin stops you slide along it.
NUMBER_HEIGHT = 0.075 * INCH
NUMBER_RELIEF = 0.006 * INCH
STOP_WIDTH = 1.6 * CHAR_WIDTH
STOP_HEIGHT = SCALE_HEIGHT * 1.7
STOP_THICKNESS = SCALE_THICKNESS * 2.2

# Hardware is held together by something. Screw heads on every mount and
# flange, a hub cap on each knob, and the line-space ratchet behind the right
# knob — the toothed wheel that clicks the paper up a line.
SCREW_RADIUS = 0.028 * INCH
SCREW_RELIEF = 0.012 * INCH
HUB_RADIUS = 0.3 * INCH
HUB_WIDTH = 0.08 * INCH
RATCHET_RADIUS = ROLLER_RADIUS * 1.14
RATCHET_WIDTH = FLANGE_WIDTH * 0.75
RATCHET_TEETH = 36
RATCHET_DEPTH = 0.14

# The mounts that hold the scale to the frames, one at each end. Without them
# the rule is a bar hovering in front of the page.
MOUNT_HEIGHT = 0.26 * INCH

# The frames the platen is bolted between. Mostly off to the sides of the
# page, where otherwise there is nothing but void.
FRAME_WIDTH = 0.55 * INCH
FRAME_DEPTH = 2.1 * INCH
FRAME_TOP = 1.1 * INCH
FRAME_BOTTOM = -8.5 * INCH
FRAME_OFFSET = SHEET_WIDTH * 0.595

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


def screw(bm, centre, facing):
    """A slotted round head standing proud of a face that looks along x."""
    head = place(0, 0, 0)
    head.x = centre.x + facing * SCREW_RELIEF / 2
    head.y, head.z = centre.y, centre.z
    lying_cylinder(bm, SCREW_RADIUS, SCREW_RELIEF, 20, head, bevel=SCREW_RADIUS * 0.3)
    # The slot, cut as a thin dark box across the head.
    slot = Vector((head.x + facing * SCREW_RELIEF / 2, head.y, head.z))
    bmesh.ops.create_cube(
        bm,
        size=1.0,
        matrix=Matrix.Translation(slot)
        @ Matrix.Diagonal((SCREW_RELIEF * 0.5, SCREW_RADIUS * 1.6, SCREW_RADIUS * 0.28, 1.0)),
    )


def number_mesh(collection, label, centre, mat):
    """Raised digits on the scale, built from a text object and frozen to a
    mesh so the export carries plain geometry."""
    curve = bpy.data.curves.new(f"Scale {label}", type="FONT")
    curve.body = label
    curve.size = NUMBER_HEIGHT
    curve.extrude = NUMBER_RELIEF / 2
    curve.align_x = "CENTER"
    curve.align_y = "CENTER"

    text = bpy.data.objects.new(f"Scale {label} text", curve)
    text.location = centre
    # Text is born flat on the floor; stand it up to face the typist (-y).
    text.rotation_euler = (math.pi / 2, 0, 0)
    collection.objects.link(text)

    depsgraph = bpy.context.evaluated_depsgraph_get()
    mesh = bpy.data.meshes.new_from_object(text.evaluated_get(depsgraph))
    mesh.transform(text.matrix_world)

    obj = bpy.data.objects.new(f"Scale {label}", mesh)
    obj.data.materials.append(mat)
    collection.objects.link(obj)

    bpy.data.objects.remove(text, do_unlink=True)
    bpy.data.curves.remove(curve)
    return obj


def column_x(column):
    """Centre of a typed column, in web-scene x."""
    return LEFT_MARGIN - SHEET_WIDTH / 2 + (column + 0.5) * CHAR_WIDTH


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
    enamel = material("Frame Enamel", (0.02, 0.018, 0.015), 0.28, 0.1)
    brass = material("Brass", (0.6, 0.42, 0.18), 0.38, 0.95)

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
        spacer = RATCHET_WIDTH * 1.4
        knob_x = side * (PLATEN_LENGTH / 2 + FLANGE_WIDTH + spacer + KNOB_WIDTH / 2)

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

        hub_x = knob_x + side * (KNOB_WIDTH + HUB_WIDTH) / 2
        add_mesh(
            collection,
            f"Knob Hub {tag}",
            lambda bm, x=hub_x: lying_cylinder(
                bm, HUB_RADIUS, HUB_WIDTH, 48, place(x, AXIS_Y, AXIS_Z),
                bevel=0.015 * INCH,
            ),
            brass,
        )
        add_mesh(
            collection,
            f"Knob Screw {tag}",
            lambda bm, x=hub_x + side * HUB_WIDTH / 2: screw(
                bm, place(x, AXIS_Y, AXIS_Z), side,
            ),
            steel,
        )

        # Three screws around each flange, where it bolts to the platen core.
        for index in range(3):
            angle = index * 2 * math.pi / 3 + math.pi / 6
            add_mesh(
                collection,
                f"Flange Screw {tag}{index}",
                lambda bm, x=flange_x + side * FLANGE_WIDTH / 2, a=angle: screw(
                    bm,
                    place(
                        x,
                        AXIS_Y + math.cos(a) * FLANGE_RADIUS * 0.62,
                        AXIS_Z + math.sin(a) * FLANGE_RADIUS * 0.62,
                    ),
                    side,
                ),
                steel,
            )

    # The line-space ratchet sits in the gap between the right flange and its
    # knob; the left gets a plain collar in the same gap.
    gap_x = PLATEN_LENGTH / 2 + FLANGE_WIDTH + RATCHET_WIDTH * 0.7
    add_mesh(
        collection,
        "Ratchet",
        lambda bm: fluted_cylinder(
            bm, RATCHET_RADIUS, RATCHET_WIDTH, place(gap_x, AXIS_Y, AXIS_Z),
            RATCHET_TEETH, RATCHET_DEPTH,
        ),
        brass,
    )
    add_mesh(
        collection,
        "Collar L",
        lambda bm: lying_cylinder(
            bm, ROLLER_RADIUS * 0.55, RATCHET_WIDTH, 32, place(-gap_x, AXIS_Y, AXIS_Z),
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

    build_frames(collection, enamel)
    build_scale(collection, steel, brass)
    build_type_guide(collection, dark_steel)
    build_lever_and_stripes(collection, enamel, brass)

    return collection


def build_frames(collection, mat):
    """The carriage's side frames.

    They carry no detail because they are never in focus: their whole job is
    to be something solid either side of the page, so the sheet reads as held
    by a machine instead of floating in front of a wall.
    """
    height = FRAME_TOP - FRAME_BOTTOM
    centre_y = (FRAME_TOP + FRAME_BOTTOM) / 2

    for side, tag in ((-1, "L"), (1, "R")):
        add_mesh(
            collection,
            f"Carriage Frame {tag}",
            lambda bm, s=side: box(
                bm,
                measure(FRAME_WIDTH, height, FRAME_DEPTH),
                place(
                    s * FRAME_OFFSET,
                    centre_y,
                    -ROLLER_RADIUS - FRAME_DEPTH / 2 + 0.3 * INCH,
                ),
            ),
            mat,
        )


def build_scale(collection, mat, steel_for_numbers):
    """The ruler the typist reads their column off, ticked every character and
    stepped up every fifth and tenth, so a glance lands on a number.

    It spans the whole carriage and is mounted to the frames at both ends: the
    paper passes behind it. A rule that only covered the typing area would
    hang in front of the page with nothing holding it up.
    """

    frame_front = -ROLLER_RADIUS - FRAME_DEPTH / 2 + 0.3 * INCH + FRAME_DEPTH / 2

    def geometry(bm):
        box(
            bm,
            measure(FRAME_OFFSET * 2 + FRAME_WIDTH, SCALE_HEIGHT, SCALE_THICKNESS),
            place(0, -SCALE_DROP, SCALE_STANDOFF),
        )

        # The mounts reach back past the paper's edge to the frame behind it.
        reach = SCALE_STANDOFF - frame_front
        for side in (-1, 1):
            box(
                bm,
                measure(FRAME_WIDTH, MOUNT_HEIGHT, reach),
                place(side * FRAME_OFFSET, -SCALE_DROP, SCALE_STANDOFF - reach / 2),
            )

        for column in range(COLUMNS + 1):
            if column % 10 == 0:
                length = TICK_LONG
            elif column % 5 == 0:
                length = TICK_MEDIUM
            else:
                length = TICK_SHORT

            # Ticks stand up out of the rule, towards the line being typed.
            # Sunk into it they are the same slab and read as nothing.
            box(
                bm,
                measure(TICK_WIDTH, length, SCALE_THICKNESS * 0.75),
                place(
                    column_x(column - 0.5),
                    -SCALE_DROP + SCALE_HEIGHT / 2 + length / 2,
                    SCALE_STANDOFF,
                ),
            )

    add_mesh(collection, "Alignment Scale", geometry, mat)

    face_z = SCALE_STANDOFF + SCALE_THICKNESS / 2
    for column in range(0, COLUMNS + 1, 10):
        number_mesh(
            collection,
            str(column),
            place(column_x(column - 0.5), -SCALE_DROP - SCALE_HEIGHT * 0.12, face_z),
            steel_for_numbers,
        )

    def stops(bm):
        for column in (0, COLUMNS):
            box(
                bm,
                measure(STOP_WIDTH, STOP_HEIGHT, STOP_THICKNESS),
                place(
                    column_x(column - 0.5),
                    -SCALE_DROP + (STOP_HEIGHT - SCALE_HEIGHT) / 2,
                    SCALE_STANDOFF + STOP_THICKNESS / 2,
                ),
            )

    add_mesh(collection, "Margin Stops", stops, mat)


def build_type_guide(collection, mat):
    """The fork that sits at the printing point.

    Built around x = 0 so the web scene can slide it to the carriage's column
    by setting nothing but `position.x`.
    """
    baseline = -PRINT_LINE_DROP
    cheek_centre_y = baseline - GUIDE_BELOW_BASELINE + GUIDE_HEIGHT / 2
    scale_top = -SCALE_DROP + SCALE_HEIGHT / 2

    def geometry(bm):
        # The two cheeks either side of the cell the next letter lands in.
        for side in (-1, 1):
            box(
                bm,
                measure(GUIDE_CHEEK, GUIDE_HEIGHT, GUIDE_THICKNESS),
                place(side * (GUIDE_NOTCH + GUIDE_CHEEK) / 2, cheek_centre_y, GUIDE_STANDOFF),
            )

        # The bar under the baseline that joins them.
        box(
            bm,
            measure(GUIDE_WIDTH, GUIDE_THICKNESS * 1.6, GUIDE_THICKNESS),
            place(0, baseline - GUIDE_BELOW_BASELINE, GUIDE_STANDOFF),
        )

        # The stem down to the scale, and the slider that rides it.
        stem_top = baseline - GUIDE_BELOW_BASELINE
        stem_bottom = scale_top
        box(
            bm,
            measure(GUIDE_STEM_WIDTH, stem_top - stem_bottom, GUIDE_THICKNESS),
            place(0, (stem_top + stem_bottom) / 2, GUIDE_STANDOFF),
        )
        box(
            bm,
            measure(GUIDE_SLIDER_WIDTH, GUIDE_SLIDER_HEIGHT, GUIDE_THICKNESS * 1.4),
            place(0, -SCALE_DROP, GUIDE_STANDOFF),
        )

    add_mesh(collection, "Type Guide", geometry, mat)


def build_lever_and_stripes(collection, enamel, brass):
    """The line-space lever at the left of the carriage, and the gold
    pinstripes on the frames."""
    base = place(-FRAME_OFFSET - FRAME_WIDTH * 0.2, 0.25 * INCH, 0.08 * INCH)
    # Pointing forward and up at the typist: tilt about x in Blender's frame.
    tilt = Matrix.Rotation(math.radians(-38), 4, "X")
    along = tilt @ Vector((0, -1, 0))  # the lever's own forward
    centre = base + along * (LEVER_LENGTH / 2)

    def lever(bm):
        bmesh.ops.create_cube(
            bm,
            size=1.0,
            matrix=Matrix.Translation(centre)
            @ tilt
            @ Matrix.Diagonal((LEVER_WIDTH, LEVER_LENGTH, LEVER_THICKNESS, 1.0)),
        )

    add_mesh(collection, "Line Space Lever", lever, enamel)

    tip = base + along * LEVER_LENGTH

    def knob(bm):
        bmesh.ops.create_cone(
            bm, cap_ends=True, cap_tris=False, segments=24,
            radius1=LEVER_TIP_RADIUS, radius2=LEVER_TIP_RADIUS,
            depth=LEVER_THICKNESS * 2.4,
            matrix=Matrix.Translation(tip) @ tilt,
        )
        smooth_sides(bm)

    add_mesh(collection, "Line Space Lever Tip", knob, brass)

    frame_front = -ROLLER_RADIUS + 0.3 * INCH
    height = (FRAME_TOP - FRAME_BOTTOM) * 0.92
    centre_y = (FRAME_TOP + FRAME_BOTTOM) / 2

    def stripes(bm):
        for side in (-1, 1):
            for edge in (-1, 1):
                box(
                    bm,
                    measure(PINSTRIPE_WIDTH, height, PINSTRIPE_WIDTH * 0.6),
                    place(
                        side * FRAME_OFFSET + edge * (FRAME_WIDTH / 2 - PINSTRIPE_INSET),
                        centre_y,
                        frame_front + PINSTRIPE_WIDTH * 0.3,
                    ),
                )

    add_mesh(collection, "Pinstripes", stripes, brass)


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
