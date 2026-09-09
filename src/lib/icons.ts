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
  | 'smartphone'
  | 'tablet'
  | 'laptop'
  | 'tv'
  | 'gamepad'
  | 'printer'
  | 'alert-circle'
  | 'alert-triangle'
  | 'check-circle'
  | 'info'
  | 'lock'
  | 'eye'
  | 'eye-off'
  | 'shield-off'
  | 'chevron-down'
  | 'star';

const PATHS: Record<IconName, string> = {
  router:
    '<rect x="2" y="13" width="20" height="8" rx="2.5"/><path d="M6.5 17h.01"/><path d="M10 17h.01"/><path d="M12 10V7.5"/><path d="M8.8 6.2a5 5 0 0 1 6.4 0"/><path d="M6.2 3.4a9 9 0 0 1 11.6 0"/>',
  sliders:
    '<path d="M3 6h9"/><path d="M17 6h4"/><circle cx="14.5" cy="6" r="2.5"/><path d="M3 18h4"/><path d="M12 18h9"/><circle cx="9.5" cy="18" r="2.5"/>',
  check: '<path d="M20 6.5 9.5 17 4 11.5"/>',
  monitor:
    '<rect x="2" y="4" width="20" height="13" rx="2.5"/><path d="M8.5 21h7"/><path d="M12 17v4"/>',
  smartphone:
    '<rect x="7" y="2" width="10" height="20" rx="2.5"/><path d="M11 18.3h2"/>',
  tablet:
    '<rect x="3" y="3" width="18" height="18" rx="2.5"/><path d="M12 17.5h.01"/>',
  laptop:
    '<rect x="4" y="4.5" width="16" height="10.5" rx="1.5"/><path d="M2 17.5h20"/>',
  tv:
    '<rect x="2" y="6.5" width="20" height="13.5" rx="2.5"/><path d="m8 3 4 3.5 4-3.5"/><path d="M9.5 22h5"/>',
  gamepad:
    '<path d="M8 9v4"/><path d="M6 11h4"/><circle cx="16.5" cy="10" r="1"/><circle cx="14.5" cy="12.5" r="1"/><path d="M6.5 6h11a4.5 4.5 0 0 1 4.4 5.4l-1 5a3 3 0 0 1-5.3 1.3L14 16h-4l-1.6 1.7A3 3 0 0 1 3 16.4l-1-5A4.5 4.5 0 0 1 6.5 6Z"/>',
  printer:
    '<path d="M7 8V3h10v5"/><rect x="3" y="8" width="18" height="8" rx="2"/><path d="M7 16v5h10v-5"/><path d="M17 11h.01"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 7.5v5"/><path d="M12 16.2h.01"/>',
  'alert-triangle':
    '<path d="M10.3 3.9 1.9 18a2 2 0 0 0 1.7 3h16.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  'check-circle': '<circle cx="12" cy="12" r="9"/><path d="m8.2 12.3 2.6 2.6 5-5.4"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11.2v5"/><path d="M12 7.8h.01"/>',
  lock: '<rect x="3.5" y="10" width="17" height="10.5" rx="2.5"/><path d="M7.5 10V7a4.5 4.5 0 0 1 9 0v3"/>',
  eye: '<path d="M2 12s3.7-6.5 10-6.5S22 12 22 12s-3.7 6.5-10 6.5S2 12 2 12Z"/><circle cx="12" cy="12" r="2.8"/>',
  'eye-off':
    '<path d="M10.6 5.7A10.6 10.6 0 0 1 12 5.5c6.3 0 10 6.5 10 6.5a17.5 17.5 0 0 1-3.4 4.1"/><path d="M6.3 6.8A17.4 17.4 0 0 0 2 12s3.7 6.5 10 6.5a10.5 10.5 0 0 0 4.1-.8"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/><path d="M3 3l18 18"/>',
  'chevron-down': '<path d="m6 9.5 6 6 6-6"/>',
  // Заливка включается классом .is-favorite — контур и звезда рисуются одним путём.
  star: '<path d="m12 2.9 2.85 5.78 6.38.93-4.62 4.5 1.09 6.35L12 17.46l-5.7 3-1.09-6.35-4.62-4.5 6.38-.93Z"/>',
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
