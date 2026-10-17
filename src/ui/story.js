// src/ui/story.js
//
// The small card that appears when you tap a person: their name, job, mood,
// personality, and a one-line story of what they are doing right now. It
// updates live, and has a "Follow" button that makes the camera trail them.

import { nameOf, jobOf } from '../data/people.js';
import { statusOf, moodWord } from '../sim/stories.js';

export function createStoryCard(root, config, handlers) {
  const card = document.createElement('div');
  card.className = 'story-card';
  card.hidden = true;
  root.appendChild(card);

  let tenantId = null;
  let following = false;
  let goneAt = null;
  let lastRefresh = 0;

  function find() {
    return handlers.getGame().tenants.list.find((t) => t.id === tenantId && !t.dead);
  }

  function hide() {
    tenantId = null;
    following = false;
    goneAt = null;
    card.hidden = true;
    root.classList.remove('story-open');
    handlers.onClose();
  }

  function show(id) {
    tenantId = id;
    following = false;
    goneAt = null;
    card.hidden = false;
    root.classList.add('story-open');
    const t = find();
    const trait = config.tenants.traits[t.trait];
    card.innerHTML = `
      <div class="story-head">
        <div>
          <div class="story-name" data-k="name"></div>
          <div class="story-job" data-k="job"></div>
        </div>
        <button class="close" type="button" id="story-close" aria-label="Close">&times;</button>
      </div>
      <div class="story-status" data-k="status"></div>
      <div class="story-mood"><span data-k="mood"></span><span class="bar"><span data-k="bar"></span></span></div>
      <div class="story-trait"><span class="dot" style="background:${trait.color}"></span><b>${trait.label}</b> ${trait.desc ?? ''}</div>
      <button class="secondary" type="button" id="story-follow">Follow</button>`;
    card.querySelector('#story-close').addEventListener('click', hide);
    card.querySelector('#story-follow').addEventListener('click', () => {
      following = !following;
      card.querySelector('#story-follow').textContent = following ? 'Following (tap to stop)' : 'Follow';
      handlers.onFollow(following);
    });
    refresh(true);
  }

  const set = (key, text) => {
    const el = card.querySelector(`[data-k="${key}"]`);
    if (el && el.textContent !== text) el.textContent = text;
  };

  function refresh(force = false) {
    if (tenantId === null) return;
    const now = performance.now();
    if (!force && now - lastRefresh < 300) return;
    lastRefresh = now;
    const game = handlers.getGame();
    const t = find();
    if (t) {
      set('name', nameOf(t));
      set('job', jobOf(t));
    }
    if (!t || t.mode === 'away') {
      set('status', 'Has left the building for now.');
      if (goneAt === null) goneAt = now;
      if (now - goneAt > 1800) hide();
      return;
    }
    goneAt = null;
    set('name', nameOf(t));
    set('job', jobOf(t));
    set('status', statusOf(game, config, t));
    set('mood', `Feeling ${moodWord(config, t)} (${Math.round(t.stress)})`);
    const bar = card.querySelector('[data-k="bar"]');
    bar.style.width = `${Math.round(t.stress)}%`;
  }

  return {
    show,
    hide,
    refresh,
    isOpen: () => tenantId !== null,
    get id() {
      return tenantId;
    },
    get following() {
      return following;
    },
  };
}
