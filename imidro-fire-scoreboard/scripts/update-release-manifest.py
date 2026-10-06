"""CI-only: record hashes from a published release using the runner's GitHub token."""
import base64
import json
import os
import re
import subprocess
from pathlib import Path

repo = os.environ['GITHUB_REPOSITORY']
version = json.loads(Path('package.json').read_text())['version']
if not re.fullmatch(r'\d+\.\d+\.\d+', version):
    raise ValueError('Invalid package version')


def api(path):
    return json.loads(subprocess.check_output(['gh', 'api', path]))


release = api(f'repos/{repo}/releases/tags/imidro-fire-v{version}')
if release['draft'] or release['prerelease']:
    raise ValueError('Release is not public and stable')
asset = next(a for a in release['assets'] if a['name'] == f'IMIDRO-Fire-Scoreboard-{version}-x64-setup.exe')
digest = asset.get('digest', '')
if not re.fullmatch(r'sha256:[0-9a-fA-F]{64}', digest) or asset['size'] <= 0:
    raise ValueError('Missing verified asset digest')
path = 'imidro-fire-scoreboard/scripts/releases.json'
current = api(f'repos/{repo}/contents/{path}?ref=main')
manifest = json.loads(base64.b64decode(current['content']))
manifest['releases'][version] = {'size': asset['size'], 'sha256': digest[7:]}
manifest['latest'] = max(manifest['releases'], key=lambda v: tuple(map(int, v.split('.'))))
content = (json.dumps(manifest, indent=2) + '\n').encode()
if content == base64.b64decode(current['content']):
    print('Published installer metadata already matches.')
else:
    payload = {'message': f'Update verified IMIDRO installer metadata for {version}', 'branch': 'main',
               'sha': current['sha'], 'content': base64.b64encode(content).decode()}
    subprocess.run(['gh', 'api', f'repos/{repo}/contents/{path}', '--method', 'PUT', '--input', '-'],
                   input=json.dumps(payload).encode(), check=True, stdout=subprocess.DEVNULL)
    print(f'Published installer metadata updated for {version}.')
