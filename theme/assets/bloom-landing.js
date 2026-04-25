(function () {
  function startBloom() {
    var body = document.body;
    if (!body || !body.classList.contains('template-index')) {
      return;
    }

    initializeBloomInteractions();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', startBloom);
  } else {
    startBloom();
  }

  function initializeBloomInteractions() {
    initScrollVideo();
    initLazyVideos();
    initGiantTextTimeline();
    initRevealAnimations();
    initHorizontalScroll();
    initNavBehavior();
    initSetupCard();
    initShopCard();
    initMaterialsCard();
    initCompressionCard();
    initBestsellerCarousel();
    initGalleryAnimations();
  }

  var heroReadyDispatched = false;

  function debugBloom(message, data) {
    if (typeof console === 'undefined' || typeof console.log !== 'function') {
      return;
    }
    if (typeof data !== 'undefined') {
      console.log('[Bloom]', message, data);
    } else {
      console.log('[Bloom]', message);
    }
  }

  function dispatchHeroEvent(detail) {
    var eventName = 'bloom:hero-ready';
    var eventDetail = detail || {};
    var heroEvent;
    if (typeof window.CustomEvent === 'function') {
      heroEvent = new CustomEvent(eventName, { detail: eventDetail });
    } else {
      heroEvent = document.createEvent('CustomEvent');
      heroEvent.initCustomEvent(eventName, true, true, eventDetail);
    }
    document.dispatchEvent(heroEvent);
  }

  function markHeroReady(reason) {
    if (heroReadyDispatched) {
      return;
    }
    heroReadyDispatched = true;
    debugBloom('Hero ready', reason);
    dispatchHeroEvent({ reason: reason || 'unknown' });
    hideLoader();
  }

  function initScrollVideo() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      markHeroReady('gsap-unavailable');
      return;
    }

    gsap.registerPlugin(ScrollTrigger);
    var heroTimeout = setTimeout(function () {
      markHeroReady('hero-timeout');
    }, 8000);

    var canvas = document.querySelector('#scroll-canvas');
    var ctx = canvas ? canvas.getContext('2d') : null;

    if (!canvas || !ctx) {
      markHeroReady('hero-elements-missing');
      return;
    }

    var frameDataElement = document.getElementById('hero-frame-data');
    var frameData = null;

    if (frameDataElement) {
      try {
        frameData = JSON.parse(frameDataElement.textContent || '{}');
      } catch (error) {
        frameData = null;
      }
    }

    var isMobile = window.innerWidth < 768;
    var desktopFrames = frameData && Array.isArray(frameData.frames) ? frameData.frames : [];
    var mobileFrames = frameData && Array.isArray(frameData.mobile_frames) ? frameData.mobile_frames : [];

    // Fallback to desktop frames if mobile frames are missing
    var frameUrls = (isMobile && mobileFrames.length) ? mobileFrames : desktopFrames;

    if (!frameUrls.length) {
      markHeroReady('hero-no-frame-data');
      return;
    }

    var frameCount = frameUrls.length;
    var loadedFrames = new Array(frameCount);
    var loadOrder = [];
    for (var idx = frameCount - 1; idx >= 0; idx -= 1) {
      loadOrder.push(idx);
    }

    var queuePointer = 0;
    var activeLoads = 0;
    var requestedConcurrency = window.BLOOM_FRAME_CONCURRENCY ? Number(window.BLOOM_FRAME_CONCURRENCY) : 20;
    var maxConcurrent = Math.max(1, Math.min(frameCount, requestedConcurrency));
    var timelineStarted = false;
    var desiredFrameIndex = frameCount - 1;
    var displayedFrameIndex = -1;
    var canvasInitialized = false;
    var requestedReadyFrames = window.BLOOM_MIN_READY_FRAMES ? Number(window.BLOOM_MIN_READY_FRAMES) : 50;
    var minReadyFrames = Math.max(1, Math.min(frameCount, requestedReadyFrames));
    var framesReadyCount = 0;
    var readyDebounceId = null;

    startLoadingQueue();

    function startLoadingQueue() {
      while (activeLoads < maxConcurrent && queuePointer < loadOrder.length) {
        loadFrame(loadOrder[queuePointer]);
        queuePointer += 1;
      }
    }

    function loadFrame(index) {
      activeLoads += 1;
      var url = frameUrls[index];
      var img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';

      img.onload = function () {
        activeLoads -= 1;
        if (!loadedFrames[index]) {
          framesReadyCount += 1;
        }
        loadedFrames[index] = img;
        if (!canvasInitialized) {
          initializeCanvasSize(img);
        }
        renderFrame(desiredFrameIndex);
        if (readyDebounceId) {
          clearTimeout(readyDebounceId);
        }
        readyDebounceId = setTimeout(tryStartTimeline, 10);
        startLoadingQueue();
      };

      img.onerror = function () {
        activeLoads -= 1;
        loadedFrames[index] = null;
        startLoadingQueue();
      };

      img.src = url;
    }

    function initializeCanvasSize(img) {
      var width = img.naturalWidth || img.width || canvas.clientWidth || 1920;
      var height = img.naturalHeight || img.height || canvas.clientHeight || 1080;
      canvas.width = width;
      canvas.height = height;
      canvasInitialized = true;
    }

    function hasInitialFramesReady() {
      if (!loadedFrames[frameCount - 1]) {
        return false;
      }
      return framesReadyCount >= minReadyFrames;
    }

    function tryStartTimeline() {
      if (timelineStarted || !hasInitialFramesReady()) {
        return;
      }
      timelineStarted = true;
      renderFrame(frameCount - 1);

      var tlHero = gsap.timeline({
        scrollTrigger: {
          trigger: '#hero',
          start: 'top top',
          end: 'bottom bottom',
          scrub: 1,
          onUpdate: function (self) {
            var videoProgress = Math.min(1, self.progress / 0.85);
            var targetFrame = Math.floor((1 - videoProgress) * (frameCount - 1));
            desiredFrameIndex = Math.max(0, Math.min(frameCount - 1, targetFrame));
            renderFrame(desiredFrameIndex);
          }
        }
      });

      tlHero.to('#hero-text-1', {
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
        duration: 0.1,
        ease: 'power2.out'
      }, 0.05);

      tlHero.to('#hero-text-2', {
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
        duration: 0.1,
        ease: 'power2.out'
      }, 0.35);

      clearTimeout(heroTimeout);
      markHeroReady('hero-frames-ready');
    }

    function renderFrame(targetIndex) {
      if (!canvasInitialized) {
        return;
      }

      var frameInfo = getAvailableFrame(targetIndex);
      if (!frameInfo || frameInfo.index === displayedFrameIndex) {
        return;
      }

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(frameInfo.image, 0, 0, canvas.width, canvas.height);
      displayedFrameIndex = frameInfo.index;
    }

    function getAvailableFrame(targetIndex) {
      if (loadedFrames[targetIndex]) {
        return { image: loadedFrames[targetIndex], index: targetIndex };
      }

      for (var offset = 1; offset < frameCount; offset += 1) {
        var previous = targetIndex - offset;
        if (previous >= 0 && loadedFrames[previous]) {
          return { image: loadedFrames[previous], index: previous };
        }

        var next = targetIndex + offset;
        if (next < frameCount && loadedFrames[next]) {
          return { image: loadedFrames[next], index: next };
        }
      }

      return null;
    }
  }

  function hideLoader() {
    var loader = document.getElementById('loader');
    if (!loader) {
      return;
    }

    loader.style.opacity = '0';
    loader.addEventListener('transitionend', function handleTransitionEnd() {
      loader.removeEventListener('transitionend', handleTransitionEnd);
      loader.remove();
    });

    setTimeout(function () {
      if (document.body.contains(loader)) {
        loader.remove();
      }
    }, 1000);
  }

  function initLazyVideos() {
    var videos = document.querySelectorAll('[data-bloom-video]');
    if (!videos.length) {
      return;
    }

    var groups = {};
    videos.forEach(function (video) {
      var priority = Number(video.dataset.bloomVideoPriority || 100);
      if (!groups[priority]) {
        groups[priority] = [];
      }
      groups[priority].push(video);
    });

    var orderedKeys = Object.keys(groups).map(Number).sort(function (a, b) {
      return a - b;
    });

    if (!orderedKeys.length) {
      return;
    }

    var hasStarted = false;
    var currentGroupIndex = -1;

    function beginProcessing() {
      if (hasStarted) {
        return;
      }
      hasStarted = true;
      debugBloom('Starting lazy video pipeline', orderedKeys);
      startNextGroup();
    }

    document.addEventListener('bloom:hero-ready', beginProcessing, { once: true });
    setTimeout(beginProcessing, 5000);

    function startNextGroup() {
      currentGroupIndex += 1;
      if (currentGroupIndex >= orderedKeys.length) {
        debugBloom('All lazy video groups processed');
        return;
      }

      var priority = orderedKeys[currentGroupIndex];
      var currentGroup = groups[priority];
      if (!currentGroup || !currentGroup.length) {
        startNextGroup();
        return;
      }

      debugBloom('Loading lazy video group', priority);
      var loaders = currentGroup.map(function (video) {
        return loadVideoElement(video);
      });

      Promise.allSettled(loaders).then(function () {
        debugBloom('Completed lazy video group', priority);
        startNextGroup();
      });
    }

    function loadVideoElement(video) {
      return new Promise(function (resolve) {
        if (!video) {
          resolve();
          return;
        }

        if (video.dataset.bloomVideoLoaded === 'true' || video.dataset.bloomVideoLoading === 'true') {
          resolve();
          return;
        }

        var sourceUrl = video.dataset.bloomVideoSrc;
        if (!sourceUrl) {
          resolve();
          return;
        }

        var finished = false;
        video.dataset.bloomVideoLoading = 'true';

        function cleanup() {
          if (finished) {
            return;
          }
          finished = true;
          video.dataset.bloomVideoLoading = 'false';
          video.removeEventListener('loadeddata', handleLoadedData);
          video.removeEventListener('error', handleError);
          clearTimeout(timeoutId);
          resolve();
        }

        function handleLoadedData() {
          video.dataset.bloomVideoLoaded = 'true';
          if (video.hasAttribute('autoplay')) {
            var playPromise = video.play();
            if (playPromise && typeof playPromise.then === 'function') {
              playPromise.catch(function () {
                return null;
              });
            }
          }
          cleanup();
        }

        function handleError() {
          cleanup();
        }

        var timeoutId = setTimeout(cleanup, 12000);
        video.addEventListener('loadeddata', handleLoadedData, { once: true });
        video.addEventListener('error', handleError, { once: true });

        debugBloom('Requesting lazy video', sourceUrl);
        video.src = sourceUrl;
        video.load();
      });
    }
  }

  function initGiantTextTimeline() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      return;
    }

    var giantTextSection = document.getElementById('giant-text-section');
    if (!giantTextSection) {
      return;
    }

    var elements = giantTextSection.querySelectorAll('.reveal-text');
    if (!elements.length) {
      return;
    }

    var tlGiantText = gsap.timeline({
      scrollTrigger: {
        trigger: giantTextSection,
        start: 'top top',
        end: '+=300%',
        pin: true,
        scrub: 1,
        anticipatePin: 1
      }
    });

    elements.forEach(function (el, index) {
      tlGiantText.to(el, {
        opacity: 1,
        y: 0,
        duration: 0.15,
        ease: 'power2.out'
      }, index * 0.25);
    });
  }

  function initRevealAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      return;
    }

    var elements = Array.prototype.slice.call(document.querySelectorAll('.reveal-text')).filter(function (el) {
      return !el.closest('#giant-text-section');
    });

    elements.forEach(function (el) {
      gsap.fromTo(el, { opacity: 0, y: 50 }, {
        opacity: 1,
        y: 0,
        duration: 1.5,
        ease: 'power3.out',
        scrollTrigger: {
          trigger: el,
          start: 'top 85%'
        }
      });
    });
  }

  function initHorizontalScroll() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      return;
    }

    var scrollWrapper = document.querySelector('.horizontal-scroll-wrapper');
    if (!scrollWrapper) {
      return;
    }

    var sections = gsap.utils.toArray('.horizontal-scroll-wrapper > div');
    if (!sections.length) {
      return;
    }

    gsap.to(sections, {
      xPercent: -100 * (sections.length - 1),
      ease: 'none',
      scrollTrigger: {
        trigger: '#horizontal-scroll-section',
        pin: true,
        scrub: 0,
        snap: {
          snapTo: 1 / (sections.length - 1),
          duration: { min: 0.1, max: 0.3 },
          delay: 0
        },
        end: function () {
          return '+=' + scrollWrapper.offsetWidth;
        }
      }
    });
  }

  function initNavBehavior() {
    var nav = document.getElementById('main-nav');
    var heroSection = document.getElementById('hero');
    if (!nav) {
      return;
    }

    var lastScroll = 0;

    window.addEventListener('scroll', function () {
      var currentScroll = window.pageYOffset;
      var heroBottom = heroSection ? heroSection.offsetHeight : 0;

      if (currentScroll < heroBottom) {
        nav.style.mixBlendMode = 'normal';
      } else {
        nav.style.mixBlendMode = 'difference';
      }

      if (currentScroll <= 0) {
        nav.classList.remove('-translate-y-full');
        return;
      }

      if (currentScroll > lastScroll && !nav.classList.contains('-translate-y-full')) {
        nav.classList.add('-translate-y-full');
      } else if (currentScroll < lastScroll && nav.classList.contains('-translate-y-full')) {
        nav.classList.remove('-translate-y-full');
      }

      lastScroll = currentScroll;
    });
  }

  function initSetupCard() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      return;
    }

    var clockProgress = document.getElementById('clock-progress');
    var setupCard = document.getElementById('setup-time-card');
    var setupVideo = document.getElementById('setup-video');

    if (clockProgress && setupCard) {
      gsap.to(clockProgress, {
        strokeDashoffset: 0,
        duration: 5,
        ease: 'none',
        scrollTrigger: {
          trigger: setupCard,
          start: 'top 80%'
        }
      });
    }

    if (setupCard && setupVideo) {
      var isFirstRunSetup = true;

      ScrollTrigger.create({
        trigger: setupCard,
        start: 'top 80%',
        onEnter: function () {
          setupVideo.currentTime = 0;
          setupVideo.loop = false;
          setupVideo.play();
        }
      });

      setupVideo.addEventListener('ended', function () {
        isFirstRunSetup = false;
        setupVideo.currentTime = 0;
        if (setupCard.matches(':hover')) {
          setupVideo.loop = true;
          setupVideo.play();
        }
      });

      setupCard.addEventListener('mouseenter', function () {
        if (isFirstRunSetup) {
          return;
        }
        setupVideo.loop = true;
        setupVideo.play();
      });

      setupCard.addEventListener('mouseleave', function () {
        if (isFirstRunSetup) {
          return;
        }
        setupVideo.loop = false;
        setupVideo.pause();
        setupVideo.currentTime = 0;
      });
    }
  }

  function initShopCard() {
    var shopCard = document.getElementById('shop-card');
    var slideshowImages = document.querySelectorAll('.slideshow-img');
    if (!shopCard || !slideshowImages.length) {
      return;
    }

    var currentSlide = 0;
    var isPaused = false;

    function nextSlide() {
      if (isPaused || !slideshowImages.length) {
        return;
      }
      slideshowImages[currentSlide].style.opacity = '0';
      currentSlide = (currentSlide + 1) % slideshowImages.length;
      slideshowImages[currentSlide].style.opacity = '1';
    }

    var slideshowInterval = setInterval(nextSlide, 3000);

    shopCard.addEventListener('mouseenter', function () {
      isPaused = true;
    });

    shopCard.addEventListener('mouseleave', function () {
      isPaused = false;
    });

    window.addEventListener('beforeunload', function () {
      clearInterval(slideshowInterval);
    });
  }

  function initMaterialsCard() {
    if (typeof ScrollTrigger === 'undefined') {
      return;
    }

    var materialsCard = document.getElementById('materials-card');
    var materialsVideo = document.getElementById('materials-video');

    if (!materialsCard || !materialsVideo) {
      return;
    }

    var isFirstRun = true;

    ScrollTrigger.create({
      trigger: materialsCard,
      start: 'top 80%',
      onEnter: function () {
        materialsVideo.currentTime = 0;
        materialsVideo.loop = false;
        materialsVideo.play();
      }
    });

    materialsVideo.addEventListener('ended', function () {
      isFirstRun = false;
      materialsVideo.currentTime = 0;
      if (materialsCard.matches(':hover')) {
        materialsVideo.loop = true;
        materialsVideo.play();
      }
    });

    materialsCard.addEventListener('mouseenter', function () {
      if (isFirstRun) {
        return;
      }
      materialsVideo.loop = true;
      materialsVideo.play();
    });

    materialsCard.addEventListener('mouseleave', function () {
      if (isFirstRun) {
        return;
      }
      materialsVideo.loop = false;
      materialsVideo.pause();
      materialsVideo.currentTime = 0;
    });
  }

  function initCompressionCard() {
    if (typeof ScrollTrigger === 'undefined') {
      return;
    }

    var compressionCard = document.getElementById('compression-card');
    var compressionVideo = document.getElementById('compression-video');

    if (!compressionCard || !compressionVideo) {
      return;
    }

    var isFirstRunCompression = true;

    ScrollTrigger.create({
      trigger: compressionCard,
      start: 'top 80%',
      onEnter: function () {
        compressionVideo.currentTime = 0;
        compressionVideo.loop = false;
        compressionVideo.play();
      }
    });

    compressionVideo.addEventListener('ended', function () {
      isFirstRunCompression = false;
      compressionVideo.currentTime = 0;
      if (compressionCard.matches(':hover')) {
        compressionVideo.loop = true;
        compressionVideo.play();
      }
    });

    compressionCard.addEventListener('mouseenter', function () {
      if (isFirstRunCompression) {
        return;
      }
      compressionVideo.loop = true;
      compressionVideo.play();
    });

    compressionCard.addEventListener('mouseleave', function () {
      if (isFirstRunCompression) {
        return;
      }
      compressionVideo.loop = false;
      compressionVideo.pause();
      compressionVideo.currentTime = 0;
    });
  }

  function initBestsellerCarousel() {
    var track = document.getElementById('bestseller-track');
    if (!track || !track.children.length) {
      return;
    }

    var nextBtn = document.getElementById('bestseller-next');
    var prevBtn = document.getElementById('bestseller-prev');
    var progressBar = document.getElementById('bestseller-progress');
    var currentIndex = 0;

    function getVisibleCards() {
      var width = window.innerWidth;
      if (width >= 1024) return 4;
      if (width >= 768) return 2;
      return 1;
    }

    function updateCarousel() {
      var visibleCards = getVisibleCards();
      var maxIndex = Math.max(0, track.children.length - visibleCards);
      currentIndex = Math.max(0, Math.min(currentIndex, maxIndex));

      var firstCard = track.children[0];
      var cardWidth = firstCard ? firstCard.offsetWidth : 0;
      var gap = 32;
      var scrollAmount = (cardWidth + gap) * currentIndex;
      track.style.transform = 'translateX(-' + scrollAmount + 'px)';

      if (progressBar) {
        var progress = maxIndex > 0 ? (currentIndex / maxIndex) * 100 : 0;
        progressBar.style.width = progress + '%';
      }

      toggleButtonState(prevBtn, currentIndex === 0);
      toggleButtonState(nextBtn, currentIndex >= maxIndex);
    }

    function toggleButtonState(button, disabled) {
      if (!button) {
        return;
      }
      if (disabled) {
        button.classList.add('opacity-50', 'pointer-events-none');
      } else {
        button.classList.remove('opacity-50', 'pointer-events-none');
      }
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function () {
        currentIndex += 2;
        updateCarousel();
      });
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () {
        currentIndex -= 2;
        updateCarousel();
      });
    }

    window.addEventListener('resize', updateCarousel);
    updateCarousel();
  }

  function initGalleryAnimations() {
    if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
      return;
    }

    var gallerySection = document.getElementById('experience-gallery');
    if (!gallerySection) {
      return;
    }

    var rows = [1, 2, 3, 4, 5];
    rows.forEach(function (rowNum) {
      var rowItems = gallerySection.querySelectorAll('.gallery-item[data-row="' + rowNum + '"]');
      if (!rowItems.length) {
        return;
      }

      gsap.fromTo(rowItems, {
        opacity: 0,
        filter: 'blur(20px)',
        y: 100,
        scale: 0.9
      }, {
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
        scale: 1,
        duration: 1,
        ease: 'power2.out',
        scrollTrigger: {
          trigger: rowItems[0],
          start: 'top 90%',
          end: 'top 60%',
          scrub: 1
        }
      });
    });
  }
})();
