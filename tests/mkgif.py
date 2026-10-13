import sys, glob
from PIL import Image
src, out, w = sys.argv[1], sys.argv[2], int(sys.argv[3])
frames = [Image.open(f).convert('RGB') for f in sorted(glob.glob(src + '/f*.png'))]
h = round(frames[0].height * w / frames[0].width)
frames = [f.resize((w, h), Image.LANCZOS) for f in frames]
# shared palette from a sample of frames keeps colours stable between frames
sample = Image.new('RGB', (w, h * 4))
for k, i in enumerate(range(0, len(frames), max(1, len(frames) // 4))):
    if k < 4: sample.paste(frames[i], (0, k * h))
pal = sample.quantize(colors=int(sys.argv[4]) if len(sys.argv)>4 else 128, method=Image.MEDIANCUT)
q = [f.quantize(palette=pal, dither=Image.NONE) for f in frames]
q[0].save(out, save_all=True, append_images=q[1:], duration=83, loop=0, optimize=True)
import os; print(out, round(os.path.getsize(out) / 1e6, 2), 'MB', len(q), 'frames', (w, h))
