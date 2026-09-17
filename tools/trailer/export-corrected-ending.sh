#!/usr/bin/env bash
set -euo pipefail
cd /home/jorge/nebula-cloud/tools/trailer
export PATH=/home/jorge/.bun/bin:/home/jorge/nebula-cloud/tools/trailer/node_modules/ffmpeg-static:/home/jorge/nebula-cloud/tools/trailer/node_modules/ffprobe-static/bin/linux/x64:/usr/local/bin:/usr/bin:/bin
echo "Rendering corrected ending"
bun x --bun hyperframes@0.8.29 render renders/export-tail --workers 1 --low-memory-mode --fps 60 --quality high --output renders/nubols-tail-corrected-2k-60fps.mp4
echo "Assembling final video"
ffmpeg -hide_banner -loglevel error -threads 2 -t 64 -i renders/nubols-trailer-2k-60fps.mp4 -threads 2 -i renders/nubols-tail-corrected-2k-60fps.mp4 -filter_complex_threads 1 -filter_complex '[0:v]setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0[v]' -map '[v]' -an -c:v libx264 -threads 2 -preset fast -crf 18 -pix_fmt yuv420p -r 60 -movflags +faststart -y renders/nubols-trailer-2k-60fps-corrected.mp4
ffprobe -v error -show_entries stream=width,height,r_frame_rate,nb_frames:format=duration,size -of json renders/nubols-trailer-2k-60fps-corrected.mp4
echo "COMPLETE: renders/nubols-trailer-2k-60fps-corrected.mp4"
