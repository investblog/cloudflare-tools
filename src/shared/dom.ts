/**
 * Tiny DOM helpers shared by extension pages.
 * No innerHTML with dynamic data anywhere (AMO review requirement).
 */

/**
 * Single-path decorative SVG icon.
 */
export function createSvgIcon(path: string, className: string, viewBox = '0 0 24 24'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', viewBox);
  svg.setAttribute('fill', 'currentColor');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add(...className.split(' ').filter(Boolean));
  const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  p.setAttribute('d', path);
  svg.appendChild(p);
  return svg;
}

/**
 * Parse STATIC, source-defined markup into a fragment without innerHTML.
 * Never call this with user- or network-provided strings.
 */
export function trustedHTML(html: string): DocumentFragment {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const fragment = document.createDocumentFragment();
  for (const node of Array.from(doc.body.childNodes)) {
    fragment.appendChild(node);
  }
  return fragment;
}
