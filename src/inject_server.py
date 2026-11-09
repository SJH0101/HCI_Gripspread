"""Replace the /*@SERVER_CLIENT@*/ marker in built pages with src/server_client.js (one copy of the server helper)."""
import os, sys
code = open(os.path.join(os.path.dirname(__file__), 'server_client.js'), encoding='utf-8').read()
for p in sys.argv[1:]:
    s = open(p, encoding='utf-8').read()
    assert s.count('/*@SERVER_CLIENT@*/') == 1, p
    open(p, 'w', encoding='utf-8').write(s.replace('/*@SERVER_CLIENT@*/', code))
