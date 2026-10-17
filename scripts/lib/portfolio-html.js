import { readFileSync } from 'node:fs';
import { renderAbout, renderExperience, renderEducation, renderContactLinks } from '../../src/ui/portfolio-content.js';

const escape = value => String(value || '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[character]));

export function renderPortfolioDocument(portfolio, years) {
  const profile = portfolio.profile || {};
  const sections = [
    ['about', 'About', renderAbout(portfolio, years)],
    ['experience', 'Experience', renderExperience(portfolio, years)],
    ['education', 'Education', renderEducation(portfolio)],
    ['contact', 'Contact', renderContactLinks(portfolio)],
  ];
  return `<article id="portfolio-document" class="portfolio-document" aria-label="Professional portfolio">
    <div class="portfolio-document-content">
      <header><p>EnzoLabs</p><h1>${escape(profile.name)}</h1><p>${escape(profile.role)}</p><p>${escape(profile.headline)}</p><p>${escape(profile.location)}</p></header>
      <nav aria-label="Portfolio sections">${sections.map(([id, title]) => `<a href="#${id}">${title}</a>`).join('')}</nav>
      ${sections.map(([id, title, content]) => `<section id="${id}" aria-labelledby="document-${id}-heading"><h2 id="document-${id}-heading">${title}</h2><div data-portfolio-content="${id}">${content}</div></section>`).join('')}
    </div>
  </article>`;
}

/** Runs for both the dev HTML response and the production build. */
export function portfolioHtmlPlugin() {
  return {
    name: 'portfolio-initial-html',
    transformIndexHtml(html) {
      const portfolio = JSON.parse(readFileSync(new URL('../../src/content/portfolio.json', import.meta.url), 'utf8'));
      const years = JSON.parse(readFileSync(new URL('../../src/content/skill-years.json', import.meta.url), 'utf8'));
      return html.replace('<!--portfolio-document-->', () => renderPortfolioDocument(portfolio, years));
    },
  };
}
