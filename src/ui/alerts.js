// src/ui/alerts.js
//
// Short notices under the top bar: a fire, pests, a power dip, inspector
// news. Each can carry a "Show" button that swings the camera to the place it
// happened. They fade on their own after a while; tap x to dismiss sooner.

export function createAlerts(root, handlers) {
  const box = document.createElement('div');
  box.className = 'alerts';
  root.appendChild(box);
  const items = []; // { el, until }
  const MAX = 3;

  function remove(item) {
    item.el.remove();
    items.splice(items.indexOf(item), 1);
  }

  return {
    add(alert) {
      if (items.length >= MAX) remove(items[0]);
      const el = document.createElement('div');
      el.className = `alert ${alert.kind ?? ''}`;
      el.innerHTML = `<span class="msg"></span>`;
      el.querySelector('.msg').textContent = alert.text; // text, never HTML
      const item = { el, until: performance.now() + (alert.kind === 'good' ? 7000 : 15000) };
      if (alert.floor !== null && alert.floor !== undefined) {
        const show = document.createElement('button');
        show.type = 'button';
        show.textContent = 'Show';
        show.addEventListener('click', () => handlers.onFocus(alert));
        el.appendChild(show);
      }
      const close = document.createElement('button');
      close.type = 'button';
      close.setAttribute('aria-label', 'Dismiss');
      close.innerHTML = '&times;';
      close.addEventListener('click', () => remove(item));
      el.appendChild(close);
      box.appendChild(el);
      items.push(item);
    },
    // Called every frame: drop notices that have expired.
    tick() {
      const now = performance.now();
      for (const item of items.slice()) if (now > item.until) remove(item);
    },
  };
}
