import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { createMechanicalBoard, CABINET_LAYOUT, NAMEPLATE_LAYOUT } from './scene/mechanical-board.js';
import { createLaunchCamera } from './scene/launch-camera.js';
import { BOARD_SETTINGS, LAUNCH_ORIGIN } from './game/board-settings.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { CSS3DObject, CSS3DRenderer } from 'three/addons/renderers/CSS3DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { SoftwareRenderer } from './renderers/software-renderer.js';
import { createDestinationGamePhysics, POCKETS, BALL_RADIUS } from './game/physics.js';
import { createHologram } from './ui/hologram.js';
import { normalizePortfolioSection, sectionForPocket, pocketForSection, pocketLabel, sectionName } from './ui/portfolio-sections.js';
import { createPlayModeUI } from './ui/play-mode.js';
import { createPlayRound, createRecordStore, MULTIPLIERS } from './game/play-round.js';
import { createHighScoreClient } from './game/high-scores.js';
import { createBoardAudio } from './audio/board-audio.js';
import { createBackgroundMusic } from './audio/background-music.js';
import portfolio from './content/portfolio.json';
import './styles/style.css';
import './styles/play-mode.css';
import './styles/professional.css';
import './styles/typography.css';

THREE.Cache.enabled = true;
const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x080f0c, 0.004);
const WORKSHOP_REFLECTIONS = 0.3;
const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 180);
const mount = document.querySelector('#scene-mount');
const hologramMount = document.querySelector('#hologram-mount');
const loading = document.querySelector('#loading-screen');
const status = document.querySelector('#game-status');
const dropButton = document.querySelector('#drop-ball');
const slider = document.querySelector('#launch-position');
const soundButton = document.querySelector('#sound-toggle');
const audio = createBoardAudio();
const music = createBackgroundMusic();
const musicButton = document.querySelector('#music-toggle');
function updateMusicButton() {
  const enabled = music.supported && !music.muted;
  musicButton.dataset.muted = String(!enabled);
  musicButton.setAttribute('aria-pressed', String(enabled));
  musicButton.title = music.supported ? (enabled ? 'Mute background music' : 'Play background music') : 'Background music unavailable';
  musicButton.disabled = !music.supported;
}
musicButton.addEventListener('click', () => {
  music.setMuted(!music.muted);
  updateMusicButton();
});
updateMusicButton();
function updateSoundButton() {
  const enabled = audio.supported && !audio.muted;
  soundButton.dataset.muted = String(!enabled);
  soundButton.setAttribute('aria-pressed', String(enabled));
  soundButton.title = audio.supported ? (enabled ? 'Mute sound effects' : 'Enable sound effects') : 'Sound effects unavailable';
  soundButton.disabled = !audio.supported;
}
soundButton.addEventListener('click', () => {
  audio.setMuted(!audio.muted);
  updateSoundButton();
});
updateSoundButton();
const connector = document.querySelector('#connector-path');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelector('#hero-name').firstChild.textContent = portfolio.profile.name;
document.querySelector('.hero-role').textContent = portfolio.profile.role;
if (portfolio.profile.headline) document.querySelector('.scene-description').textContent = portfolio.profile.headline;

function renderPixelRatio(software = false) {
  // Supersample standard-density desktop displays as well as honoring Retina
  // density. Keep the CPU fallback and mobile rendering at native density.
  const minimum = !software && innerWidth > 900 ? 1.5 : 1;
  return Math.min(Math.max(devicePixelRatio || 1, minimum), 2);
}
function makeRenderer() {
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('webgl2', { alpha: true, antialias: true, premultipliedAlpha: false });
  if (!context) {
    const fallback = new SoftwareRenderer();
    fallback.setPixelRatio(renderPixelRatio(true));
    return fallback;
  }
  const webgl = new THREE.WebGLRenderer({ canvas, context, alpha: true, antialias: true, premultipliedAlpha: false });
  webgl.setPixelRatio(renderPixelRatio());
  webgl.setClearColor(0x000000, 0);
  webgl.outputColorSpace = THREE.SRGBColorSpace;
  webgl.toneMapping = THREE.ACESFilmicToneMapping;
  webgl.toneMappingExposure = 0.98;
  webgl.shadowMap.enabled = true;
  webgl.shadowMap.type = THREE.PCFSoftShadowMap;
  // The cabinet and light stay fixed: render its contact shadows once.
  webgl.shadowMap.autoUpdate = false;
  webgl.shadowMap.needsUpdate = true;
  const pmrem = new THREE.PMREMGenerator(webgl);
  const environment = new RoomEnvironment();
  scene.environment = pmrem.fromScene(environment, 0.04).texture;
  scene.environmentIntensity = WORKSHOP_REFLECTIONS;
  environment.dispose();
  pmrem.dispose();
  return webgl;
}
const renderer = makeRenderer();
renderer.domElement.className = 'game-canvas';
renderer.domElement.setAttribute('aria-label', 'Mechanical 3D portfolio board with an exposed spring and a bottom launch channel.');
mount.appendChild(renderer.domElement);
const labels = new CSS2DRenderer();
labels.domElement.className = 'world-labels';
labels.domElement.style.pointerEvents = 'none';
mount.appendChild(labels.domElement);
const nameplateRenderer = new CSS3DRenderer();
nameplateRenderer.domElement.className = 'nameplate-world';
nameplateRenderer.domElement.style.pointerEvents = 'none';
mount.appendChild(nameplateRenderer.domElement);
const nameplateScene = new THREE.Scene();
const hologramRenderer = new CSS3DRenderer();
hologramRenderer.domElement.className = 'hologram-world';
hologramRenderer.domElement.style.pointerEvents = 'none';
hologramMount.appendChild(hologramRenderer.domElement);
const hologramScene = new THREE.Scene();
const hologram = createHologram(portfolio);
let hologramObject = new CSS3DObject(hologram.element);
hologram.element.style.userSelect = 'text';
hologramObject.position.set(9.8, 6, 1.5);
hologramObject.rotation.y = -0.06;
hologramObject.scale.setScalar(0.013);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = false;
controls.enableZoom = false;
controls.minAzimuthAngle = -0.22;
controls.maxAzimuthAngle = 0.22;
controls.minPolarAngle = Math.PI / 2 - 0.12;
controls.maxPolarAngle = Math.PI / 2 + 0.08;
controls.target.set(0, 5.7, 0);
const desiredPosition = new THREE.Vector3();
const desiredTarget = new THREE.Vector3();
let framing = true;
const launchCamera = createLaunchCamera(camera, controls);
let pendingCameraLaunch = null;
const handleOrbitStart = () => {
  launchCamera.stop();
  pendingCameraLaunch = null;
  framing = false;
};
controls.addEventListener('start', handleOrbitStart);
let viewport = { width: innerWidth, height: innerHeight, mobile: innerWidth <= 900 };
scene.add(new THREE.HemisphereLight(0xe8d8bd, 0x111a15, 0.7));
const keyLight = new THREE.DirectionalLight(0xffd4a0, 2.7);
keyLight.position.set(-5, 12, 9);
keyLight.target.position.set(0, 5.7, 0);
keyLight.castShadow = !renderer.isSoftwareRenderer;
keyLight.shadow.mapSize.set(2048, 2048);
Object.assign(keyLight.shadow.camera, { left: -6.7, right: 6.7, top: 7.2, bottom: -7.2, near: 0.5, far: 35 });
keyLight.shadow.normalBias = 0.012;
keyLight.shadow.bias = -0.00015;
const rimLight = new THREE.DirectionalLight(0xe9c797, 0.65);
rimLight.position.set(7, 8, -4);
scene.add(keyLight, keyLight.target, rimLight);
const materials = {
  cabinet: new THREE.MeshStandardMaterial({ color: 0x123e33, metalness: 0.7, roughness: 0.32 }),
  stage: new THREE.MeshStandardMaterial({ color: 0x102921, metalness: 0.4, roughness: 0.5 }),
  trim: new THREE.MeshStandardMaterial({ color: 0x91764a, metalness: 0.82, roughness: 0.43 }),
  pins: new THREE.MeshStandardMaterial({ color: 0xa6d2be, metalness: 0.7, roughness: 0.22, emissive: 0x204e40, emissiveIntensity: 0.25 }),
  glow: new THREE.MeshStandardMaterial({ color: 0x9debd4, emissive: 0x59d6b3, emissiveIntensity: 1.3, metalness: 0.4, roughness: 0.3 }),
};
const mechanicalBoard = createMechanicalBoard(scene);
const identityElement = document.createElement('div');
identityElement.className = 'board-wordmark';
identityElement.setAttribute('aria-hidden', 'true');
const boardWordmark = document.createElement('span');
boardWordmark.textContent = portfolio.profile.boardLabel || 'ENZOLABS.DEV';
identityElement.appendChild(boardWordmark);
// A fixed-size surface follows the plate's perspective, unlike a CSS2D billboard.
const boardIdentity = new CSS3DObject(identityElement);
boardIdentity.position.set(0, NAMEPLATE_LAYOUT.y, NAMEPLATE_LAYOUT.z);
boardIdentity.scale.setScalar(0.01);
identityElement.style.width = `${NAMEPLATE_LAYOUT.halfWidth * 2 / boardIdentity.scale.x}px`;
nameplateScene.add(boardIdentity);
let textureLoadActive = true;
const textureViews = [];
const atlasUrl = new URL(`${import.meta.env.BASE_URL}assets/classic-materials.png`, document.baseURI).href;
const materialAtlas = new THREE.TextureLoader().load(atlasUrl, atlas => {
  if (!textureLoadActive) return;
  atlas.colorSpace = THREE.SRGBColorSpace;
  const crop = (x, y) => {
    const view = atlas.clone();
    view.repeat.set(0.484, 0.484); view.offset.set(x + 0.008, y + 0.008);
    view.colorSpace = THREE.SRGBColorSpace;
    view.minFilter = THREE.LinearMipmapLinearFilter;
    view.magFilter = THREE.LinearFilter;
    view.generateMipmaps = true;
    view.anisotropy = renderer.isSoftwareRenderer ? 1 : Math.min(8, renderer.capabilities.getMaxAnisotropy());
    view.updateMatrix(); view.needsUpdate = true; textureViews.push(view);
    return view;
  };
  mechanicalBoard.applyTextures({ walnut: crop(0, 0.5), brass: crop(0.5, 0.5), enamel: crop(0, 0), circuits: crop(0.5, 0) });
  renderer.invalidate?.();
  mount.dataset.materialsReady = 'true';
}, undefined, () => { mount.dataset.materialsReady = 'fallback'; });
let selectionProgress = 0.375;
let releaseRecoil = 0;
const pocketObjects = new Map();
const pocketLabels = new Map();
const pocketIcons = {
  about: '<circle cx="12" cy="8" r="3.5"/><path d="M5 21v-3a7 7 0 0 1 14 0v3Z"/>',
  education: '<path d="m2 9 10-5 10 5-10 5ZM6 12v5c4 3 8 3 12 0v-5M22 9v8"/>',
  experience: '<rect x="3" y="7" width="18" height="14" rx="1"/><path d="M8 7V3h8v4M3 12h18M10 12v3h4v-3"/>',
  contact: '<rect x="2" y="5" width="20" height="15" rx="1"/><path d="m2 6 10 8 10-8"/>',
};
function box(width, height, depth, material, x, y, z) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), material);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  scene.add(mesh);
  return mesh;
}
POCKETS.forEach(pocket => {
  const material = new THREE.MeshStandardMaterial({ color: 0x0d231a, metalness: 0.2, roughness: 0.68, emissive: pocket.color, emissiveIntensity: 0.008 });
  const accent = new THREE.MeshStandardMaterial({ color: 0xa18550, metalness: 0.85, roughness: 0.38, emissive: pocket.color, emissiveIntensity: 0.035 });
  box(1.72, 0.14, 0.95, material, pocket.x, 1.77, 0.12);
  box(1.72, 0.79, 0.09, material, pocket.x, 2.13, -0.04);
  box(1.64, 0.045, 0.055, accent, pocket.x, 1.86, 0.6);
  pocketObjects.set(pocket.id, { material, accent });
  const button = document.createElement('button');
  button.className = 'pocket-label';
  button.dataset.pocket = pocket.id;
  button.style.setProperty('--pocket-color', pocket.color);
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${pocketIcons[sectionForPocket(pocket.id)]}</svg><span class="pocket-title">${pocketLabel(pocket.id)}</span>`;
  button.setAttribute('aria-label', `Open ${pocketLabel(pocket.id)}`);
  button.setAttribute('aria-pressed', 'false');
  button.addEventListener('click', () => openSection(sectionForPocket(pocket.id)));
  const label = new CSS2DObject(button);
  label.position.set(pocket.x, 2.24, 0.7);
  scene.add(label);
  pocketLabels.set(pocket.id, button);
  labels.domElement.appendChild(button);
});
[-3.6, -1.8, 0, 1.8, 3.6].forEach(x => {
  box(0.09, 0.92, 0.9, materials.trim, x, 2.18, 0.12);
  box(0.028, 0.84, 0.028, materials.trim, x, 2.18, 0.58);
});
const ball = new THREE.InstancedMesh(new THREE.SphereGeometry(BALL_RADIUS, 32, 24),
  new THREE.MeshStandardMaterial({ color: 0xcbd2c8, metalness: 0.92, roughness: 0.13,
    // Keep the original soft silver finish with a little extra reflected light.
    envMap: scene.environment, envMapIntensity: 0.4 }), 1);
ball.name = 'SilverBall';
ball.count = 0;
ball.frustumCulled = false;
scene.add(ball);
const ballMatrix = new THREE.Matrix4();
const beamGeometry = new THREE.BufferGeometry().setFromPoints(Array.from({ length: 4 }, () => new THREE.Vector3()));
const beam = new THREE.Line(beamGeometry, new THREE.LineBasicMaterial({ color: 0xd4b477, transparent: true, opacity: 0.6 }));
beam.visible = false;
scene.add(beam);
const hologramFrame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.PlaneGeometry(7.44, 8.1)),
  new THREE.LineBasicMaterial({ color: 0xb89a62, transparent: true, opacity: 0.45 }));
hologramFrame.position.copy(hologramObject.position);
hologramFrame.position.z -= 0.03;
hologramFrame.rotation.copy(hologramObject.rotation);
hologramFrame.visible = false;
scene.add(hologramFrame);
let game;
let activeSection = null;
let activePocket = null;
let pendingPanelFocus = false;
let playing = false;
let portfolioSliderValue = slider.value;
let playPower = 7.25;
const round = createPlayRound();
const records = createRecordStore();
const leaderboard = createHighScoreClient({
  url: import.meta.env.VITE_SUPABASE_URL,
  key: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
});
let recordRequest = null;
let roundVersion = 0;
let submissionId = null;
const playUI = createPlayModeUI({
  onToggle: () => setPlayMode(!playing),
  onReplay: restartPlayRound,
  onPortfolio: () => setPlayMode(false),
  onSaveRecord: async ({ name, country }) => {
    if (!playing || !round.completed) return false;
    if (leaderboard.configured) {
      submissionId ??= crypto.randomUUID();
      const result = await leaderboard.submit({ submissionId, name, country, shots: round.shots });
      if (result.best) records.replace(result.best);
      updatePlayHud();
      if (!result.saved) throw new Error('Another player set a higher record. Your score did not beat the latest shared record.');
      return { saved: true, shared: true };
    }
    const saved = records.save({ name, country, score: round.score });
    updatePlayHud();
    return { saved, shared: false };
  },
});
function refreshSharedRecord() {
  if (!leaderboard.configured) return Promise.resolve();
  if (recordRequest) return recordRequest;
  playUI.setRecordConnection({ shared: true, loading: true });
  recordRequest = leaderboard.loadBest().then(best => {
    records.replace(best || { name: 'No record yet', score: 0, country: null });
    playUI.setRecordConnection({ shared: true });
    updatePlayHud();
  }).catch(error => {
    playUI.setRecordConnection({ shared: true, error: error.message });
  }).finally(() => { recordRequest = null; });
  return recordRequest;
}
async function finishPlayRound() {
  const version = roundVersion;
  await refreshSharedRecord();
  if (playing && round.completed && version === roundVersion) playUI.finish(round, records.best);
}
function setStatus(message) { status.textContent = message; }
function refreshDropButton() {
  dropButton.disabled = !game || game.inFlight || hologram.isOpen;
  dropButton.querySelector('.drop-label').textContent = playing && round.completed ? 'Play again' : 'Launch ball';
  slider.disabled = Boolean(playing && game?.inFlight);
}
function updatePlayHud() {
  playUI.render(round, { playing, best: records.best, ready: Boolean(game) });
  mount.dataset.mode = playing ? 'play' : 'portfolio';
  mount.dataset.roundScore = String(round.score);
  mount.dataset.ballsCompleted = String(round.shots.length);
  refreshDropButton();
}
function clearPocketSelection() {
  activeSection = null;
  activePocket = null;
  for (const pocket of POCKETS) {
    const { material, accent } = pocketObjects.get(pocket.id);
    material.emissiveIntensity = 0.008;
    accent.emissiveIntensity = 0.035;
    const label = pocketLabels.get(pocket.id);
    label.classList.remove('is-active');
    label.setAttribute('aria-pressed', 'false');
  }
  renderer.invalidate?.();
}
function resetRound() {
  roundVersion++;
  submissionId = null;
  game.reset();
  round.reset();
  audio.stopRoll();
  releaseRecoil = 0;
  playUI.closeDialog();
  clearPocketSelection();
  delete mount.dataset.landingDestination;
  delete mount.dataset.landingBounces;
  delete mount.dataset.launchRoute;
  delete mount.dataset.expectedBounces;
  mount.dataset.pinHits = '0';
}
function restartPlayRound() {
  if (!game || !playing) return;
  resetRound();
  updateLauncher();
  updatePlayHud();
  frameCamera();
  setStatus('New round. Ten balls ready. Choose your launch strength.');
  dropButton.focus({ preventScroll: true });
}
function updatePocketPresentation() {
  for (const pocket of POCKETS) {
    const label = pocketLabels.get(pocket.id);
    label.innerHTML = playing ? `<span class="pocket-multiplier">${MULTIPLIERS[pocket.id]}×</span><span class="pocket-multiplier-caption">POINTS</span>`
      : `<svg viewBox="0 0 24 24" aria-hidden="true">${pocketIcons[sectionForPocket(pocket.id)]}</svg><span class="pocket-title">${pocketLabel(pocket.id)}</span>`;
    label.setAttribute('aria-label', playing ? `${MULTIPLIERS[pocket.id]} times pin hits` : `Open ${pocketLabel(pocket.id)}`);
    label.tabIndex = playing ? -1 : 0;
    label.disabled = playing;
  }
}
function setPlayMode(enabled) {
  if (!game || enabled === playing) return;
  if (enabled) portfolioSliderValue = slider.value;
  else playPower = Number(slider.value);
  playing = enabled;
  resetRound();
  hologram.close();
  document.body.classList.toggle('play-mode', playing);
  Object.assign(slider, playing ? { min: '0.5', max: '14', step: '0.05', value: String(playPower) }
    : { min: '-3.2', max: '3.2', step: '0.05', value: portfolioSliderValue });
  slider.setAttribute('aria-label', playing ? 'Launch strength' : 'Select destination');
  updatePocketPresentation();
  updateLauncher();
  updatePlayHud();
  frameCamera();
  setStatus(playing ? 'Play mode. Ten balls. Pin hits multiplied by your landing pocket earn points.' : 'Portfolio mode. Choose a section and launch a ball.');
  if (playing) void refreshSharedRecord();
}
updatePocketPresentation();
updatePlayHud();
playUI.setRecordConnection({ shared: leaderboard.configured });
void refreshSharedRecord();
function selectPocket(section) {
  const pocket = POCKETS.find(item => item.id === section);
  if (!pocket) return;
  activePocket = section;
  activeSection = sectionForPocket(section);
  POCKETS.forEach(item => {
    const active = item.id === section;
    const { material, accent } = pocketObjects.get(item.id);
    material.emissiveIntensity = active ? 0.13 : 0.008;
    accent.emissiveIntensity = active ? 0.5 : 0.035;
    const label = pocketLabels.get(item.id);
    const labelActive = playing ? active : sectionForPocket(item.id) === activeSection;
    label.classList.toggle('is-active', labelActive);
    label.setAttribute('aria-pressed', String(labelActive));
  });
  renderer.invalidate?.();
  const positions = beam.geometry.attributes.position;
  [[pocket.x, 2.55, 0.7], [pocket.x, 3, 0.7], [4, 5.4, 1.3], [4.48, 5.4, 1.5]].forEach((point, index) => positions.setXYZ(index, ...point));
  positions.needsUpdate = true;
  beam.geometry.computeBoundingSphere();
}
function openSection(section, landedPocket) {
  if (playing) return;
  section = normalizePortfolioSection(section);
  const pocketId = landedPocket && sectionForPocket(landedPocket) === section ? landedPocket : pocketForSection(section);
  if (!pocketId) return;
  const wasOpen = hologram.isOpen;
  selectPocket(pocketId);
  hologram.open(section);
  if (!wasOpen && hologram.isOpen) audio.popup();
  frameCamera();
  refreshDropButton();
  setStatus(`${sectionName(section)} open · close the panel to launch again`);
}
function openDirectSection(section, trigger) {
  if (playing) setPlayMode(false);
  if (game?.inFlight) { game.reset(); audio.stopRoll(); }
  trigger?.focus({ preventScroll: true });
  openSection(section);
}
document.querySelectorAll('[data-open-section]').forEach(link => link.addEventListener('click', event => {
  event.preventDefault();
  openDirectSection(link.dataset.openSection, link);
}));
const routeSections = new Set(['about', 'work', 'skills', 'experiences', 'experience', 'exp', 'build', 'education', 'contact']);
function openHashSection() {
  const section = location.hash.slice(1);
  if (routeSections.has(section)) openDirectSection(section);
  else if (!location.hash) hologram.close();
}
window.addEventListener('hashchange', openHashSection);
hologram.element.addEventListener('hologram:open', event => {
  const section = event.detail.sectionId;
  if (!event.detail.wasOpen) pendingPanelFocus = true;
  if (location.hash !== `#${section}`) history.replaceState(null, '', `#${section}`);
  document.querySelectorAll('[data-open-section]').forEach(link => {
    if (link.dataset.openSection === section) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
});
hologram.onClose(() => {
  pendingPanelFocus = false;
  beam.visible = hologramFrame.visible = false;
  connector.setAttribute('d', '');
  frameCamera();
  refreshDropButton();
  setStatus(game?.inFlight ? 'Ball in motion…' : '');
  if (routeSections.has(location.hash.slice(1))) history.replaceState(null, '', location.pathname + location.search);
  document.querySelectorAll('[data-open-section]').forEach(link => link.removeAttribute('aria-current'));
});
function frameCamera(immediate = false) {
  launchCamera.stop();
  pendingCameraLaunch = null;
  const { width, height, mobile } = viewport;
  const open = hologram.isOpen && !mobile;
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const availableWidth = Math.max(200, width - (mobile ? 28 : 130));
  const landscape = mobile && width > height && height < 560;
  const portraitBoard = mobile && !landscape;
  // Fit the cabinet more closely on phones while leaving room for its launch lean.
  const mobileFraming = { fitHeight: 11, fitWidth: 9.5, edgeGap: 8 };
  const playBounds = portraitBoard ? {
    top: (playing ? document.querySelector('.play-scoreboard') : document.querySelector('.scene-caption')).getBoundingClientRect().bottom + mobileFraming.edgeGap,
    bottom: document.querySelector('.launch-dock').getBoundingClientRect().top - mobileFraming.edgeGap,
  } : null;
  const availableHeight = playBounds ? Math.max(120, playBounds.bottom - playBounds.top)
    : Math.max(180, height - (mobile ? (height <= 650 ? 310 : 255) : 215));
  const fitHeight = portraitBoard ? mobileFraming.fitHeight : CABINET_LAYOUT.fitHeight;
  const fitWidth = portraitBoard ? mobileFraming.fitWidth : open ? 20.5 : 10.6;
  const distance = Math.max(fitHeight / (2 * tangent) * height / availableHeight,
    fitWidth / (2 * tangent * camera.aspect) * width / availableWidth);
  const centerX = open ? 3.7 : landscape && !playing ? -5 : 0;
  const centerY = portraitBoard ? (CABINET_LAYOUT.topY + CABINET_LAYOUT.bottomY) / 2 : CABINET_LAYOUT.centerY;
  desiredTarget.set(centerX, centerY, 0);
  desiredPosition.set(centerX + 0.7, centerY + 1.4, distance);
  if (playBounds) {
    const shift = ((playBounds.top + playBounds.bottom) / 2 - height / 2) * 2 * tangent * distance / height;
    desiredPosition.y += shift;
    desiredTarget.y += shift;
  }
  if (!open) {
    const layoutCamera = camera.clone();
    layoutCamera.position.copy(desiredPosition);
    layoutCamera.lookAt(desiredTarget);
    layoutCamera.updateMatrixWorld();
    const pocketBottom = Math.max(...POCKETS.map(pocket => {
      const projected = new THREE.Vector3(pocket.x, 2.09, 0.7).project(layoutCamera);
      return (1 - projected.y) * height / 2 + pocketLabels.get(pocket.id).offsetHeight / 2;
    }));
    const dockTop = document.querySelector('.launch-dock').getBoundingClientRect().top;
    const cabinetBottom = new THREE.Vector3(0, CABINET_LAYOUT.bottomY, 0.3).project(layoutCamera);
    const boardBottom = (1 - cabinetBottom.y) * height / 2;
    const controlGap = portraitBoard ? mobileFraming.edgeGap : mobile ? 20 : 28;
    const lift = Math.max(0, Math.max(pocketBottom, boardBottom) - dockTop + controlGap) * 2 * tangent * (distance - 0.7) / height;
    desiredPosition.y -= lift;
    desiredTarget.y -= lift;
  }
  // Match one CSS pixel to one projected pixel instead of shrinking the text
  // with the panel. The reading area fits the viewport and scrolls separately.
  const pixelsPerUnit = height / (2 * tangent * (distance - hologramObject.position.z));
  const panelWidth = Math.round(Math.min(680, width * 0.44));
  const panelHeight = Math.round(Math.min(820, height - 110));
  hologram.element.style.setProperty('--hologram-world-width', `${panelWidth}px`);
  hologram.element.style.setProperty('--hologram-world-height', `${panelHeight}px`);
  hologramObject.scale.setScalar(1 / pixelsPerUnit);
  hologramFrame.scale.set((panelWidth + 12) / (pixelsPerUnit * 7.44),
    (panelHeight + 12) / (pixelsPerUnit * 8.1), 1);
  if (open) {
    // Anchor the reading surface inside the right viewport margin even when
    // the board's camera framing changes with the screen's aspect ratio.
    const framedCamera = camera.clone();
    framedCamera.position.copy(desiredPosition);
    framedCamera.lookAt(desiredTarget);
    framedCamera.updateMatrixWorld();
    const projectedCenter = hologramObject.position.clone().project(framedCamera);
    const screenX = width - panelWidth * 0.53 - Math.max(32, width * 0.025);
    projectedCenter.x = screenX / width * 2 - 1;
    projectedCenter.unproject(framedCamera);
    const direction = projectedCenter.sub(desiredPosition).normalize();
    const depth = (hologramObject.position.z - desiredPosition.z) / direction.z;
    hologramObject.position.x = desiredPosition.x + direction.x * depth;
    hologramFrame.position.x = hologramObject.position.x;
  }
  controls.enabled = !hologram.isOpen;
  framing = true;
  if (immediate || reducedMotion) {
    camera.position.copy(desiredPosition);
    controls.target.copy(desiredTarget);
    camera.lookAt(desiredTarget);
    framing = false;
    controls.update();
  }
}
function resize() {
  const wasOverlay = hologram.element.classList.contains('is-overlay');
  viewport = { width: innerWidth, height: innerHeight, mobile: innerWidth <= 900 };
  scene.environmentIntensity = WORKSHOP_REFLECTIONS;
  camera.aspect = viewport.width / viewport.height;
  camera.updateProjectionMatrix();
  renderer.setPixelRatio(renderPixelRatio(renderer.isSoftwareRenderer));
  renderer.setSize(viewport.width, viewport.height);
  labels.setSize(viewport.width, viewport.height);
  nameplateRenderer.setSize(viewport.width, viewport.height);
  hologramRenderer.setSize(viewport.width, viewport.height);
  hologram.element.classList.toggle('is-overlay', viewport.mobile);
  hologram.element.dataset.presentation = viewport.mobile ? 'overlay' : 'world';
  if (viewport.mobile) {
    hologramScene.remove(hologramObject);
    hologramMount.appendChild(hologram.element);
    hologramRenderer.domElement.hidden = true;
    hologram.element.style.transform = '';
    hologram.element.style.position = 'fixed';
  } else {
    if (wasOverlay) {
      // The CSS renderer caches transforms by object. The overlay cleared its
      // transform, so use a fresh object when returning to world presentation.
      const worldObject = new CSS3DObject(hologram.element);
      worldObject.position.copy(hologramObject.position);
      worldObject.quaternion.copy(hologramObject.quaternion);
      worldObject.scale.copy(hologramObject.scale);
      hologramObject = worldObject;
      hologram.element.style.userSelect = 'text';
    }
    hologram.element.style.position = 'absolute';
    hologramScene.add(hologramObject);
    hologramRenderer.domElement.hidden = false;
  }
  frameCamera(true);
}
window.addEventListener('resize', resize);
resize();
function updateLauncher() {
  const value = Number(slider.value);
  const progress = (value - Number(slider.min)) / (Number(slider.max) - Number(slider.min));
  const destination = POCKETS[Math.min(POCKETS.length - 1, Math.floor(progress * POCKETS.length))];
  selectionProgress = progress;
  const springLength = mechanicalBoard.updateSpring(progress, releaseRecoil);
  mount.dataset.springLength = springLength.toFixed(3);
  mount.dataset.springTension = (1 - progress).toFixed(3);
  mount.dataset.plungerY = (BOARD_SETTINGS.springBaseY + springLength + 0.08).toFixed(3);
  if (playing) {
    const percent = Math.round(progress * 100);
    playPower = value;
    slider.setAttribute('aria-valuetext', `${percent}% launch strength`);
    slider.closest('.aim-control').style.setProperty('--destination-color', '#dfbd7b');
    playUI.setPower(percent);
    return;
  }
  slider.setAttribute('aria-valuetext', pocketLabel(destination.id));
  slider.dataset.destination = destination.id;
  slider.closest('.aim-control').style.setProperty('--destination-color', destination.color);
  document.querySelectorAll('button[data-destination]').forEach(button => {
    const selected = sectionForPocket(button.dataset.destination) === sectionForPocket(destination.id);
    button.classList.toggle('is-selected', selected);
    button.setAttribute('aria-pressed', String(selected));
  });
}
slider.addEventListener('input', updateLauncher);
document.querySelectorAll('button[data-destination]').forEach(button => button.addEventListener('click', () => {
  const index = POCKETS.findIndex(pocket => pocket.id === button.dataset.destination);
  slider.value = Number(slider.min) + (index + 0.5) / POCKETS.length * (Number(slider.max) - Number(slider.min));
  updateLauncher();
  openDirectSection(sectionForPocket(button.dataset.destination), button);
}));
updateLauncher();
function dropBall() {
  if (!game || hologram.isOpen || playUI.dialogOpen || game.inFlight) return;
  if (playing && round.completed) { restartPlayRound(); return; }
  if (playing) {
    if (!round.canLaunch || !game.launchFree(Number(slider.value))) return;
    round.beginBall();
    clearPocketSelection();
    updatePlayHud();
  } else if (!game.launchDestination(slider.dataset.destination)) return;
  const route = game.lastLaunchRoute;
  const power = playing ? Number(slider.value) : route.power;
  const strength = (power - 0.5) / 13.5;
  const channelSeconds = BOARD_SETTINGS.channelSeconds
    + (BOARD_SETTINGS.channelFastSeconds - BOARD_SETTINGS.channelSeconds) * strength;
  audio.launch(power, channelSeconds);
  if (!reducedMotion) {
    if (framing) pendingCameraLaunch = power;
    else launchCamera.start(power, viewport.mobile ? 0.75 : 1);
  }
  if (route) {
    mount.dataset.launchRoute = route.id;
    mount.dataset.expectedBounces = String(route.bounces);
  } else {
    delete mount.dataset.launchRoute;
    delete mount.dataset.expectedBounces;
  }
  mount.dataset.launchPower = String(power);
  mount.dataset.pinHits = '0';
  refreshDropButton();
  releaseRecoil = 1;
  setStatus('Ball rising from the bottom launcher…');
}
dropButton.addEventListener('click', dropBall);
const handleGameKeys = event => {
  if (hologram.isOpen || playUI.dialogOpen || /INPUT|TEXTAREA|SELECT|BUTTON|A/.test(event.target.tagName)) return;
  if (event.code === 'Space') { event.preventDefault(); dropBall(); }
  if (event.code === 'ArrowLeft' || event.code === 'ArrowRight') {
    if (slider.disabled) return;
    event.preventDefault();
    slider.value = Math.max(Number(slider.min), Math.min(Number(slider.max), Number(slider.value) + (event.code === 'ArrowLeft' ? -0.3 : 0.3)));
    updateLauncher();
  }
};
window.addEventListener('keydown', handleGameKeys);
document.querySelector('.site-brand').addEventListener('click', event => {
  event.preventDefault();
  if (playing) setPlayMode(false);
  hologram.close();
  frameCamera();
});
async function initializeGame() {
  try {
    const RAPIER = await import('@dimforge/rapier3d');
    const pins = mechanicalBoard.pins;
    game = createDestinationGamePhysics(RAPIER, pins, result => {
      mount.dataset.landingDestination = result.pocket.id;
      mount.dataset.landingBounces = String(result.bounces);
      audio.land(result.x);
      if (playing) {
        const shot = round.land({ pocketId: result.pocket.id, bounces: result.bounces });
        selectPocket(result.pocket.id);
        updatePlayHud();
        frameCamera();
        setStatus(`${shot.bounces} pin hits times ${shot.multiplier}: ${shot.points} points. Total ${round.score}.`);
        if (round.completed) { audio.popup(); void finishPlayRound(); }
      } else {
        openSection(sectionForPocket(result.pocket.id), result.pocket.id);
        setStatus(`${pocketLabel(result.pocket.id)} unlocked · ${result.bounces} peg bounces`);
      }
    }, hit => {
      mechanicalBoard.hitPin(hit);
      audio.pin(hit);
      mount.dataset.pinHits = String(Number(mount.dataset.pinHits || 0) + 1);
      mount.dataset.lastHitPin = String(hit.index);
      if (playing) { round.hitPin(); updatePlayHud(); }
    });
    updateLauncher();
    mount.dataset.ready = 'true';
    mount.dataset.pinCount = String(pins.length);
    mount.dataset.renderer = renderer.isSoftwareRenderer ? 'software' : 'webgl';
    renderer.invalidate?.();
    loading.classList.add('is-loaded');
    updatePlayHud();
    setStatus('');
  } catch (error) {
    console.error('Could not load portfolio stage:', error);
    document.querySelector('#loading-message').textContent = 'The stage could not load. You can still explore the portfolio using the navigation.';
    loading.classList.add('has-error');
    loading.classList.add('is-loaded');
    setStatus('Choose a section to read the archive');
  }
}
initializeGame();
openHashSection();
const projectedPocket = new THREE.Vector3();
function updateConnector() {
  if (!hologram.isOpen || !activeSection) return;
  const pocket = POCKETS.find(item => item.id === activePocket);
  if (!pocket) { connector.setAttribute('d', ''); return; }
  projectedPocket.set(pocket.x, 2.5, 0.7).project(camera);
  const x = (projectedPocket.x + 1) * viewport.width / 2;
  const y = (1 - projectedPocket.y) * viewport.height / 2;
  const rect = hologram.element.getBoundingClientRect();
  const endX = viewport.mobile ? rect.left + 24 : rect.left;
  const endY = viewport.mobile ? rect.bottom - 45 : rect.top + rect.height * 0.65;
  connector.setAttribute('d', `M ${x} ${y} L ${x} ${y - 32} L ${endX - 18} ${endY} L ${endX} ${endY}`);
  document.querySelector('#connector-origin').setAttribute('cx', x);
  document.querySelector('#connector-origin').setAttribute('cy', y);
}
let previousTime = performance.now();
renderer.setAnimationLoop(now => {
  const delta = Math.min((now - previousTime) / 1000, 0.1);
  previousTime = now;
  if (framing) {
    const amount = 1 - Math.exp(-delta * 6);
    camera.position.lerp(desiredPosition, amount);
    controls.target.lerp(desiredTarget, amount);
    camera.lookAt(controls.target);
    if (camera.position.distanceTo(desiredPosition) < 0.008) framing = false;
  }
  if (!framing && controls.enabled) {
    if (pendingCameraLaunch !== null) {
      launchCamera.start(pendingCameraLaunch, viewport.mobile ? 0.75 : 1);
      pendingCameraLaunch = null;
    }
    if (!document.hidden) launchCamera.update(delta);
    controls.update();
  }
  // Keep the landed ball settling while its page is open. Opening a page
  // manually still pauses a launch that has not reached a pocket yet.
  if (game && !document.hidden && (!hologram.isOpen || game.phase === 'landed')) game.step(delta);
  if (game?.phase !== 'channel' || hologram.isOpen) audio.stopRoll();
  {
    const { x, y, z } = game?.hasBall ? game.position : LAUNCH_ORIGIN;
    ballMatrix.makeTranslation(x, y, z);
    ball.setMatrixAt(0, ballMatrix);
    ball.instanceMatrix.needsUpdate = true;
    ball.count = 1;
  }
  if (releaseRecoil > 0) {
    releaseRecoil = Math.max(0, releaseRecoil - delta * 2.4);
    mechanicalBoard.updateSpring(selectionProgress, releaseRecoil);
  }
  mount.dataset.activePinReactions = String(mechanicalBoard.updatePinReactions(delta, reducedMotion));
  mount.dataset.launchPhase = game?.phase || 'idle';
  if (game?.hasBall) {
    mount.dataset.ballX = game.position.x.toFixed(3);
    mount.dataset.ballY = game.position.y.toFixed(3);
  }
  if (hologram.isOpen && hologram.activeSection !== activeSection) {
    const section = hologram.activeSection;
    if (pocketForSection(section)) selectPocket(pocketForSection(section));
    else { clearPocketSelection(); activeSection = section; }
    setStatus(`${sectionName(section)} open · close the panel to launch again`);
  }
  hologramFrame.visible = hologram.isOpen && !viewport.mobile;
  beam.visible = hologramFrame.visible && Boolean(activePocket);
  renderer.render(scene, camera);
  labels.render(scene, camera);
  nameplateRenderer.render(nameplateScene, camera);
  if (!viewport.mobile) hologramRenderer.render(hologramScene, camera);
  // CSS3DRenderer attaches the panel on its first render; focus after that move.
  if (pendingPanelFocus && hologram.isOpen) {
    hologram.element.querySelector('.hologram-close').focus({ preventScroll: true });
    pendingPanelFocus = false;
  }
  updateConnector();
});
if (import.meta.hot) import.meta.hot.dispose(() => {
  textureLoadActive = false;
  materialAtlas.dispose(); textureViews.forEach(texture => texture.dispose());
  renderer.setAnimationLoop(null);
  launchCamera.stop();
  controls.removeEventListener('start', handleOrbitStart);
  controls.dispose();
  game?.dispose();
  playUI.dispose();
  audio.dispose();
  music.dispose();
  renderer.dispose();
  mechanicalBoard.dispose();
  ball.material.dispose();
  boardIdentity.removeFromParent();
  nameplateRenderer.domElement.remove();
  hologram.dispose();
  scene.traverse(object => { if (object.isMesh) object.geometry.dispose(); });
  window.removeEventListener('resize', resize);
  window.removeEventListener('keydown', handleGameKeys);
  window.removeEventListener('hashchange', openHashSection);
});
