import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let levelData;
let playerHP = 100, pistolMag = 10, pistolTotal = 120;
let isReloading = false, isShooting = false, lastDamageTime = 0;
let monsters = [];
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false, KeyR: false };
let pitch = 0;

let shotSound, reloadSound, bgMusic;
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();

// Определение пути
const path = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';

fetch(path + 'levels/level1.json')
    .then(r => r.json())
    .then(data => { 
        levelData = data; 
        physics = new Physics(levelData); // Инициализация физики сразу после загрузки
        init(); 
    });

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020000);
    scene.fog = new THREE.Fog(0x020000, 1, 30);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 
    camera.add(listener);

    // Загрузка аудио
    bgMusic = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/music/fon.mp3', (buffer) => {
        bgMusic.setBuffer(buffer);
        bgMusic.setLoop(true);
        bgMusic.setVolume(0.2);
    });

    shotSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/shot.mp3', (buffer) => {
        shotSound.setBuffer(buffer);
        shotSound.setVolume(0.9);
    });

    reloadSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/reload.mp3', (buffer) => {
        reloadSound.setBuffer(buffer);
        reloadSound.setVolume(0.7);
    });

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const loader = new THREE.TextureLoader();
    scene.add(new THREE.AmbientLight(0x220000, 0.5));
    playerLight = new THREE.PointLight(0xffffff, 1.5, 15);
    scene.add(playerLight);

    // Отрисовка стен
    const wallTex = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex });
    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(new THREE.BoxGeometry(1, 4, 1), wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            }
        });
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Старт игры по клику на экран
    document.getElementById('start-screen').addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
        document.body.requestPointerLock();
        if (listener.context.state === 'suspended') listener.context.resume();
        if (bgMusic.buffer && !bgMusic.isPlaying) bgMusic.play();
    });

    window.addEventListener('keydown', e => { if(e.code in keys) keys[e.code] = true; if(e.code === 'KeyR') reloadPistol(); });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    window.addEventListener('mousedown', () => { if (document.pointerLockElement) shoot(); });
    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) {
            camera.rotation.y -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
            camera.rotation.x = pitch;
            updateWeaponPosition();
        }
    });

    spawnMonster(5, 5);
    spawnMonster(2, 8);
    animate();
}

function spawnMonster(x, z) {
    const loader = new THREE.TextureLoader();
    loader.load(path + 'assets/sprites/monster.png', (texture) => {
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const monster = new THREE.Sprite(spriteMat);
        monster.position.set(x, 1, z);
        monster.scale.set(2, 2, 1);
        monster.userData = { health: 50, speed: 0.015 };
        scene.add(monster);
        monsters.push(monster);
    });
}

function updateWeaponPosition() {
    const weapon = document.getElementById('weapon');
    if (!isReloading) weapon.style.transform = `translateY(${pitch * 25}px)`;
}

function reloadPistol() {
    if (isReloading || pistolMag === 10 || pistolTotal <= 0) return;
    isReloading = true;
    if (reloadSound.buffer) reloadSound.play();
    document.getElementById('weapon').classList.add('reloading');
    setTimeout(() => {
        let toReload = Math.min(10 - pistolMag, pistolTotal);
        pistolMag += toReload; pistolTotal -= toReload;
        document.getElementById('mag').innerText = pistolMag;
        document.getElementById('total-ammo').innerText = pistolTotal;
        document.getElementById('weapon').classList.remove('reloading');
        setTimeout(() => { isReloading = false; updateWeaponPosition(); }, 600);
    }, 1400); 
}

function shoot() {
    if (isShooting || isReloading) return;
    if (pistolMag <= 0) { reloadPistol(); return; }
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    if (shotSound.buffer) { if (shotSound.isPlaying) shotSound.stop(); shotSound.play(); }

    // Урон монстрам
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(monsters);
    if (intersects.length > 0) {
        let m = intersects[0].object;
        m.userData.health -= 25;
        if (m.userData.health <= 0) {
            scene.remove(m);
            monsters = monsters.filter(mon => mon !== m);
        }
    }

    // РЕЗКАЯ АНИМАЦИЯ ВЫСТРЕЛА
    const weapon = document.getElementById('weapon');
    weapon.style.transition = "none";
    weapon.style.transform = `translateY(${pitch * 25 + 80}px) scale(1.15) rotate(-5deg)`;
    
    setTimeout(() => {
        weapon.style.transition = "transform 0.1s ease-out";
        updateWeaponPosition();
        isShooting = false;
        if (pistolMag === 0) reloadPistol();
    }, 70);
}

function animate() {
    requestAnimationFrame(animate);
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const moveDir = dir.clone().setY(0).normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();
    const oldP = camera.position.clone();
    let s = keys.ShiftLeft ? 0.12 : 0.05;

    if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
    if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
    if (keys.KeyA) camera.position.addScaledVector(side, s);
    if (keys.KeyD) camera.position.addScaledVector(side, -s);

    // ФИЗИКА СТЕН (проверка)
    if (physics && physics.checkCollision(camera.position.x, camera.position.z)) {
        camera.position.copy(oldP);
    }

    // ИИ Монстров
    const now = Date.now();
    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < 15) {
            const dirToP = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            const nextX = m.position.x + dirToP.x * m.userData.speed;
            const nextZ = m.position.z + dirToP.z * m.userData.speed;
            if (physics && !physics.checkCollision(nextX, nextZ)) {
                m.position.x = nextX; m.position.z = nextZ;
            }
            if (dist < 1.2 && now - lastDamageTime > 1000) {
                playerHP -= 20;
                document.getElementById('hp-bar-fill').style.width = playerHP + "%";
                document.getElementById('hp-text').innerText = playerHP + "%";
                lastDamageTime = now;
                if (playerHP <= 0) location.reload();
            }
        }
    });

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
