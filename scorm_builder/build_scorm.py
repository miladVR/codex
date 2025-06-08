import os
import json
import shutil
from zipfile import ZipFile
from pathlib import Path

TEMPLATE_DIR = Path(__file__).parent / 'template'

def build_scorm(video_path, questions_path, output_zip):
    video_path = Path(video_path)
    questions_path = Path(questions_path)
    output_zip = Path(output_zip)

    if not video_path.exists():
        raise FileNotFoundError(f"Video not found: {video_path}")
    if not questions_path.exists():
        raise FileNotFoundError(f"Questions file not found: {questions_path}")

    with open(questions_path, 'r', encoding='utf-8') as f:
        questions = json.load(f)

    if len(questions) != 3:
        raise ValueError('Exactly three questions required')

    build_dir = Path('scorm_package')
    if build_dir.exists():
        shutil.rmtree(build_dir)
    build_dir.mkdir()

    # copy template files
    shutil.copytree(TEMPLATE_DIR, build_dir, dirs_exist_ok=True)

    # copy video
    shutil.copy(video_path, build_dir / video_path.name)

    # write questions.js
    with open(build_dir / 'questions.js', 'w', encoding='utf-8') as f:
        f.write('const QUESTIONS = ' + json.dumps(questions, ensure_ascii=False) + ';\n')

    # write manifest with correct video name
    manifest_template = (TEMPLATE_DIR / 'imsmanifest.xml').read_text(encoding='utf-8')
    manifest_content = manifest_template.replace('{{VIDEO}}', video_path.name)
    with open(build_dir / 'imsmanifest.xml', 'w', encoding='utf-8') as f:
        f.write(manifest_content)

    # zip
    with ZipFile(output_zip, 'w') as zipf:
        for path in build_dir.rglob('*'):
            zipf.write(path, path.relative_to(build_dir))

    shutil.rmtree(build_dir)

if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='Build SCORM package with video quiz')
    parser.add_argument('video', help='Path to video file')
    parser.add_argument('questions', help='Path to JSON file with questions')
    parser.add_argument('-o', '--output', default='package.zip', help='Output zip file')
    args = parser.parse_args()

    build_scorm(args.video, args.questions, args.output)
    print('SCORM package created:', args.output)
