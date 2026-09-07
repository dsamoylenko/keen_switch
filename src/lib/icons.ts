/**
 * Иконки интерфейса — inline-SVG в стиле Lucide (24×24, stroke 1.75, currentColor).
 *
 * Векторные иконки вместо эмодзи: одинаково выглядят на всех платформах,
 * наследуют цвет темы и масштабируются без размытия.
 */

export type IconName =
  | 'router'
  | 'sliders'
  | 'check'
  | 'monitor'
  | 'alert-circle'
  | 'alert-triangle'
  | 'check-circle'
  | 'info'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'shield-off';

const PATHS: Record<IconName, string> = {
  router:
    '<rect x="2" y="13" width="20" height="8" rx="2.5"/><path d="M6.5 17h.01"/><path d="M10 17h.01"/><path d="M12 10V7.5"/><path d="M8.8 6.2a5 5 0 0 1 6.4 0"/><path d="M6.2 3.4a9 9 0 0 1 11.6 0"/>',
  sliders:
    '<path d="M3 6h9"/><path d="M17 6h4"/><circle cx="14.5" cy="6" r="2.5"/><path d="M3 18h4"/><path d="M12 18h9"/><circle cx="9.5" cy="18" r="2.5"/>',
  check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
  monitor:
    '<rect x="2" y="4" width="20" height="13" rx="2.5"/><path d="M8.5 21h7"/><path d="M12 17v4"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.2h.01"/>',
  'alert-triangle':
    '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5"/><path d="M12 7.8h.01"/>',
  lock: '<rect x="3.5" y="10" width="17" height="10.5" rx="2.5"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"/>',
  eye: '<path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  'eye-off':
    '<path d="M10.6 5.7A10.6 10.6 0 0 1 12 5.5c6.3 0 10 6.5 10 6.5a17.5 17.5 0 0 1-3.4 4.1"/><path d="M6.3 6.8A17.4 17.4 0 0 0 2 12s3.7 6.5 10 6.5a10.5 10.5 0 0 0 4.1-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  'shield-off':
    '<path d="M19.7 14A11 11 0 0 0 20 11.5V5.8l-8-2.8-3.4 1.2"/><path d="M4 6.6v4.9c0 5 3.6 8.1 8 9.5a13 13 0 0 0 4.3-2.3"/><path d="M3 3l18 18"/>',
};

/** Создаёт SVG-иконку; размер и цвет задаются через CSS. */
export function icon(name: IconName, className = 'icon'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.75');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', className);
  svg.innerHTML = PATHS[name];
  return svg;
}
