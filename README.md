# Enzo — 3D Portfolio

An interactive Plinko portfolio built with Three.js, Rapier physics, and Vite. Select a destination and launch the ball to explore About, Experiences, Education, or Contact. Includes scrollable content, CV downloads, sound effects, and calm background music.

## Run locally

Use Node.js 22.12 or newer.

```bash
npm ci
npm run dev
```

Open [localhost:5174](http://127.0.0.1:5174/).

## Update content

- Edit `src/content/portfolio.json` for your profile, projects, experience, education, and contact links.
- Replace `public/assets/enzo.pdf` to update both CV download buttons. For a different filename, update `profile.resume` with the path relative to `public`.
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
```

After changing the board layout or physics, regenerate the destination paths with `npm run record:paths`, then rerun the physics checks.
