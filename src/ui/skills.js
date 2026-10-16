const escape = (value = '') => String(value).replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function skillExperienceText(years) {
  if (typeof years !== 'number' || !Number.isFinite(years) || years < 0) return 'Experience available on request';
  return `${years} ${years === 1 ? 'year' : 'years'} of use`;
}

export function renderSkills(groups = [], yearsBySkill = {}) {
  const visibleGroups = groups.filter(group => !group.optional);
  return `<section class="skills-section" aria-labelledby="skills-heading">
    <h3 class="work-chapter-title" id="skills-heading">Skills &amp; tools</h3>
    <p class="skills-hint">Select a tool to see years of use.</p>
    <div class="portfolio-skill-groups">${visibleGroups.map(group => `<section class="skill-category">
      <h4>${escape(group.label || group.name)}</h4>
      <div class="skill-tags">${(group.items || []).map(name => `<button type="button" class="skill-tag skill-button" data-skill="${escape(name)}" data-experience="${escape(skillExperienceText(yearsBySkill[name]))}">${escape(name)}</button>`).join('')}</div>
    </section>`).join('')}</div>
  </section>`;
}

let tooltipSequence = 0;

/** One viewport-positioned tooltip avoids clipping inside the scrolling 3D panel. */
export function createSkillTooltips(root) {
  const doc = root.ownerDocument;
  const view = doc.defaultView;
  const tooltip = doc.createElement('div');
  tooltip.id = `skill-experience-tooltip-${++tooltipSequence}`;
  tooltip.className = 'skill-experience-tooltip';
  tooltip.setAttribute('role', 'tooltip');
  tooltip.hidden = true;
  doc.body.appendChild(tooltip);
  let active = null;
  let pinned = false;

  function hide() {
    active?.removeAttribute('aria-describedby');
    active?.removeAttribute('data-tooltip-open');
    active = null;
    pinned = false;
    tooltip.hidden = true;
  }

  function position() {
    if (!active?.isConnected) { hide(); return; }
    const button = active.getBoundingClientRect();
    const readingArea = root.querySelector('.hologram-body')?.getBoundingClientRect();
    if (readingArea && (button.bottom < readingArea.top || button.top > readingArea.bottom)) { hide(); return; }
    const gap = 8;
    const margin = 12;
    const width = tooltip.offsetWidth;
    const height = tooltip.offsetHeight;
    const left = Math.max(margin, Math.min(button.left + (button.width - width) / 2, view.innerWidth - width - margin));
    const above = button.top - height - gap;
    const top = above >= margin ? above : button.bottom + gap;
    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${Math.max(margin, Math.min(top, view.innerHeight - height - margin))}px`;
  }

  function show(button, pin = false) {
    if (active !== button) hide();
    active = button;
    pinned = pin;
    tooltip.textContent = button.dataset.experience;
    tooltip.hidden = false;
    button.setAttribute('aria-describedby', tooltip.id);
    button.setAttribute('data-tooltip-open', 'true');
    position();
  }

  function skillButton(target) {
    const button = target?.closest?.('.skill-button');
    return button && root.contains(button) ? button : null;
  }

  function pointerOver(event) {
    if (event.pointerType === 'touch') return;
    const button = skillButton(event.target);
    if (button && button !== active) show(button);
  }
  function pointerOut(event) {
    const button = skillButton(event.target);
    if (!button || button.contains(event.relatedTarget) || tooltip.contains(event.relatedTarget)) return;
    if (active === button && !pinned && doc.activeElement !== button) hide();
  }
  function focusIn(event) {
    const button = skillButton(event.target);
    if (button && button !== active) show(button);
  }
  function focusOut(event) {
    if (skillButton(event.target) === active) hide();
  }
  function click(event) {
    const button = skillButton(event.target);
    if (!button) return;
    if (active === button && pinned) hide();
    else show(button, true);
  }
  function outsidePointer(event) {
    if (active && !active.contains(event.target) && !tooltip.contains(event.target)) hide();
  }
  function escapeKey(event) {
    if (event.key !== 'Escape' || tooltip.hidden) return;
    hide();
    event.preventDefault();
    event.stopPropagation();
  }
  function leaveTooltip() {
    if (!pinned && doc.activeElement !== active) hide();
  }
  function scroll(event) {
    if (active && root.contains(event.target)) position();
  }

  root.addEventListener('pointerover', pointerOver);
  root.addEventListener('pointerout', pointerOut);
  root.addEventListener('focusin', focusIn);
  root.addEventListener('focusout', focusOut);
  root.addEventListener('click', click);
  tooltip.addEventListener('pointerleave', leaveTooltip);
  doc.addEventListener('pointerdown', outsidePointer, true);
  doc.addEventListener('keydown', escapeKey, true);
  doc.addEventListener('scroll', scroll, true);
  view.addEventListener('resize', hide);

  return {
    hide,
    dispose() {
      hide();
      root.removeEventListener('pointerover', pointerOver);
      root.removeEventListener('pointerout', pointerOut);
      root.removeEventListener('focusin', focusIn);
      root.removeEventListener('focusout', focusOut);
      root.removeEventListener('click', click);
      tooltip.removeEventListener('pointerleave', leaveTooltip);
      doc.removeEventListener('pointerdown', outsidePointer, true);
      doc.removeEventListener('keydown', escapeKey, true);
      doc.removeEventListener('scroll', scroll, true);
      view.removeEventListener('resize', hide);
      tooltip.remove();
    },
  };
}
