# kids-stuff

A collection of small, kid-friendly web apps.

## 🔢 Counting Out Loud (`counting-app/`)

A phone-friendly web app that helps a young child learn to count **1–100 by saying
numbers out loud**. A big number is shown in the middle of the screen; the child says it,
and when they get it right the app advances to the next number.

### How to play
1. Tap **Start** (the browser will ask for microphone permission — allow it).
2. Say the number shown on screen.
3. Correct → a happy chime, a green flash, and the next number appears.
   Wrong → a gentle buzz and a red flash; the number stays so they can try again.
4. Use the **▲ Up** / **▼ Down** buttons at the bottom to choose the direction.
   - **Up** counts `1 → 100`.
   - **Down** counts `100 → 1`.
5. Reach the end and you get a 🎉 celebration, then it loops back to start.

### Run it locally
The microphone needs a *secure context*, which means **HTTPS or `localhost`**:

```bash
cd counting-app
python3 -m http.server 8000
# then open http://localhost:8000 in Chrome
```

> Tip: open the JS console and try `__countingApp.extractNumbers("twenty three")`
> to sanity-check the number parser.

### Browser support
Uses the browser **Web Speech API** for speech recognition and the **Web Audio API** for
sound effects — no build step, no dependencies, just static files.

- ✅ Chrome / Edge (desktop & Android)
- ✅ Safari (iOS 14.5+ and macOS)
- ❌ Firefox (no Web Speech recognition) — the app shows a clear message.

## Deployment (GitHub Pages)

Deployment is automated via GitHub Actions
([`.github/workflows/deploy.yml`](.github/workflows/deploy.yml)): on every push to `main`
that touches `counting-app/`, the `counting-app/` directory is published as the site root.

**One-time setup:** in the repo, go to **Settings → Pages → Build and deployment →
Source** and choose **GitHub Actions**. After the first successful run, the app is live at
the URL shown in the workflow's `github-pages` environment (typically
`https://<owner>.github.io/<repo>/`).
