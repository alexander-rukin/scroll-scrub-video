# scroll-scrub-video

Drive an HTML5 `<video>` from the scroll position: the clip does not play, its playhead is mapped
onto how far the user has scrolled. Scroll down and the video runs forward, scroll up and it
rewinds. Extracted from a production landing page and generalised so you can drop in any clip.

- 16 KB of commented vanilla JavaScript (~4 KB gzipped), no dependencies, no build step.
- Two layouts: a fixed full-screen background, or a video pinned inside a tall section.
- Scroll length is a parameter: `'120vh'`, `'900px'`, `'2screens'`, `'150%'`, or a raw number.
- Optional poster hand-off, opacity fade-out, smoothing, reduced-motion handling, iOS unlocking.

## Try it

```bash
cd scroll-scrub-video
python3 tools/serve.py 8000
```

- <http://localhost:8000/demo/> - fixed background, with live sliders for every parameter.
- <http://localhost:8000/demo/container.html> - video pinned inside a 400vh section, markup-only setup.

Use `tools/serve.py`, not `python3 -m http.server`: the stdlib server ignores HTTP Range
requests and a video served that way cannot be seeked at all. See "Serving the file" below.

## Files

```
dist/scroll-scrub-video.js       the library (script tag / CommonJS / AMD)
dist/scroll-scrub-video.esm.js   the same code as an ES module (generated)
dist/scroll-scrub-video.css      optional layout helpers for the two layouts
demo/                            two runnable examples + a demo clip
tools/build-esm.mjs              regenerates the .esm.js copy after you edit the source
tools/serve.py                   dev server with Range support, for running the demos locally
```

Only `dist/` is needed in a project. The CSS is optional - the script writes nothing but
`opacity` and `currentTime`, all positioning is yours.

## Quick start - fixed background

```html
<link rel="stylesheet" href="/js/scroll-scrub-video.css">

<!-- poster and video share one box; the overlay is a scrim on top of both -->
<img   id="scrub-poster"  class="ssv-layer ssv-poster" src="/media/poster.jpg" alt="" aria-hidden="true">
<video id="scrub-video"   class="ssv-layer" muted playsinline preload="auto" aria-hidden="true">
  <source src="/media/clip.mp4" type="video/mp4">
</video>
<div   id="scrub-overlay" class="ssv-overlay" aria-hidden="true"></div>

<!-- page content has to sit above the fixed layers -->
<div class="ssv-content"> ... your page ... </div>

<script src="/js/scroll-scrub-video.js"></script>
<script>
  var scrubber = new ScrollScrubVideo({
    video:   '#scrub-video',
    poster:  '#scrub-poster',
    overlay: '#scrub-overlay',
    scrub:   '150vh',                                  // 1.5 screens of scrolling = the whole clip
    videoOpacity: 0.5,
    fade:    { length: '50vh', videoTo: 0, overlayTo: 0.2 }   // then fade out over half a screen
  });
</script>
```

## Quick start - pinned section

The video sticks to the viewport while a tall block scrolls past; the block's height *is* the
scrub length.

```html
<div id="stage" class="ssv-stage" style="min-height:400vh">   <!-- 400vh tall = 300vh of scrubbing -->
  <div class="ssv-sticky">
    <video id="pinned" muted playsinline preload="auto">
      <source src="/media/clip.mp4" type="video/mp4">
    </video>
    <div id="pinned-overlay" class="ssv-overlay"></div>
  </div>
</div>

<script>
  new ScrollScrubVideo({
    video: '#pinned',
    overlay: '#pinned-overlay',
    mode: 'container',
    container: '#stage',
    scrub: 'auto'          // = container height minus one viewport
  });
</script>
```

## Markup-only setup

No JS call at all - the script picks up any `video[data-scroll-scrub]` on `DOMContentLoaded`:

```html
<video data-scroll-scrub
       data-scrub="200vh"
       data-poster="#scrub-poster"
       data-overlay="#scrub-overlay"
       data-video-opacity="0.5"
       data-fade-length="60vh"
       muted playsinline preload="auto">
  <source src="/media/clip.mp4" type="video/mp4">
</video>
```

Every option below except `onProgress` has a `data-` twin in kebab-case (`smooth` -> `data-smooth`,
`videoOpacity` -> `data-video-opacity`, `fade.length` -> `data-fade-length`, and so on).
Call `ScrollScrubVideo.auto()` yourself if you inject markup later.

## Options

| Option | Default | What it does |
| --- | --- | --- |
| `video` | - | **Required.** Selector or `HTMLVideoElement`. |
| `poster` | `null` | `<img>` shown until the first video frame is decoded, then crossfaded away. |
| `overlay` | `null` | Scrim element whose opacity is animated together with the video. |
| `mode` | `'fixed'` | `'fixed'` = window scroll drives it. `'container'` = a pinned block drives it. |
| `container` | `null` | The tall block, required for `mode: 'container'`. |
| `scrub` | `'120vh'` | **Scroll distance that maps to the full clip.** See units below. In container mode, `'auto'` means the block's own scroll range. |
| `start` | `0` | Offset before scrubbing begins (same units). E.g. `'50vh'` keeps frame 0 for half a screen. |
| `smooth` | `0` | `0` follows the scroll exactly. `0..0.95` = how much the playhead lags: `0.5` is subtle, `0.85-0.92` is an obvious glide. |
| `loop` | `false` | Wrap around instead of clamping at the ends. |
| `videoOpacity` | `1` | Base opacity of the video layer. |
| `overlayOpacity` | `1` | Base opacity of the overlay layer. |
| `fade` | `false` | `true`, or `{ start, length, videoTo, overlayTo }`. Fades both layers out after the scrub. `start` defaults to the end of the scrub range, `length` to `'50vh'`. |
| `posterFade` | `600` | Milliseconds of the poster to video crossfade. `0` = hard cut. |
| `respectReducedMotion` | `true` | With `prefers-reduced-motion: reduce`, hold a single frame instead of scrubbing. |
| `reducedMotionFrame` | `0` | Which frame to hold, as progress `0..1`. |
| `unlockOnTouch` | `true` | iOS: a `play()` + `pause()` on the first touch, so seeking becomes possible. |
| `onProgress` | `null` | `function (progress /* 0..1 */, instance)`, called on every committed frame. |

### Units for `scrub`, `start`, `fade.start`, `fade.length`

| Written as | Means |
| --- | --- |
| `900` or `'900px'` | 900 pixels of scrolling |
| `'120vh'` or `'120%'` | 120% of the viewport height |
| `'80vw'` | 80% of the viewport width |
| `'1.5screens'` | 1.5 viewport heights |
| `'auto'` | container mode only: the block's height minus one viewport |

Viewport-relative values are re-measured on `resize` and `orientationchange`.

**Rule of thumb.** `scrub` is about how the page *feels*, not about the clip's duration - the clip
is stretched to fit. Around `100vh`-`150vh` reads as "the hero animates while you leave it";
`300vh`+ turns the clip into a slow storytelling sequence. Longer ranges are also more forgiving
of a low frame rate, because every source frame gets more scroll pixels.

## API

```js
var s = new ScrollScrubVideo({ ... });

s.progress;    // current position, 0..1
s.update();    // recompute from the current scroll position
s.refresh();   // re-measure lengths after a layout change, then update
s.destroy();   // remove every listener

ScrollScrubVideo.auto(root);   // init all [data-scroll-scrub] videos under root
ScrollScrubVideo.version;
ScrollScrubVideo.defaults;
```

ES module build:

```js
import ScrollScrubVideo from './scroll-scrub-video.esm.js';
```

It is generated from the UMD file - after editing the source, run `node tools/build-esm.mjs`.

## Preparing the clip (this is what makes it smooth)

Scrubbing seeks to arbitrary timestamps, and a browser can only seek cheaply to a keyframe.
A normal web export has one keyframe every 2-10 seconds, so scrubbing it stutters. Re-encode
the clip **all-intra** (every frame is a keyframe):

```bash
ffmpeg -i source.mov \
  -an \
  -vf "scale=1280:-2,fps=25" \
  -c:v libx264 -crf 28 -preset slow \
  -g 1 -keyint_min 1 -sc_threshold 0 \
  -pix_fmt yuv420p \
  -movflags +faststart \
  clip.mp4
```

- `-g 1 -keyint_min 1 -sc_threshold 0` is the important part: a keyframe on every frame, so any
  timestamp is reachable without decoding a run of intermediate frames.
- `-an` drops the audio track - it is muted anyway and only adds bytes.
- `-movflags +faststart` moves the metadata to the front so the browser can start decoding early.
- `scale=1280:-2,fps=25` is a sane background-layer target; see the budget below.

Practical budget:

- **Duration 4-8 s.** Longer clips buy you nothing: the scroll range is what the viewer feels.
- **25 fps** is enough; 30 fps if the motion is fast. All-intra at 60 fps is a waste of bytes.
- **720p-1080p wide** for a background layer, `crf` 26-30. Aim for under ~2 MB - all-intra files
  are roughly 3-5x larger than a normal encode, so keep dimensions and duration modest.
- Also export a **poster JPEG of frame 0** (`ffmpeg -i clip.mp4 -frames:v 1 poster.jpg`) and pass
  it as `poster`. It covers the gap before the video is decodable and removes the first-paint flash.
- A WebM/VP9 source can be added as a second `<source>`, but keep the MP4 first for Safari.

## Serving the file

Seeking only works if the server answers **HTTP Range requests** (`206 Partial Content`).
If it does not, `video.seekable` comes back empty, every seek is silently ignored, and the
effect looks half-broken: opacity and progress react to scrolling, the picture stays on frame 0.

- nginx, Caddy, Apache, Vercel, Netlify, S3/CloudFront and every normal CDN do this by default.
- `python3 -m http.server` and a few minimal Node dev servers do **not**. That is what
  `tools/serve.py` in this package is for.
- If the clip sits behind a proxy or an auth layer, check that `Accept-Ranges: bytes` survives it.
- `file://` works in Chrome but not reliably elsewhere - test over HTTP.

## Browser notes

- **iOS Safari** will not decode or seek a video before some user interaction in several versions.
  `unlockOnTouch` handles it by firing a muted `play()` + `pause()` on the first touch or click.
  The video must be `muted` and `playsinline` - the script enforces both.
- **iOS Low Power Mode** blocks video decoding almost entirely. If the poster is present, that is
  what the user keeps seeing, which is why passing `poster` is recommended rather than optional.
- **Safari** repaints `position: fixed` layers aggressively; the CSS promotes them with
  `transform: translateZ(0)`, which is what keeps the background from flickering while scrolling.
- **Android/older devices**: seeking cost scales with resolution. If it feels heavy, halve the
  resolution before touching anything else.
- The script never calls `play()` for playback, so autoplay policies do not apply.

## How it works

1. A passive `scroll` listener converts the scroll position into progress `0..1`.
2. Progress is written inside a single `requestAnimationFrame` per frame - scroll events are
   coalesced, so a fast wheel or a trackpad flick never queues up dozens of seeks.
3. `video.currentTime = progress * duration` (guarded until `duration` is known, and clamped just
   short of the end so the browser does not fire `ended` and rewind).
4. Opacities are computed from the same scroll offset, so the initial state can be applied
   synchronously at init - reloading halfway down the page does not flash the video.

## License

MIT.
