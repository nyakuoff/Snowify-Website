/* ============================================
   Snowify Website — JavaScript
   ============================================ */

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

  // --- Screenshot Tabs ---
  const tabBtns = document.querySelectorAll('.tab-btn');
  const screenshotImg = document.getElementById('screenshotImg');

  tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tab = btn.dataset.tab;

      // Update active state
      tabBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Swap image with fade
      screenshotImg.classList.add('loading');
      const newSrc = `${SCREENSHOTS_BASE}/${tab}.png`;

      const img = new Image();
      img.onload = () => {
        screenshotImg.src = newSrc;
        screenshotImg.alt = `Snowify ${btn.textContent} Screen`;
        screenshotImg.classList.remove('loading');
      };
      img.onerror = () => {
        screenshotImg.classList.remove('loading');
      };
      img.src = newSrc;
    });
  });

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
