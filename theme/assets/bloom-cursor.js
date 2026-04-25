(function () {
  document.addEventListener('DOMContentLoaded', initCursor);

  // Also run on Shopify section load events for dynamic content
  document.addEventListener('shopify:section:load', function () {
    initInteractiveElements();
  });

  function initCursor() {
    console.log('Bloom Cursor: Initializing...');
    // Check for fine pointer (mouse)
    if (window.matchMedia('(pointer: coarse)').matches) {
      console.log('Bloom Cursor: Coarse pointer detected. Aborting.');
      return;
    }

    const cursorDot = document.querySelector('.cursor-dot');
    const cursorOutline = document.querySelector('.cursor-dot-outline');

    if (!cursorDot || !cursorOutline) {
      console.error('Bloom Cursor: Elements not found in DOM.');
      return;
    }
    console.log('Bloom Cursor: Elements found. Binding events.');

    // Movement Logic
    window.addEventListener('mousemove', function (e) {
      const posX = e.clientX;
      const posY = e.clientY;

      // Animate dot immediately
      cursorDot.style.left = posX + 'px';
      cursorDot.style.top = posY + 'px';

      // Animate outline with a slight delay for fluid feel
      cursorOutline.animate({
        left: posX + 'px',
        top: posY + 'px'
      }, { duration: 500, fill: "forwards" });
    });

    initInteractiveElements();
  }

  function initInteractiveElements() {
    // Hover interactions
    // Using delegation to handle dynamic elements better than the static list in interactions.js
    // but keeping the selector list similar
    const selector = 'a, button, .accordion-item, .glossy-card, [data-bloom-cursor="interactive"]';

    document.addEventListener('mouseover', function (event) {
      if (event.target.closest(selector)) {
        document.body.classList.add('hovering');
      }
    });

    document.addEventListener('mouseout', function (event) {
      const related = event.relatedTarget;
      // If moving to another element that matches selector, don't remove class yet
      if (related && related.closest(selector)) {
         return; 
      }
      // If leaving the selector element
      if (event.target.closest(selector)) {
        document.body.classList.remove('hovering');
      }
    });
    
    // Dark Zones (kept from previous implementation as it's useful for the theme)
    const darkZones = document.querySelectorAll('[data-bloom-dark-zone], .bg-black');
    darkZones.forEach(function(zone) {
      zone.addEventListener('mouseenter', function() {
        document.body.classList.add('cursor-white');
      });
      zone.addEventListener('mouseleave', function() {
        document.body.classList.remove('cursor-white');
      });
    });
  }
})();