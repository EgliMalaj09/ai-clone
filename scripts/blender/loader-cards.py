# NgaZero loader: 8 glossy rounded cards chasing round a circle, rendered as a seamless transparent loop.
#
#   blender --background --factory-startup --python scripts/blender/loader-cards.py -- <out_dir> [frames] [size] [samples]
#
# Writes <out_dir>/f_0000.png ... (RGBA). scripts/render-loader.mjs turns them into public/media/loader-cards.webp.
import bpy, math, sys

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = argv[0] if argv else "//loader"
FRAMES = int(argv[1]) if len(argv) > 1 else 48       # 2 s at 24 fps = one lap
SIZE = int(argv[2]) if len(argv) > 2 else 360
SAMPLES = int(argv[3]) if len(argv) > 3 else 64
ONLY = int(argv[4]) if len(argv) > 4 else -1          # render a single frame (for previews)

COLORS = ["#ff4d6d", "#ff8a3d", "#ffd23f", "#5ee07a", "#2ec4b6", "#3a86ff", "#3154f5", "#8f5bff"]
DELAY = 0.075     # each card trails the one before by this fraction of a lap
RADIUS = 1.3

def srgb(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return [x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c] + [1]

def ease(u):
    return 4 * u ** 3 if u < 0.5 else 1 - (-2 * u + 2) ** 3 / 2

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
scene.cycles.device = "CPU"
# Use the graphics card when there is one (much faster); otherwise stay on the CPU.
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("OPTIX", "CUDA", "HIP", "ONEAPI", "METAL"):
        try:
            prefs.compute_device_type = backend; prefs.get_devices()
            gpus = [d for d in prefs.devices if d.type != "CPU"]
            if gpus:
                for d in prefs.devices: d.use = d.type != "CPU"
                scene.cycles.device = "GPU"; print("Using GPU:", backend, [d.name for d in gpus]); break
        except Exception: pass
except Exception as e: print("GPU check failed:", e)
scene.cycles.use_adaptive_sampling = True
scene.cycles.adaptive_threshold = 0.02
scene.cycles.max_bounces = 6
scene.cycles.transmission_bounces = 4
scene.cycles.samples = SAMPLES
scene.cycles.use_denoising = True
scene.render.film_transparent = True
scene.render.resolution_x = scene.render.resolution_y = SIZE
scene.render.fps = 24
scene.frame_start, scene.frame_end = 0, FRAMES - 1
scene.render.image_settings.file_format = "PNG"
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.view_transform = "Standard"
scene.render.filepath = OUT.rstrip("/\\") + "/f_"

# Soft white studio light for reflections (the background itself stays transparent).
world = bpy.data.worlds.new("World"); scene.world = world; world.use_nodes = True
bg = world.node_tree.nodes["Background"]; bg.inputs[0].default_value = (1, 1, 1, 1); bg.inputs[1].default_value = 0.55

cam_data = bpy.data.cameras.new("Cam"); cam_data.sensor_fit = "VERTICAL"; cam_data.angle = math.radians(30)
cam = bpy.data.objects.new("Cam", cam_data); cam.location = (0, 0, 8.0); scene.collection.objects.link(cam); scene.camera = cam

def area(name, loc, power, size, color=(1, 1, 1)):
    d = bpy.data.lights.new(name, "AREA"); d.energy = power; d.size = size; d.color = color
    o = bpy.data.objects.new(name, d); o.location = loc; scene.collection.objects.link(o)
    c = o.constraints.new("TRACK_TO"); c.target = cam  # placeholder, retargeted below
    return o

origin = bpy.data.objects.new("Origin", None); scene.collection.objects.link(origin)
for name, loc, power, size, col in [("Key", (2.5, 3, 4.5), 420, 3.5, (1, 0.98, 0.95)),
                                    ("Fill", (-3.5, -1, 3), 160, 4, (0.92, 0.95, 1)),
                                    ("Rim", (0, 3, -3), 260, 3, (1, 1, 1))]:
    o = area(name, loc, power, size, col); o.constraints[0].target = origin; o.constraints[0].track_axis = "TRACK_NEGATIVE_Z"; o.constraints[0].up_axis = "UP_Y"

# Tilted carrier so the loop reads as 3D.
group = bpy.data.objects.new("Group", None); group.rotation_euler = (-0.35, 0.25, 0); scene.collection.objects.link(group)

def card_mesh():
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.active_object
    o.scale = (0.78, 1.04, 0.22); bpy.ops.object.transform_apply(scale=True)
    b = o.modifiers.new("Bevel", "BEVEL"); b.width = 0.12; b.segments = 8; b.limit_method = "NONE"
    bpy.ops.object.modifier_apply(modifier="Bevel")
    bpy.ops.object.shade_smooth()
    return o.data

mesh = card_mesh(); bpy.data.objects.remove(bpy.context.active_object)

cards = []
for i, hexc in enumerate(COLORS):
    m = bpy.data.materials.new(f"Card{i}"); m.use_nodes = True
    p = m.node_tree.nodes["Principled BSDF"]
    p.inputs["Base Color"].default_value = srgb(hexc)
    p.inputs["Roughness"].default_value = 0.34
    p.inputs["IOR"].default_value = 1.45
    for k, v in [("Transmission Weight", 0.35), ("Coat Weight", 0.6), ("Coat Roughness", 0.12)]:
        if k in p.inputs: p.inputs[k].default_value = v
    o = bpy.data.objects.new(f"Card{i}", mesh.copy()); o.data.materials.append(m)
    o.parent = group; scene.collection.objects.link(o); cards.append(o)

for f in range(FRAMES):
    s = f / FRAMES  # fraction of the loop (0..1); one lap per loop keeps it seamless
    for i, o in enumerate(cards):
        u = s - i * DELAY; lap = math.floor(u)
        a = math.pi / 2 - 2 * math.pi * (lap + ease(u - lap))
        o.location = (math.cos(a) * RADIUS, math.sin(a) * RADIUS, 0)
        o.rotation_euler = (0, math.sin(a * 2 + 2 * math.pi * s) * 0.35, a - math.pi / 2)
        o.keyframe_insert("location", frame=f); o.keyframe_insert("rotation_euler", frame=f)

for o in cards:
    for fc in (o.animation_data.action.fcurves if hasattr(o.animation_data.action, "fcurves") else []):
        for k in fc.keyframe_points: k.interpolation = "LINEAR"

if ONLY >= 0:
    scene.frame_set(ONLY); scene.render.filepath = OUT.rstrip("/\\") + f"/preview_{ONLY:04d}.png"
    bpy.ops.render.render(write_still=True)
else:
    bpy.ops.render.render(animation=True)
