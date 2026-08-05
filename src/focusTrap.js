const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/**
 * Focusable descendants of a container (visible-enough for Tab trapping).
 *
 * Args:
 *   container (Element|null): Root to search within.
 *
 * Returns:
 *   Element[]: Focusable elements in document order.
 */
export const getFocusableElements = (container) => {
  if (!container) {
    return [];
  }
  return Array.from(container.querySelectorAll(FOCUSABLE_SELECTOR)).filter(
    (element) => {
      if (element.getAttribute('aria-hidden') === 'true') {
        return false;
      }
      if (element.hasAttribute('disabled')) {
        return false;
      }
      return true;
    }
  );
};

/**
 * Keydown handler that cycles Tab / Shift+Tab inside a container.
 *
 * Args:
 *   container (Element|null): Trap root (e.g. dialog panel).
 *
 * Returns:
 *   function(KeyboardEvent): Event handler.
 */
export const createFocusTrapKeyDown = (container) => (event) => {
  if (event.key !== 'Tab' || !container) {
    return;
  }
  const focusable = getFocusableElements(container);
  if (focusable.length === 0) {
    event.preventDefault();
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;
  const focusOutside = !container.contains(active);

  if (event.shiftKey) {
    if (active === first || focusOutside) {
      event.preventDefault();
      last.focus();
    }
    return;
  }

  if (active === last || focusOutside) {
    event.preventDefault();
    first.focus();
  }
};
