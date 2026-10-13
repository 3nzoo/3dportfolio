import { readFile, writeFile } from 'node:fs/promises';

// Reuse all geometry from the copied game while removing casino texture atlases.
// The original asset remains intact and the scene is recolored in main.js.
const source = new URL('../public/assets/Plinkov11.gltf', import.meta.url);
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
const target = new URL('../public/assets/portfolio-stage.gltf', import.meta.url);
await writeFile(target, JSON.stringify(stage));
console.log(`Prepared ${target.pathname}`);
