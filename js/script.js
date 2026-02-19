(function () {
  'use strict';

  // --- Configuration ---
  const REPO = 'nyakuoff/Snowify';
  const SCREENSHOTS_BASE = `https://raw.githubusercontent.com/${REPO}/main/assets/screenshots`;
  const SCREENSHOTS = ['home', 'artist', 'lyrics', 'playlist', 'login', 'discord-rpc'];

  // --- Navigation ---
  const nav = document.getElementById('nav');
  const navToggle = document.getElementById('navToggle');
  const navMobile = document.getElementById('navMobile');

  // Scroll effect
  let lastScroll = 0;
  window.addEventListener('scroll', () => {
    const scrollY = window.scrollY;
    nav.classList.toggle('scrolled', scrollY > 50);
    lastScroll = scrollY;
  }, { passive: true });

  // Mobile toggle
  navToggle.addEventListener('click', () => {
    navToggle.classList.toggle('active');
    navMobile.classList.toggle('open');
  });

  // Close mobile nav on link click
  navMobile.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      navToggle.classList.remove('active');
      navMobile.classList.remove('open');
    });
  });

  // --- Screenshot Viewer ---
  const screenshotImg = document.getElementById('screenshotImg');
  const screenshotLabel = document.getElementById('screenshotLabel');
  const screenshotFrame = document.getElementById('screenshotFrame');
  const prevBtn = document.getElementById('carouselPrev');
  const nextBtn = document.getElementById('carouselNext');
  const dotsContainer = document.getElementById('carouselDots');

  const SCREENSHOT_NAMES = ['home', 'artist', 'lyrics', 'playlist', 'login', 'discord-rpc'];
  const SCREENSHOT_LABELS = ['Home', 'Artist', 'Lyrics', 'Playlist', 'Login', 'Discord RPC'];
  let current = 0;
  let autoPlayTimer;
  const AUTO_INTERVAL = 5000;

  // Build dots
  SCREENSHOT_NAMES.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'carousel-dot' + (i === 0 ? ' active' : '');
    dot.setAttribute('aria-label', `Screenshot ${i + 1}`);
    dot.addEventListener('click', () => goTo(i));
    dotsContainer.appendChild(dot);
  });

  function goTo(index, direction) {
    if (index === current || transitioning) return;
    transitioning = true;
    const dir = direction || (index > current ? 'left' : 'right');
    const outClass = dir === 'left' ? 'slide-out-left' : 'slide-out-right';
    const inClass = dir === 'left' ? 'slide-in-left' : 'slide-in-right';

    // Slide out current
    screenshotImg.classList.add(outClass);

    setTimeout(() => {
      // Prep new image off-screen
      const src = `${SCREENSHOTS_BASE}/${SCREENSHOT_NAMES[index]}.png`;
      const img = new Image();
      img.onload = () => {
        screenshotImg.classList.remove(outClass);
        screenshotImg.classList.add(inClass);
        screenshotImg.src = src;
        screenshotImg.alt = `Snowify ${SCREENSHOT_LABELS[index]} Screen`;

        // Force reflow then animate in
        void screenshotImg.offsetWidth;
        screenshotImg.classList.remove(inClass);
        current = index;
        screenshotLabel.textContent = SCREENSHOT_LABELS[current];
        updateDots();
        setTimeout(() => { transitioning = false; }, 300);
      };
      img.src = src;
    }, 300);

    resetAutoPlay();
  }
  let transitioning = false;

  function updateDots() {
    dotsContainer.querySelectorAll('.carousel-dot').forEach((d, i) => {
      d.classList.toggle('active', i === current);
    });
  }

  prevBtn.addEventListener('click', () => {
    goTo(current > 0 ? current - 1 : SCREENSHOT_NAMES.length - 1, 'right');
  });

  nextBtn.addEventListener('click', () => {
    goTo(current < SCREENSHOT_NAMES.length - 1 ? current + 1 : 0, 'left');
  });

  function autoPlay() {
    autoPlayTimer = setInterval(() => {
      goTo(current < SCREENSHOT_NAMES.length - 1 ? current + 1 : 0, 'left');
    }, AUTO_INTERVAL);
  }

  function resetAutoPlay() {
    clearInterval(autoPlayTimer);
    autoPlay();
  }

  autoPlay();

  // --- Scroll Animations (Intersection Observer) ---
  const animatedElements = document.querySelectorAll('[data-animate]');

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry, index) => {
        if (entry.isIntersecting) {
          // Stagger animation for grid items
          const el = entry.target;
          const parent = el.parentElement;
          const siblings = parent ? Array.from(parent.querySelectorAll('[data-animate]')) : [el];
          const idx = siblings.indexOf(el);
          const delay = idx >= 0 ? idx * 80 : 0;

          setTimeout(() => {
            el.classList.add('visible');
          }, delay);

          observer.unobserve(el);
        }
      });
    }, {
      threshold: 0.1,
      rootMargin: '0px 0px -40px 0px'
    });

    animatedElements.forEach(el => observer.observe(el));
  } else {
    // Fallback: show everything
    animatedElements.forEach(el => el.classList.add('visible'));
  }

  // --- Dynamic Download Links (GitHub Releases API) ---
  async function fetchLatestRelease() {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/releases`);
      if (!res.ok) return;

      const releases = await res.json();
      if (!releases.length) return;

      // Find the latest release (first in the array)
      const latest = releases[0];
      const assets = latest.assets || [];

      const windowsAsset = assets.find(a => a.name.endsWith('.exe'));
      const linuxAsset = assets.find(a => a.name.endsWith('.AppImage'));

      const winBtn = document.getElementById('downloadWindows');
      const linuxBtn = document.getElementById('downloadLinux');

      if (windowsAsset && winBtn) {
        winBtn.href = windowsAsset.browser_download_url;
      }

      if (linuxAsset && linuxBtn) {
        linuxBtn.href = linuxAsset.browser_download_url;
      }

      // Update version badge
      const badge = document.querySelector('.hero-badge');
      if (badge && latest.tag_name) {
        const version = latest.tag_name.replace(/^v/, '');
        const isPrerelease = latest.prerelease;
        badge.innerHTML = `<span class="badge-dot"></span>${isPrerelease ? 'Beta' : 'Stable'} · v${version}`;
      }
    } catch (e) {
      // Silently fail, fallback hrefs point to the releases page
      console.debug('Could not fetch latest release:', e.message);
    }
  }

  fetchLatestRelease();

  // --- Platform Detection ---
  (function detectPlatform() {
    const ua = navigator.userAgent.toLowerCase();
    const cards = document.getElementById('downloadCards');
    const toggle = document.getElementById('platformToggle');
    if (!cards || !toggle) return;

    let platform = null;
    if (ua.includes('win')) platform = 'windows';
    else if (ua.includes('linux')) platform = 'linux';

    if (platform) {
      cards.classList.add('detected');
      const match = cards.querySelector(`[data-platform="${platform}"]`);
      if (match) match.classList.add('platform-match');

      toggle.addEventListener('click', () => {
        cards.classList.remove('detected');
        cards.classList.add('show-all');
        toggle.classList.add('hidden');
      });
    } else {
      // Unknown platform, show both
      toggle.classList.add('hidden');
    }
  })();

  // --- Snowfall Effect ---
  const canvas = document.getElementById('snowfall');
  const ctx = canvas.getContext('2d');
  let particles = [];
  let animationId;

  function resizeCanvas() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }

  function createParticles() {
    const count = Math.min(Math.floor(window.innerWidth / 15), 80);
    particles = [];
    for (let i = 0; i < count; i++) {
      particles.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        radius: Math.random() * 2 + 0.5,
        speed: Math.random() * 0.5 + 0.15,
        drift: Math.random() * 0.4 - 0.2,
        opacity: Math.random() * 0.5 + 0.1,
      });
    }
  }

  function drawSnow() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach(p => {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(210, 200, 240, ${p.opacity})`;
      ctx.fill();

      // Move
      p.y += p.speed;
      p.x += p.drift;

      // Reset if out of bounds
      if (p.y > canvas.height) {
        p.y = -p.radius;
        p.x = Math.random() * canvas.width;
      }
      if (p.x > canvas.width) p.x = 0;
      if (p.x < 0) p.x = canvas.width;
    });

    animationId = requestAnimationFrame(drawSnow);
  }

  // Reduce snowfall when page is not visible
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(animationId);
    } else {
      drawSnow();
    }
  });

  // Handle resize
  let resizeTimer;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      resizeCanvas();
      createParticles();
    }, 200);
  }, { passive: true });

  // Init snowfall
  resizeCanvas();
  createParticles();
  drawSnow();

  // --- Hero Screenshot Tilt Effect (VanillaTilt) ---
  VanillaTilt.init(document.querySelectorAll('[data-tilt]'));

  // --- Smooth scroll for anchor links ---
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (target) {
        e.preventDefault();
        target.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

})();
