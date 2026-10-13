
import RAPIER from "@dimforge/rapier3d";
import * as THREE from 'three';
import { scene, world } from "../main";



export function createWall(config) {
  const {
    x,
    y,
    z,
    width,
    height,
    depth,
    rotationY = 0,
    rotationX = 0,
    rotationZ = 0,
    visible = false,
    name = "Wall",
  } = config;

  // Preserve the original collision layout. The previous implementation set
  // rotation after creating the body, so the physics wall was unrotated even
  // though its optional debug mesh was rotated.
  const bodyDesc = RAPIER.RigidBodyDesc.fixed().setTranslation(x, y, z);
  const body = world.createRigidBody(bodyDesc);
  const bodyColliderDesc = RAPIER.ColliderDesc.cuboid(
    width / 2,
    height / 2,
    depth / 2
  )
    .setRestitution(0.1)
    .setFriction(-1);
  body.userData = { type: "wall" };

  world.createCollider(bodyColliderDesc, body);

  // Avoid allocating GPU resources for invisible physics-only walls.
  let mesh = null;
  if (visible) {
    const bodyGeometry = new THREE.BoxGeometry(width, height, depth);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.2,
      depthWrite: false,
    });
    mesh = new THREE.Mesh(bodyGeometry, bodyMaterial);
    mesh.position.set(x, y, z);
    mesh.rotation.set(rotationX, rotationY, rotationZ);
    scene.add(mesh);
  }

  return { body, mesh };
}
