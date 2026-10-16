import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { renderSkills, skillExperienceText } from '../src/ui/skills.js';

const portfolio = JSON.parse(await readFile(new URL('../src/content/portfolio.json', import.meta.url)));
const years = JSON.parse(await readFile(new URL('../src/content/skill-years.json', import.meta.url)));
const groups = portfolio.profile.skills.filter(group => !group.optional);
const names = groups.flatMap(group => group.items);
assert.deepEqual(groups.map(group => group.label), ['Frontend', 'Backend & data', 'AI tools', 'Cloud & others']);
assert.equal(new Set(names).size, names.length, 'Visible skills should not be duplicated across categories');
for (const name of names) assert.equal(typeof years[name], 'number', `Missing year value: ${name}`);
for (const name of ['Codex','ChatGPT','Google Gemini','Claude','Supabase','Cloudflare','HTML5','CSS','Axios','WordPress','Shopify','Framer Motion','Vite','Phaser.js','Bootstrap','Jest','ImpactJS','Apollo Client','Sass','JWT','Mocha','Sequelize','TypeORM','Postman','FastAPI','Firestore','Mongoose','Redis','DynamoDB','Serverless','MySQL','SQLite','AWS services','Heroku','cPanel','GitLab','Bitbucket','Firebase']) {
  assert(names.includes(name), `Requested skill is missing: ${name}`);
}
assert.equal(skillExperienceText(1), '1 year of use');
assert.equal(skillExperienceText(2), '2 years of use');
assert.equal(skillExperienceText(0.5), '0.5 years of use');
for (const invalid of [undefined, null, '2', -1, Infinity, NaN]) assert.equal(skillExperienceText(invalid), 'Experience available on request');
const html = renderSkills(portfolio.profile.skills, years);
assert.equal((html.match(/class="skill-tag skill-button"/g) || []).length, names.length);
assert(!html.includes('<details'), 'Skills must remain visible without a disclosure');
assert(!html.includes('Additional tools'), 'The historical optional group stays hidden');
const edited = renderSkills([{label:'Test',items:['React']}], {React:7});
assert(edited.includes('data-experience="7 years of use"'), 'Editing the data must change the rendered experience');
const escaped = renderSkills([{label:'<img>',items:['<script>"&']}], {});
assert(!escaped.includes('<script>') && !escaped.includes('<img>'));
assert(escaped.includes('&lt;script&gt;&quot;&amp;'));
console.log(`Skill checks passed: ${names.length} visible tools, requested categories, editable year values, honest fallbacks and escaped markup.`);
