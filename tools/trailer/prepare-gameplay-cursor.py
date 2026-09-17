"""Track the recorded setup pointer and remove it for the shared SVG overlay.
Only the six-second derived clip is processed; the original recording is untouched.
"""
import cv2
import json
import subprocess

cv2.setNumThreads(2)
templates = [
    ("arrow", cv2.imread("renders/minecraft-pointer-detail.png")[514:532, 951:964]),
    ("hand", cv2.imread("renders/minecraft-arrow-detail.png")[791:807, 936:951]),
]
templates = [(kind, cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)) for kind, img in templates]
cap = cv2.VideoCapture("renders/minecraft-normal-speed.mp4")
encoder = subprocess.Popen([
    "node_modules/ffmpeg-static/ffmpeg", "-hide_banner", "-loglevel", "error",
    "-f", "rawvideo", "-pix_fmt", "bgr24", "-s", "1920x1080", "-r", "60",
    "-i", "-", "-an", "-c:v", "libx264", "-threads", "2", "-preset", "fast",
    "-crf", "19", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
    "-y", "renders/minecraft-cursor-clean.mp4",
], stdin=subprocess.PIPE)
track = []
frame_index = 0
while True:
    ok, frame = cap.read()
    if not ok:
        break
    if frame_index < 180:
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        candidates = []
        for kind, template in templates:
            scores = cv2.matchTemplate(gray, template, cv2.TM_CCOEFF_NORMED)
            _, score, _, location = cv2.minMaxLoc(scores)
            candidates.append((score, location, kind, template.shape))
        score, (x, y), kind, (h, w) = max(candidates)
        if score > .72:
            track.append(dict(t=frame_index / 60, x=x + w/2, y=y + h/2, kind=kind, score=round(score, 3)))
            # Small local repair; no UI text or unrelated regions are masked.
            mask = cv2.inRange(gray, 256, 256)
            mask[max(0,y-1):y+h+1, max(0,x-1):x+w+1] = 255
            frame = cv2.inpaint(frame, mask, 3, cv2.INPAINT_TELEA)
    encoder.stdin.write(frame.tobytes())
    frame_index += 1
cap.release()
encoder.stdin.close()
if encoder.wait() != 0:
    raise RuntimeError("Cursor-clean clip encoding failed")
with open("renders/minecraft-cursor-track.json", "w") as output:
    json.dump(track, output)
print(f"Tracked {len(track)} / 180 setup frames")
print(track[::20])
