# Layer Webstore Polish Checklist

## Global / Store Structure

- [x] Add a `<main>` wrapper around all primary content after nav and before footer for cleaner page semantics.
- [x] Fix horizontal overflow. Rendered `body.scrollWidth` is wider than the viewport on desktop and mobile, mainly from the pinned horizontal gallery wrapper.
- [x] Contain the horizontal-scroll gallery so the page does not expose sideways scrolling outside the intended animation.
- [x] Replace placeholder `href="#"` links across nav/footer with real commerce or section targets.
- [x] Add product-detail or quick-shop links/actions to product cards.
- [x] Add actual cart behavior or link the Cart button.
- [x] Add favicon and app icons.
- [x] Add SEO/social meta tags: description, Open Graph image, and canonical URL.
- [x] Consider self-hosting Tailwind and GSAP for production instead of relying on browser CDN scripts.

## Navigation

- [x] Add mobile navigation. Current mobile nav hides the center links entirely, leaving only brand and cart.
- [x] Make the brand link scroll to top or route home instead of pointing to `#`.
- [x] Remove the 'journal' and add 'Fragrances' 'For him' 'For her'
- [x] Add cart button behavior.
- [x] Add a `type` and stronger accessible labeling to the Cart button.

## Hero

- [x] Keep the current visual language and typography.
- [x] Make the “Discover Layering” CTA destination match the intended user journey.
- [x] Check small mobile heights so the scroll prompt does not feel clipped.
- [x] Contain the decorative oversized rings/blobs within the hero clipping context to avoid mobile overflow.

## Cinematic Reveal

- [x] Replace or document the hard-coded `height: 300vh` reveal duration.
- [x] Tie reveal scroll duration to content/viewport if a more resilient structure is needed.
- [x] Modify the reveal animation such that the text emerges from smoke particles. Rather the smoke particles combine to reveal the text. 
- [x] Preload or eager-load reveal images if they are essential to the scroll moment.
- [x] Add a no-JS readable fallback so reveal text is not stuck in low-opacity styling if scripts fail.

## Starter Kit Showcase

- [x] Modify this section entirely, have the section split into two parts vetically. Hover response: hovering over each section would enlarge it horizontally to 3 parts of the entire section while the other section would be 1 part. Left section is "For him" and right section is "For her". 
- [x] Generate images using the /image-gen skill for both the section. the image span across the entire section. image ratio 16:9. Choose product being mentioned in layer-product-combos for him and for her. 
- [x] Keep the animation smooth and snappy

## Horizontal Curated Stacks

- [x] Fix the gallery wrapper causing document-wide horizontal overflow.
- [x] Make product cards clickable/focusable product entries.
- [x] Hovering should reveal a "buy now" button
- [x] Convert the “Build Your Own” card into a real button or link.
- [x] Add a mobile fallback for the pinned horizontal scroll. Simple vertical list should do the trick. 
- [x] Add missing product metadata expected in a store: CTA, size, bundle contents, availability, or add-to-cart path.

## Philosophy

- [x] Keep the editorial layout and style.
- [x] Sharpen the content around store-confidence signals: formulation, sourcing, layering method, or quality promise.
- [x] Replace the images with somehting that suits the section more. Feel free to generate with image-gen skill if needed. 
- [x] Replace Generic image alt text like “Perfume detail” with specific description.
- [x] Verify negative z-index decorative elements render consistently across browsers.

## Notes Visualizer

- [x] Add `aria-expanded` to accordion buttons.
- [x] The 'Base Notes' element is not in the correct placing, it should be below the heart notes 
- [x] Increase visiblity of the SCENT PROFILE component. (Bigger and Bolder) 
- [x] Add controlled panel IDs for accordion content.
- [x] Add persistent click/toggle behavior instead of relying only on hover/focus.
- [x] Provide a compact mobile equivalent for the hidden scent profile visualization, or intentionally simplify the mobile experience.
- [x] Ensure touch users can trigger the background image change or equivalent interaction.

## Email CTA

- [x] Replace `onsubmit="return false;"` with a real submit flow.
- [x] Add `name` attributes to form fields.
- [x] Add validation messaging.
- [x] Add success and error states.
- [ ] Connect the form to a real subscription endpoint.
- [x] Add an accessible input label instead of relying only on placeholder text.

## Footer

- [x] Replace all placeholder footer links with real destinations.
- [x] Add policy/store essentials: shipping, returns, privacy, terms, FAQ, and contact.
- [x] Add real social URLs.
- [x] Add accessible labels for social links if icons are introduced later.
- [x] Update static `© 2026` copyright to the current/legal year strategy.
- [x] Recheck mobile footer layout after real links are added.
