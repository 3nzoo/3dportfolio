const escape = (value = '') => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));
const list = (value) => Array.isArray(value) ? value : [];

function safeUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.href : '';
  } catch { return ''; }
}

function renderDetail(section) {
  return `<section class="story-detail-section">
    <h4>${escape(section.title)}</h4>
    ${section.body ? `<p>${escape(section.body)}</p>` : ''}
    ${list(section.bullets).length ? `<ul>${section.bullets.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ''}
  </section>`;
}

function renderProject(project, index) {
  const url = safeUrl(project.url);
  return `<article class="story-card">
    <p class="story-eyebrow"><span class="story-number">${escape(String(index + 1).padStart(2, '0'))}</span>${escape(project.eyebrow)}</p>
    <h3>${escape(project.title)}</h3>
    ${project.subtitle ? `<p class="story-subtitle">${escape(project.subtitle)}</p>` : ''}
    <p class="story-summary">${escape(project.summary)}</p>
    <details class="story-details"><summary>Project details<span aria-hidden="true"> +</span></summary><div class="story-details-content">
      ${list(project.facts).length ? `<dl class="story-facts">${project.facts.map((fact) => `<div><dt>${escape(fact.label)}</dt><dd>${escape(fact.value)}</dd></div>`).join('')}</dl>` : ''}
      ${project.outcome ? `<div class="story-outcome"><h4>Delivered</h4><p>${escape(project.outcome)}</p></div>` : ''}
      ${list(project.details).map(renderDetail).join('')}
      ${list(project.tags).length ? `<ul class="story-tags" aria-label="Technologies">${project.tags.map((tag) => `<li>${escape(tag)}</li>`).join('')}</ul>` : ''}
      ${url ? `<a class="story-link" href="${escape(url)}" target="_blank" rel="noopener noreferrer">${escape(project.linkLabel || 'Visit project')}<span aria-hidden="true"> ↗</span></a>` : ''}
    </div></details>
  </article>`;
}

/** HTML for the selected-work panel; all content comes from portfolio.json. */
export function renderSelectedWork(portfolio = {}, { showIntro = true } = {}) {
  const work = portfolio.selectedWork || {};
  return `${showIntro && work.intro ? `<p class="story-intro">${escape(work.intro)}</p>` : ''}
    <div class="story-grid">${list(work.projects).map(renderProject).join('')}</div>`;
}

