"""Inject the IMU calibration core (CSS, HTML, JS between CORE markers of src/imu_calib.html) into a built page."""
import sys, re
src = open('src/imu_calib.html', encoding='utf-8').read()
def between(a, b):
    i = src.index(a) + len(a); return src[i:src.index(b, i)]
css = between('/*CORE-CSS-START*/', '/*CORE-CSS-END*/')
html = between('<!--CORE-HTML-START-->', '<!--CORE-HTML-END-->')
js = between('/*CORE-JS-START*/', '/*CORE-JS-END*/')
html = html.replace('id="sImu" class="screen on" style="position:static;display:block"', 'id="sImuCore"')
path = sys.argv[1]
out = open(path, encoding='utf-8').read()
for k, v in (('{{IMUCAL_CSS}}', css), ('{{IMUCAL_HTML}}', html), ('{{IMUCAL_JS}}', js)):
    assert k in out, k
    out = out.replace(k, v)
open(path, 'w', encoding='utf-8').write(out)
