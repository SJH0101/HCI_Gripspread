"""Inline the sample-document pages into the prototype HTML so it stays a single file."""
import base64, glob, sys, os

pages_dir, template, out = sys.argv[1], sys.argv[2], sys.argv[3]
imgs = []
for i, f in enumerate(sorted(glob.glob(os.path.join(pages_dir, 'p-*.webp'))), 1):
    b64 = base64.b64encode(open(f, 'rb').read()).decode()
    imgs.append(f'<img src="data:image/webp;base64,{b64}" alt="예시 문서 {i}쪽" loading="eager">')
html = open(template, encoding='utf-8').read().replace('{{PAGES}}', '\n'.join(imgs))
open(out, 'w', encoding='utf-8').write(html)
print(out, os.path.getsize(out), 'bytes,', len(imgs), 'pages')
