import { createInquiryClient } from '../contact/inquiries.js';
import { createSkillTooltips } from './skills.js';
import { renderAbout, renderExperience, renderEducation, renderContactLinks } from './portfolio-content.js';
import skillYears from '../content/skill-years.json';
import { SECTION_NAMES, SECTION_LABELS, normalizePortfolioSection as normalizeSection } from './portfolio-sections.js';

const inquiries = createInquiryClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});

const SECTIONS = Object.keys(SECTION_NAMES);
const ICON_CLOSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>';
const ICON_ARROW = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 17 17 7M7 7h10v10" /></svg>';

function renderContact(portfolio) {
  return `${renderContactLinks(portfolio)}
    <form class="contact-form">
      <div class="form-row">
        <div class="form-field"><label for="contact-name">YOUR NAME</label><input id="contact-name" name="name" autocomplete="name" placeholder="Your name" maxlength="100" required /></div>
        <div class="form-field"><label for="contact-email">EMAIL ADDRESS</label><input id="contact-email" name="email" type="email" autocomplete="email" placeholder="you@example.com" maxlength="200" required /></div>
      </div>
      <div class="form-field"><label for="contact-subject">SUBJECT</label><input id="contact-subject" name="subject" placeholder="What would you like to talk about?" maxlength="200" required /></div>
      <div class="form-field"><label for="contact-message">YOUR MESSAGE</label><textarea id="contact-message" name="message" placeholder="Tell me a little about it…" maxlength="5000" required></textarea></div>
      <button class="contact-submit" type="submit">Send message${ICON_ARROW}</button>
      <p class="contact-note">${inquiries.configured ? 'Your message is saved privately so I can get back to you.' : 'The message form is currently unavailable. Please use the email link above.'}</p>
      <p class="form-status" role="status" aria-live="polite"></p>
    </form>`;
}

/** DOM surface for a Three.js CSS3DObject; world positioning belongs to the scene. */
export function createHologram(portfolio) {
  let activeSection = null;
  let previousFocus = null;
  const contactDraft = {};
  let contactPending = false;
  let contactFeedback = '';
  const closeCallbacks = new Set();
  const element = document.createElement('section');
  element.className = 'hologram-panel';
  element.setAttribute('role', 'dialog');
  element.setAttribute('aria-modal', 'true');
  element.setAttribute('aria-labelledby', 'hologram-title');
  element.setAttribute('aria-hidden', 'true');
  element.innerHTML = `<header class="hologram-header"><h2 class="hologram-title" id="hologram-title">About</h2><button class="hologram-close" type="button" aria-label="Close portfolio panel">${ICON_CLOSE}</button></header>
    <nav class="hologram-nav" role="tablist" aria-label="Portfolio content">${SECTIONS.map((id) => `<button class="hologram-tab" id="hologram-tab-${id}" data-hologram-section="${id}" role="tab" type="button" aria-controls="hologram-content" aria-selected="false" tabindex="-1">${SECTION_LABELS[id]}</button>`).join('')}</nav>
    <div class="hologram-body" id="hologram-content" role="tabpanel" tabindex="0"></div>
    <footer class="hologram-footer"><span class="footer-signal"><i></i>ENZOLABS</span><span>SCROLL TO EXPLORE ↓</span></footer>`;
  const body = element.querySelector('.hologram-body');
  const closeButton = element.querySelector('.hologram-close');
  const tabs = [...element.querySelectorAll('.hologram-tab')];
  const skillTooltips = createSkillTooltips(element);
  const initialDocument = document.querySelector('#portfolio-document');
  const sectionContent = new Map(
    [...(initialDocument?.querySelectorAll('[data-portfolio-content]') || [])]
      .map(section => [section.dataset.portfolioContent, section]),
  );
  const renders = {
    about: () => renderAbout(portfolio, skillYears),
    experience: () => renderExperience(portfolio, skillYears),
    education: () => renderEducation(portfolio),
    contact: () => renderContact(portfolio),
  };
  // Move the initial content into its actual tabs; keep all sections in the DOM.
  for (const section of sectionContent.values()) {
    section.hidden = true;
    body.appendChild(section);
  }
  initialDocument?.remove();
  function setBackgroundInert(inert) {
    for (const selector of ['#game-hud', '#portfolio-header', '#scene-mount']) {
      document.querySelector(selector)?.toggleAttribute('inert', inert);
    }
  }

  function saveDraft() {
    if (activeSection !== 'contact') return;
    body.querySelectorAll('input, textarea').forEach((field) => { contactDraft[field.name] = field.value; });
  }

  function updateContactForm() {
    if (activeSection !== 'contact') return;
    const form = body.querySelector('form');
    form.setAttribute('aria-busy', String(contactPending));
    form.querySelectorAll('input, textarea').forEach((field) => { field.disabled = contactPending; });
    const submit = form.querySelector('.contact-submit');
    submit.disabled = contactPending || !inquiries.configured;
    submit.innerHTML = `${contactPending ? 'Sending…' : 'Send message'}${ICON_ARROW}`;
    form.querySelector('.form-status').textContent = contactFeedback;
  }

  function close() {
    if (!activeSection) return;
    saveDraft();
    skillTooltips.hide();
    const closedSection = activeSection;
    activeSection = null;
    element.classList.remove('is-open');
    element.setAttribute('aria-hidden', 'true');
    document.body.classList.remove('hologram-open');
    setBackgroundInert(false);
    closeCallbacks.forEach((callback) => callback(closedSection));
    const returnFocus = previousFocus === document.body ? document.querySelector('#drop-ball') : previousFocus;
    if (returnFocus?.isConnected && !returnFocus.disabled) returnFocus.focus({ preventScroll: true });
    element.dispatchEvent(new CustomEvent('hologram:close', { bubbles: true, detail: { sectionId: closedSection } }));
  }

  function open(sectionId) {
    const id = normalizeSection(sectionId);
    if (!SECTIONS.includes(id)) return;
    const wasOpen = Boolean(activeSection);
    if (!wasOpen) previousFocus = document.activeElement;
    saveDraft();
    activeSection = id;
    element.querySelector('.hologram-title').textContent = SECTION_NAMES[id];
    tabs.forEach((tab) => {
      const selected = tab.dataset.hologramSection === id;
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    const selectedTab = tabs.find(tab => tab.dataset.hologramSection === id);
    const navigation = element.querySelector('.hologram-nav');
    if (selectedTab) navigation.scrollLeft = selectedTab.offsetLeft - navigation.offsetLeft - 26;
    body.setAttribute('aria-labelledby', `hologram-tab-${id}`);
    skillTooltips.hide();
    let content = sectionContent.get(id);
    if (!content) {
      content = document.createElement('div');
      content.dataset.portfolioContent = id;
      content.innerHTML = renders[id]();
      sectionContent.set(id, content);
      body.appendChild(content);
    } else if (id === 'contact') {
      // Preserve the existing form/draft lifecycle; only public links are prerendered.
      content.innerHTML = renders.contact();
    }
    for (const [sectionId, section] of sectionContent) section.hidden = sectionId !== id;
    body.scrollTop = 0;
    if (id === 'contact') {
      body.querySelectorAll('input, textarea').forEach((field) => { field.value = contactDraft[field.name] || ''; });
      updateContactForm();
      body.querySelector('form').addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        if (contactPending || !form.reportValidity()) return;
        const fields = new FormData(form);
        saveDraft();
        contactPending = true;
        contactFeedback = 'Sending your message…';
        updateContactForm();
        try {
          await inquiries.submit(Object.fromEntries(fields));
          Object.keys(contactDraft).forEach((name) => delete contactDraft[name]);
          if (activeSection === 'contact') body.querySelector('form').reset();
          contactFeedback = 'Thank you—your message has been saved. I’ll get back to you by email.';
        } catch (error) {
          contactFeedback = error.message;
        } finally {
          contactPending = false;
          updateContactForm();
        }
      });
    }
    element.classList.add('is-open');
    element.setAttribute('aria-hidden', 'false');
    document.body.classList.add('hologram-open');
    setBackgroundInert(true);
    if (!wasOpen) requestAnimationFrame(() => { if (activeSection) closeButton.focus({ preventScroll: true }); });
    element.dispatchEvent(new CustomEvent('hologram:open', { bubbles: true, detail: { sectionId: id, wasOpen } }));
  }

  closeButton.addEventListener('click', close);
  tabs.forEach((tab) => tab.addEventListener('click', () => open(tab.dataset.hologramSection)));
  element.querySelector('.hologram-nav').addEventListener('keydown', (event) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    let index = SECTIONS.indexOf(activeSection);
    if (event.key === 'ArrowLeft') index = (index + SECTIONS.length - 1) % SECTIONS.length;
    if (event.key === 'ArrowRight') index = (index + 1) % SECTIONS.length;
    if (event.key === 'Home') index = 0;
    if (event.key === 'End') index = SECTIONS.length - 1;
    open(SECTIONS[index]);
    tabs[index].focus({ preventScroll: true });
  });

  function handleKeyboard(event) {
    if (!activeSection) return;
    if (event.key === 'Escape') { event.preventDefault(); close(); return; }
    if (event.key !== 'Tab') return;
    const focusable = [...element.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), summary, [tabindex="0"]')].filter((node) => node.getClientRects().length && !node.hidden && node.tabIndex >= 0);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && (document.activeElement === first || !element.contains(document.activeElement))) { event.preventDefault(); last?.focus({ preventScroll: true }); }
    else if (!event.shiftKey && (document.activeElement === last || !element.contains(document.activeElement))) { event.preventDefault(); first?.focus({ preventScroll: true }); }
  }
  element.addEventListener('keydown', (event) => { handleKeyboard(event); event.stopPropagation(); });
  document.addEventListener('keydown', handleKeyboard);
  ['pointerdown', 'pointerup', 'click', 'wheel', 'touchmove'].forEach((eventName) => element.addEventListener(eventName, (event) => event.stopPropagation(), { passive: true }));

  return {
    element,
    open,
    close,
    get isOpen() { return Boolean(activeSection); },
    get activeSection() { return activeSection; },
    onClose(callback) { closeCallbacks.add(callback); return () => closeCallbacks.delete(callback); },
    dispose() {
      document.removeEventListener('keydown', handleKeyboard);
      closeCallbacks.clear();
      skillTooltips.dispose();
      document.body.classList.remove('hologram-open');
      setBackgroundInert(false);
      element.remove();
    },
  };
}
