import subprocess
import tempfile
from pathlib import Path

def extract(raw, suffix):
    with tempfile.TemporaryDirectory() as folder:
        source = Path(folder) / ("input" + suffix)
        source.write_bytes(raw)
        if suffix in (".docx", ".doc"):
            cmd = ["textutil", "-convert", "txt", "-stdout", str(source)]
        elif suffix == ".pdf":
            cmd = ["pdftotext", "-layout", str(source), "-"]
        elif suffix in (".png", ".jpg", ".jpeg", ".webp", ".heic"):
            cmd = ["tesseract", str(source), "stdout", "-l", "chi_sim+eng"]
        elif suffix in (".wav", ".mp3", ".m4a", ".aac", ".ogg", ".flac", ".webm"):
            cmd = ["whisper", str(source), "--language", "Chinese", "--model", "base",
                   "--output_dir", folder, "--output_format", "srt", "--fp16", "False"]
        elif suffix == ".txt":
            return raw.decode("utf-8-sig")
        else:
            raise ValueError("该格式可手动摘录")
        completed = subprocess.run(cmd, cwd=folder, capture_output=True, timeout=300, check=True)
        transcript = source.with_suffix(".srt")
        return transcript.read_text() if transcript.exists() else completed.stdout.decode()
