import * as THREE from 'three';

const LIGHT_DIRECTION = new THREE.Vector3(-5, 6.3, 9).normalize();
const HIGHLIGHT_DIRECTION = LIGHT_DIRECTION.clone().add(new THREE.Vector3(0, 0, 1)).normalize();
const MOVING_PIXEL_BUDGET = 750_000;
const SETTLED_PIXEL_BUDGET = 4_000_000;
const SETTLED_SUPERSAMPLING = 2;
const SETTLE_DELAY = 180;
const RASTER_INTERVAL = 40;

function visibleMaterial(material) {
  return material && material.visible !== false && !material.isShadowMaterial
    && (material.opacity ?? 1) > 0.005;
}

function visibleObject(object) {
  for (let parent = object; parent; parent = parent.parent) {
    if (!parent.visible) return false;
  }
  return true;
}

/**
 * Canvas fallback for the actual game geometry. The board uses cached triangle
 * rasterization and a depth buffer; instanced spheres remain animated above it.
 * The material atlas is sampled only when a static frame needs rasterization.
 */
export class SoftwareRenderer {
  constructor() {
    this.domElement = document.createElement('canvas');
    this.context = this.domElement.getContext('2d');
    this.backing = document.createElement('canvas');
    this.backContext = this.backing.getContext('2d');
    if (!this.context || !this.backContext) throw new Error('Canvas rendering is unavailable.');
    this.isSoftwareRenderer = true;
    this.ratio = 1;
    this.meshes = null;
    this.structure = '';
    this.signature = '';
    this.observedSignature = '';
    this.lastRaster = -Infinity;
    this.lastChange = -Infinity;
    this.lowQuality = false;
    this.depthBuffer = null;
    this.version = 0;
    this.frame = null;
    this.animationCallback = null;
    this.disposed = false;
    this.texturePixels = new WeakMap();
  }

  setPixelRatio(ratio) {
    this.ratio = Math.max(0.5, Math.min(Number(ratio) || 1, 2));
    if (this.cssWidth) this.setSize(this.cssWidth, this.cssHeight, false);
  }

  setSize(width, height, updateStyle = true) {
    this.cssWidth = Math.max(1, width);
    this.cssHeight = Math.max(1, height);
    this.domElement.width = Math.max(1, Math.round(this.cssWidth * this.ratio));
    this.domElement.height = Math.max(1, Math.round(this.cssHeight * this.ratio));
    this.context.imageSmoothingEnabled = true;
    this.context.imageSmoothingQuality = 'high';
    if (updateStyle) {
      this.domElement.style.width = `${this.cssWidth}px`;
      this.domElement.style.height = `${this.cssHeight}px`;
    }
    this.signature = '';
    this.observedSignature = '';
    this.depthBuffer = null;
    this.lastRaster = -Infinity;
  }

  setAnimationLoop(callback) {
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.frame = null;
    this.animationCallback = typeof callback === 'function' ? callback : null;
    if (!this.animationCallback || this.disposed) return;
    const animate = (now) => {
      this.frame = null;
      const active = this.animationCallback;
      if (!active || this.disposed) return;
      active(now);
      if (this.animationCallback === active && !this.disposed) {
        this.frame = requestAnimationFrame(animate);
      }
    };
    this.frame = requestAnimationFrame(animate);
  }

  invalidate() {
    this.meshes = null;
    this.signature = '';
    this.observedSignature = '';
    this.depthBuffer = null;
    this.lastRaster = -Infinity;
    this.version += 1;
  }

  dispose() {
    this.setAnimationLoop(null);
    this.disposed = true;
    this.meshes = null;
    this.depthBuffer = null;
    this.backing.width = this.backing.height = 1;
  }

  readTexture(texture) {
    const source = texture?.image;
    if (!source?.width || !source?.height) return null;
    if (this.texturePixels.has(source)) return this.texturePixels.get(source);
    const canvas = document.createElement('canvas');
    canvas.width = source.width; canvas.height = source.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = { width: canvas.width, height: canvas.height, data: context.getImageData(0, 0, canvas.width, canvas.height).data };
    pixels.levels = [pixels];
    // Cache filtered smaller versions once. Sampling an appropriate level keeps
    // fine grain from aliasing when the cabinet occupies a small part of a page.
    while (canvas.width > 1 || canvas.height > 1) {
      const smaller = document.createElement('canvas');
      smaller.width = Math.max(1, Math.floor(canvas.width / 2));
      smaller.height = Math.max(1, Math.floor(canvas.height / 2));
      const smallContext = smaller.getContext('2d', { willReadFrequently: true });
      smallContext.imageSmoothingEnabled = true;
      smallContext.imageSmoothingQuality = 'high';
      smallContext.drawImage(canvas, 0, 0, smaller.width, smaller.height);
      pixels.levels.push({ width: smaller.width, height: smaller.height,
        data: smallContext.getImageData(0, 0, smaller.width, smaller.height).data });
      canvas.width = smaller.width; canvas.height = smaller.height;
      context.drawImage(smaller, 0, 0);
    }
    this.texturePixels.set(source, pixels);
    return pixels;
  }

  prepare(objects) {
    this.meshes = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (const object of objects) {
      const geometry = object.geometry;
      const position = geometry.attributes.position;
      const normalAttribute = geometry.attributes.normal;
      const vertices = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i += 1) {
        a.fromBufferAttribute(position, i).toArray(vertices, i * 3);
      }
      const indices = geometry.index?.array
        || Uint32Array.from({ length: position.count }, (_, index) => index);
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      const start = Math.max(0, geometry.drawRange.start);
      const end = Math.min(indices.length, start + geometry.drawRange.count);
      const triangles = [];
      for (let index = start; index + 2 < end; index += 3) {
        const group = geometry.groups.find((entry) => index >= entry.start && index < entry.start + entry.count);
        const material = Array.isArray(object.material)
          ? materials[group?.materialIndex ?? 0]
          : materials[0];
        if (!visibleMaterial(material)) continue;
        const ia = indices[index] * 3, ib = indices[index + 1] * 3, ic = indices[index + 2] * 3;
        a.fromArray(vertices, ia); b.fromArray(vertices, ib); c.fromArray(vertices, ic);
        const center = a.clone().add(b).add(c).divideScalar(3);
        const normal = b.sub(a).cross(c.sub(a)).normalize().clone();
        const vertexNormals = new Float32Array(9);
        for (let corner = 0; corner < 3; corner++) {
          (normalAttribute ? a.fromBufferAttribute(normalAttribute, indices[index + corner]) : a.copy(normal))
            .toArray(vertexNormals, corner * 3);
        }
        const texture = this.readTexture(material.map);
        const textureStrength = material.userData.textureStrength ?? 1;
        const textureBase = (material.userData.textureBase || new THREE.Color(0xffffff)).clone().convertLinearToSRGB();
        let uv = null;
        if (texture && geometry.attributes.uv) {
          material.map.updateMatrix();
          uv = [indices[index], indices[index + 1], indices[index + 2]].flatMap(vertex => {
            const point = new THREE.Vector2().fromBufferAttribute(geometry.attributes.uv, vertex).applyMatrix3(material.map.matrix);
            return [point.x, material.map.flipY ? 1 - point.y : point.y];
          });
        }
        triangles.push({ ia, ib, ic, material, center, normal, vertexNormals, shades: [1, 1, 1], texture, uv, textureStrength,
          textureBase: [textureBase.r * 255, textureBase.g * 255, textureBase.b * 255],
          worldCenter: new THREE.Vector3(), worldNormal: new THREE.Vector3(), color: [0, 0, 0, 255] });
      }
      if (triangles.length) {
        this.meshes.push({ object, vertices, triangles,
          worldVertices: new Float32Array(vertices.length),
          screen: new Float32Array(vertices.length),
          worldMatrix: new THREE.Matrix4().makeScale(0, 0, 0),
        });
      }
    }
  }

  updateWorld(mesh) {
    if (mesh.worldMatrix.equals(mesh.object.matrixWorld)) return;
    mesh.worldMatrix.copy(mesh.object.matrixWorld);
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.worldMatrix);
    const vertex = new THREE.Vector3(), smoothNormal = new THREE.Vector3();
    for (let i = 0; i < mesh.vertices.length; i += 3) {
      vertex.fromArray(mesh.vertices, i).applyMatrix4(mesh.worldMatrix).toArray(mesh.worldVertices, i);
    }
    for (const triangle of mesh.triangles) {
      triangle.worldCenter.copy(triangle.center).applyMatrix4(mesh.worldMatrix);
      triangle.worldNormal.copy(triangle.normal).applyMatrix3(normalMatrix).normalize();
      const material = triangle.material;
      // Interpolate the geometry's smooth normals through cached vertex light.
      // Rounded brass and the elbow no longer show a separate flat triangle.
      for (let corner = 0; corner < 3; corner++) {
        if (material.isMeshBasicMaterial) { triangle.shades[corner] = 1; continue; }
        smoothNormal.fromArray(triangle.vertexNormals, corner * 3).applyMatrix3(normalMatrix).normalize();
        const diffuse = 0.34 + 0.5 * Math.max(0, smoothNormal.dot(LIGHT_DIRECTION));
        const highlight = Math.pow(Math.max(0, smoothNormal.dot(HIGHLIGHT_DIRECTION)),
          12 + (1 - (material.roughness ?? 0.7)) * 40) * (material.metalness ?? 0) * 0.38;
        triangle.shades[corner] = Math.pow(diffuse + highlight, 1 / 2.2);
      }
      const color = (material.color || new THREE.Color(0xffffff)).clone();
      if (material.emissive) color.add(material.emissive.clone().multiplyScalar(material.emissiveIntensity ?? 1));
      color.convertLinearToSRGB();
      triangle.color = [color.r, color.g, color.b].map((value) => Math.max(0, Math.min(255, Math.round(value * 255))));
      triangle.color.push(Math.round(Math.max(0, Math.min(1, material.opacity ?? 1)) * 255));
    }
  }

  rasterize(camera) {
    const width = this.backing.width, height = this.backing.height;
    const image = this.backContext.createImageData(width, height);
    const pixels = image.data;
    const depthBuffer = new Float32Array(width * height);
    const nearDepth = 1 / camera.near, farDepth = 1 / camera.far;
    const projection = new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const cameraPosition = new THREE.Vector3().setFromMatrixPosition(camera.matrixWorld);
    const vertex = new THREE.Vector3(), direction = new THREE.Vector3();
    for (const mesh of this.meshes) {
      if (!visibleObject(mesh.object)) continue;
      this.updateWorld(mesh);
      const screen = mesh.screen;
      for (let i = 0; i < mesh.worldVertices.length; i += 3) {
        vertex.fromArray(mesh.worldVertices, i).applyMatrix4(projection);
        screen[i] = (vertex.x + 1) * width / 2;
        screen[i + 1] = (1 - vertex.y) * height / 2;
        vertex.fromArray(mesh.worldVertices, i).applyMatrix4(camera.matrixWorldInverse);
        screen[i + 2] = -1 / vertex.z;
      }
      for (const triangle of mesh.triangles) {
        const facing = triangle.worldNormal.dot(direction.copy(cameraPosition).sub(triangle.worldCenter));
        const side = triangle.material.side;
        if ((side === THREE.FrontSide && facing <= 0) || (side === THREE.BackSide && facing >= 0)) continue;
        const { ia: a, ib: b, ic: c } = triangle;
        const x0 = screen[a], y0 = screen[a + 1], z0 = screen[a + 2];
        const x1 = screen[b], y1 = screen[b + 1], z1 = screen[b + 2];
        const x2 = screen[c], y2 = screen[c + 1], z2 = screen[c + 2];
        const denominator = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2);
        if (!Number.isFinite(denominator) || Math.abs(denominator) < 0.0001 || Math.min(z0, z1, z2) <= 0) continue;
        const minX = Math.max(0, Math.floor(Math.min(x0, x1, x2)));
        const maxX = Math.min(width - 1, Math.ceil(Math.max(x0, x1, x2)));
        const minY = Math.max(0, Math.floor(Math.min(y0, y1, y2)));
        const maxY = Math.min(height - 1, Math.ceil(Math.max(y0, y1, y2)));
        const [r, g, blue, alpha] = triangle.color;
        const inverseDenominator = 1 / denominator;
        const waStep = (y1 - y2) * inverseDenominator;
        const wbStep = (y2 - y0) * inverseDenominator;
        const depthStep = waStep * (z0 - z2) + wbStep * (z1 - z2);
        const [shade0, shade1, shade2] = triangle.shades;
        const lightStep = waStep * (shade0 - shade2) + wbStep * (shade1 - shade2);
        const sourceTexture = triangle.uv && triangle.texture;
        const uv = triangle.uv;
        let texture = sourceTexture;
        if (texture) {
          const duX = ((y1 - y2) * (uv[0] - uv[4]) + (y2 - y0) * (uv[2] - uv[4])) * inverseDenominator;
          const dvX = ((y1 - y2) * (uv[1] - uv[5]) + (y2 - y0) * (uv[3] - uv[5])) * inverseDenominator;
          const duY = ((x2 - x1) * (uv[0] - uv[4]) + (x0 - x2) * (uv[2] - uv[4])) * inverseDenominator;
          const dvY = ((x2 - x1) * (uv[1] - uv[5]) + (x0 - x2) * (uv[3] - uv[5])) * inverseDenominator;
          const footprint = Math.max(Math.hypot(duX * texture.width, dvX * texture.height), Math.hypot(duY * texture.width, dvY * texture.height));
          const level = Math.min(texture.levels.length - 1, Math.max(0, Math.floor(Math.log2(footprint))));
          texture = texture.levels[level];
        }
        const strength = triangle.textureStrength;
        const [baseR, baseG, baseB] = triangle.textureBase;
        const ua = texture ? uv[0] * z0 : 0, ub = texture ? uv[2] * z1 : 0, uc = texture ? uv[4] * z2 : 0;
        const va = texture ? uv[1] * z0 : 0, vb = texture ? uv[3] * z1 : 0, vc = texture ? uv[5] * z2 : 0;
        for (let y = minY; y <= maxY; y += 1) {
          let wa = ((y1 - y2) * (minX + 0.5 - x2) + (x2 - x1) * (y + 0.5 - y2)) * inverseDenominator;
          let wb = ((y2 - y0) * (minX + 0.5 - x2) + (x0 - x2) * (y + 0.5 - y2)) * inverseDenominator;
          let depth = z2 + wa * (z0 - z2) + wb * (z1 - z2);
          let light = shade2 + wa * (shade0 - shade2) + wb * (shade1 - shade2);
          for (let x = minX; x <= maxX; x += 1, wa += waStep, wb += wbStep, depth += depthStep, light += lightStep) {
            if (wa < -0.00001 || wb < -0.00001 || wa + wb > 1.00001) continue;
            const index = y * width + x;
            if (depth <= depthBuffer[index] || depth > nearDepth || depth < farDepth) continue;
            depthBuffer[index] = depth;
            const offset = index * 4;
            if (texture) {
              const wc = 1 - wa - wb;
              const tx = Math.max(0, Math.min(texture.width - 1, (wa * ua + wb * ub + wc * uc) / depth * texture.width - 0.5));
              const ty = Math.max(0, Math.min(texture.height - 1, (wa * va + wb * vb + wc * vc) / depth * texture.height - 0.5));
              const x = Math.floor(tx), y = Math.floor(ty), fx = tx - x, fy = ty - y;
              const a = (y * texture.width + x) * 4;
              const b = (y * texture.width + Math.min(x + 1, texture.width - 1)) * 4;
              const c = (Math.min(y + 1, texture.height - 1) * texture.width + x) * 4;
              const d = (Math.min(y + 1, texture.height - 1) * texture.width + Math.min(x + 1, texture.width - 1)) * 4;
              const samples = texture.data;
              const filteredR = (samples[a] * (1 - fx) + samples[b] * fx) * (1 - fy) + (samples[c] * (1 - fx) + samples[d] * fx) * fy;
              const filteredG = (samples[a + 1] * (1 - fx) + samples[b + 1] * fx) * (1 - fy) + (samples[c + 1] * (1 - fx) + samples[d + 1] * fx) * fy;
              const filteredB = (samples[a + 2] * (1 - fx) + samples[b + 2] * fx) * (1 - fy) + (samples[c + 2] * (1 - fx) + samples[d + 2] * fx) * fy;
              pixels[offset] = (baseR + (filteredR - baseR) * strength) * r / 255 * light;
              pixels[offset + 1] = (baseG + (filteredG - baseG) * strength) * g / 255 * light;
              pixels[offset + 2] = (baseB + (filteredB - baseB) * strength) * blue / 255 * light;
            } else {
              pixels[offset] = r * light; pixels[offset + 1] = g * light; pixels[offset + 2] = blue * light;
            }
            pixels[offset + 3] = alpha;
          }
        }
      }
    }
    this.backContext.putImageData(image, 0, 0);
    this.depthBuffer = depthBuffer;
  }

  drawInstances(instances, camera) {
    if (!this.depthBuffer) return;
    const ctx = this.context, width = this.domElement.width, height = this.domElement.height;
    const matrix = new THREE.Matrix4(), world = new THREE.Matrix4();
    const center = new THREE.Vector3(), projected = new THREE.Vector3(), edge = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
    const balls = [];
    for (const mesh of instances) {
      const kind = mesh.userData.renderKind || 'ball';
      const baseRadius = mesh.geometry.parameters?.radius ?? mesh.userData.radius ?? mesh.userData.ballRadius ?? 0.16;
      for (let i = 0; i < mesh.count; i += 1) {
        if (kind === 'pin-ripple' && !mesh.userData.opacity[i]) continue;
        mesh.getMatrixAt(i, matrix);
        world.multiplyMatrices(mesh.matrixWorld, matrix);
        center.setFromMatrixPosition(world);
        scale.setFromMatrixScale(world);
        const ballRadius = baseRadius * (kind === 'pin-ripple' ? Math.max(scale.x, scale.y) : Math.max(scale.x, scale.y, scale.z));
        const depth = -edge.copy(center).applyMatrix4(camera.matrixWorldInverse).z;
        if (depth <= camera.near || depth >= camera.far || ballRadius <= 0) continue;
        projected.copy(center).project(camera);
        edge.copy(center).addScaledVector(right, ballRadius).project(camera);
        const x = (projected.x + 1) * width / 2, y = (1 - projected.y) * height / 2;
        const radius = Math.max(1, Math.abs(edge.x - projected.x) * width / 2);
        if (x + radius < 0 || x - radius > width || y + radius < 0 || y - radius > height) continue;
        balls.push({ x, y, radius, ballRadius, depth, kind,
          pulse: mesh.userData.pulses?.[i] || 0, opacity: mesh.userData.opacity?.[i] || 0 });
      }
    }
    // Drawing farther spheres first preserves ordering when balls overlap.
    balls.sort((a, b) => b.depth - a.depth);
    for (const ball of balls) {
      const { x, y, radius, ballRadius, depth, kind, pulse, opacity } = ball;
      if (kind === 'pin-ripple') {
        ctx.save(); ctx.globalAlpha = opacity * 0.5;
        ctx.strokeStyle = '#e9c17e'; ctx.lineWidth = Math.max(0.6, radius * 0.08);
        ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
        continue;
      }
      ctx.save();
      ctx.beginPath();
      // Pins sit entirely in the open playfield. Native Canvas circles retain
      // smooth edges, while the ball needs per-pixel clipping inside the tube.
      if (kind === 'pin') ctx.arc(x, y, radius, 0, Math.PI * 2);
      else for (let py = Math.max(0, Math.floor(y - radius)); py <= Math.min(height - 1, Math.ceil(y + radius)); py += 1) {
        let run = null;
        const endX = Math.min(width, Math.ceil(x + radius) + 1);
        for (let px = Math.max(0, Math.floor(x - radius)); px <= endX; px += 1) {
          const distance = ((px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2) / radius ** 2;
          const bx = Math.floor(px * this.backing.width / width);
          const by = Math.floor(py * this.backing.height / height);
          const front = 1 / (depth - ballRadius * Math.sqrt(Math.max(0, 1 - distance)));
          const visible = px < width && distance <= 1 && bx >= 0 && by >= 0
            && bx < this.backing.width && by < this.backing.height
            && front >= this.depthBuffer[by * this.backing.width + bx];
          if (visible && run === null) run = px;
          if (!visible && run !== null) { ctx.rect(run, py, px - run, 1); run = null; }
        }
      }
      ctx.clip();
      const gradient = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.4, 0, x, y, radius);
      gradient.addColorStop(0, kind === 'pin' ? '#fff0bf' : '#ffffff');
      gradient.addColorStop(0.23, kind === 'pin' ? (pulse > 0.15 ? '#f8d18b' : '#d7b779') : '#eff0e3');
      gradient.addColorStop(0.65, kind === 'pin' ? '#926b35' : '#8c9c87');
      gradient.addColorStop(1, kind === 'pin' ? '#322719' : '#25392f');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.arc(x, y, radius, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }
  }

  render(scene, camera) {
    if (this.disposed) return;
    scene.updateMatrixWorld(true);
    camera.updateMatrixWorld(true);
    const objects = [], instances = [];
    scene.traverseVisible((object) => {
      if (!object.isMesh || !object.geometry?.attributes?.position) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      if (!materials.some(visibleMaterial)) return;
      if (object.isInstancedMesh) instances.push(object);
      else objects.push(object);
    });
    const structure = objects.map((object) => `${object.uuid}:${object.geometry.uuid}:${object.geometry.version || 0}:${(Array.isArray(object.material) ? object.material : [object.material]).map((material) => `${material?.uuid}:${material?.version}`).join('/')}`).join(',');
    if (!this.meshes || structure !== this.structure) {
      this.prepare(objects);
      this.structure = structure;
      this.signature = '';
    }
    const transforms = [...camera.matrixWorld.elements, ...camera.projectionMatrix.elements,
      ...objects.flatMap((object) => object.matrixWorld.elements)];
    const signature = `${this.version}:${structure}:${transforms.map((value) => value.toFixed(4)).join(',')}`;
    const now = performance.now();
    if (signature !== this.observedSignature) {
      this.observedSignature = signature;
      this.lastChange = now;
    }
    const settled = now - this.lastChange > SETTLE_DELAY;
    const sharpen = settled && this.lowQuality;
    if ((signature !== this.signature || sharpen || !this.depthBuffer) && now - this.lastRaster > RASTER_INTERVAL) {
      // A long portrait viewport must retain its horizontal detail. Budget by
      // pixel area, then supersample still frames for smooth triangle edges.
      const pixels = this.domElement.width * this.domElement.height;
      // Still frames must never be enlarged from fewer pixels than the
      // display canvas, including large or high-density desktop screens.
      const budget = settled ? Math.max(SETTLED_PIXEL_BUDGET, pixels) : MOVING_PIXEL_BUDGET;
      const ratio = Math.min(settled ? SETTLED_SUPERSAMPLING : 1,
        Math.sqrt(budget / pixels));
      this.backing.width = Math.max(1, Math.round(this.domElement.width * ratio));
      this.backing.height = Math.max(1, Math.round(this.domElement.height * ratio));
      this.lowQuality = !settled;
      this.rasterize(camera);
      this.domElement.dataset.renderResolution = `${this.backing.width}x${this.backing.height}`;
      this.domElement.dataset.renderQuality = settled ? 'antialiased' : 'interactive';
      this.signature = signature;
      this.lastRaster = performance.now();
    }
    this.context.clearRect(0, 0, this.domElement.width, this.domElement.height);
    this.context.drawImage(this.backing, 0, 0, this.domElement.width, this.domElement.height);
    this.drawInstances(instances, camera);
  }
}
