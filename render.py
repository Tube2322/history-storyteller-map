"""เรนเดอร์วิดีโอฝั่งเซิร์ฟเวอร์ (ไม่ต้องนั่งเฝ้าหน้าจอ ไม่ต้องกด getDisplayMedia)

วิธีทำงาน:
1. อ่านไฟล์สคริปต์ซีน (ฟอร์แมตเดียวกับที่วางในกล่อง "นำเข้าสคริปต์" บนเว็บ)
2. เรียก /api/tts (server.py) พากย์เสียงทีละท่อนจริง เก็บเป็น mp3 + วัดความยาวจริงด้วย ffprobe
3. ต่อไฟล์เสียงทั้งหมดเป็นแทร็กเดียว
4. เปิด Chromium แบบ headless ผ่าน Playwright ให้เล่นหน้าเว็บโหมด ?autoplay=1
   โดยส่งสคริปต์ + ความยาวเสียงที่วัดได้ไปทาง URL ให้จังหวะภาพตรงกับเสียงเป๊ะ
   (ไม่ต้องพากย์เสียงซ้ำในเบราว์เซอร์ แค่รอเวลาตามที่กำหนด)
5. อัดหน้าจอ (ภาพอย่างเดียว ไม่มีเสียง) เป็น .webm ด้วย Playwright screencast
6. เอาภาพ (webm) + เสียง (mp3) มารวมกันเป็นไฟล์ .mp4 ด้วย ffmpeg

ข้อจำกัด: อัดภาพยังใช้เวลาเท่าความยาวจริงของวิดีโอ (ไม่ fast-render) เพราะต้องให้
แอนิเมชันกล้อง/แผนที่เล่นจริงเพื่อภาพจะได้ลื่นเหมือนที่เห็นบนเว็บ แต่ต่างจากการ
อัดหน้าจอสด (getDisplayMedia) ตรงที่ไม่ต้องมีคนนั่งเฝ้า ไม่ต้องกดอนุญาตแชร์แท็บ
และซ่อน UI เครื่องมือแก้ไข (topbar/timeline) ออกจากวิดีโอที่ได้ให้อัตโนมัติ

รันคำสั่ง:
    python render.py script.txt --aspect 916 --out out.mp4
    (ต้องเปิด server.py ไว้ที่ localhost:5173 ก่อน)
"""

import argparse
import base64
import json
import re
import subprocess
import sys
import tempfile
import time
import urllib.request
from pathlib import Path

if sys.stdout.encoding and sys.stdout.encoding.lower() != "utf-8":
    sys.stdout.reconfigure(encoding="utf-8")  # กัน console Windows แสดงภาษาไทยเพี้ยน

import imageio_ffmpeg
from playwright.sync_api import sync_playwright

SERVER_URL = "http://localhost:5173"
SEGMENT_DELIM = ";;"
DEFAULT_VOICE = "th-TH-PremwadeeNeural"
FFMPEG = imageio_ffmpeg.get_ffmpeg_exe()


TAG_ALIASES = {
    "place": "place", "loc": "place",
    "script": "script", "text": "script",
    "sec": "dur", "duration": "dur",
}
TAG_RE = re.compile(r"^([a-zA-Z]+)\s*=\s*([\s\S]*)$")


def parse_rows(text: str):
    # ต้องอ่านให้ตรงกับ finalizeScene ฝั่ง script.js (tag-mode หรือ column-mode)
    # แต่ render.py สนแค่ place/script/duration สำหรับพากย์เสียง+จับเวลา ส่วนภาพให้ script.js
    # จัดการตอนเล่นในเบราว์เซอร์ headless ทั้งหมดอยู่แล้ว
    rows = []
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        segments = [s.strip() for s in line.split("|") if s.strip()]
        tags = {}
        for seg in segments:
            m = TAG_RE.match(seg)
            if not m:
                continue
            key = TAG_ALIASES.get(m.group(1).lower())
            if key:
                tags[key] = m.group(2).strip()

        if tags:
            place, script, dur = tags.get("place", ""), tags.get("script", ""), tags.get("dur", "")
        else:
            parts = segments + [""] * 8
            place, _latlng, _cam, script, dur = parts[0], parts[1], parts[2], parts[3], parts[4]

        if not place or not script:
            continue
        rows.append({"place": place, "script": script, "duration": float(dur) if dur else 5.0})
    return rows


def fetch_tts_bytes(text: str, voice: str, rate: str, pitch: str) -> bytes:
    req = urllib.request.Request(
        f"{SERVER_URL}/api/tts",
        data=json.dumps({"text": text, "voice": voice, "rate": rate, "pitch": pitch}).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as resp:
        return resp.read()


def make_silence(path: Path, seconds: float):
    subprocess.run(
        [FFMPEG, "-y", "-f", "lavfi", "-i", f"anullsrc=r=44100:cl=stereo", "-t", str(seconds),
         "-q:a", "9", str(path)],
        check=True, capture_output=True,
    )


def probe_duration(path: Path) -> float:
    ffprobe = str(Path(FFMPEG).with_name(Path(FFMPEG).name.replace("ffmpeg", "ffprobe")))
    # imageio-ffmpeg แถมมาแค่ ffmpeg ไม่มี ffprobe แยก ใช้ ffmpeg -i อ่าน duration จาก stderr แทน
    result = subprocess.run(
        [FFMPEG, "-i", str(path)],
        capture_output=True, text=True,
    )
    for line in result.stderr.splitlines():
        line = line.strip()
        if line.startswith("Duration:"):
            hh, mm, ss = line.split(",")[0].split("Duration:")[1].strip().split(":")
            return int(hh) * 3600 + int(mm) * 60 + float(ss)
    return 0.0


def build_audio_track(rows, workdir: Path, voice: str, rate: str, pitch: str, gap: float):
    clip_paths = []
    durations = []  # [[seg1, seg2, ...], ...] ต่อฉาก — ไม่รวมช่วงเงียบคั่นฉาก (กล้อง/ซับไตเติลไม่ต้องรู้เรื่องนี้)
    silence_path = None
    if gap > 0:
        silence_path = workdir / "silence.mp3"
        make_silence(silence_path, gap)

    for i, row in enumerate(rows):
        segments = [s.strip() for s in row["script"].split(SEGMENT_DELIM) if s.strip()] or [row["script"]]
        seg_durations = []
        for j, seg in enumerate(segments):
            print(f"[tts] ฉาก {i+1}/{len(rows)} ท่อน {j+1}/{len(segments)}: {seg[:30]}...")
            audio_bytes = fetch_tts_bytes(seg, voice, rate, pitch)
            clip_path = workdir / f"clip_{i:03d}_{j:02d}.mp3"
            clip_path.write_bytes(audio_bytes)
            dur = probe_duration(clip_path)
            clip_paths.append(clip_path)
            seg_durations.append(round(dur, 2))
        durations.append(seg_durations)
        if silence_path and i < len(rows) - 1:
            clip_paths.append(silence_path)  # จังหวะฉาก — พักเงียบก่อนตัดไปฉากถัดไป (เหมือนพากย์สด)

    concat_list = workdir / "concat.txt"
    concat_list.write_text(
        "\n".join(f"file '{p.name}'" for p in clip_paths), encoding="utf-8"
    )
    narration_out = workdir / "narration.mp3"
    subprocess.run(
        [FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(concat_list), "-c", "copy", str(narration_out)],
        cwd=workdir, check=True, capture_output=True,
    )
    return narration_out, durations


def mix_bgm(narration_path: Path, bgm_path: Path, bgm_volume: float, workdir: Path) -> Path:
    # bgm วนซ้ำ (-stream_loop -1) แล้วตัดให้พอดีความยาวพากย์เสียงจริง (-shortest), ลดวอลุ่มแยกจากเสียงพากย์
    mixed = workdir / "mixed.mp3"
    subprocess.run(
        [
            FFMPEG, "-y",
            "-i", str(narration_path),
            "-stream_loop", "-1", "-i", str(bgm_path),
            "-filter_complex", f"[1:a]volume={bgm_volume}[bgm];[0:a][bgm]amix=inputs=2:duration=first:dropout_transition=0[a]",
            "-map", "[a]",
            str(mixed),
        ],
        check=True, capture_output=True,
    )
    return mixed


def b64url(data: str) -> str:
    return base64.urlsafe_b64encode(data.encode("utf-8")).decode("ascii")


def record_video(script_text: str, durations, aspect: str, workdir: Path, gap: float, subtitle: dict) -> Path:
    width, height = (1280, 720) if aspect == "169" else (720, 1280)
    url = (
        f"{SERVER_URL}/index.html?autoplay=1&aspect={aspect}"
        f"&script={b64url(script_text)}&durations={b64url(json.dumps(durations))}"
        f"&gap={gap}"
    )
    if subtitle.get("pos"):
        url += f"&subpos={subtitle['pos']}"
    if subtitle.get("color"):
        url += f"&subcolor={subtitle['color'].lstrip('#')}"
    if subtitle.get("size"):
        url += f"&subsize={subtitle['size']}"
    if subtitle.get("weight"):
        url += f"&subweight={subtitle['weight']}"
    video_dir = workdir / "video"
    video_dir.mkdir(exist_ok=True)

    with sync_playwright() as p:
        browser = p.chromium.launch()
        context = browser.new_context(
            viewport={"width": width, "height": height},
            record_video_dir=str(video_dir),
            record_video_size={"width": width, "height": height},
        )
        page = context.new_page()
        page.goto(url)
        print("[render] กำลังเล่นและอัดภาพ...")
        page.wait_for_function("window.__renderComplete === true", timeout=0)
        time.sleep(0.5)  # กันเฟรมท้ายขาด
        context.close()
        browser.close()

    webm_files = list(video_dir.glob("*.webm"))
    if not webm_files:
        raise RuntimeError("ไม่พบไฟล์วิดีโอที่ Playwright อัดไว้")
    return webm_files[0]


def mux(video_path: Path, audio_path: Path, out_path: Path):
    subprocess.run(
        [
            FFMPEG, "-y",
            "-i", str(video_path),
            "-i", str(audio_path),
            "-c:v", "libx264", "-pix_fmt", "yuv420p",
            "-c:a", "aac",
            "-shortest",
            str(out_path),
        ],
        check=True,
    )


def main():
    ap = argparse.ArgumentParser(description="เรนเดอร์วิดีโอจากสคริปต์ซีนฝั่งเซิร์ฟเวอร์")
    ap.add_argument("script_file", help="ไฟล์ข้อความสคริปต์ซีน (ฟอร์แมตเดียวกับกล่องนำเข้าบนเว็บ)")
    ap.add_argument("--aspect", choices=["916", "169"], default="916", help="9:16 แนวตั้ง (ดีฟอลต์) หรือ 16:9 แนวนอน")
    ap.add_argument("--out", default="render-out.mp4", help="ชื่อไฟล์วิดีโอผลลัพธ์")
    ap.add_argument("--voice", default=DEFAULT_VOICE, help="ชื่อเสียง edge-tts เช่น th-TH-PremwadeeNeural (หญิง) หรือ th-TH-NiwatNeural (ชาย)")
    ap.add_argument("--rate", default="+0%", help="ปรับความเร็วเสียงพากย์ เช่น +20%% / -10%%")
    ap.add_argument("--pitch", default="+0Hz", help="ปรับโทนเสียงพากย์ เช่น +10Hz / -10Hz")
    ap.add_argument("--gap", type=float, default=0.0, help="ระยะพักเงียบระหว่างฉาก (วินาที)")
    ap.add_argument("--bgm", default=None, help="ไฟล์เพลงพื้นหลัง (mp3/wav ในเครื่อง) ถ้าต้องการ mix เข้ากับเสียงพากย์")
    ap.add_argument("--bgm-volume", type=float, default=0.25, help="ระดับเสียงเพลงพื้นหลัง 0.0-1.0 (ดีฟอลต์ 0.25)")
    ap.add_argument("--subpos", choices=["top", "bottom"], default=None, help="ตำแหน่งซับไตเติล")
    ap.add_argument("--subcolor", default=None, help="สีซับไตเติล เป็น hex 6 หลัก ไม่ต้องใส่ #")
    ap.add_argument("--subsize", type=int, default=None, help="ขนาดฟอนต์ซับไตเติล (px)")
    ap.add_argument("--subweight", default=None, help="น้ำหนักฟอนต์ซับไตเติล เช่น 400/600/800")
    args = ap.parse_args()

    script_text = Path(args.script_file).read_text(encoding="utf-8")
    rows = parse_rows(script_text)
    if not rows:
        sys.exit("ไม่พบฉากในไฟล์สคริปต์ — เช็กฟอร์แมตอีกที")

    subtitle = {"pos": args.subpos, "color": args.subcolor, "size": args.subsize, "weight": args.subweight}

    with tempfile.TemporaryDirectory(prefix="hsm_render_") as tmp:
        workdir = Path(tmp)
        print(f"[1/3] พากย์เสียงจริง {len(rows)} ฉาก...")
        audio_path, durations = build_audio_track(rows, workdir, args.voice, args.rate, args.pitch, args.gap)
        if args.bgm:
            print("[1b/3] ผสมเพลงพื้นหลัง...")
            audio_path = mix_bgm(audio_path, Path(args.bgm).resolve(), args.bgm_volume, workdir)

        print("[2/3] อัดภาพผ่านเบราว์เซอร์ headless...")
        video_path = record_video(script_text, durations, args.aspect, workdir, args.gap, subtitle)

        print("[3/3] รวมภาพ+เสียงเป็น mp4...")
        out_path = Path(args.out).resolve()
        mux(video_path, audio_path, out_path)

    print(f"เสร็จแล้ว: {out_path}")


if __name__ == "__main__":
    main()
