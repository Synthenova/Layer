document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
          if (prefersReducedMotion) {
              document.querySelectorAll('.hero-elem').forEach(el => {
                  el.style.opacity = 1;
                  el.style.transform = 'none';
              });
          }
          gsap.registerPlugin(ScrollTrigger);
  
  
          // ── Custom Cursor (GSAP quickTo for smooth, non-queuing movement) ──
          const cursorDot     = document.querySelector('.cursor-dot');
          const cursorOutline = document.querySelector('.cursor-outline');
  
          if (cursorDot && cursorOutline && window.matchMedia('(pointer: fine)').matches) {
              const moveX = gsap.quickTo(cursorOutline, 'left', { duration: 0.45, ease: 'power3.out' });
              const moveY = gsap.quickTo(cursorOutline, 'top',  { duration: 0.45, ease: 'power3.out' });
              const darkCursorSelectors = [
                  '#reveal',
                  '#showcase',
                  '#email-signup',
                  'footer',
                  '.collection-card'
              ].join(',');
  
              const parseColor = (value) => {
                  const match = value && value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)/);
                  if (!match) return null;
                  const alpha = match[4] === undefined ? 1 : Number(match[4]);
                  if (alpha === 0) return null;
                  return [Number(match[1]), Number(match[2]), Number(match[3])];
              };
  
              const isDarkColor = ([r, g, b]) => ((r * 299 + g * 587 + b * 114) / 1000) < 128;
  
              const shouldUseLightCursor = (x, y) => {
                  const stack = document.elementsFromPoint(x, y)
                      .filter(el => !el.classList?.contains('cursor-dot') && !el.classList?.contains('cursor-outline'));
  
                  if (stack.some(el => el.closest?.(darkCursorSelectors))) return true;
  
                  for (const el of stack) {
                      const styles = window.getComputedStyle(el);
                      const bg = parseColor(styles.backgroundColor);
                      if (bg) return isDarkColor(bg);
                  }
                  return false;
              };
  
              const setCursorTheme = (useLight) => {
                  cursorDot.classList.toggle('cursor-light', useLight);
                  cursorOutline.classList.toggle('cursor-light', useLight);
              };
  
              window.addEventListener('mousemove', (e) => {
                  cursorDot.style.left = e.clientX + 'px';
                  cursorDot.style.top  = e.clientY + 'px';
                  moveX(e.clientX);
                  moveY(e.clientY);
                  setCursorTheme(shouldUseLightCursor(e.clientX, e.clientY));
              });
  
              document.querySelectorAll('a, button, .note-item').forEach(el => {
                  el.addEventListener('mouseenter', () => cursorOutline.classList.add('hovered'));
                  el.addEventListener('mouseleave', () => cursorOutline.classList.remove('hovered'));
              });
          }
  
          // ── Mobile navigation ──
          const mobileMenuToggle = document.getElementById('mobile-menu-toggle');
          const mobileMenu = document.getElementById('mobile-menu');
  
          if (mobileMenuToggle && mobileMenu) {
              const closeMobileMenu = () => {
                  mobileMenu.hidden = true;
                  mobileMenuToggle.setAttribute('aria-expanded', 'false');
                  mobileMenuToggle.setAttribute('aria-label', 'Open navigation menu');
              };
              mobileMenuToggle.addEventListener('click', () => {
                  const isOpen = mobileMenuToggle.getAttribute('aria-expanded') === 'true';
                  mobileMenu.hidden = isOpen;
                  mobileMenuToggle.setAttribute('aria-expanded', String(!isOpen));
                  mobileMenuToggle.setAttribute('aria-label', isOpen ? 'Open navigation menu' : 'Close navigation menu');
              });
              mobileMenu.querySelectorAll('a').forEach(link => link.addEventListener('click', closeMobileMenu));
              document.addEventListener('keydown', (event) => {
                  if (event.key === 'Escape') closeMobileMenu();
              });
          }
  
          // ── Navigation scroll state and direction reveal ──
          const nav = document.getElementById('main-nav');
  
          if (nav) {
              let lastNavScrollY = window.scrollY;
              let navTriggerStartY = window.scrollY;
              const navTriggerZone = 15;
  
              const setNavScrolledState = () => {
                  if (window.scrollY > 72) {
                      nav.classList.add('scrolled');
                      nav.classList.remove('mix-blend-difference', 'text-white');
                      nav.style.color = 'var(--color-text)';
                  } else {
                      nav.classList.remove('scrolled');
                      nav.classList.add('mix-blend-difference', 'text-white');
                      nav.style.color = '';
                      if (window.scrollY === 0) {
                          nav.classList.remove('nav-hidden');
                      }
                  }
              };
  
              const showNav = () => {
                  nav.classList.remove('nav-hidden');
                  navTriggerStartY = window.scrollY;
              };
  
              const hideNav = () => {
                  const menuOpen = mobileMenuToggle?.getAttribute('aria-expanded') === 'true';
                  if (window.scrollY <= 0 || menuOpen) return;
                  nav.classList.add('nav-hidden');
                  navTriggerStartY = window.scrollY;
              };
  
              setNavScrolledState();
  
              window.addEventListener('scroll', () => {
                  const currentY = window.scrollY;
                  const direction = currentY > lastNavScrollY ? 'down' : 'up';
  
                  setNavScrolledState();
  
                  if (direction === 'down' && currentY - navTriggerStartY >= navTriggerZone) {
                      hideNav();
                  }
                  if (direction === 'up' && navTriggerStartY - currentY >= navTriggerZone) {
                      showNav();
                  }
  
                  if ((direction === 'down' && currentY < navTriggerStartY) || (direction === 'up' && currentY > navTriggerStartY)) {
                      navTriggerStartY = currentY;
                  }
  
                  lastNavScrollY = currentY;
              }, { passive: true });
          }
  
          ScrollTrigger.create({
              start: 'top -72px',
              onEnter: () => {
                  if (!nav) return;
                  nav.classList.add('scrolled');
                  nav.classList.remove('mix-blend-difference', 'text-white');
                  nav.style.color = 'var(--color-text)';
              },
              onLeaveBack: () => {
                  if (!nav) return;
                  nav.classList.remove('scrolled');
                  nav.classList.remove('nav-hidden');
                  nav.classList.add('mix-blend-difference', 'text-white');
                  nav.style.color = '';
              }
          });
  
          // ── Hero reveal (fromTo with explicit initial state) ──
          gsap.fromTo('.hero-elem',
              { y: 40, opacity: 0 },
              { y: 0, opacity: 1, duration: 1.5, stagger: 0.15, ease: 'power3.out', delay: 0.35 }
          );
  
          // ── Cinematic text reveal (300vh section + correct percentage math) ──
          const textContainer = document.querySelector('.reveal-text');
          if (textContainer) {
              const rawText = textContainer.innerText.trim();
              textContainer.innerHTML = '';
  
              const sentences = rawText.split(/(?<=[.!?])\s+/).filter(Boolean);
              sentences.forEach(sentence => {
                  const span = document.createElement('span');
                  span.textContent = sentence + ' ';
                  textContainer.appendChild(span);
              });
  
              const textSpans     = textContainer.querySelectorAll('span');
              const totalSentences = textSpans.length;
  
              // percentages now correctly span 0–100% of the 300vh section
              textSpans.forEach((span, i) => {
                  gsap.to(span, {
                      scrollTrigger: {
                          trigger: '#reveal',
                          start: `top+=${(i / totalSentences) * 100}% top`,
                          end:   `top+=${((i + 1) / totalSentences) * 100}% top`,
                          scrub: 0.8,
                      },
                      opacity: 1,
                      color: '#F9F8F6',
                      filter: 'none',
                      y: 0,
                      scale: 1,
                      textShadow: '0 0 0 rgba(249,248,246,0)',
                  });
              });
  
              if (prefersReducedMotion) {
                  textSpans.forEach(el => {
                      el.style.opacity = 1;
                      el.style.color = '#F9F8F6';
                      el.style.filter = 'none';
                      el.style.transform = 'none';
                  });
              }
  
              // SVG filter convergence — particles consolidate as text is revealed
              gsap.to('#dither-filter feDisplacementMap', {
                  scrollTrigger: { trigger: '#reveal', start: 'top top', end: 'bottom bottom', scrub: 1 },
                  attr: { scale: 0 },
              });
              gsap.to('#dither-filter feGaussianBlur', {
                  scrollTrigger: { trigger: '#reveal', start: 'top top', end: 'bottom bottom', scrub: 1 },
                  attr: { stdDeviation: 0 },
              });
              gsap.to('.reveal-smoke', {
                  scrollTrigger: { trigger: '#reveal', start: 'top top', end: 'bottom bottom', scrub: 1 },
                  opacity: 0.08,
                  scale: 0.72,
                  filter: 'blur(8px)',
              });
  
              // Parallax images (staggered entry/exit within the 300vh)
              const revealTl = gsap.timeline({
                  scrollTrigger: { trigger: '#reveal', start: 'top top', end: 'bottom bottom', scrub: 1 }
              });
              revealTl
                  .fromTo('.reveal-img-left',  { y: '55vh', opacity: 0 }, { y: '-55vh', opacity: 1, duration: 1, ease: 'none' }, 0)
                  .fromTo('.reveal-img-right', { y: '70vh', opacity: 0 }, { y: '-45vh', opacity: 1, duration: 1, ease: 'none' }, 0.18);
          }
  
          // ── Split showcase animation ──
          gsap.fromTo('.split-panel',
              { opacity: 0.88, y: 28 },
              { opacity: 1, y: 0, duration: 0.85, ease: 'power2.out', stagger: 0.08,
                scrollTrigger: { trigger: '#showcase', start: 'top 72%', toggleActions: 'play none none none' } }
          );
  
          // ── Horizontal scroll gallery ──
          const hSection = document.getElementById('h-scroll-section');
          const hWrapper = document.getElementById('h-scroll-wrapper');
  
          const desktopGallery = window.matchMedia('(min-width: 768px)');
  
          if (hSection && hWrapper && desktopGallery.matches) {
              gsap.to(hWrapper, {
                  x: () => -(hWrapper.scrollWidth - window.innerWidth),
                  ease: 'none',
                  scrollTrigger: {
                      trigger: hSection,
                      start: 'top top',
                      end: () => '+=' + (hWrapper.scrollWidth - window.innerWidth),
                      pin: true,
                      scrub: 1,
                      invalidateOnRefresh: true,
                      anticipatePin: 1,
                  }
              });
          }
  
          // ── Best sellers side-scroll controls ──
          const bestSellerTrack = document.querySelector('.best-seller-track');
          const bestSellerPrev = document.querySelector('.gallery-prev');
          const bestSellerNext = document.querySelector('.gallery-next');
  
          if (bestSellerTrack && bestSellerPrev && bestSellerNext) {
              const updateBestSellerControls = () => {
                  const maxScroll = bestSellerTrack.scrollWidth - bestSellerTrack.clientWidth - 2;
                  bestSellerPrev.disabled = bestSellerTrack.scrollLeft <= 2;
                  bestSellerNext.disabled = bestSellerTrack.scrollLeft >= maxScroll;
                  bestSellerPrev.classList.toggle('opacity-35', bestSellerPrev.disabled);
                  bestSellerNext.classList.toggle('opacity-35', bestSellerNext.disabled);
              };
  
              const scrollBestSellers = (direction) => {
                  const firstCard = bestSellerTrack.querySelector('.best-seller-card');
                  const gap = parseFloat(getComputedStyle(bestSellerTrack).columnGap || getComputedStyle(bestSellerTrack).gap || 0);
                  const distance = firstCard ? ((firstCard.getBoundingClientRect().width + gap) * 4) : bestSellerTrack.clientWidth;
                  bestSellerTrack.scrollBy({ left: direction * distance, behavior: 'smooth' });
              };
  
              bestSellerPrev.addEventListener('click', () => scrollBestSellers(-1));
              bestSellerNext.addEventListener('click', () => scrollBestSellers(1));
              bestSellerTrack.addEventListener('scroll', updateBestSellerControls, { passive: true });
              window.addEventListener('resize', updateBestSellerControls);
              updateBestSellerControls();
          }
  
          // ── Philosophy entrance animations ──
          gsap.fromTo('.phil-col-images',
              { x: -36, opacity: 0 },
              { x: 0, opacity: 1, duration: 1.1, ease: 'power2.out',
                scrollTrigger: { trigger: '#philosophy', start: 'top 72%', toggleActions: 'play none none none' } }
          );
          gsap.fromTo('.phil-col-content',
              { x: 36, opacity: 0 },
              { x: 0, opacity: 1, duration: 1.1, ease: 'power2.out',
                scrollTrigger: { trigger: '#philosophy', start: 'top 72%', toggleActions: 'play none none none' } }
          );
  
          // ── Notes visualizer — background image swap ──
          const noteItems = document.querySelectorAll('.note-item');
          const noteBg = document.getElementById('note-bg');
          const noteBgImg = document.querySelector('#note-bg img');
          const defaultNoteImg = noteBg?.dataset.defaultImg || noteBgImg?.getAttribute('src');
          let activeNoteImg = '';
          let currentNoteImg = noteBgImg?.getAttribute('src') || '';
  
          noteItems.forEach(item => {
              const activateItem = () => {
                  noteItems.forEach(other => {
                      const isActive = other === item;
                      other.classList.toggle('active', isActive);
                      other.setAttribute('aria-expanded', String(isActive));
                  });
                  activeNoteImg = item.dataset.img || '';
              };
              const updateImage = (newSrc) => {
                  if (!newSrc || !noteBgImg || newSrc === currentNoteImg) return;
                  gsap.to(noteBgImg, {
                      opacity: 0, duration: 0.25,
                      onComplete: () => {
                          noteBgImg.src = newSrc;
                          currentNoteImg = newSrc;
                          gsap.to(noteBgImg, { opacity: 0.13, duration: 0.45 });
                      }
                  });
              };
              const previewItem = () => updateImage(item.dataset.img);
              const restoreImage = () => updateImage(activeNoteImg || defaultNoteImg);
  
              item.addEventListener('mouseenter', previewItem);
              item.addEventListener('mouseleave', restoreImage);
              item.addEventListener('focus', previewItem);
              item.addEventListener('blur', restoreImage);
              item.addEventListener('click', () => {
                  activateItem();
                  updateImage(activeNoteImg);
              });
          });
  
          // ── Email capture fallback flow ──
          const signupForm = document.getElementById('signup-form');
          const signupEmail = document.getElementById('signup-email');
          const signupMessage = document.getElementById('signup-message');
  
          if (signupForm && signupEmail && signupMessage) {
              signupForm.addEventListener('submit', (event) => {
                  event.preventDefault();
                  signupMessage.hidden = false;
                  if (!signupEmail.validity.valid) {
                      signupMessage.textContent = 'Enter a valid email address.';
                      signupMessage.classList.remove('text-stone-500');
                      signupMessage.classList.add('text-[#C9A96E]');
                      signupEmail.setAttribute('aria-invalid', 'true');
                      signupEmail.focus();
                      return;
                  }
                  signupEmail.setAttribute('aria-invalid', 'false');
                  signupMessage.classList.add('text-stone-500');
                  signupMessage.classList.remove('text-[#C9A96E]');
                  signupMessage.textContent = 'You are on the list.';
                  signupForm.reset();
              });
          }
  
          const copyrightYear = document.getElementById('copyright-year');
          if (copyrightYear) {
              copyrightYear.textContent = new Date().getFullYear();
          }
});
