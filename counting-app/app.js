/* Kids Counting Voice App
 * Shows a big number; the child says it out loud. Correct answers advance the
 * count up or down (toggle at the bottom). Pure static app, no dependencies. */

(function () {
  "use strict";

  const MIN = 1;
  const MAX = 100;

  // ---- State ----
  const state = {
    current: MIN,
    direction: "up", // "up" | "down"
    listening: false,
    started: false,
    celebrating: false,
  };

  // ---- DOM ----
  const app = document.getElementById("app");
  const numberDisplay = document.getElementById("numberDisplay");
  const statusText = document.getElementById("statusText");
  const micDot = document.getElementById("micDot");
  const micMeterFill = document.getElementById("micMeterFill");
  const startOverlay = document.getElementById("startOverlay");
  const startButton = document.getElementById("startButton");
  const supportHint = document.getElementById("supportHint");
  const celebrateOverlay = document.getElementById("celebrateOverlay");
  const upButton = document.getElementById("upButton");
  const downButton = document.getElementById("downButton");
  const confetti = document.getElementById("confetti");

  // ============================================================
  //  Word -> number parsing (0..100)
  // ============================================================
  // Includes common speech-recognition homophones/mishears so quiet or
  // slightly-garbled answers still count.
  const ONES = {
    zero: 0, oh: 0, "o": 0,
    one: 1, won: 1, wun: 1,
    two: 2, to: 2, too: 2, tu: 2,
    three: 3, free: 3, tree: 3, thee: 3,
    four: 4, for: 4, fore: 4,
    five: 5, fife: 5, fives: 5,
    six: 6, sicks: 6, sex: 6,
    seven: 7, sebben: 7,
    eight: 8, ate: 8, ait: 8,
    nine: 9, niner: 9,
  };
  const TEENS = {
    ten: 10, tin: 10, tan: 10,
    eleven: 11, twelve: 12,
    thirteen: 13, fourteen: 14, fifteen: 15, fifteens: 15,
    sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  };
  const TENS = {
    twenty: 20, twenny: 20,
    thirty: 30, dirty: 30, thirsty: 30,
    forty: 40, fourty: 40,
    fifty: 50, fitty: 50,
    sixty: 60, seventy: 70, eighty: 80, ninety: 90, ninty: 90,
  };

  /**
   * Extract every number (0..100) mentioned in a transcript.
   * Handles digits ("23"), and words ("twenty three", "one hundred").
   * Returns an array of integers found.
   */
  function extractNumbers(text) {
    const found = [];
    const cleaned = text
      .toLowerCase()
      .replace(/-/g, " ") // twenty-three -> twenty three
      .replace(/[^a-z0-9\s]/g, " ");
    const tokens = cleaned.split(/\s+/).filter(Boolean);

    let acc = null; // accumulator for an in-progress worded number

    const flush = () => {
      if (acc !== null) {
        found.push(acc);
        acc = null;
      }
    };

    for (const tok of tokens) {
      // Bare digits
      if (/^\d+$/.test(tok)) {
        flush();
        found.push(parseInt(tok, 10));
        continue;
      }
      if (tok in TENS) {
        // "twenty" then maybe "three"
        flush();
        acc = TENS[tok];
      } else if (tok in TEENS) {
        flush();
        found.push(TEENS[tok]);
      } else if (tok in ONES) {
        if (acc !== null && acc % 10 === 0 && acc >= 20) {
          // tens + ones, e.g. twenty + three
          found.push(acc + ONES[tok]);
          acc = null;
        } else {
          flush();
          found.push(ONES[tok]);
        }
      } else if (tok === "hundred") {
        // "one hundred" -> previous found 1 becomes 100
        if (found.length && found[found.length - 1] === 1) {
          found[found.length - 1] = 100;
        } else {
          flush();
          found.push(100);
        }
      } else {
        // unknown word breaks any tens accumulation
        flush();
      }
    }
    flush();
    return found.filter((n) => n >= 0 && n <= MAX);
  }

  // ============================================================
  //  Sound effects (Web Audio API)
  // ============================================================
  let audioCtx = null;
  function getAudio() {
    if (!audioCtx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (Ctx) audioCtx = new Ctx();
    }
    if (audioCtx && audioCtx.state === "suspended") audioCtx.resume();
    return audioCtx;
  }

  function tone(freq, startAt, duration, type, peak) {
    const ctx = getAudio();
    if (!ctx) return;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type || "sine";
    osc.frequency.value = freq;
    const t = ctx.currentTime + startAt;
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(peak || 0.3, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  function playDing() {
    // happy rising two-note chime
    tone(660, 0, 0.18, "triangle", 0.35);
    tone(990, 0.12, 0.25, "triangle", 0.35);
  }

  function playBuzz() {
    // gentle low "try again"
    tone(196, 0, 0.22, "sawtooth", 0.18);
  }

  function playFanfare() {
    const notes = [523, 659, 784, 1047]; // C E G C
    notes.forEach((f, i) => tone(f, i * 0.15, 0.4, "triangle", 0.32));
  }

  // ============================================================
  //  Display + feedback
  // ============================================================
  function render() {
    numberDisplay.textContent = String(state.current);
  }

  function flash(kind) {
    const cls = kind === "correct" ? "flash-correct" : "flash-wrong";
    const anim = kind === "correct" ? "bump" : "shake";
    app.classList.add(cls);
    numberDisplay.classList.add(anim);
    setTimeout(() => {
      app.classList.remove(cls);
      numberDisplay.classList.remove(anim);
    }, 350);
  }

  function setStatus(msg) {
    statusText.textContent = msg;
  }

  // ============================================================
  //  Game logic
  // ============================================================
  function step() {
    return state.direction === "up" ? 1 : -1;
  }

  function startValue() {
    return state.direction === "up" ? MIN : MAX;
  }

  function atEnd() {
    return state.direction === "up" ? state.current >= MAX : state.current <= MIN;
  }

  function handleCorrect() {
    if (state.celebrating) return;
    playDing();
    flash("correct");

    if (atEnd()) {
      celebrate();
      return;
    }
    state.current += step();
    render();
  }

  function handleWrong() {
    if (state.celebrating) return;
    playBuzz();
    flash("wrong");
  }

  function celebrate() {
    state.celebrating = true;
    playFanfare();
    launchConfetti();
    celebrateOverlay.hidden = false;
    setTimeout(() => {
      celebrateOverlay.hidden = true;
      confetti.innerHTML = "";
      state.current = startValue();
      state.celebrating = false;
      render();
    }, 2600);
  }

  function launchConfetti() {
    const colors = ["#fbbf24", "#22c55e", "#ef4444", "#3b82f6", "#ec4899", "#a855f7"];
    const pieces = 70;
    for (let i = 0; i < pieces; i++) {
      const s = document.createElement("span");
      s.style.left = Math.random() * 100 + "vw";
      s.style.background = colors[i % colors.length];
      s.style.animationDuration = 1.8 + Math.random() * 1.4 + "s";
      s.style.animationDelay = Math.random() * 0.4 + "s";
      s.style.transform = `rotate(${Math.random() * 360}deg)`;
      confetti.appendChild(s);
    }
  }

  // ============================================================
  //  Direction controls
  // ============================================================
  function setDirection(dir) {
    if (state.direction === dir) return;
    state.direction = dir;
    state.current = startValue();
    state.celebrating = false;
    celebrateOverlay.hidden = true;
    confetti.innerHTML = "";

    const up = dir === "up";
    upButton.classList.toggle("is-active", up);
    downButton.classList.toggle("is-active", !up);
    upButton.setAttribute("aria-pressed", String(up));
    downButton.setAttribute("aria-pressed", String(!up));
    render();
  }

  upButton.addEventListener("click", () => setDirection("up"));
  downButton.addEventListener("click", () => setDirection("down"));

  // ============================================================
  //  Speech recognition
  // ============================================================
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  let recognition = null;
  let wantListening = false; // we keep restarting while true

  function buildRecognition() {
    const rec = new SpeechRecognition();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 8;

    rec.onstart = () => {
      state.listening = true;
      micDot.classList.add("is-listening");
      setStatus("Listening… say the number!");
    };

    rec.onresult = (event) => {
      // Scan every alternative of the latest results for a number match.
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        let matched = false;
        for (let a = 0; a < result.length; a++) {
          const nums = extractNumbers(result[a].transcript);
          if (nums.includes(state.current)) {
            handleCorrect();
            matched = true;
            break;
          }
        }
        // Only buzz on a CONFIDENT, clearly-different number in a final result.
        // Quiet / uncertain / unparseable speech is ignored so it isn't punished.
        if (!matched && result.isFinal) {
          const best = result[0];
          const nums = extractNumbers(best.transcript);
          const confidentEnough =
            typeof best.confidence !== "number" || best.confidence >= 0.6;
          if (nums.length && confidentEnough && !nums.includes(state.current)) {
            handleWrong();
          }
        }
      }
    };

    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        wantListening = false;
        setStatus("🎤 Microphone blocked. Allow mic access and reload.");
        micDot.classList.remove("is-listening");
      }
      // "no-speech" / "aborted" / "network" -> let onend restart
    };

    rec.onend = () => {
      state.listening = false;
      micDot.classList.remove("is-listening");
      if (wantListening) {
        // Browsers stop recognition periodically; restart to keep listening.
        try {
          rec.start();
        } catch (_) {
          setTimeout(() => {
            if (wantListening) {
              try { rec.start(); } catch (_) {}
            }
          }, 300);
        }
      }
    };

    return rec;
  }

  function startListening() {
    if (!SpeechRecognition) return;
    if (!recognition) recognition = buildRecognition();
    wantListening = true;
    try {
      recognition.start();
    } catch (_) {
      // start() throws if already started; ignore.
    }
  }

  // ============================================================
  //  Mic priming + live level meter
  // ============================================================
  // The Web Speech recognizer captures audio itself and we can't set its
  // sensitivity. We open our OWN getUserMedia stream with auto-gain-control on
  // (and suppression off) to favor quiet voices and to keep the mic "warm", and
  // we draw a live level meter so it's obvious whether the phone is hearing the
  // child and how close they need to be.
  let micStream = null;
  let analyser = null;
  const HEARD_THRESHOLD = 0.045; // RMS level we treat as "I hear you"

  function startMicMeter() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    navigator.mediaDevices
      .getUserMedia({
        audio: {
          autoGainControl: true,
          noiseSuppression: false,
          echoCancellation: false,
          channelCount: 1,
        },
      })
      .then((stream) => {
        micStream = stream;
        const ctx = getAudio();
        if (!ctx) return;
        const source = ctx.createMediaStreamSource(stream);
        analyser = ctx.createAnalyser();
        analyser.fftSize = 512;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);
        runMeter();
      })
      .catch((err) => {
        if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
          wantListening = false;
          setStatus("🎤 Microphone blocked. Allow mic access and reload.");
        }
        // Other errors: recognition may still work; just no meter.
      });
  }

  function runMeter() {
    if (!analyser) return;
    const buf = new Uint8Array(analyser.fftSize);
    const tick = () => {
      if (!analyser) return;
      analyser.getByteTimeDomainData(buf);
      // RMS of the centered waveform (0..~1)
      let sum = 0;
      for (let i = 0; i < buf.length; i++) {
        const v = (buf[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buf.length);
      const heard = rms >= HEARD_THRESHOLD;

      if (micMeterFill) {
        // Scale so normal speech roughly fills the bar; clamp to 100%.
        const pct = Math.min(100, Math.round((rms / 0.25) * 100));
        micMeterFill.style.width = pct + "%";
        micMeterFill.classList.toggle("is-heard", heard);
      }
      if (heard && state.listening && !state.celebrating) {
        setStatus("👂 I hear you… say the number!");
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  // ============================================================
  //  Boot
  // ============================================================
  function init() {
    render();

    if (!SpeechRecognition) {
      supportHint.textContent =
        "⚠️ Your browser can’t use the microphone for speech. Try Chrome or Safari.";
      startButton.disabled = true;
      startButton.textContent = "Not supported";
      return;
    }
    supportHint.textContent = "You’ll be asked to allow the microphone.";

    startButton.addEventListener("click", () => {
      if (state.started) return;
      state.started = true;
      getAudio(); // unlock audio on the user gesture
      startOverlay.hidden = true;
      startOverlay.style.display = "none";
      startMicMeter(); // prime mic (auto-gain) + live level meter
      startListening();
    });
  }

  init();

  // Expose parser for quick console testing / verification.
  window.__countingApp = { extractNumbers, state };
})();
