import json
import shutil
import tempfile
from pathlib import Path
from http.server import BaseHTTPRequestHandler, HTTPServer
import cgi

from .build_scorm import build_scorm

INDEX_HTML = '''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>SCORM Video Quiz Builder</title>
</head>
<body>
<h1>SCORM Video Quiz Builder</h1>
<form action="/build" method="post" enctype="multipart/form-data">
<label>Video: <input type="file" name="video" accept="video/mp4"></label><br><br>
'''
for i in range(3):
    INDEX_HTML += f'<fieldset><legend>Question {i+1}</legend>'
    INDEX_HTML += f'<input type="text" name="q{i}" placeholder="Question text" style="width:400px"><br>'
    for j in range(4):
        INDEX_HTML += f'Option {j+1}: <input type="text" name="q{i}o{j}" style="width:300px"><br>'
    INDEX_HTML += 'Correct:'
    for j in range(4):
        checked = ' checked' if j == 0 else ''
        INDEX_HTML += f'<label><input type="radio" name="q{i}a" value="{j}"{checked}> {j+1}</label>'
    INDEX_HTML += '</fieldset><br>'
INDEX_HTML += '<button type="submit">Build SCORM</button></form></body></html>'

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/' or self.path == '/index.html':
            self.send_response(200)
            self.send_header('Content-Type', 'text/html; charset=utf-8')
            self.end_headers()
            self.wfile.write(INDEX_HTML.encode('utf-8'))
        else:
            self.send_error(404)

    def do_POST(self):
        if self.path != '/build':
            self.send_error(404)
            return
        ctype, pdict = cgi.parse_header(self.headers.get('Content-Type'))
        if ctype != 'multipart/form-data':
            self.send_error(400, 'Content-Type must be multipart/form-data')
            return
        pdict['boundary'] = pdict['boundary'].encode('utf-8')
        fs = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ={'REQUEST_METHOD': 'POST', 'CONTENT_TYPE': self.headers['Content-Type']})
        video_item = fs.getfirst('video') if isinstance(fs.get('video'), cgi.FieldStorage) else fs.get('video')
        if not video_item or not getattr(video_item, 'filename', ''):
            self.send_error(400, 'Video file required')
            return
        tempdir = tempfile.mkdtemp()
        try:
            video_path = Path(tempdir)/Path(video_item.filename).name
            with open(video_path, 'wb') as f:
                shutil.copyfileobj(video_item.file, f)
            questions = []
            for i in range(3):
                q_text = fs.getfirst(f'q{i}', '').strip()
                opts = [fs.getfirst(f'q{i}o{j}', '').strip() for j in range(4)]
                ans = fs.getfirst(f'q{i}a', '0')
                if not q_text or any(not o for o in opts):
                    self.send_error(400, 'All questions and options must be filled')
                    return
                questions.append({'question': q_text, 'options': opts, 'answer': int(ans)})
            q_file = Path(tempdir)/'questions.json'
            with open(q_file, 'w', encoding='utf-8') as f:
                json.dump(questions, f, ensure_ascii=False)
            output_zip = Path(tempdir)/'package.zip'
            build_scorm(video_path, q_file, output_zip)
            with open(output_zip, 'rb') as f:
                data = f.read()
            self.send_response(200)
            self.send_header('Content-Type', 'application/zip')
            self.send_header('Content-Disposition', 'attachment; filename="package.zip"')
            self.send_header('Content-Length', str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        finally:
            shutil.rmtree(tempdir)


def run(port=8000):
    server = HTTPServer(('0.0.0.0', port), Handler)
    print(f'Serving on http://localhost:{port}')
    server.serve_forever()

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Run web interface for SCORM builder')
    parser.add_argument('-p', '--port', type=int, default=8000)
    args = parser.parse_args()
    run(args.port)

