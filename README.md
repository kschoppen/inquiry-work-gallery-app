# Inquiry Work Gallery

A lightweight static PWA for browsing and submitting student inquiry work, styled to match the [inquirED Inquiry Hub](https://hub.inquired.com). Two tabs — **Gallery** and **Submit Work** — each embed a MiniExtensions form/gallery.

Deployed at: https://inquired-inquiry-work-gallery.netlify.app/

## Stack

Plain HTML/CSS/JS — no framework, no build step. Branded to the inquirED parent identity (Inter, dark green `#144745`).

## Structure

```
index.html        App shell (nav, hero, both tabs, iframes)
manifest.json     PWA manifest
sw.js             Service worker (offline shell cache)
icons/            PWA icons (icon-192.png, icon-512.png)
assets/           inquirED logo SVGs (green + white)
tools/            generate-icons.html — regenerate the PWA icons
netlify.toml      Deploy config (publish root, no-cache on sw.js)
```

## Run locally

```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Regenerate icons

Open `tools/generate-icons.html` via the local server, click both download buttons, and replace the files in `icons/`. After changing the shell, bump the `CACHE` version in `sw.js` so installed clients refresh.

## Deploy

Pushing to the connected Netlify site publishes automatically (static, publish dir `.`).
