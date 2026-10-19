import { readFile, writeFile } from 'node:fs/promises';

// Retain the historical geometry-preparation workflow outside the published assets.
// The live board is procedural and does not load these archived models.
const source = new URL('../source-assets/legacy/Plinkov11.gltf', import.meta.url);
const stage = JSON.parse(await readFile(source, 'utf8'));
stage.materials = stage.materials.map((material, index) => ({
  name: material.name || `StageMaterial_${index}`,
  pbrMetallicRoughness: {
    baseColorFactor: [0.09, 0.22, 0.19, 1],
    metallicFactor: 0.45,
    roughnessFactor: 0.4,
  },
}));
delete stage.images;
delete stage.textures;
delete stage.samplers;
delete stage.extensionsUsed;
delete stage.extensionsRequired;
stage.asset.generator = 'Ezo portfolio / adapted from Slots-Pachinko';
stage.asset.extras = { source: 'Plinkov11.gltf', author: 'Enzo Dinglasan' };
const target = new URL('../source-assets/legacy/portfolio-stage.gltf', import.meta.url);
await writeFile(target, JSON.stringify(stage));
console.log(`Prepared ${target.pathname}`);
