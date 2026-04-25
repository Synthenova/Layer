import { Component } from '@theme/component';
import { ThemeEvents, VariantUpdateEvent, ZoomMediaSelectedEvent } from '@theme/events';

/**
 * A custom element that renders a media gallery.
 *
 * @typedef {object} Refs
 * @property {import('./zoom-dialog').ZoomDialog} [zoomDialogComponent] - The zoom dialog component.
 * @property {import('./slideshow').Slideshow} [slideshow] - The slideshow component.
 * @property {HTMLElement[]} [media] - The media elements.
 *
 * @extends Component<Refs>
 */
export class MediaGallery extends Component {
  connectedCallback() {
    super.connectedCallback();

    const { signal } = this.#controller;
    const target = this.closest('.shopify-section, dialog');

    target?.addEventListener(ThemeEvents.variantUpdate, this.#handleVariantUpdate, { signal });
    this.refs.zoomDialogComponent?.addEventListener(ThemeEvents.zoomMediaSelected, this.#handleZoomMediaSelected, {
      signal,
    });
  }

  #controller = new AbortController();

  disconnectedCallback() {
    super.disconnectedCallback();

    this.#controller.abort();
  }

  /**
   * Handles a variant update event by replacing the current media gallery with a new one.
   *
   * @param {VariantUpdateEvent} event - The variant update event.
   */
  #handleVariantUpdate = (event) => {
    const source = event.detail.data.html;

    if (!source) return;
    const newMediaGallery = source.querySelector('media-gallery');

    if (!newMediaGallery) return;

    const featuredMediaId = event.detail.resource?.featured_media?.id;
    const mediaId = featuredMediaId ? String(featuredMediaId) : null;

    this.replaceWith(newMediaGallery);

    if (!mediaId) return;

    const queryRoot =
      newMediaGallery.dataset.presentation === 'grid'
        ? newMediaGallery.querySelector('.media-gallery__grid')
        : null;
    const mediaMatch = (queryRoot || newMediaGallery).querySelector(`[data-media-id="${mediaId}"]`);
    const scrollTarget = mediaMatch?.closest('.product-media-container') || mediaMatch;

    if (!scrollTarget) return;

    requestAnimationFrame(() => {
      scrollTarget.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });
    });
  };

  /**
   * Handles the 'zoom-media:selected' event.
   * @param {ZoomMediaSelectedEvent} event - The zoom-media:selected event.
   */
  #handleZoomMediaSelected = async (event) => {
    this.slideshow?.select(event.detail.index, undefined, { animate: false });
  };

  /**
   * Zooms the media gallery.
   *
   * @param {number} index - The index of the media to zoom.
   * @param {PointerEvent} event - The pointer event.
   */
  zoom(index, event) {
    this.refs.zoomDialogComponent?.open(index, event);
  }

  get slideshow() {
    return this.refs.slideshow;
  }

  get media() {
    return this.refs.media;
  }

  get presentation() {
    return this.dataset.presentation;
  }

  /**
   * Scrolls to a specific media item in the grid view and updates thumbnail states.
   *
   * @param {number} index - The index of the media to scroll to.
   * @param {Event} [event] - The event that triggered the scroll.
   */
  scrollToMedia(index, event) {
    event?.preventDefault();

    const mediaItems = this.refs.media;
    const thumbnailButtons = this.refs.gridThumbnailButtons;

    if (!mediaItems || !mediaItems[index]) return;

    const targetMedia = mediaItems[index];

    // Scroll the media item into view
    targetMedia.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
      inline: 'nearest',
    });

    // Update thumbnail aria-selected states
    if (thumbnailButtons) {
      thumbnailButtons.forEach((btn, i) => {
        btn.setAttribute('aria-selected', String(i === index));
      });
    }
  }
}

if (!customElements.get('media-gallery')) {
  customElements.define('media-gallery', MediaGallery);
}
