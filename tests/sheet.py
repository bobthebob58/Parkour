# Contact sheet: python3 sheet.py <dir> <id> <out.png>  (2x2 grid of views 1,2,3,7 – or the first 4 found)
import sys, os
from PIL import Image
d, kid, out = sys.argv[1], sys.argv[2], sys.argv[3]
names = ['1-oversigt', '2-start', '3-taet', '7-varianter', '5-panorama', '4-nedefra']
files = [os.path.join(d, f'{kid}-{n}.png') for n in names if os.path.exists(os.path.join(d, f'{kid}-{n}.png'))][:4]
W, H = 640, 360
sheet = Image.new('RGB', (W * 2, H * 2), (20, 20, 20))
for i, f in enumerate(files):
    im = Image.open(f).convert('RGB').resize((W, H))
    sheet.paste(im, ((i % 2) * W, (i // 2) * H))
sheet.save(out)
print('sheet', out, len(files))
