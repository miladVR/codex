# SCORM Video Quiz Builder

This repository contains a simple script for generating a SCORM 1.2 package
that plays a video and asks three multiple‑choice questions in the final ten
seconds. The learner's score is sent to the LMS when the quiz is submitted.

## Command Line Usage

1. Prepare a video file (`.mp4`) and a JSON file containing exactly three
   questions. Each question must include the text, four options and the index of
   the correct option (starting from 0). Example `questions.json`:

   ```json
   [
     {"question": "Question 1?", "options": ["A", "B", "C", "D"], "answer": 1},
     {"question": "Question 2?", "options": ["A", "B", "C", "D"], "answer": 2},
     {"question": "Question 3?", "options": ["A", "B", "C", "D"], "answer": 0}
   ]
   ```

2. Run the builder:

   ```bash
   python3 scorm_builder/build_scorm.py path/to/video.mp4 questions.json -o quiz.zip
   ```

3. Upload the resulting `quiz.zip` file to your LMS (e.g. Moodle) as a SCORM
   activity.

## Graphical Interface

A simple Tkinter interface is available for users who prefer not to prepare the
`questions.json` file manually. Run:

```bash
python3 -m scorm_builder.gui
```

The first window lets you choose the video file. After clicking **Next**, you
can enter three questions, four options for each, and select the correct
answer. Clicking **Build SCORM** will prompt for the output zip file and create
it using the same template as the command line tool.

When the video reaches the last ten seconds it pauses and the question overlay
appears. After the learner submits answers, the score is reported via the SCORM
1.2 API and displayed on screen.

## Web Interface

For environments without a desktop, a very small web interface is provided. Run:

```bash
python3 -m scorm_builder.webapp
```

Then open `http://localhost:8000` in a browser. Upload your video, fill in the three
questions and options, and submit. The generated `package.zip` will be returned
as a download.

