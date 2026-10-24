"""Inline the shared GripSpread engine into the experiment page so it stays a single file."""
import sys, os
template, engine, out = sys.argv[1], sys.argv[2], sys.argv[3]
html = open(template, encoding='utf-8').read().replace('{{ENGINE}}', open(engine, encoding='utf-8').read())
open(out, 'w', encoding='utf-8').write(html)
print(out, os.path.getsize(out), 'bytes')
