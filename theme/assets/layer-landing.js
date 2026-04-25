document.addEventListener('DOMContentLoaded', () => {
  const pageRoot = document.querySelector('.layer-landing-page');

  if (!pageRoot || typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') {
    return;
  }

  const { gsap, ScrollTrigger } = window;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (prefersReducedMotion) {
    document.querySelectorAll('.hero-elem').forEach((element) => {
      element.style.opacity = '1';
      element.style.transform = 'none';
    });

    document.querySelectorAll('.reveal-text span').forEach((element) => {
      element.style.opacity = '1';
      element.style.color = '#F9F8F6';
      element.style.filter = 'none';
    });
  }

  gsap.registerPlugin(ScrollTrigger);

  const cursorDot = document.querySelector('.cursor-dot');
  const cursorOutline = document.querySelector('.cursor-outline');

  if (cursorDot && cursorOutline && window.matchMedia('(pointer: fine)').matches) {
    const moveX = gsap.quickTo(cursorOutline, 'left', { duration: 0.45, ease: 'power3.out' });
    const moveY = gsap.quickTo(cursorOutline, 'top', { duration: 0.45, ease: 'power3.out' });

    window.addEventListener('mousemove', (event) => {
      cursorDot.style.left = `${event.clientX}px`;
      cursorDot.style.top = `${event.clientY}px`;
      moveX(event.clientX);
      moveY(event.clientY);
    });

    document.querySelectorAll('a, button, .note-item').forEach((element) => {
      element.addEventListener('mouseenter', () => cursorOutline.classList.add('hovered'));
      element.addEventListener('mouseleave', () => cursorOutline.classList.remove('hovered'));
    });
  }

  const nav = document.getElementById('main-nav');

  if (nav) {
    ScrollTrigger.create({
      start: 'top -72px',
      onEnter: () => {
        nav.classList.add('scrolled');
        nav.classList.remove('mix-blend-difference', 'text-white');
        nav.style.color = 'var(--color-text)';
      },
      onLeaveBack: () => {
        nav.classList.remove('scrolled');
        nav.classList.add('mix-blend-difference', 'text-white');
        nav.style.color = '';
      },
    });
  }

  gsap.fromTo(
    '.hero-elem',
    { y: 40, opacity: 0 },
    { y: 0, opacity: 1, duration: 1.5, stagger: 0.15, ease: 'power3.out', delay: 0.35 }
  );

  const textContainer = document.querySelector('.reveal-text');

  if (textContainer) {
    const rawText = textContainer.innerText.trim();
    textContainer.innerHTML = '';

    const sentences = rawText.split(/(?<=[.!?])\s+/).filter(Boolean);

    sentences.forEach((sentence) => {
      const span = document.createElement('span');
      span.textContent = `${sentence} `;
      textContainer.appendChild(span);
    });

    const textSpans = textContainer.querySelectorAll('span');
    const totalSentences = textSpans.length;

    textSpans.forEach((span, index) => {
      gsap.to(span, {
        scrollTrigger: {
          trigger: '#reveal',
          start: `top+=${(index / totalSentences) * 100}% top`,
          end: `top+=${((index + 1) / totalSentences) * 100}% top`,
          scrub: 0.8,
        },
        opacity: 1,
        color: '#F9F8F6',
        filter: 'none',
      });
    });

    gsap.to('#dither-filter feDisplacementMap', {
      scrollTrigger: { trigger: '#reveal', start: 'top top', end: 'bottom bottom', scrub: 1 },
      attr: { scale: 0 },
    });

    gsap.to('#dither-filter feGaussianBlur', {
      scrollTrigger: { trigger: '#reveal', start: 'top top', end: 'bottom bottom', scrub: 1 },
      attr: { stdDeviation: 0 },
    });

    const revealTimeline = gsap.timeline({
      scrollTrigger: { trigger: '#reveal', start: 'top top', end: 'bottom bottom', scrub: 1 },
    });

    revealTimeline
      .fromTo('.reveal-img-left', { y: '55vh', opacity: 0 }, { y: '-55vh', opacity: 1, duration: 1, ease: 'none' }, 0)
      .fromTo('.reveal-img-right', { y: '70vh', opacity: 0 }, { y: '-45vh', opacity: 1, duration: 1, ease: 'none' }, 0.18);
  }

  gsap.timeline({
    scrollTrigger: { trigger: '#showcase', start: 'top 70%', end: 'center center', scrub: true },
  })
    .fromTo('.showcase-box', { scale: 0.88, opacity: 0 }, { scale: 1, opacity: 1, duration: 1 }, 0)
    .fromTo('.item-1', { y: 55, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, 0.05)
    .fromTo('.item-2', { y: 55, opacity: 0 }, { y: 0, opacity: 1, duration: 1 }, 0.1)
    .fromTo('.item-3', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 1 }, 0.15)
    .fromTo('.item-4', { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 1 }, 0.2);

  const horizontalSection = document.getElementById('h-scroll-section');
  const horizontalWrapper = document.getElementById('h-scroll-wrapper');

  if (horizontalSection && horizontalWrapper) {
    gsap.to(horizontalWrapper, {
      x: () => -(horizontalWrapper.scrollWidth - window.innerWidth),
      ease: 'none',
      scrollTrigger: {
        trigger: horizontalSection,
        start: 'top top',
        end: () => `+=${horizontalWrapper.scrollWidth - window.innerWidth}`,
        pin: true,
        scrub: 1,
        invalidateOnRefresh: true,
        anticipatePin: 1,
      },
    });
  }

  gsap.fromTo(
    '.phil-col-images',
    { x: -36, opacity: 0 },
    {
      x: 0,
      opacity: 1,
      duration: 1.1,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#philosophy', start: 'top 72%', toggleActions: 'play none none none' },
    }
  );

  gsap.fromTo(
    '.phil-col-content',
    { x: 36, opacity: 0 },
    {
      x: 0,
      opacity: 1,
      duration: 1.1,
      ease: 'power2.out',
      scrollTrigger: { trigger: '#philosophy', start: 'top 72%', toggleActions: 'play none none none' },
    }
  );

  const noteItems = document.querySelectorAll('.note-item');
  const noteBackgroundImage = document.querySelector('#note-bg img');

  noteItems.forEach((item) => {
    const updateImage = () => {
      const newSource = item.getAttribute('data-img');

      if (!newSource || !noteBackgroundImage) {
        return;
      }

      gsap.to(noteBackgroundImage, {
        opacity: 0,
        duration: 0.25,
        onComplete: () => {
          noteBackgroundImage.src = newSource;
          gsap.to(noteBackgroundImage, { opacity: 0.13, duration: 0.45 });
        },
      });
    };

    item.addEventListener('mouseenter', updateImage);
    item.addEventListener('focus', updateImage);
  });
});
