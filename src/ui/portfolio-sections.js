// Keep recorded physics pockets independent from the two portfolio destinations.
export const SECTION_NAMES = { about: 'Work & Skills', contact: 'Let’s connect' };
export const SECTION_LABELS = { about: 'Work & Skills', contact: 'Contact' };
export const POCKET_GROUPS = [
  { section: 'about', pockets: ['about', 'experiences'] },
  { section: 'contact', pockets: ['education', 'contact'] },
];
const POCKET_CONTENT = Object.fromEntries(POCKET_GROUPS.flatMap(group => group.pockets.map(id => [id, group.section])));
const SECTION_POCKETS = { about: 'about', contact: 'contact' };
const ALIASES = { work: 'about', skills: 'about', experience: 'about', experiences: 'about', exp: 'about', build: 'about', education: 'about' };
export const normalizePortfolioSection = id => ALIASES[id] || id;
export const sectionForPocket = id => POCKET_CONTENT[id];
export const pocketForSection = id => SECTION_POCKETS[normalizePortfolioSection(id)];
export const pocketLabel = id => SECTION_LABELS[sectionForPocket(id)] || 'Portfolio';
export const sectionName = id => SECTION_NAMES[normalizePortfolioSection(id)] || 'Portfolio';
