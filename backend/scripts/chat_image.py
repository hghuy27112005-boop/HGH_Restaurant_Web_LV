"""Rasterize trusted server receipts, or normalize uploaded images, to real JPEG."""
import argparse
import sys
from pathlib import Path
import shutil
import subprocess
import tempfile
import xml.etree.ElementTree as ET
# Web workers may not load the developer's user-site packages. Resolve the
# project-local dependency first, regardless of cwd, user profile or PYTHONPATH.
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / '.runtime' / 'python'))
from PIL import Image, ImageOps


def convert(source, destination):
    with Image.open(source) as original:
        original.seek(0)
        image = ImageOps.exif_transpose(original)
        image.thumbnail((6000, 12000))
        background = Image.new('RGB', image.size, 'white')
        if image.mode in ('RGBA', 'LA') or 'transparency' in image.info:
            rgba = image.convert('RGBA')
            background.paste(rgba, mask=rgba.getchannel('A'))
        else:
            background.paste(image.convert('RGB'))
        background.save(destination, 'JPEG', quality=92, optimize=True)


parser = argparse.ArgumentParser()
parser.add_argument('source')
parser.add_argument('destination')
parser.add_argument('--svg', action='store_true')
parser.add_argument('--browser', default='')
args = parser.parse_args()
if not args.svg:
    convert(args.source, args.destination)
else:
    browser = args.browser or next((p for p in [
        shutil.which('chromium'), shutil.which('chromium-browser'), shutil.which('google-chrome'),
        r'C:\Program Files\Google\Chrome\Application\chrome.exe',
        r'C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe',
    ] if p and Path(p).is_file()), None)
    if not browser:
        raise RuntimeError('Chrome/Chromium is required to render invoice images. Set CHAT_IMAGE_BROWSER.')
    root = ET.parse(args.source).getroot()
    width, height = int(root.attrib['width']), int(root.attrib['height'])
    if width > 6000 or height > 30000:
        raise ValueError('Receipt dimensions exceed rendering limits')
    with tempfile.TemporaryDirectory(prefix='hgh-invoice-') as temporary:
        # tempnam() sources have a .tmp/extensionless name. Chromium renders those
        # as plain text; give the trusted document its real MIME-associated suffix.
        document = Path(temporary) / 'receipt.svg'
        document.write_bytes(Path(args.source).read_bytes())
        png = Path(temporary) / 'receipt.png'
        subprocess.run([browser, '--headless', '--no-sandbox', '--disable-gpu',
            '--disable-software-rasterizer', '--no-first-run', '--no-default-browser-check',
            '--hide-scrollbars', '--force-device-scale-factor=1',
            '--user-data-dir=' + str(Path(temporary) / 'profile'),
            '--screenshot=' + str(png), f'--window-size={width},{height + 140}',
            document.resolve().as_uri()], check=True, timeout=35, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        with Image.open(png) as image:
            receipt = image.crop((0, 0, width, height)).convert('RGB')
            # Our trusted receipt includes a green success symbol. A plain-text
            # screenshot can still be valid JPEG, so verify rendered content too.
            green_pixels = sum(1 for r, g, b in receipt.getdata() if g > 85 and g > r * 1.4 and g > b * 1.3)
            if green_pixels < 100:
                raise RuntimeError('Invoice did not render as a receipt; refusing to save a source-code screenshot')
            receipt.save(args.destination, 'JPEG', quality=94, optimize=True)
