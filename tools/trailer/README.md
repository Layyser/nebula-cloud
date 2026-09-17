# Nubols trailer

Silent 69.46-second HyperFrames timeline, 1920×1080 at 60 fps.
The Hooks scene also has its own 3.4-second composition (`hooks.html`), with no
intro/outro transition; export it independently for the later final assembly.

Run inside WSL with Bun on PATH:

```sh
cd /home/jorge/nebula-cloud/tools/trailer
bun install
bun run build
bun run preview
bun run render
```

The render is `renders/nubols-assembled-60fps.mp4`. Studio previews the generated
`dist` folder; make lasting changes in `index.html`, `style.css`, or `scene.tsx`,
then rebuild. Fonts and assets are bundled so rendering needs no network.

## Original building-block timing (before assembly)

- 0.20–2.17s: “Imagine your agent was always there.”, one word per beat.
- 3.38–3.98s: reusable downward camera cut, handing off at 3.62s to the
  graphite shader. No custom title lift or opacity fade-out.
- 4.45s: Meet appears; at 5.55s the aligned logo and wordmark appear together.
- 6.30–8.40s: hold with a subtle push in.
- 8.40–13.20s: real ChatInput and heading inside a 1600×880 framed window,
  with blue–lilac backdrop visible on all sides, a 1.8× readable composer,
  shader inside the frame, and the existing cursor hover/press sequence.
- 8.95–10.90s: camera pans right across the input, without changing zoom.
- 8.95–10.75s: scripted prompt typing; the real input handler updates its send button.
- 10.95–11.60s: cursor approaches an off-center target on Send, becoming a
  pointer as its tip crosses the rounded button boundary.
- 11.75–12.10s: gentle press and release, with the real button hover color.
  This is a visual-only click; it does not submit a request.
- 13.20–15.44s: “Take control. Anytime.” appears word by word over the shader,
  using the opening title's typography and reveal animation.
  “control.” starts at 13.76s and “Anytime.” at 14.54s for a longer sentence beat.
- 15.20–15.80s: downward camera cut from the title into the sidebar, cutting
  at 15.44s. Its cubic incoming movement is the sidebar's only vertical scroll.
- 15.44–17.11s: sidebar study over a blue–lilac backdrop. The
  expanded production Sidebar is rendered with mock sessions and callbacks.
  Hover steps downward through the navigation; Terminal squashes on press,
  and its content pane switches from the original shader to plain black at 16.65s.
  Camera scale stays fixed at 2.94×; hover shares the incoming camera's 0.36s
  cubic easing and start time. Both stop at 15.80s, followed by a 0.73s pause.
  Scene implementation lives in `sidebar-scene.tsx` and `sidebar-scene.css` so
  it can be moved independently without changing the completed opening.
- 16.87–17.47s: accelerate the camera right, hard cut at 17.11s, then
  decelerate into the terminal with continuous apparent velocity.
- 17.11–21.85s: the real TerminalPage in offline preview mode: two open tabs,
  commands typed character by character, with ANSI-colored output following
  each completed command, no title card. The preview driver resets/replays the
  real xterm buffer when seeking, without changing the production component.
  ANSI cursor hiding is reapplied after every reset to omit the typing caret.

## Agent working study

At 36.35s, a separate 9.5s scene continues the release-summary request using
the real `MessageBubble` and its `ToolCallCard`/Markdown renderer. Scripted
`ContentBlock` fixtures inspect a diff, run file reading and tests in parallel,
write release notes, then display a Markdown summary. Tool results are omitted
while pending and supplied at completion, matching the real protocol. The
original tool sheen is driven by timeline time for repeatable seeking. No tools
execute, and no change IDs or backend requests are used. The standalone scene
is `working-dist`, exported to `renders/nubols-agent-working.mp4`.

## Hooks carousel

The matching “Make it yours.” carousel follows at 28.25s: Skills → Agents →
Commands → Rules. It imports the shared capability metadata icons and the app's
Bot icon, with each label/icon pair moving together. `yours-dist` is its separate
8.1-second composition, exported to `renders/nubols-make-it-yours.mp4`.

At 21.85s the preview shows the independent “Connect hooks from” scene. The
lead-in types word by word; each company name and its original landing SVG
appear and move as one unit. GitHub → Telegram → Gmail scroll upward with
0.48s crossfades. GitHub is white; the other logos retain their original colors.
The fixed-width masked slot avoids moving the sentence as company widths change.

`hooks-scene.ts` is shared by the combined preview and `hooks-entry.ts`.
`shader-renderer.ts` shares the original shader adapter without duplicating it.
Export only this clip with the existing ffmpeg tools on PATH:

```sh
bun x --bun hyperframes@0.8.29 render hooks-dist --workers 1 --fps 30 --output renders/nubols-hooks.mp4
```

## Assembled trailer (69.46 seconds)

Scene boundaries live in `assembly.tsx` (`EDIT`). The release-summary prompt
and working study are omitted from this cut; standalone studies remain available.

| Start | Scene |
| --- | --- |
| 0 | Imagine your agent was always there |
| 3.62 | Meet Nubols (static size; identity appears at 4.85s) |
| 6 | GitHub / Telegram / Gmail hooks |
| 9.4 | Incoming email and CV review with HR |
| 19.4 | Deploy anything: PostgreSQL / Redis / Bun |
| 23.2 | Redis prompt and localhost deployment |
| 33.45 | Take control. Anytime. |
| 35.69 | Sidebar hover and Terminal click |
| 37.36 | Two tabs: git status --short, then bun test |
| 40.86 | Install anything: Python / Node.js / Java |
| 44.66 | And also, have fun |
| 48.46 | Minecraft prompt, installation and invitation |
| 60.46 | Six-second gameplay placeholder |
| 66.46 | Nubols shader finish |
| 69.46 | End |

Logo holds are shortened; carousel swaps retain their 0.48s motion and titles
retain punctuation pauses. The first concrete example starts at 9.4s.
This edit is timeline-only; existing MP4 files are from older cuts.

`scripted-chat.tsx` shares the prompt/send/response flow between Redis and
Minecraft using production components. All conversations and deployments are
offline fixtures. Replace the gameplay placeholder with supplied footage later.

## Reusable camera cut

`camera-cut.ts` exports `addCameraCut`. Pass source/destination scene selectors,
unscaled camera-wrapper selectors, a start time, and `right`, `left`, `up`, or
`down`. Distance and half-duration are configurable (300px / 0.24s here).
Quadratic acceleration and a 1.5× longer cubic deceleration have matching
velocity at the cut (2500px/s here), with a softer zero-acceleration finish.
The sidebar hover uses the same start, duration, and easing as its vertical
camera movement. The terminal scene is edge-to-edge black, without a frame.
Keep framing/zoom on elements inside the camera wrappers. The helper changes
only translation and scene visibility; it never crossfades or changes scale.
Title shaders share `.title-shader`: a centered 1920×1080 plane scaled uniformly
by 1.6, preserving 16:9. This adds 576px horizontal and 324px vertical overscan
on each side for both incoming and outgoing 300px cuts, in every direction.
Increase the uniform scale if a future cut exceeds those margins; never stretch
one axis independently. Scene clipping happens outside the moving camera.
Run `bun test camera-cut.test.ts` to check direction and velocity contracts.

Export regressions: sidebar framing belongs in CSS (available before its first
frame), and its shader is primed before the cut. The build-only xterm adapter
uses the pinned package's synchronous parser and render service to avoid
capturing a cleared buffer before an asynchronous write completes. Recheck this
adapter when upgrading xterm. `TRAILER_PROOF=1 bun run build` also generates
`proof-dist`, an eight-second export regression clip spanning 35–43s. Render it
at 60 fps before a full export when changing these scenes.

`addZoomCut` uses the same quadratic exit and cubic arrival on camera scale.
Use direction `in` or `out`. The incoming scale continues the outgoing direction
and comes smoothly to rest. Tests check matching normalized scale velocities.

## Existing design sources

- `NebulaMark` is imported directly from nebula-frontend, including its SVG.
- `ChatInput` is imported directly, with mock callbacks and the real model/security controls.
- `Sidebar` is imported directly; trailer-only attributes drive deterministic
  hover and press states without making runtime requests.
- `TerminalPage` is imported directly from Cloud with `previewOutput`, which
  bypasses WebSocket creation. The real xterm parses the fixture's ANSI colors;
  no commands run. Consolas is bundled from this host for stable terminal text.
- Compiled app Tailwind CSS and semantic tokens come from `apps/web/dist/assets`.
  Rebuild Cloud before the trailer if shared component classes change.
- GLSL vertex/fragment sources are imported directly from nebula-frontend.
- The wordmark CSS is extracted from the existing shared stylesheet at build time.
- Segoe UI is bundled from this Windows host, matching the app's Windows font.
- Courier Prime is the app's existing wordmark font, downloaded at build time.
  Generated local font copies and renders are ignored by Git.

The shader needs a small rendering adapter because its app component uses a
real-time clock. Here GSAP's seekable timeline drives the original shader.
No shader requestAnimationFrame loop, API requests, or live agent execution are used.
Later chat scenes should render authored Markdown/tool fixtures through the
existing shared components.
