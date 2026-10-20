# Enzo — 3D Portfolio

An interactive Plinko portfolio built with Three.js, Rapier physics, and Vite. Select a destination and launch the ball to explore About, Experience, Education, or Contact. Includes scrollable content, CV downloads, sound effects, and calm background music.

## Run locally

Use Node.js 22.12 or newer.

```bash
npm ci
npm run dev
```

Open [localhost:5174](http://127.0.0.1:5174/).

## Update content

- Edit `src/content/portfolio.json` for your profile, projects, experience, education, and contact links.
- Replace `public/assets/enzo.pdf` to update the CV download in Contact. For a different filename, update `profile.resume` with the path relative to `public`.
- Edit `src/styles/style.css` for fonts, colors, and responsive layouts.

The contact form saves inquiries to Supabase once configured. Follow [the setup guide](docs/supabase.md) to create the private records table and add your public project settings. Email notifications are not included.

## Build and deploy

```bash
npm run build
npm run preview
```

For Cloudflare Pages, connect this repository and use:

- Build command: `npm run build`
- Output directory: `dist`
- Node.js version: `22.18.0`

## Gameplay checks

```bash
npm run test:physics
npm run test:music
npm run test:contact
npm run test:play
npm run test:scores
```

After changing the board layout or physics, regenerate the destination paths with `npm run record:paths`, then rerun the physics checks.

## Ten-ball play mode

Select **Play** beside the launcher to start a ten-ball round. The slider controls launch strength; balls use live physics without choosing a portfolio destination. Each real pin hit is worth one point, multiplied by the landing pocket (left to right: 2×, 3×, 1×, 2×). The ten silver balls show completed, active, and remaining launches. **Portfolio** exits a round immediately and restores the normal ten recorded routes per section.

After all ten balls, a score above the current record opens the name and searchable country form. The starter record is **Enzo · Philippines · 480**. With Supabase configured, the game loads the shared record and saves new records through the validated `submit_high_score` database function. Run the high-score migration in [the Supabase setup guide](docs/supabase.md) before enabling shared records. Without Supabase settings, records remain browser-local. `src/game/play-round.js` owns scoring and the browser cache; `src/game/high-scores.js` handles shared records; `src/ui/play-mode.js` owns the scoreboard, country picker, and round dialog. Failed saves keep the form available for retry and never show an online-save confirmation.

## Social sharing

The planned production address is `https://enzolabs.dev/`. `index.html` contains the canonical URL, Open Graph metadata, and a large-image X/Twitter Card directly in its initial HTML. The 1200 × 630 PNG preview is `public/assets/social-preview.png`; the editable vector source is beside it as `social-preview.svg`.

Connect the domain to the deployed site before sharing: both the homepage and `https://enzolabs.dev/assets/social-preview.png` must be publicly accessible over HTTPS. If the domain changes, update the canonical link and every absolute sharing URL in `index.html`.

After deployment, check the URL with LinkedIn Post Inspector and Facebook Sharing Debugger. They can refresh cached previews after metadata or image changes. These tags prepare link previews; the domain connection and deployment are separate steps.

## Portfolio stories and direct navigation

The opening screen shows Enzo's name and role once. The board carries `ENZOLABS.DEV`; change `profile.boardLabel` in `src/content/portfolio.json` to edit its text. There is no top menu or duplicate introduction shortcuts. The four buttons above the slider open About, Experience, Education, and Contact directly. Move the slider and launch a ball to use the interactive navigation instead.

About includes a two-paragraph introduction, the Banana Banners, TRAQPLAN, and Arckyv project stories, and always-visible Skills & Tools after the last project. Experience contains the career timeline. Education has its own view. Contact contains the form, professional links, and CV download. Build remains removed. Play mode restores four separate scoring labels; physical IDs, recorded trajectories, and scoring are preserved.

Use a blank line (`\n\n`) inside `profile.summary` in `src/content/portfolio.json` to separate About paragraphs. Project cards support an optional `subtitle`; Arckyv uses it for “Cultural Discovery Timeline Platform” and is described as an ongoing client project. Panel headings do not display section numbers.

`src/ui/portfolio-sections.js` maps pockets to content. Old `#work` and `#skills` links open About; `#experiences` and `#exp` open Experience; `#education` opens Education. Opening a portfolio view during play exits the round. `src/ui/portfolio-stories.js` renders case studies, and `src/styles/professional.css` controls the introduction and story layouts. The social preview matches the four destinations and board wordmark, and uses `?v=5` for sharing caches.

These presentation and content updates require **no Supabase migration or policy changes**. The contact form continues to use the existing `portfolio_inquiries` table and the same four submitted fields. The shared leaderboard has its own migration; it does not change the contact table or contact permissions.

## Readable text sizes

`src/styles/typography.css` is loaded last and keeps the reading scale in one place. Adjust the `--text-*` variables at the top to change body copy, secondary text, labels, controls, and headings. Body text is 16px on phones/tablets and 17px on desktop at the default browser font size; form inputs stay at 16px. Panel tabs remain 14–15px, with tighter spacing on narrow screens. The reading panel scrolls rather than shrinking the type. Board artwork and its wordmark retain their separate sizing. Loading-screen sizes live in the initial `src/styles/style.css`, which is linked in `index.html` before JavaScript runs: a fixed 76px orbit, 28px initials, 13px caption, and 16px status text at the default browser font size. The loader uses a local font and has no later typography overrides, so its size remains stable until it fades out.

## Skill experience tooltips

Edit `src/content/skill-years.json` to update years of use. Each key must match the tool's name in `profile.skills` in `src/content/portfolio.json`. All tools start at **2 years**, as requested; replace each number with your own value. Decimals are supported (for example, `0.5`); `1` displays “1 year of use”. A missing, negative, or invalid value displays “Experience available on request”. The values are manual totals, so gaps in usage are not automatically counted as continuous experience.

Skills & Tools is always visible after the About projects. Categories and tool order live in `profile.skills`: Frontend, Backend & data, AI tools, and Cloud & others. The optional historical 3D group stays hidden. Core full-stack tools lead each relevant list, informed by adoption in the [2026 Stack Overflow technology survey](https://survey.stackoverflow.co/2026/technology/data); the order is editorial and is not a measured job-vacancy ranking.

Hover or focus a tool for its tooltip. Click/tap to keep it visible; tap again, select another tool, or tap outside to dismiss. Escape dismisses the tooltip before closing the portfolio panel. The tooltip is positioned in the viewport so it stays inside small screens and avoids clipping in the scrolling 3D panel. `src/ui/skills.js` handles the renderer and interactions. Run `npm run test:skills` for data/rendering checks.

### Initial HTML and readable portfolio

The Vite HTML plugin generates About, selected work, Experience, Education, Skills, and contact links from `src/content/portfolio.json` and `src/content/skill-years.json` for both development and production. Keep editing those JSON files; do not maintain a separate HTML copy. With JavaScript, the initial content moves into the existing 3D portfolio tabs. Without JavaScript, visitors can read the document, expand project details, download the CV, and use the contact links.

Run `npm run build` followed by `npm run test:html` to verify the production HTML includes the current content.

### Asset size and game loading

The deployed site uses WebP copies of the background and material atlas. Original PNGs and unused historical models are preserved in `source-assets/`, outside Vite's published `public/` directory. See [source asset notes](source-assets/README.md) for regeneration commands.

The 3D scene and portfolio tabs load immediately. Rapier and its WebAssembly load only on the first **Launch ball** or **Play** action. The controls display **Preparing game…** during that first download; subsequent launches reuse the loaded physics. Direct portfolio navigation works without it.

### Server-only high-score submissions

See [the score backend deployment guide](docs/score-backend-deployment.md) before deploying changes to the leaderboard. The database preparation, Supabase Edge Function, Cloudflare frontend deployment, and final RPC permission restriction must happen in that order for an existing live site. Publishing the frontend does not deploy the Edge Function or apply SQL migrations.
