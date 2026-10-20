# Source assets (not deployed)

`public/` is copied into every Vite deployment. Keep editable originals and historical models here so they do not inflate the deployed site.

- `textures/`: original PNGs and creation notes for the material atlas and workshop background. The live site uses same-dimension WebP copies under `public/assets/`.
- `legacy/`: historical models and the unused original background. The current Three.js board is generated procedurally and does not load these files.
- `npm run prepare:stage` still prepares the historical model, but now reads and writes within `legacy/`.

Regenerate the published textures with the WebP command-line tools:

```sh
cwebp -q 88 -m 6 -sharp_yuv source-assets/textures/classic-materials.png -o public/assets/classic-materials.webp
cwebp -q 85 -m 6 -sharp_yuv source-assets/textures/workshop-background.png -o public/assets/workshop-background.webp
```

The existing dimensions and atlas layout are preserved. No generation tool or image encoder is required during deployment because the optimized files are committed.
