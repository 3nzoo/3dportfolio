// Presentation names are independent from the recorded physics pocket IDs.
export const SECTION_NAMES = { about: 'About', experience: 'Experience', education: 'Education', contact: 'Let’s connect' };
export const SECTION_LABELS = { about: 'About', experience: 'Experience', education: 'Education', contact: 'Contact' };
const POCKET_CONTENT = { about: 'about', experiences: 'experience', education: 'education', contact: 'contact' };
const SECTION_POCKETS = Object.fromEntries(Object.entries(POCKET_CONTENT).map(([pocket, section]) => [section, pocket]));
const ALIASES = { work: 'about', skills: 'about', experiences: 'experience', exp: 'experience', build: 'about' };
export const normalizePortfolioSection = id => ALIASES[id] || id;
export const sectionForPocket = id => POCKET_CONTENT[id];
export const pocketForSection = id => SECTION_POCKETS[normalizePortfolioSection(id)];
export const pocketLabel = id => SECTION_LABELS[sectionForPocket(id)] || 'Portfolio';
export const sectionName = id => SECTION_NAMES[normalizePortfolioSection(id)] || 'Portfolio';
