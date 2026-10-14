# Enzo — 3D Portfolio

An interactive Plinko portfolio built with Three.js, Rapier physics, and Vite. Select a destination and launch the ball to explore Work & Skills or Contact. Includes scrollable content, CV downloads, sound effects, and calm background music.

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
```

After changing the board layout or physics, regenerate the destination paths with `npm run record:paths`, then rerun the physics checks.

## Ten-ball play mode

Select **Play** beside the launcher to start a ten-ball round. The slider controls launch strength; balls use live physics without choosing a portfolio destination. Each real pin hit is worth one point, multiplied by the landing pocket (left to right: 2×, 3×, 1×, 2×). The ten silver balls show completed, active, and remaining launches. **Portfolio** exits a round immediately and restores the normal ten recorded routes per section.

After all ten balls, a score above the current record opens the name and searchable country form. The starter record is **Enzo · Philippines · 500**. Records are saved only in this browser's local storage; they are not a shared leaderboard and do not use the contact form's Supabase connection. `src/game/play-round.js` owns round scoring and local record storage; `src/ui/play-mode.js` owns the scoreboard, country picker, and round dialog.

## Social sharing

The planned production address is `https://enzolabs.dev/`. `index.html` contains the canonical URL, Open Graph metadata, and a large-image X/Twitter Card directly in its initial HTML. The 1200 × 630 PNG preview is `public/assets/social-preview.png`; the editable vector source is beside it as `social-preview.svg`.

Connect the domain to the deployed site before sharing: both the homepage and `https://enzolabs.dev/assets/social-preview.png` must be publicly accessible over HTTPS. If the domain changes, update the canonical link and every absolute sharing URL in `index.html`.

After deployment, check the URL with LinkedIn Post Inspector and Facebook Sharing Debugger. They can refresh cached previews after metadata or image changes. These tags prepare link previews; the domain connection and deployment are separate steps.

## Portfolio stories and direct navigation

The opening screen shows Enzo's name and role once, with two direct actions: Work & Skills and Contact. The board carries a decorative ED monogram. There is no top navigation menu. Work & Skills leads with three concise project summaries; each has expandable details. Skills, career history, and education are optional disclosures in that same view. Contact contains the message form, professional links, and CV download.

The four physical pockets are grouped into two reading destinations: the left pair opens Work & Skills, and the right pair opens Contact. Play mode restores all four separate scoring labels. Physical IDs, recorded trajectories, and scoring remain unchanged. `src/ui/portfolio-sections.js` maps pockets to content. Old hashes including `#work`, `#experiences`, `#education`, and `#build` redirect to `#about`; the Build/engineering section has been removed. Opening a portfolio view during play exits the round.

Edit `selectedWork` in `src/content/portfolio.json` to update the Banana Banners, TRAQPLAN, and Arckyv case studies. `src/ui/portfolio-stories.js` renders them, and `src/styles/professional.css` controls the introduction and story layouts. The social preview follows the simplified design and uses `?v=4` to distinguish this asset in sharing caches.

These presentation and content updates require **no Supabase migration or policy changes**. The contact form continues to use the existing `portfolio_inquiries` table and the same four submitted fields. No leaderboard database integration is introduced.
