import base64
import json
import os
import re
import ssl
import subprocess
import threading
import tempfile
import uuid
from pathlib import Path
from urllib.request import Request,urlopen
from deepseek_harness import DeepSeekHarness
from extract import extract

def speech(path,key):
    boundary=uuid.uuid4().hex
    body=(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="clip.wav"\r\nContent-Type: audio/wav\r\n\r\n'.encode()+path.read_bytes()+f'\r\n--{boundary}--\r\n'.encode())
    req=Request("https://api.deepseek.com/v1/tools/asr",body,{"Authorization":"Bearer "+key,"Content-Type":"multipart/form-data; boundary="+boundary})
    with urlopen(req,timeout=90,context=ssl.create_default_context(cafile="/etc/ssl/cert.pem")) as res:
        return json.load(res)["text"]

def prepare(files,key):
    notes=[]
    images=[]
    for file in files:
        name=Path(file["name"]).name
        ext=Path(name).suffix.lower()
        raw=base64.b64decode(file["data"],validate=True)
        if ext in (".pdf",".txt",".doc",".docx"):
            content=extract(raw,ext).strip()
            if not content: raise ValueError("材料无可提取文字，请上传页面图片")
            notes.append(name+"："+content)
            continue
        with tempfile.TemporaryDirectory() as folder:
            path=Path(folder)/("input"+ext)
            path.write_bytes(raw)
            def ff(*args):
                return subprocess.check_output(["ffmpeg","-y","-loglevel","error",*args],timeout=60)
            meta=json.loads(subprocess.check_output(["ffprobe","-v","error","-show_format","-show_streams","-of","json",str(path)],timeout=20))
            streams={v["codec_type"] for v in meta["streams"]}
            duration=float(meta["format"].get("duration",0))
            if duration>1800: raise ValueError("单份媒体最长30分钟")
            if "video" in streams:
                for pos in ([0] if duration<2 else [duration*r for r in (.05,.35,.65,.95)]):
                    jpeg=ff("-ss",str(pos),"-i",str(path),"-frames:v","1","-vf","scale=min(1600\\,iw):-2","-f","image2pipe","-vcodec","mjpeg","-")
                    if jpeg: images.extend([{"type":"text","text":f"{name}，{pos:.1f}秒"},{"type":"image","mimeType":"image/jpeg","data":base64.b64encode(jpeg).decode()}])
            if "audio" in streams:
                for start in range(0,max(1,int(duration+.999)),110):
                    clip=Path(folder)/"clip.wav"
                    ff("-ss",str(start),"-i",str(path),"-t","110","-vn","-ar","16000","-ac","1",str(clip))
                    notes.append(f"{name} 从{start}秒起："+speech(clip,key))
    return notes,images

def run(prompt,data,images,key,model):
    with tempfile.TemporaryDirectory() as folder:
        with DeepSeekHarness(dsh_bin=os.environ.get("LABOR_DSH_BIN"),env={"DSH_TELEMETRY_MODE":"DISABLED","DSH_PERMISSION_MODE":"read-only","NODE_EXTRA_CA_CERTS":"/etc/ssl/cert.pem"},dsh_home=folder+"/state",cwd=folder,provider="deepseek-official",model=model,api_key=key,patches=(str(Path(__file__).with_name("harness.yml").resolve()),)) as h:
            h.start()
            expired=threading.Event()
            def stop_waiting():
                expired.set()
                h.client.close()
            watchdog=threading.Timer(150,stop_waiting)
            watchdog.start()
            try:
                reply=h.run([{"type":"text","text":prompt+"\n结合历史与新增材料；摘要保留事实、金额、日期和材料内容。仅输出 JSON。\n"+json.dumps(data,ensure_ascii=False)},*images])
            finally:
                watchdog.cancel()
                watchdog.join()
                if expired.is_set():
                    raise TimeoutError("DeepSeek Harness 等待超过150秒")
            if reply.finish_reason!="completed": raise ValueError("Harness 未完成分析")
            return json.loads(re.sub(r"^\x60\x60\x60(?:json)?\s*|\s*\x60\x60\x60$","",reply.final_response.strip()))
