import { getResumeUrl, ICON_DOWNLOAD } from './resume.js';
import { renderSelectedWork } from './portfolio-stories.js';
import { renderSkills, renderSkillTag } from './skills.js';

const escape = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const list = (value) => Array.isArray(value) ? value : value ? [value] : [];
const tags = (items = [], yearsBySkill = {}) => list(items).length ? `<div class="skill-tags">${list(items).map((item) => renderSkillTag(item, yearsBySkill)).join('')}</div>` : '';
const bullets = (items = []) => list(items).length ? `<ul class="timeline-bullets">${list(items).map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : '';
const safeUrl = (value = '') => /^(https?:\/\/|mailto:)/i.test(value) ? value : '';

export function renderAbout(portfolio, yearsBySkill = {}) {
  const profile = portfolio.profile || {};
  return `${String(profile.summary || '').split(/\n\s*\n/).filter((paragraph) => paragraph.trim()).map((paragraph) => `<p class="profile-summary">${escape(paragraph)}</p>`).join('')}
    <h3 class="work-chapter-title">Selected work</h3>
    <section class="selected-work-section" aria-label="Selected work">${renderSelectedWork(portfolio, { showIntro: false, yearsBySkill })}</section>
    ${renderSkills(list(profile.skills || portfolio.skills), yearsBySkill)}`;
}

export function renderExperience(portfolio, yearsBySkill = {}) {
  return `<p class="intro-note">From building products from scratch to taking ownership of existing systems. Explore the roles below for scope and technical details.</p>
    <div class="timeline">${list(portfolio.experience || portfolio.experiences).map((experience) => `<article class="timeline-entry">
      <p class="timeline-period">${escape(experience.period)}</p>
      <h3>${escape(experience.role)}</h3>
      <p class="timeline-company">${escape(experience.company)}</p>
      ${experience.summary ? `<p class="timeline-description">${escape(experience.summary)}</p>` : ''}
      <details class="career-details"><summary>Scope &amp; technical details</summary>
      ${bullets(experience.bullets)}
      ${list(experience.projects).map((project) => `<div class="timeline-project"><h4>${escape(project.title || project.name)}</h4><p>${escape(project.description)}</p>${bullets(project.bullets)}${tags(project.tags, yearsBySkill)}</div>`).join('')}
      ${tags(experience.tags, yearsBySkill)}
      </details>
    </article>`).join('')}</div>`;
}

export function renderEducation(portfolio) {
  const entries = [...list(portfolio.education || portfolio.profile?.education), ...list(portfolio.certifications)];
  return `<p class="intro-note">The foundations, qualifications, and learning that shaped my work.</p><div class="timeline">${entries.map((entry, index) => `<article class="timeline-entry education-entry ${index === 0 ? 'is-featured' : ''}">
    <p class="timeline-period">${escape(entry.period || entry.year || '')}</p>
    <h3>${escape(entry.title || entry.degree || entry.name)}</h3>
    <p class="timeline-company">${escape(entry.institution || entry.issuer)}</p>
    ${entry.detail || entry.description ? `<p class="timeline-description">${escape(entry.detail || entry.description)}</p>` : ''}
    ${bullets(entry.bullets)}
  </article>`).join('')}</div>`;
}

export function renderContactLinks(portfolio) {
  const profile = portfolio.profile || {};
  const email = profile.email || portfolio.contact?.email || '';
  const resumeUrl = getResumeUrl(profile);
  const links = [{ href: email ? `mailto:${email}` : '', label: email }, { href: profile.github, label: 'GitHub' }, { href: profile.linkedin, label: 'LinkedIn' }].filter((link) => safeUrl(link.href));
  return `<h3 class="contact-intro">Have something in mind?</h3><p class="intro-note">I’d love to hear about your project, an opportunity, or a good idea.</p>
    <div class="contact-links">${links.map((link) => `<a href="${escape(link.href)}" ${link.href.startsWith('http') ? 'target="_blank" rel="noopener noreferrer"' : ''}>${escape(link.label)}</a>`).join('')}</div>
    ${resumeUrl ? `<div class="contact-resume"><a class="resume-download" href="${escape(resumeUrl)}" download>Download CV${ICON_DOWNLOAD}</a><span class="resume-format">PDF</span></div>` : ''}
`;
}
