import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let monsters = [], items = [], level;
let health = 100, ammo = 50;
const keys = {};

// Загрузка уровня
fetch('./levels/level1.json')
    .then(r => r.json())
    .then(data => {
        level = data;
        init();
    })
    .catch(err => {
        document.body.innerHTML = "<h1 style='color:white; padding:20px;'>Ошибка JSON: " + err.message + "</h1>";
    });

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050000);
    scene.fog = new THREE.Fog(0x050000, 1, 20);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(1.5, 1.6, 1.5); // Начальная позиция

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    physics = new Physics(level);
    const loader = new THREE.TextureLoader();

    // Свет
    scene.add(new THREE.AmbientLight(0xff0000, 0.1));
    playerLight = new THREE.PointLight(0xffffff, 60, 15);
    scene.add(playerLight);

    // Генерация карты из JSON
    const wallGeo = new THREE.BoxGeometry(1, 4, 1);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x555555 });

    level.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            } else if (cell === 2) {
                createMonster(x, z, loader);
            } else if (cell === 3) {
                createItem(x, z, loader);
            }
        });
    });

    // Пол
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Управление
    setupInput();
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

function createItem(x, z, loader) {
    const tex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/medkit.png');
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 0.5, z);
    sprite.scale.set(0.7, 0.7, 1);
    items.push({ sprite, x, z });
    scene.add(sprite);
}

function setupInput() {
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
    document.getElementById('am').innerText = ammo;
    playerLight.intensity = 400;
    setTimeout(() => playerLight.intensity = 60, 70);

    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = ray.intersectObjects(monsters.map(m => m.sprite));
    if (hits.length > 0) {
        const m = monsters.find(mon => mon.sprite === hits[0].object);
        m.health -= 25;
        if (m.health <= 0) { scene.remove(m.sprite); monsters = monsters.filter(mon => mon !== m); }
    }
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

    // Сбор предметов
    items = items.filter(it => {
        if (camera.position.distanceTo(it.sprite.position) < 1) {
            health = Math.min(100, health + 20);
            document.getElementById('hp').innerText = health;
            scene.remove(it.sprite); return false;
        }
        return true;
    });

    // Поворот монстров к игроку
    monsters.forEach(m => m.sprite.lookAt(camera.position));

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
