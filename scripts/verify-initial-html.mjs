import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderPortfolioDocument, portfolioHtmlPlugin } from './lib/portfolio-html.js';
import { getResumeUrl } from '../src/ui/resume.js';

const portfolio = JSON.parse(await readFile(new URL('../src/content/portfolio.json', import.meta.url)));
const years = JSON.parse(await readFile(new URL('../src/content/skill-years.json', import.meta.url)));
const source = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const html = portfolioHtmlPlugin().transformIndexHtml(source);
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
assert(!html.includes('<!--portfolio-document-->'));
assert(html.includes(`<h1>${escape(portfolio.profile.name)}</h1>`));
for (const id of ['about','experience','education','contact']) {
  assert(html.includes(`href="#${id}"`));
  assert(html.includes(`data-portfolio-content="${id}"`));
}
for (const project of portfolio.selectedWork.projects) assert(html.includes(escape(project.summary)));
for (const role of portfolio.experience) {
  assert(html.includes(escape(role.company)));
  for (const bullet of role.bullets || []) assert(html.includes(escape(bullet)));
}
assert(html.includes(`mailto:${portfolio.profile.email}`));
assert(html.includes(`href="./${portfolio.profile.resume}" download`));
assert(!html.includes('<form'), 'The readable initial document must not contain a non-working inquiry form');
assert(!html.includes('sb_publishable_') && !html.includes('sb_secret_'), 'No credentials belong in prerendered content');
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Initial document IDs must be unique');
assert.equal(getResumeUrl({resume:'../secret.pdf'}), '');
const hostile = renderPortfolioDocument({profile:{name:'<script>alert(1)</script>',email:'" onmouseover="bad'},experience:[]}, {});
assert(!hostile.includes('<script>') && hostile.includes('&lt;script&gt;'));
const built = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
assert(built.includes('data-portfolio-content="experience"') && built.includes(escape(portfolio.experience[0].company)), 'The production artifact must contain the actual content');
console.log('Initial HTML checks passed: public content, project and experience details, unique IDs, usable links, escaped text and production artifact.');
