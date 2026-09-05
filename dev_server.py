import http.server
import socketserver
import json
import urllib.request
import urllib.error
import base64
import os
from datetime import date

TOKEN     = os.environ.get('GITHUB_TOKEN', '')
REPO      = 'brjidweoio/sadasddasdsa'
FILE_PATH = 'public/fixed.json'
PORT      = 3000

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory='public', **kwargs)

    def log_message(self, format, *args):
        pass  # quiet

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_POST(self):
        if self.path == '/.netlify/functions/toggle-fixed':
            self.handle_toggle()
        else:
            self.send_response(404)
            self.end_headers()

    def handle_toggle(self):
        try:
            length   = int(self.headers.get('Content-Length', 0))
            body     = json.loads(self.rfile.read(length))
            vuln_id  = str(body.get('id'))
            nick     = body.get('nick', '')
            action   = body.get('action')

            api_url = f'https://api.github.com/repos/{REPO}/contents/{FILE_PATH}'
            gh_headers = {
                'Authorization': f'Bearer {TOKEN}',
                'User-Agent':    'vuln-tracker',
                'Accept':        'application/vnd.github.v3+json'
            }

            # Читаем fixed.json с GitHub
            req = urllib.request.Request(api_url, headers=gh_headers)
            with urllib.request.urlopen(req) as r:
                data = json.loads(r.read())

            fixed_map = json.loads(base64.b64decode(data['content']).decode())
            sha       = data['sha']

            if action == 'fix':
                fixed_map[vuln_id] = {'nick': nick, 'date': date.today().isoformat()}
            else:
                fixed_map.pop(vuln_id, None)

            # Пишем обратно
            new_content = base64.b64encode(json.dumps(fixed_map, indent=2).encode()).decode()
            put_body    = json.dumps({'message': f'toggle {vuln_id}', 'content': new_content, 'sha': sha}).encode()
            put_req     = urllib.request.Request(api_url, data=put_body, method='PUT', headers={**gh_headers, 'Content-Type': 'application/json'})
            with urllib.request.urlopen(put_req) as r:
                r.read()

            self.json_response(200, fixed_map)

        except Exception as e:
            self.json_response(500, {'error': str(e)})

    def json_response(self, code, data):
        body = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', len(body))
        self.end_headers()
        self.wfile.write(body)

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(('', PORT), Handler) as httpd:
    print(f'\nСервер запущен: http://localhost:{PORT}\n')
    httpd.serve_forever()
