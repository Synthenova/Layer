class ProductRecommendations extends HTMLElement {
  /**
   * The observer for the product recommendations
   * @type {IntersectionObserver}
   */
  #intersectionObserver = new IntersectionObserver(
    (entries, observer) => {
      if (!entries[0]?.isIntersecting) return;

      observer.disconnect();
      this.#loadRecommendations();
    },
    { rootMargin: '0px 0px 400px 0px' }
  );

  /**
   * Observing changes to the elements attributes
   * @type {MutationObserver}
   */
  #mutationObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      // Only attribute changes are interesting
      if (mutation.target !== this || mutation.type !== 'attributes') continue;

      // Ignore error attribute changes
      if (mutation.attributeName === 'data-error') continue;

      // Ignore addition of hidden class because it means there's an error with the display
      if (mutation.attributeName === 'class' && this.classList.contains('hidden')) continue;

      // Ignore when the data-recommendations-performed attribute has been set to 'true'
      if (
        mutation.attributeName === 'data-recommendations-performed' &&
        this.dataset.recommendationsPerformed === 'true'
      )
        continue;

      // All other attribute changes trigger a reload
      this.#loadRecommendations();
      break;
    }
  });

  /**
   * The cached recommendations
   * @type {Record<string, string>}
   */
  #cachedRecommendations = {};

  /**
   * An abort controller for the active fetch (if there is one)
   * @type {AbortController | null}
   */
  #activeFetch = null;

  connectedCallback() {
    this.#intersectionObserver.observe(this);
    this.#mutationObserver.observe(this, { attributes: true });
  }

  disconnectedCallback() {
    this.#intersectionObserver.disconnect();
    this.#mutationObserver.disconnect();
  }

  /**
   * Load the product recommendations
   */
  #loadRecommendations() {
    const { productId, recommendationsPerformed, sectionId, intent } = this.dataset;
    const id = this.id;

    if (!productId || !id) {
      throw new Error('Product ID and an ID attribute are required');
    }

    // If the recommendations have already been loaded, accounts for the case where the Theme Editor
    // is loaded the section from the editor's visual preview context.
    if (recommendationsPerformed === 'true') {
      return;
    }

    this.#fetchCachedRecommendations(productId, sectionId, intent)
      .then((result) => {
        if (!result.success) {
          // The Theme Editor will place a section element element in the DOM whose section_id is not available
          // to the Section Renderer API. In this case, we can safely ignore the error.
          if (!Shopify.designMode) {
            this.#handleError(new Error(`Server returned ${result.status}`));
          }
          return;
        }

        const html = document.createElement('div');
        html.innerHTML = result.data || '';
        const recommendations = html.querySelector(`product-recommendations[id="${id}"]`);

        if (recommendations?.innerHTML && recommendations.innerHTML.trim().length) {
          this.dataset.recommendationsPerformed = 'true';
          this.innerHTML = recommendations.innerHTML;

          // Initialize hover autoplay for product card galleries
          this.#initHoverAutoplay();
        } else {
          this.#handleError(new Error('No recommendations available'));
        }
      })
      .catch((e) => {
        this.#handleError(e);
      });
  }

  /**
   * Fetches the recommendations and cached the result for future use
   * @param {string} productId
   * @param {string | undefined} sectionId
   * @param {string | undefined} intent
   * @returns {Promise<{ success: true, data: string } | { success: false, status: number }>}
   */
  async #fetchCachedRecommendations(productId, sectionId, intent) {
    const url = `${this.dataset.url}&product_id=${productId}&section_id=${sectionId}&intent=${intent}`;

    const cachedResponse = this.#cachedRecommendations[url];
    if (cachedResponse) {
      return { success: true, data: cachedResponse };
    }

    this.#activeFetch?.abort();
    this.#activeFetch = new AbortController();

    try {
      const response = await fetch(url, { signal: this.#activeFetch.signal });
      if (!response.ok) {
        return { success: false, status: response.status };
      }

      const text = await response.text();
      this.#cachedRecommendations[url] = text;
      return { success: true, data: text };
    } finally {
      this.#activeFetch = null;
    }
  }

  /**
   * Handle errors in a consistent way
   * @param {Error} error
   */
  #handleError(error) {
    console.error('Product recommendations error:', error.message);
    this.classList.add('hidden');
    this.dataset.error = 'Error loading product recommendations';
  }

  /**
   * Intervals for hover autoplay
   * @type {WeakMap<HTMLElement, number>}
   */
  #galleryIntervals = new WeakMap();

  /**
   * Initialize hover autoplay for product card galleries
   */
  #initHoverAutoplay() {
    const AUTOPLAY_INTERVAL = 800;
    const galleries = this.querySelectorAll('.card-gallery');

    galleries.forEach((gallery) => {
      const startAutoplay = () => {
        if (this.#galleryIntervals.has(gallery)) return;

        const slideshow = gallery.querySelector('slideshow-component');
        if (!slideshow || typeof slideshow.next !== 'function') return;

        // Re-enable the slideshow (it's disabled when nested)
        slideshow.setAttribute('disabled', 'false');

        const interval = setInterval(() => slideshow.next(), AUTOPLAY_INTERVAL);
        this.#galleryIntervals.set(gallery, interval);
      };

      const stopAutoplay = () => {
        const interval = this.#galleryIntervals.get(gallery);
        if (interval) {
          clearInterval(interval);
          this.#galleryIntervals.delete(gallery);

          // Re-disable the slideshow
          const slideshow = gallery.querySelector('slideshow-component');
          if (slideshow) {
            slideshow.setAttribute('disabled', 'true');
          }
        }
      };

      gallery.addEventListener('pointerenter', startAutoplay);
      gallery.addEventListener('pointerleave', stopAutoplay);

      // Stop autoplay when hovering swatch container to prevent image cycling
      const swatchContainer = gallery.querySelector('.product-card__image-swatches');
      if (swatchContainer) {
        swatchContainer.addEventListener('pointerenter', (e) => {
          e.stopPropagation();
          stopAutoplay();
        });
        swatchContainer.addEventListener('pointerleave', startAutoplay);
      }
    });
  }
}

if (!customElements.get('product-recommendations')) {
  customElements.define('product-recommendations', ProductRecommendations);
}
