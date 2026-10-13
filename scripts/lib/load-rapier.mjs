import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as esbuild from 'esbuild';

// Load the installed browser WASM in Node, so recordings and verification use
// exactly the same physics engine shipped to visitors.
export async function loadRapier(repository, temporaryDirectory) {
  const packageRoot = join(repository, 'node_modules/@dimforge/rapier3d');
  const output = join(temporaryDirectory, 'rapier.mjs');
  await esbuild.build({
    entryPoints: [join(packageRoot, 'rapier.js')], bundle: true, format: 'esm',
    platform: 'node', target: 'node18', outfile: output,
    plugins: [{
      name: 'rapier-wasm-for-node',
      setup(build) {
        build.onResolve({ filter: /\.wasm$/ }, args => ({
          path: resolve(args.resolveDir, args.path), namespace: 'rapier-wasm',
        }));
        build.onLoad({ filter: /.*/, namespace: 'rapier-wasm' }, async args => {
          const bytes = await readFile(args.path);
          const exports = WebAssembly.Module.exports(new WebAssembly.Module(bytes));
          return {
            loader: 'js', resolveDir: packageRoot,
            contents: `
              import * as imports from ${JSON.stringify(join(packageRoot, 'rapier_wasm3d_bg.js'))};
              const { instance } = await WebAssembly.instantiate(
                Buffer.from(${JSON.stringify(bytes.toString('base64'))}, 'base64'),
                { './rapier_wasm3d_bg.js': imports }
              );
              ${exports.map(item => `export const ${item.name} = instance.exports[${JSON.stringify(item.name)}];`).join('\n')}
            `,
          };
        });
      },
    }],
  });
  return import(pathToFileURL(output).href);
}
