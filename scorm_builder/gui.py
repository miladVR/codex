import json
import tempfile
from pathlib import Path
import tkinter as tk
from tkinter import filedialog, messagebox

from .build_scorm import build_scorm

class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title('SCORM Video Quiz Builder')
        self.video_path = None
        self.questions = []
        self._build_video_frame()

    def _build_video_frame(self):
        self.video_frame = tk.Frame(self)
        self.video_frame.pack(padx=10, pady=10)

        tk.Label(self.video_frame, text='Select video file:').pack(anchor='w')
        self.video_var = tk.StringVar()
        tk.Entry(self.video_frame, textvariable=self.video_var, width=40).pack(side='left')
        tk.Button(self.video_frame, text='Browse', command=self.select_video).pack(side='left', padx=5)
        tk.Button(self.video_frame, text='Next', command=self.show_question_frame).pack(side='left', padx=5)

    def select_video(self):
        path = filedialog.askopenfilename(filetypes=[('MP4 files','*.mp4'),('All files','*')])
        if path:
            self.video_var.set(path)

    def show_question_frame(self):
        if not self.video_var.get():
            messagebox.showerror('Error', 'Please select a video file.')
            return
        self.video_path = Path(self.video_var.get())
        self.video_frame.destroy()
        self._build_questions_frame()

    def _build_questions_frame(self):
        self.q_frame = tk.Frame(self)
        self.q_frame.pack(padx=10, pady=10)
        self.entries = []
        for i in range(3):
            frame = tk.LabelFrame(self.q_frame, text=f'Question {i+1}')
            frame.pack(fill='x', pady=5)
            q_text = tk.Entry(frame, width=50)
            q_text.pack(fill='x', padx=5, pady=2)
            opts = []
            correct_var = tk.IntVar(value=0)
            for j in range(4):
                opt_frame = tk.Frame(frame)
                opt_frame.pack(fill='x', padx=5)
                tk.Radiobutton(opt_frame, variable=correct_var, value=j).pack(side='left')
                opt_entry = tk.Entry(opt_frame, width=40)
                opt_entry.pack(side='left', pady=1)
                opts.append(opt_entry)
            self.entries.append((q_text, opts, correct_var))
        tk.Button(self.q_frame, text='Build SCORM', command=self.build).pack(pady=10)

    def build(self):
        questions = []
        for q_entry, opt_entries, ans_var in self.entries:
            q_text = q_entry.get().strip()
            opts = [e.get().strip() for e in opt_entries]
            if not q_text or any(not o for o in opts):
                messagebox.showerror('Error', 'All questions and options must be filled.')
                return
            questions.append({'question': q_text, 'options': opts, 'answer': ans_var.get()})
        output = filedialog.asksaveasfilename(defaultextension='.zip', filetypes=[('Zip file','*.zip')])
        if not output:
            return
        with tempfile.TemporaryDirectory() as tmpdir:
            q_file = Path(tmpdir)/'questions.json'
            with open(q_file, 'w', encoding='utf-8') as f:
                json.dump(questions, f, ensure_ascii=False)
            try:
                build_scorm(self.video_path, q_file, output)
            except Exception as e:
                messagebox.showerror('Error', str(e))
                return
        messagebox.showinfo('Done', f'SCORM package created:\n{output}')

if __name__ == '__main__':
    app = App()
    app.mainloop()
