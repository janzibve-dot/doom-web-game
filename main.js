import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let level, scene, camera, renderer, physics, playerLight;
let monsters = [], items = [];
let health = 100, ammo = 50;
const keys = {};

fetch('./levels/level1.json').then(r => r.json()).then(data => {
    level = data;
    init();
});

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050000); // Глубокий темный
    scene.fog = new THREE.Fog(0x050000, 1, 25);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    // Спавнимся в левом верхнем углу, где пусто
    camera.position.set(1.5, 1.6, 1.5);

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    physics = new Physics(level);
    const loader = new THREE.TextureLoader();

    // Загрузка текстур
    const wallTex = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    const floorTex = loader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(50, 50);

    scene.add(new THREE.AmbientLight(0xff0000, 0.05));
    playerLight = new THREE.PointLight(0xffffff, 60, 15);
    scene.add(playerLight);

    const wallGeo = new THREE.BoxGeometry(1, 4, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex });

    // Отрисовка твоей карты 40x40
    level.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            } else if (cell === 2) {
                createMonster(x, z, loader);
            } else if (cell === 3) {
                createItem(x, z, 3, loader); // Аптечка
            }
        });
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x080808 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 4;
    scene.add(ceil);

    setupControls();
    updateHUD();
    animate();
}

function createMonster(x, z, loader) {
    const tex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/imp_idle.png');
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 1.2, z); 
    sprite.scale.set(1.8, 1.8, 1);
    monsters.push({ sprite, health: 50 });
    scene.add(sprite);
}

function createItem(x, z, type, loader) {
    const tex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/medkit.png');
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 0.5, z); sprite.scale.set(0.7, 0.7, 1);
    items.push({ sprite, x, z });
    scene.add(sprite);
}

function setupControls() {
    window.addEventListener('keydown', e => keys[e.code] = true);
    window.addEventListener('keyup', e => keys[e.code] = false);
    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) camera.rotation.y -= e.movementX * 0.0025;
    });
    window.addEventListener('click', () => {
        if (!document.pointerLockElement) document.body.requestPointerLock();
        else shoot();
    });
}

function shoot() {
    if (ammo <= 0) return;
    ammo--;
    updateHUD();
    playerLight.intensity = 400;
    setTimeout(() => playerLight.intensity = 60, 70);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera({ x: 0, y: 0 }, camera);
    const intersects = raycaster.intersectObjects(monsters.map(m => m.sprite));
    
    if (intersects.length > 0) {
        const hit = monsters.find(m => m.sprite === intersects[0].object);
        hit.health -= 25;
        if (hit.health <= 0) {
            scene.remove(hit.sprite);
            monsters = monsters.filter(m => m !== hit);
        }
    }
}

function updateHUD() {
    document.getElementById('hp').innerText = health;
    document.getElementById('am').innerText = ammo;
}

function animate() {
    requestAnimationFrame(animate);
    const speed = 0.15;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();

    const oldP = camera.position.clone();
    if (keys.KeyW) camera.position.addScaledVector(dir, speed);
    if (keys.KeyS) camera.position.addScaledVector(dir, -speed);
    if (keys.KeyA) camera.position.addScaledVector(side, speed);
    if (keys.KeyD) camera.position.addScaledVector(side, -speed);

    if (physics.checkCollision(camera.position.x, camera.position.z)) camera.position.copy(oldP);

    // Сбор предметов (аптечек)
    items = items.filter(it => {
        const dist = camera.position.distanceTo(it.sprite.position);
        if (dist < 1) {
            health = Math.min(100, health + 20);
            updateHUD();
            scene.remove(it.sprite);
            return false;
        }
        return true;
    });

    // ИИ Монстров
    monsters.forEach(m => {
        m.sprite.lookAt(camera.position);
        const dist = m.sprite.position.distanceTo(camera.position);
        if (dist < 10 && dist > 1.2) {
            const mDir = new THREE.Vector3().subVectors(camera.position, m.sprite.position).normalize();
            m.sprite.position.addScaledVector(mDir, 0.04);
        }
        if (dist < 1.3 && Math.random() < 0.02) {
            health -= 2; updateHUD();
            if (health <= 0) { alert("ВЫ ПОГИБЛИ!"); location.reload(); }
        }
    });

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', onWindowResize);
