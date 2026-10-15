// Editor add-on for Sveltia CMS (loaded by /admin/).
//
// Sveltia already refuses to save an entry with a missing or invalid field, but it only
// shows a small "N fields have errors" toast and a red note under each field, which is easy
// to miss on a long form. This script:
//   - lists the offending fields BY NAME in a banner at the top of the screen,
//   - scrolls the first one into view,
//   - flashes a red box around every one of them three times,
//   - keeps a red marker on them until they are fixed (the banner updates live),
//   - adds a "fields marked * are required" note above the form.
// Pure DOM observation: no Sveltia internals are used, so a Sveltia update can only make
// the add-on do nothing, never break the editor.
(() => {
  const FIELD = '.field[data-key-path]';
  const css = `
    .acc-required-note { margin: 0 0 8px; padding: 6px 10px; border-radius: 4px; font-size: 14px;
      color: hsl(210 10% 35%); background: hsl(210 5% 95%); }
    .acc-required-note b { color: hsl(0 85% 35%); font-size: 1.1em; }
    ${FIELD} > header .required { color: hsl(0 85% 35%) !important; font-weight: 700; font-size: 1.1em; }
    /* The box is a real border on a pseudo-element inset inside the field (which Sveltia
       gives position:relative and 16px padding). Anything drawn outside the field's edges
       would be clipped by the scrolling pane, and an inset shadow on the field itself lost
       a pixel at the bottom whenever the field's height was fractional. */
    ${FIELD}.acc-invalid::before { content: ''; position: absolute; inset: 3px 6px; border: 2px solid hsl(0 70% 50%);
      border-radius: 8px; pointer-events: none; }
    ${FIELD}.acc-invalid > header h4 { color: hsl(0 85% 35%); }
    ${FIELD}.acc-flash { animation: acc-flash-bg 0.5s ease-in-out 3; }
    ${FIELD}.acc-flash::before { animation: acc-flash 0.5s ease-in-out 3; }
    @keyframes acc-flash {
      0%, 100% { border-width: 2px; border-color: hsl(0 70% 50%); }
      50% { border-width: 4px; border-color: hsl(0 100% 40%); }
    }
    @keyframes acc-flash-bg {
      0%, 100% { background-color: transparent; }
      50% { background-color: hsl(0 90% 60% / .18); }
    }
    .acc-errors { position: fixed; top: 12px; left: 50%; transform: translateX(-50%); z-index: 100000;
      max-width: min(720px, calc(100vw - 32px)); padding: 12px 44px 12px 16px; border-radius: 8px;
      border: 2px solid hsl(0 70% 50%); background: hsl(0 100% 97%); color: hsl(0 85% 25%);
      box-shadow: 0 6px 24px rgb(0 0 0 / .2); font-family: "Source Sans 3", system-ui, sans-serif; font-size: 15px; line-height: 1.4; }
    .acc-errors p { margin: 0 0 6px; font-weight: 700; }
    .acc-errors ol { margin: 0; padding-left: 22px; }
    .acc-errors li { margin: 2px 0; }
    .acc-errors li button { all: unset; cursor: pointer; text-decoration: underline; font-weight: 700; color: inherit; }
    .acc-errors li button:hover, .acc-errors li button:focus-visible { color: hsl(0 100% 40%); }
    .acc-errors .acc-close { position: absolute; top: 6px; right: 8px; border: 0; background: none; cursor: pointer;
      font-size: 22px; line-height: 1; color: inherit; padding: 4px; }
    @media (prefers-color-scheme: dark) {
      .acc-required-note { color: hsl(210 10% 80%); background: hsl(210 5% 18%); }
      .acc-required-note b, ${FIELD} > header .required, ${FIELD}.acc-invalid > header h4 { color: hsl(0 85% 70%) !important; }
      .acc-errors { background: hsl(0 40% 14%); color: hsl(0 85% 85%); }
    }
  `;
  document.head.append(Object.assign(document.createElement('style'), { textContent: css }));

  const text = (el) => {
    if (!el) return '';
    const clone = el.cloneNode(true);
    clone.querySelectorAll('.icon').forEach((i) => i.remove());
    return clone.textContent.replace(/\s+/g, ' ').trim();
  };
  const ownLabel = (field) => text(field.querySelector(':scope > header h4'));
  /** "Menu › Sub-items › Label": the field's label with the labels of the lists/groups it sits in. */
  const labelOf = (field) => {
    const parts = [];
    for (let el = field; el; el = el.parentElement && el.parentElement.closest(FIELD)) {
      const l = ownLabel(el);
      if (l && l !== parts[0]) parts.unshift(l);
    }
    return parts.join(' › ') || field.dataset.keyPath;
  };
  const messageOf = (field) => text(field.querySelector(':scope > .validation')) || 'Please check this field.';

  /** Fields Sveltia is currently complaining about (each has its own validation note or invalid input). */
  const invalidFields = () => {
    const set = new Set();
    document.querySelectorAll(`${FIELD} > .validation`).forEach((v) => set.add(v.parentElement));
    document.querySelectorAll('[aria-invalid="true"]').forEach((i) => { const f = i.closest(FIELD); if (f) set.add(f); });
    return [...set].filter((f) => !f.closest('[hidden]'));
  };

  const expandParents = (field) => {
    for (let el = field.parentElement && field.parentElement.closest(FIELD); el; el = el.parentElement && el.parentElement.closest(FIELD)) {
      el.querySelectorAll('button[aria-label="Expand"]').forEach((b) => b.click());
    }
  };
  const flash = (fields) => {
    for (const f of fields) {
      f.classList.remove('acc-flash');
      void f.offsetWidth; // restart the animation if it is already running
      f.classList.add('acc-flash');
      f.addEventListener('animationend', () => f.classList.remove('acc-flash'), { once: true });
    }
  };
  const goTo = (field, all) => {
    expandParents(field);
    field.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flash(all || [field]);
    const input = field.querySelector('input, textarea, [contenteditable="true"], [role="combobox"], select');
    if (input && input.closest(FIELD) === field) setTimeout(() => input.focus({ preventScroll: true }), 400);
  };

  let banner = null;
  let dismissedFor = ''; // signature of the error set the user closed the banner for
  const signature = (fields) => fields.map((f) => f.dataset.keyPath + '=' + messageOf(f)).join('|');
  const renderBanner = (fields) => {
    if (!fields.length || signature(fields) === dismissedFor) { if (banner) banner.remove(); banner = null; return; }
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'acc-errors';
      banner.setAttribute('role', 'alert');
      document.body.append(banner);
    }
    const n = fields.length;
    banner.replaceChildren();
    const p = document.createElement('p');
    p.textContent = n === 1 ? 'Not saved yet: 1 field needs attention. Click it to jump there.' : `Not saved yet: ${n} fields need attention. Click one to jump there.`;
    const ol = document.createElement('ol');
    for (const f of fields) {
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = labelOf(f);
      b.addEventListener('click', () => goTo(f));
      li.append(b, ` — ${messageOf(f)}`);
      ol.append(li);
    }
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'acc-close';
    close.setAttribute('aria-label', 'Hide this list');
    close.textContent = '×';
    close.addEventListener('click', () => { dismissedFor = signature(fields); renderBanner(fields); });
    banner.append(close, p, ol);
  };

  const addRequiredNote = () => {
    document.querySelectorAll('.content-editor .pane[data-mode="edit"] .content').forEach((content) => {
      if (content.querySelector(':scope > .acc-required-note') || !content.querySelector(`${FIELD} > header .required`)) return;
      const note = document.createElement('p');
      note.className = 'acc-required-note';
      note.append('Fields marked ', Object.assign(document.createElement('b'), { textContent: '*' }), ' are required.');
      content.prepend(note);
    });
  };

  let known = new Set();
  let timer = 0;
  const update = () => {
    timer = 0;
    addRequiredNote();
    const fields = invalidFields();
    const current = new Set(fields);
    for (const f of known) if (!current.has(f)) f.classList.remove('acc-invalid', 'acc-flash');
    for (const f of fields) if (!f.classList.contains('acc-invalid')) f.classList.add('acc-invalid');
    const fresh = fields.filter((f) => !known.has(f));
    known = current;
    if (fresh.length) dismissedFor = '';
    const sig = signature(fields);
    if (sig !== lastSignature || !!banner !== (fields.length > 0 && sig !== dismissedFor)) { lastSignature = sig; renderBanner(fields); }
    if (fresh.length) goTo(fresh[0], fields); // scroll to the first NEW problem, flash all of them
  };
  let lastSignature = '';
  const ours = (node) => node instanceof Element && node.closest('.acc-errors, .acc-required-note');
  const schedule = (records) => {
    if (records && !records.some((r) => !ours(r.target))) return; // only our own banner changed
    if (!timer) timer = setTimeout(update, 120);
  };
  new MutationObserver(schedule).observe(document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-invalid', 'hidden'] });
  schedule();
})();
