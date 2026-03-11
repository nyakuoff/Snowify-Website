/**
 * Snowify Cloudflare Worker
 * Intercepts /track/:id, /album/:id, /artist/:id routes to inject
 * Open Graph meta tags for social embeds, then redirects to the
 * snowify:// deep link (or shows a download page if app not installed).
 *
 * All other requests are passed through to GitHub Pages (origin).
 */

const SITE_URL = 'https://snowify.cc';
const LOGO_URL = 'https://snowify.cc/assets/logo.png';
const ACCENT   = '#aa55e6'; // Snowify purple

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request));
});

async function handleRequest(request) {
  const url  = new URL(request.url);
  const path = url.pathname;

  const trackMatch  = path.match(/^\/track\/([A-Za-z0-9_-]{6,20})$/);
  const albumMatch  = path.match(/^\/album\/([A-Za-z0-9_-]+)$/);
  const artistMatch = path.match(/^\/artist\/([A-Za-z0-9_-]+)$/);

  if (trackMatch)  return handleTrack(trackMatch[1]);
  if (albumMatch)  return handleAlbum(albumMatch[1]);
  if (artistMatch) return handleArtist(artistMatch[1]);

  // Pass everything else through to origin (GitHub Pages)
  return fetch(request);
}

// ─── Track ───────────────────────────────────────────────────────────────────

async function handleTrack(videoId) {
  let title     = 'Unknown Track';
  let artist    = 'Unknown Artist';
  // Square-crop via wsrv.nl — YouTube thumbs are 16:9
  const thumbnail = `https://wsrv.nl/?url=i.ytimg.com/vi/${videoId}/mqdefault.jpg&w=480&h=480&fit=cover&output=jpg`;

  // Run metadata fetch
  const oembedRes = await fetch(
      `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&format=json`,
      { cf: { cacheEverything: true, cacheTtl: 3600 } }
    ).catch(() => null);

  try {
    if (oembedRes?.ok) {
      const data = await oembedRes.json();
      // Strip YouTube junk from titles so it reads like a music track
      title = (data.title || title)
        .replace(/\s*[\[(].*?(?:official\s*(?:video|audio|music\s*video|lyric\s*video|visualizer)|lyrics?|4k|hd|hq|remaster(?:ed)?|feat\.?.*?|ft\.?.*?|explicit|clean|version|extended|radio\s*edit|\d{4}).*?[\])]/gi, '')
        .replace(/\s*[-–|]\s*$/, '')
        .trim();
      // Strip " - Topic" suffix from auto-generated artist channels
      artist = (data.author_name || artist).replace(/\s[-–]\s*Topic$/i, '').trim();
    }
  } catch (_) {}

  return buildResponse({
    ogTitle:       title,
    ogDescription: `${artist} · Listen on Snowify`,
    ogImage:       thumbnail,
    ogType:        'music.song',
    deepLink:      `snowify://track/${videoId}`,
    pageTitle:     title,
    pageSubtitle:  artist,
    badgeLabel:    'Song',
  });
}

// ─── Innertube helpers ───────────────────────────────────────────────────────

const INNERTUBE_KEY = 'AIzaSyC9XL3ZjWddXya6X74dJoCTL-WEYFDNX30';

const INNERTUBE_CTX = {
  client: {
    hl: 'en',
    gl: 'US',
    clientName: 'WEB_REMIX',
    clientVersion: '1.20240101.01.00',
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36,gzip(gfe)',
  },
};

async function innertubeBrowse(browseId, pageType) {
  const body = { context: INNERTUBE_CTX, browseId };
  if (pageType) {
    body.browseEndpointContextSupportedConfigs = {
      browseEndpointContextMusicConfig: { pageType },
    };
  }
  const opts = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36',
      'Origin': 'https://music.youtube.com',
      'Referer': 'https://music.youtube.com/',
      'X-YouTube-Client-Name': '67',
      'X-YouTube-Client-Version': '1.20240101.01.00',
    },
    body: JSON.stringify(body),
    cf: { cacheEverything: true, cacheTtl: 3600 },
  };
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(
        `https://music.youtube.com/youtubei/v1/browse?key=${INNERTUBE_KEY}&prettyPrint=false`,
        opts
      );
      if (!res.ok) { if (attempt === 0) continue; return null; }
      return await res.json();
    } catch (_) { if (attempt === 0) continue; return null; }
  }
  return null;
}

// Pick the largest thumbnail from a YTM thumbnails array
function pickThumb(thumbnails) {
  if (!Array.isArray(thumbnails) || !thumbnails.length) return null;
  return thumbnails[thumbnails.length - 1]?.url ?? null;
}

// Return a 480×480 square-cropped URL.
// Google CDN URLs (lh3.googleusercontent.com) can be resized natively.
// Everything else goes through wsrv.nl.
function squareThumb(rawUrl) {
  if (!rawUrl) return null;
  if (rawUrl.includes('lh3.googleusercontent.com')) {
    // Strip any existing size suffix (everything after the last '=') and force square crop
    const base = rawUrl.includes('=') ? rawUrl.replace(/=[^=]*$/, '') : rawUrl;
    return base + '=w480-h480-l90-rj';
  }
  try {
    const u = new URL(rawUrl);
    return `https://wsrv.nl/?url=${encodeURIComponent(u.host + u.pathname)}&w=480&h=480&fit=cover&output=jpg`;
  } catch (_) { return null; }
}

// ─── Album ───────────────────────────────────────────────────────────────────

async function handleAlbum(albumId) {
  let title  = 'Album on Snowify';
  let artist = 'Listen on Snowify';
  let image  = LOGO_URL;

  const data = await innertubeBrowse(albumId);
  if (data) {
    // New format: musicResponsiveHeaderRenderer inside twoColumnBrowseResultsRenderer
    const newHdr = data?.contents?.twoColumnBrowseResultsRenderer
      ?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]
      ?.musicResponsiveHeaderRenderer;
    // Old format: top-level musicDetailHeaderRenderer (or musicImmersiveHeaderRenderer)
    const oldHdr = data?.header?.musicDetailHeaderRenderer
                ?? data?.header?.musicImmersiveHeaderRenderer;
    const hdr = newHdr ?? oldHdr;

    if (hdr) {
      title = hdr.title?.runs?.[0]?.text ?? title;

      if (newHdr) {
        // New format: straplineTextOne.runs contains artist name(s)
        const artistText = (newHdr.straplineTextOne?.runs ?? [])
          .map(r => r.text?.trim())
          .filter(t => t && t !== '•' && t !== '\u2022')
          .join('');
        if (artistText) artist = artistText;
        // Year is in subtitle.runs
        const yearRun = (newHdr.subtitle?.runs ?? []).find(r => /^\d{4}$/.test(r.text?.trim()));
        if (yearRun) artist = `${yearRun.text.trim()} · ${artist}`;
      } else {
        // Old format: subtitle runs = ["Album", " • ", "2023", " • ", "Artist"]
        const parts = (oldHdr.subtitle?.runs ?? [])
          .map(r => r.text?.trim())
          .filter(t => t && t !== '•' && t !== '\u2022');
        // parts[0] = type, parts[1] = year, parts[2] = artist
        if (parts.length >= 3) artist = `${parts[1]} · ${parts[2]}`;
        else if (parts.length === 2) artist = parts[1];
      }

      // Thumbnail
      const thumbs = newHdr
        ? newHdr.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
        : (oldHdr.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails
           ?? oldHdr.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails);
      const url = squareThumb(pickThumb(thumbs));
      if (url) image = url;
    }
  }

  return buildResponse({
    ogTitle:       title,
    ogDescription: `${artist} · Listen on Snowify`,
    ogImage:       image,
    ogType:        'music.album',
    deepLink:      `snowify://album/${albumId}`,
    pageTitle:     title,
    pageSubtitle:  artist,
    badgeLabel:    'Album',
  });
}

// ─── Artist ──────────────────────────────────────────────────────────────────

async function handleArtist(artistId) {
  let name     = 'Artist on Snowify';
  let subtitle = 'Listen on Snowify';
  let image    = LOGO_URL;

  const data = await innertubeBrowse(artistId, 'MUSIC_PAGE_TYPE_ARTIST');
  if (data) {
    const hdr = data?.header?.musicImmersiveHeaderRenderer
             ?? data?.header?.musicVisualHeaderRenderer
             ?? data?.header?.musicHeaderRenderer;

    if (hdr) {
      name = hdr.title?.runs?.[0]?.text ?? name;

      // Monthly listeners — different renderers store it in different fields
      const listeners = hdr.monthlyListenerCount?.runs?.[0]?.text
                     ?? hdr.subtitle?.runs?.find(r => /listener/i.test(r.text))?.text;
      if (listeners) subtitle = listeners;

      // Thumbnail — artist banners are landscape, force wsrv.nl center-crop
      const thumbs = hdr.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails
                  ?? hdr.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails;
      const rawUrl = pickThumb(thumbs);
      if (rawUrl) {
        try {
          const u = new URL(rawUrl);
          // Strip lh3 size suffix (e.g. =w1440-h600-p-l90-rj) before passing to wsrv.nl
          const cleanPath = u.pathname.replace(/=[^/]*$/, '');
          image = `https://wsrv.nl/?url=${encodeURIComponent(u.host + cleanPath)}&w=480&h=480&fit=cover&output=jpg`;
        } catch (_) {}
      }
    }
  }

  const hasListeners = subtitle !== 'Listen on Snowify';
  return buildResponse({
    ogTitle:       name,
    ogDescription: hasListeners ? `${name} · ${subtitle}` : `${name} · Listen on Snowify`,
    ogImage:       image,
    ogType:        'music.musician',
    deepLink:      `snowify://artist/${artistId}`,
    pageTitle:     name,
    pageSubtitle:  hasListeners ? subtitle : 'Listen on Snowify',
    badgeLabel:    'Artist',
  });
}

// ─── HTML builder ────────────────────────────────────────────────────────────

function buildResponse({ ogTitle, ogDescription, ogImage, ogType, deepLink, pageTitle, pageSubtitle, badgeLabel }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${esc(ogTitle)} · Snowify</title>

  <!-- Open Graph -->
  <meta property="og:type"        content="${esc(ogType)}">
  <meta property="og:site_name"   content="Snowify">
  <meta property="og:title"       content="${esc(ogTitle)}">
  <meta property="og:description" content="${esc(ogDescription)}">
  <meta property="og:image"       content="${esc(ogImage)}">
  <meta property="og:url"         content="${esc(SITE_URL)}">

  <!-- Twitter / X Card -->
  <meta name="twitter:card"        content="summary">
  <meta name="twitter:title"       content="${esc(ogTitle)}">
  <meta name="twitter:description" content="${esc(ogDescription)}">
  <meta name="twitter:image"       content="${esc(ogImage)}">

  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0f0f14;
      color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      width: 100%;
      max-width: 400px;
      padding: 0 20px 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    /* Album art */
    .artwork-wrap {
      position: relative;
      width: 200px;
      height: 200px;
      margin-bottom: 28px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(170,85,230,0.35);
    }
    .artwork-wrap img {
      width: 100%; height: 100%;
      object-fit: cover;
      display: block;
    }
    .artwork-fallback {
      width: 100%; height: 100%;
      background: #1e1e2e;
      display: flex; align-items: center; justify-content: center;
    }
    /* Badge */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(170,85,230,0.15);
      border: 1px solid rgba(170,85,230,0.3);
      color: #aa55e6;
      font-size: 11px;
      font-weight: 600;
      letter-spacing: .08em;
      text-transform: uppercase;
      padding: 4px 10px;
      border-radius: 20px;
      margin-bottom: 14px;
    }
    .badge svg { flex-shrink: 0; }
    h1 {
      font-size: 22px;
      font-weight: 700;
      text-align: center;
      margin-bottom: 6px;
      line-height: 1.25;
    }
    .artist {
      color: #999;
      font-size: 14px;
      margin-bottom: 30px;
      text-align: center;
    }
    .btn {
      display: block;
      width: 100%;
      padding: 13px;
      border-radius: 50px;
      font-size: 15px;
      font-weight: 600;
      text-align: center;
      text-decoration: none;
      cursor: pointer;
      border: none;
      margin-bottom: 10px;
      transition: opacity .15s;
    }
    .btn:hover { opacity: .85; }
    .btn-primary { background: #aa55e6; color: #fff; }
    .btn-secondary {
      background: transparent;
      border: 1px solid #2a2a3a;
      color: #888;
    }
    .status { font-size: 13px; color: #555; margin-top: 16px; text-align: center; min-height: 18px; }
    /* Logo watermark at bottom */
    .watermark {
      margin-top: 32px;
      display: flex;
      align-items: center;
      gap: 8px;
      color: #444;
      font-size: 13px;
    }
    .watermark img { width: 20px; height: 20px; border-radius: 5px; opacity: .6; }
  </style>
</head>
<body>
  <div class="card">
    <div class="artwork-wrap">
      <img src="${esc(ogImage)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">
      <div class="artwork-fallback" style="display:none">
        <img src="/assets/logo.png" style="width:64px;height:64px;border-radius:12px;opacity:.5" alt="">
      </div>
    </div>

    <div class="badge">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>
      ${esc(badgeLabel)} · Snowify
    </div>

    <h1>${esc(pageTitle)}</h1>
    <p class="artist">${esc(pageSubtitle)}</p>

    <button class="btn btn-primary" id="open-btn">Open in Snowify</button>
    <a class="btn btn-secondary" href="/">Get Snowify</a>

    <p class="status" id="status"></p>

    <div class="watermark">
      <img src="/assets/logo.png" alt="">
      Snowify
    </div>
  </div>

  <script>
    const btn    = document.getElementById('open-btn');
    const status = document.getElementById('status');
    const deep   = ${JSON.stringify(deepLink)};

    function tryOpen() {
      const start = Date.now();
      window.location.href = deep;
      setTimeout(function() {
        if (document.hasFocus() && Date.now() - start < 3000) {
          status.textContent = "Snowify doesn\u2019t seem to be installed \u2014 download it below.";
        }
      }, 1500);
    }

    // Auto-open on page load
    tryOpen();

    // Also allow manual retry
    btn.addEventListener('click', tryOpen);
  </script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'content-type': 'text/html;charset=UTF-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}

function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
