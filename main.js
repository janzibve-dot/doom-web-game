import * as THREE from 'three';
// ИМПОРТ НАШЕЙ ФИЗИКИ
import { Physics } from './engine/physics.js';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x880000); 

const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(5, 1.6, 5);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const loader = new THREE.TextureLoader();
const wallTexture = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
const grassTexture = loader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
grassTexture.wrapS = grassTexture.wrapT = THREE.RepeatWrapping;
grassTexture.repeat.set(40, 40);

const mapSize = 50;
// СОЗДАЕМ ЭКЗЕМПЛЯР ФИЗИКИ
const physics = new Physics(mapSize);

const wallGeo = new THREE.BoxGeometry(1, 5, 1);
const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture });

for(let i = 0; i < mapSize; i++) {
    const w1 = new THREE.Mesh(wallGeo, wallMat); w1.position.set(i, 2.5, 0); scene.add(w1);
    const w2 = new THREE.Mesh(wallGeo, wallMat); w2.position.set(i, 2.5, mapSize-1); scene.add(w2);
    const w3 = new THREE.Mesh(wallGeo, wallMat); w3.position.set(0, 2.5, i); scene.add(w3);
    const w4 = new THREE.Mesh(wallGeo, wallMat); w4.position.set(mapSize-1, 2.5, i); scene.add(w4);
}

const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ map: grassTexture }));
floor.rotation.x = -Math.PI / 2;
floor.position.set(25, 0, 25);
scene.add(floor);
scene.add(new THREE.AmbientLight(0xffaaaa, 0.8));

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
window.addEventListener('keydown', (e) => { if (e.code in keys) keys[e.code] = true; });
window.addEventListener('keyup', (e) => { if (e.code in keys) keys[e.code] = false; });
window.addEventListener('click', () => document.body.requestPointerLock());
window.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement === document.body) camera.rotation.y -= e.movementX * 0.003;
});

function animate() {
    requestAnimationFrame(animate);
    const speed = 0.15;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();

    // ЗАПОМИНАЕМ ПОЗИЦИЮ ДО ШАГА
    const oldX = camera.position.x;
    const oldZ = camera.position.z;

    if (keys.KeyW) camera.position.addScaledVector(dir, speed);
    if (keys.KeyS) camera.position.addScaledVector(dir, -speed);
    if (keys.KeyA) camera.position.addScaledVector(side, speed);
    if (keys.KeyD) camera.position.addScaledVector(side, -speed);

    // ПРОВЕРЯЕМ ФИЗИКОЙ: МОЖНО ЛИ ТУДА ИДТИ?
    if (!physics.canMove(camera.position.x, camera.position.z)) {
        camera.position.x = oldX;
        camera.position.z = oldZ;
    }

    renderer.render(scene, camera);
}
animate();
