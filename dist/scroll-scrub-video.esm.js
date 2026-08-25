/*!
 * scroll-scrub-video v1.0.0
 * Scrub an HTML5 <video> with the scroll position.
 * No dependencies, no build step. Works as a global, CommonJS or ES module (see .esm.js).
 * MIT License.
 */
/* Generated from scroll-scrub-video.js by tools/build-esm.mjs - do not edit by hand. */

var DEFAULTS = {
    // --- elements ---
    video: null,            // required: CSS selector or HTMLVideoElement
    poster: null,           // optional: <img> shown until the first video frame is decoded
    overlay: null,          // optional: tint/scrim element that fades together with the video

    // --- where the scrubbing happens ---
    mode: 'fixed',          // 'fixed'     - video is a fixed background, driven by window scroll
                            // 'container' - video is pinned inside `container`, driven by that block
    container: null,        // required for mode:'container' (selector or element)

    // --- how long the scrub lasts ---
    // Accepts: number (px) | '900px' | '120vh' | '80vw' | '150%' (of viewport height) | '1.5screens'
    // In mode:'container', 'auto' = the container's own scroll range (height - viewport height).
    scrub: '120vh',
    start: 0,               // extra offset before scrubbing begins (same units as `scrub`)

    // --- feel ---
    smooth: 0,              // 0 = follow the scroll exactly. 0..0.95 = how much the playhead
                            // lags behind: 0.5 is subtle, 0.85 - 0.92 is an obvious glide.
    loop: false,            // true = wrap around instead of clamping at both ends

    // --- opacity ---
    videoOpacity: 1,        // base opacity of the video layer
    overlayOpacity: 1,      // base opacity of the overlay layer

    // Fade the video (and overlay) out after the scrub is done.
    // false | true (shorthand) | { start, length, videoTo, overlayTo }
    // `start` and `length` use the same units as `scrub`; `start` defaults to the end of the scrub.
    fade: false,

    // --- misc ---
    posterFade: 600,        // ms of the poster -> video crossfade (0 disables the transition)
    respectReducedMotion: true, // freeze on `reducedMotionFrame` when the OS asks for less motion
    reducedMotionFrame: 0,  // progress 0..1 to hold in that case
    unlockOnTouch: true,    // iOS: play()+pause() on the first touch so seeking works
    onProgress: null        // function (progress /*0..1*/, instance) {}
  };

  var RM_QUERY = '(prefers-reduced-motion: reduce)';

  function el(target, ctx) {
    if (!target) return null;
    if (typeof target === 'string') return (ctx || document).querySelector(target);
    return target.nodeType === 1 ? target : null;
  }

  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }

  /**
   * Turn a length option into pixels.
   * number -> px, '900px', '120vh', '80vw', '150%' (of viewport height), '1.5screens'.
   */
  function toPx(value, fallback) {
    if (value == null || value === '') return fallback || 0;
    if (typeof value === 'number') return value;
    var m = String(value).trim().match(/^(-?[\d.]+)\s*(px|vh|vw|%|screens?|s)?$/i);
    if (!m) return fallback || 0;
    var n = parseFloat(m[1]);
    var unit = (m[2] || 'px').toLowerCase();
    if (unit === 'px') return n;
    if (unit === 'vh' || unit === '%') return n / 100 * window.innerHeight;
    if (unit === 'vw') return n / 100 * window.innerWidth;
    return n * window.innerHeight; // screens / screen / s
  }

  function ScrollScrubVideo(options) {
    if (!(this instanceof ScrollScrubVideo)) return new ScrollScrubVideo(options);

    var o = {};
    for (var k in DEFAULTS) if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)) o[k] = DEFAULTS[k];
    for (var j in options || {}) if (Object.prototype.hasOwnProperty.call(options, j)) o[j] = options[j];

    this.options = o;
    this.video = el(o.video);
    this.poster = el(o.poster);
    this.overlay = el(o.overlay);
    this.container = el(o.container);
    this.progress = 0;

    if (!this.video || this.video.tagName !== 'VIDEO') {
      if (window.console) console.warn('[scroll-scrub-video] no <video> found for', o.video);
      return;
    }
    if (o.mode === 'container' && !this.container) {
      if (window.console) console.warn('[scroll-scrub-video] mode:"container" needs a container element');
      return;
    }

    this._reduced = o.respectReducedMotion &&
      window.matchMedia && window.matchMedia(RM_QUERY).matches;

    this._setupVideo();
    this._measure();
    this._bind();

    // Apply the correct state synchronously, before any frame is painted. This is what
    // prevents the classic "reload halfway down the page and the video flashes at full
    // opacity for a moment" glitch.
    this.update(true);
    this._watchPoster();
  }

  ScrollScrubVideo.prototype = {

    constructor: ScrollScrubVideo,

    // ---------------------------------------------------------------- setup

    _setupVideo: function () {
      var v = this.video;
      v.muted = true;                       // required for programmatic control on mobile
      v.defaultMuted = true;
      v.autoplay = false;
      v.controls = false;
      v.playsInline = true;
      v.setAttribute('muted', '');
      v.setAttribute('playsinline', '');
      v.setAttribute('webkit-playsinline', '');
      if (!v.getAttribute('preload')) v.preload = 'auto';
      try { v.pause(); } catch (e) {}
      // Safari sometimes needs an explicit load() when the source came from markup.
      try { v.load(); } catch (e) {}
    },

    _measure: function () {
      var o = this.options;
      var vh = window.innerHeight;

      this.startPx = toPx(o.start, 0);

      if (o.mode === 'container') {
        var auto = Math.max(1, this.container.offsetHeight - vh);
        this.scrubPx = (o.scrub === 'auto' || o.scrub == null)
          ? auto
          : Math.max(1, toPx(o.scrub, auto));
      } else {
        this.scrubPx = Math.max(1, toPx(o.scrub, vh * 1.2));
      }

      var f = o.fade;
      if (!f) {
        this.fadeCfg = null;
      } else {
        if (f === true) f = {};
        this.fadeCfg = {
          start: f.start != null ? toPx(f.start, 0) : (this.startPx + this.scrubPx),
          length: Math.max(1, toPx(f.length != null ? f.length : '50vh', vh * 0.5)),
          videoTo: f.videoTo != null ? f.videoTo : 0,
          overlayTo: f.overlayTo != null ? f.overlayTo : 0
        };
      }
    },

    _bind: function () {
      var self = this;

      this._onScroll = function () { self.update(); };
      this._onResize = function () { self._measure(); self.update(true); };
      this._onMeta = function () { self.update(true); };

      window.addEventListener('scroll', this._onScroll, { passive: true });
      window.addEventListener('resize', this._onResize, { passive: true });
      window.addEventListener('orientationchange', this._onResize, { passive: true });
      this.video.addEventListener('loadedmetadata', this._onMeta);

      if (this.options.unlockOnTouch) {
        this._unlock = function () {
          var p = self.video.play();
          if (p && p.then) p.then(function () { self.video.pause(); }).catch(function () {});
          else { try { self.video.pause(); } catch (e) {} }
          window.removeEventListener('touchstart', self._unlock);
          window.removeEventListener('click', self._unlock);
        };
        window.addEventListener('touchstart', this._unlock, { passive: true, once: true });
        window.addEventListener('click', this._unlock, { once: true });
      }
    },

    // ------------------------------------------------------------ the maths

    /** Scroll distance travelled along the scrub axis, in px. */
    _offset: function () {
      if (this.options.mode === 'container') {
        return -this.container.getBoundingClientRect().top;
      }
      return window.pageYOffset || document.documentElement.scrollTop || 0;
    },

    _progressFor: function (offset) {
      var raw = (offset - this.startPx) / this.scrubPx;
      if (this.options.loop) return ((raw % 1) + 1) % 1;
      return clamp(raw, 0, 1);
    },

    _opacityFor: function (offset) {
      var o = this.options;
      var out = { video: o.videoOpacity, overlay: o.overlayOpacity };
      var f = this.fadeCfg;
      if (!f) return out;
      var t = clamp((offset - f.start) / f.length, 0, 1);
      out.video = o.videoOpacity + (f.videoTo - o.videoOpacity) * t;
      out.overlay = o.overlayOpacity + (f.overlayTo - o.overlayOpacity) * t;
      return out;
    },

    // ------------------------------------------------------------- updating

    /**
     * Recompute the target state from the current scroll position.
     * @param {boolean} immediate skip smoothing and write the value right away
     */
    update: function (immediate) {
      var offset = this._offset();
      var op = this._opacityFor(offset);

      this._targetProgress = this._reduced
        ? clamp(this.options.reducedMotionFrame, 0, 1)
        : this._progressFor(offset);

      this._targetVideoOp = op.video;
      this._targetOverlayOp = op.overlay;

      if (immediate || !this.options.smooth || this._reduced) {
        this.progress = this._targetProgress;
        this._write();
      } else if (!this._rafId) {
        this._tick();
      }
      return this;
    },

    _tick: function () {
      var self = this;
      var s = clamp(this.options.smooth, 0, 0.99);
      var delta = this._targetProgress - this.progress;

      // Lerp toward the target; snap and stop once the difference is sub-frame.
      if (Math.abs(delta) < 0.0005) {
        this.progress = this._targetProgress;
        this._write();
        this._rafId = 0;
        return;
      }
      this.progress += delta * Math.max(1 - s, 0.02);
      this._write();
      this._rafId = requestAnimationFrame(function () { self._tick(); });
    },

    /** Push the current state onto the DOM. Always inside a rAF for scroll-driven writes. */
    _write: function () {
      var self = this;
      if (this._writePending) return;
      this._writePending = true;
      requestAnimationFrame(function () {
        self._writePending = false;
        self._commit();
      });
    },

    _commit: function () {
      var v = this.video;
      var d = v.duration;

      if (!isNaN(d) && d > 0) {
        var t = this.progress * d;
        // Keep away from the very last frame: some browsers fire `ended` and reset.
        if (t >= d) t = d - 0.001;
        if (t < 0) t = 0;
        if (Math.abs(v.currentTime - t) > 0.001) {
          try { v.currentTime = t; } catch (e) {}
        }
      }

      v.style.opacity = this._targetVideoOp;
      if (this.poster && this._posterVisible) this.poster.style.opacity = this._targetVideoOp;
      if (this.overlay) this.overlay.style.opacity = this._targetOverlayOp;

      if (typeof this.options.onProgress === 'function') {
        this.options.onProgress(this.progress, this);
      }
    },

    // -------------------------------------------------------------- poster

    _watchPoster: function () {
      var self = this;
      var v = this.video;
      this._posterVisible = !!this.poster;
      if (!this.poster) return;

      this.poster.style.opacity = this._targetVideoOp;

      this._onData = function () {
        if (!self._posterVisible) return;
        self._posterVisible = false;
        var ms = self._reduced ? 0 : self.options.posterFade;
        if (ms > 0) {
          v.style.transition = 'opacity ' + ms + 'ms ease';
          self.poster.style.transition = 'opacity ' + ms + 'ms ease';
        }
        v.style.opacity = self._targetVideoOp;
        self.poster.style.opacity = 0;
        setTimeout(function () {
          v.style.transition = '';
          if (self.poster) {
            self.poster.style.transition = '';
            self.poster.style.display = 'none';
          }
        }, ms + 100);
      };
      v.addEventListener('loadeddata', this._onData);
      if (v.readyState >= 2) this._onData();
    },

    // ------------------------------------------------------------ lifecycle

    /** Re-measure after the layout changed (fonts, dynamic content, container resize). */
    refresh: function () { this._measure(); this.update(true); return this; },

    destroy: function () {
      window.removeEventListener('scroll', this._onScroll);
      window.removeEventListener('resize', this._onResize);
      window.removeEventListener('orientationchange', this._onResize);
      if (this._unlock) {
        window.removeEventListener('touchstart', this._unlock);
        window.removeEventListener('click', this._unlock);
      }
      if (this.video) {
        this.video.removeEventListener('loadedmetadata', this._onMeta);
        if (this._onData) this.video.removeEventListener('loadeddata', this._onData);
      }
      if (this._rafId) cancelAnimationFrame(this._rafId);
      this._rafId = 0;
      return this;
    }
  };

  // ------------------------------------------------------- declarative init

  var CAMEL = {
    scrub: 'scrub', start: 'start', mode: 'mode', container: 'container',
    poster: 'poster', overlay: 'overlay', smooth: 'smooth', loop: 'loop',
    videoOpacity: 'videoOpacity', overlayOpacity: 'overlayOpacity',
    fade: 'fade', fadeStart: 'fadeStart', fadeLength: 'fadeLength',
    fadeVideoTo: 'fadeVideoTo', fadeOverlayTo: 'fadeOverlayTo',
    posterFade: 'posterFade', reducedMotionFrame: 'reducedMotionFrame',
    respectReducedMotion: 'respectReducedMotion', unlockOnTouch: 'unlockOnTouch'
  };

  function num(v) { var n = parseFloat(v); return isNaN(n) ? undefined : n; }
  function bool(v) { return v === '' || v === 'true' || v === '1'; }

  /**
   * Initialise every `[data-scroll-scrub]` video on the page:
   *   <video data-scroll-scrub data-scrub="150vh" data-overlay="#tint" data-video-opacity="0.5">
   */
  ScrollScrubVideo.auto = function (root) {
    var nodes = (root || document).querySelectorAll('video[data-scroll-scrub]');
    var made = [];
    for (var i = 0; i < nodes.length; i++) {
      var n = nodes[i], d = n.dataset, opts = { video: n };
      if (d[CAMEL.scrub]) opts.scrub = d[CAMEL.scrub];
      if (d[CAMEL.start]) opts.start = d[CAMEL.start];
      if (d[CAMEL.mode]) opts.mode = d[CAMEL.mode];
      if (d[CAMEL.container]) opts.container = d[CAMEL.container];
      if (d[CAMEL.poster]) opts.poster = d[CAMEL.poster];
      if (d[CAMEL.overlay]) opts.overlay = d[CAMEL.overlay];
      if (d[CAMEL.smooth] != null) opts.smooth = num(d[CAMEL.smooth]);
      if (d[CAMEL.loop] != null) opts.loop = bool(d[CAMEL.loop]);
      if (d[CAMEL.videoOpacity] != null) opts.videoOpacity = num(d[CAMEL.videoOpacity]);
      if (d[CAMEL.overlayOpacity] != null) opts.overlayOpacity = num(d[CAMEL.overlayOpacity]);
      if (d[CAMEL.posterFade] != null) opts.posterFade = num(d[CAMEL.posterFade]);
      if (d[CAMEL.reducedMotionFrame] != null) opts.reducedMotionFrame = num(d[CAMEL.reducedMotionFrame]);
      if (d[CAMEL.respectReducedMotion] != null) opts.respectReducedMotion = bool(d[CAMEL.respectReducedMotion]);
      if (d[CAMEL.unlockOnTouch] != null) opts.unlockOnTouch = bool(d[CAMEL.unlockOnTouch]);

      if (d[CAMEL.fade] != null || d[CAMEL.fadeStart] || d[CAMEL.fadeLength] ||
          d[CAMEL.fadeVideoTo] != null || d[CAMEL.fadeOverlayTo] != null) {
        opts.fade = {};
        if (d[CAMEL.fadeStart]) opts.fade.start = d[CAMEL.fadeStart];
        if (d[CAMEL.fadeLength]) opts.fade.length = d[CAMEL.fadeLength];
        if (d[CAMEL.fadeVideoTo] != null) opts.fade.videoTo = num(d[CAMEL.fadeVideoTo]);
        if (d[CAMEL.fadeOverlayTo] != null) opts.fade.overlayTo = num(d[CAMEL.fadeOverlayTo]);
      }
      made.push(new ScrollScrubVideo(opts));
    }
    return made;
  };

  ScrollScrubVideo.version = '1.0.0';
  ScrollScrubVideo.defaults = DEFAULTS;

  // Auto-run for the markup-only integration path.
  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () { ScrollScrubVideo.auto(); });
    } else {
      ScrollScrubVideo.auto();
    }
  }

export default ScrollScrubVideo;
export { ScrollScrubVideo };
