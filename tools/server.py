"""개발 서버: 정적 파일 + 리그 편집기 저장(POST /save?path=art/<id>/rig.json, 이전 것은 out/backup/ 에)
+ 확인용 그림 저장(POST /shot?name=이름 → out/shots/이름.png).
사용: python tools/server.py [포트]"""
import http.server
import json
import os
import shutil
import sys
import time
import urllib.parse

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..'))


class H(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        q = urllib.parse.parse_qs(u.query)
        if u.path == '/shot':
            # 확인용 그림 저장: out/shots/<name>.png (본문 = PNG 바이트)
            name = ''.join(ch for ch in q.get('name', ['shot'])[0] if ch.isalnum() or ch in '_-')[:60] or 'shot'
            d = os.path.join(ROOT, 'out', 'shots')
            os.makedirs(d, exist_ok=True)
            with open(os.path.join(d, name + '.png'), 'wb') as f:
                f.write(self.rfile.read(int(self.headers.get('Content-Length', 0))))
            self.send_response(200)
            self.end_headers()
            self.wfile.write(b'ok')
            return
        rel = q.get('path', [''])[0]
        # art/<id>/rig.json 만 저장 허용
        parts = rel.replace(chr(92), '/').split('/')
        if u.path != '/save' or len(parts) != 3 or parts[0] != 'art' or parts[2] != 'rig.json' or '..' in parts:
            self.send_error(400, 'bad path')
            return
        body = self.rfile.read(int(self.headers.get('Content-Length', 0)))
        data = json.loads(body)
        dst = os.path.join(ROOT, *parts)
        if os.path.exists(dst):
            bdir = os.path.join(ROOT, 'out', 'backup')
            os.makedirs(bdir, exist_ok=True)
            shutil.copy(dst, os.path.join(bdir, f'{parts[1]}_rig_{time.strftime("%m%d_%H%M%S")}.json'))
        with open(dst, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=1)
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b'ok')


if __name__ == '__main__':
    port = int(os.environ.get("PORT") or (sys.argv[1] if len(sys.argv) > 1 else 5320))
    http.server.ThreadingHTTPServer(('127.0.0.1', port), H).serve_forever()
