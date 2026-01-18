import * as THREE from 'three';
import { Physics } from './engine/physics.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, physics, playerLight;
let levelData, playerHP = 100, pistolMag = 10, pistolTotal = 120, kills = 0;
let isReloading = false, isShooting = false, lastDamageTime = 0;
let monsters = [], mixers = [], clock = new THREE.Clock();
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyR: false };
let pitch = 0, isGameStarted = false;

const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');

let shotSound, reloadSound, bgMusicHTML;
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();
const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

// Загрузка уровня
fetch(path + 'levels/level1.json').then(r => r.json()).then(data => { 
    levelData = data; 
    physics = new Physics(levelData);
    init(); 
});

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010101);
    scene.fog = new THREE.Fog(0x000000, 1, 15);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 
    camera.add(listener);

    setupBackgroundMusic();
    loadSFX();

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    playerLight = new THREE.PointLight(0xffffff, 2.0, 15);
    scene.add(playerLight);
    scene.add(new THREE.AmbientLight(0xffffff, 0.2));

    const loader = new THREE.TextureLoader();
    const wallTex = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;
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

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000, 1000), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Управление (Правка: Перенесено в глобальную область для надежности)
    window.addEventListener('keydown', e => { if(isGameStarted && e.code in keys) keys[e.code] = true; });
    window.addEventListener('keyup', e => { if(isGameStarted && e.code in keys) keys[e.code] = false; });
    window.addEventListener('mousemove', e => {
        if (isGameStarted && document.pointerLockElement) {
            camera.rotation.y -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-1.4, Math.min(1.4, pitch));
            camera.rotation.x = pitch;
        }
    });
    window.addEventListener('mousedown', () => { if (isGameStarted && document.pointerLockElement) shoot(); });
    window.addEventListener('keydown', e => { if(isGameStarted && e.code === 'KeyR') reloadPistol(); });

    document.getElementById('play-btn').addEventListener('click', startGame);
    animate();
}

function startGame() {
    isGameStarted = true;
    document.getElementById('start-screen').style.display = 'none';
    document.body.requestPointerLock();
    if (listener.context.state === 'suspended') listener.context.resume();
    bgMusicHTML.play();

    // ПРАВКА №49: Интервальный спавн (каждые 5 сек)
    spawnNewMonster(); // Первый сразу
    const spawnInterval = setInterval(() => {
        if (monsters.length < 15) {
            spawnNewMonster();
        } else if (monsters.length >= 15 && kills >= 100) { // Пример условия остановки
            clearInterval(spawnInterval);
        }
    }, 5000);
}

function spawnNewMonster() {
    const pos = findSafeSpawn();
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(path + 'assets/sprites/models/monster.glb', (gltf) => {
        const model = gltf.scene;
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        model.scale.set(1.8 / size.y, 1.8 / size.y, 1.8 / size.y);
        model.position.set(pos.x, 0, pos.z);
        scene.add(model);

        let mixer = null;
        if (gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            const action = mixer.clipAction(gltf.animations[0]);
            action.setDuration(3); // ПРАВКА №51: Цикл 3 секунды
            action.play();
            mixers.push(mixer);
        }
        
        model.userData = { 
            health: 100, 
            speed: 0.03, 
            mixer: mixer,
            state: 'patrol', // 'patrol' или 'chase'
            patrolDir: new THREE.Vector3(Math.random()-0.5, 0, Math.random()-0.5).normalize()
        };
        monsters.push(model);
    });
}

function findSafeSpawn() {
    let attempts = 0;
    while (attempts < 100) {
        let x = Math.floor(Math.random() * levelData.map[0].length);
        let z = Math.floor(Math.random() * levelData.map.length);
        if (levelData.map[z][x] === 0 && Math.abs(x - camera.position.x) > 5) {
            return { x: x + 0.5, z: z + 0.5 };
        }
        attempts++;
    }
    return { x: 2, z: 2 };
}

function shoot() {
    if (isShooting || isReloading || pistolMag <= 0) return;
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    if (shotSound && shotSound.buffer) { if (shotSound.isPlaying) shotSound.stop(); shotSound.play(); }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(monsters, true);
    
    if (intersects.length > 0) {
        let target = intersects[0].object;
        while(target.parent && !target.userData.health) { target = target.parent; }
        if (target.userData.health) {
            target.userData.health -= 7;
            if (target.userData.health <= 0) {
                scene.remove(target);
                monsters = monsters.filter(m => m !== target);
                kills++;
                document.getElementById('kill-counter').innerText = "УБИТО: " + kills;
            }
        }
    }
    const weapon = document.getElementById('weapon');
    weapon.style.transform = `translateY(${pitch * 25 + 60}px) scale(1.1)`;
    setTimeout(() => { weapon.style.transform = `translateY(${pitch * 25}px)`; isShooting = false; if (pistolMag === 0) reloadPistol(); }, 100);
}

function reloadPistol() {
    if (isReloading || pistolMag === 10 || pistolTotal <= 0) return;
    isReloading = true;
    if (reloadSound && reloadSound.buffer) reloadSound.play();
    document.getElementById('weapon').classList.add('reloading');
    setTimeout(() => {
        let toReload = Math.min(10 - pistolMag, pistolTotal);
        pistolMag += toReload; pistolTotal -= toReload;
        document.getElementById('mag').innerText = pistolMag;
        document.getElementById('weapon').classList.remove('reloading');
        isReloading = false;
    }, 1200);
}

function setupBackgroundMusic() {
    bgMusicHTML = new Audio(path + 'FON1.ogg');
    bgMusicHTML.loop = true;
    bgMusicHTML.volume = 0.15;
}

function loadSFX() {
    shotSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/shot.mp3', (buffer) => { shotSound.setBuffer(buffer); });
    reloadSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/reload.mp3', (buffer) => { reloadSound.setBuffer(buffer); });
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, 150, 150);
    const zoom = 8; const centerX = 75; const centerY = 75;
    minimapCtx.fillStyle = "#300";
    if (levelData) {
        levelData.map.forEach((row, z) => {
            row.forEach((cell, x) => {
                if (cell === 1) {
                    const dx = centerX + (x - camera.position.x) * zoom;
                    const dz = centerY + (z - camera.position.z) * zoom;
                    minimapCtx.fillRect(dx, dz, zoom, zoom);
                }
            });
        });
    }
    minimapCtx.fillStyle = "#f00";
    monsters.forEach(m => {
        const dx = centerX + (m.position.x - camera.position.x) * zoom;
        const dz = centerY + (m.position.z - camera.position.z) * zoom;
        minimapCtx.beginPath(); minimapCtx.arc(dx, dz, 3, 0, Math.PI * 2); minimapCtx.fill();
    });
    minimapCtx.save();
    minimapCtx.translate(centerX, centerY); minimapCtx.rotate(-camera.rotation.y);
    minimapCtx.fillStyle = "#0f0"; minimapCtx.beginPath(); minimapCtx.moveTo(0, -6); minimapCtx.lineTo(4, 4); minimapCtx.lineTo(-4, 4); minimapCtx.fill();
    minimapCtx.restore();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    if (!isGameStarted) return;

    mixers.forEach(m => m.update(delta));

    const oldP = camera.position.clone();
    let s = keys.ShiftLeft ? 0.12 : 0.05;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const moveDir = dir.clone().setY(0).normalize();
    const sideDir = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();

    if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
    if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
    if (keys.KeyA) camera.position.addScaledVector(sideDir, s);
    if (keys.KeyD) camera.position.addScaledVector(sideDir, -s);

    // ПРАВКА №52: Коллизии игрока
    if (physics && physics.checkCollision(camera.position.x, camera.position.z)) camera.position.copy(oldP);
    monsters.forEach(m => { if(camera.position.distanceTo(m.position) < 0.8) camera.position.copy(oldP); });

    playerLight.position.copy(camera.position);

    const now = Date.now();
    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        
        // ПРАВКА №50: Логика зрения (FOV)
        if (dist < 10) {
            m.userData.state = 'chase';
        } else {
            m.userData.state = 'patrol';
        }

        if (m.userData.state === 'chase') {
            const chaseDir = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            if (!physics.checkCollision(m.position.x + chaseDir.x * 0.4, m.position.z + chaseDir.z * 0.4)) {
                m.position.x += chaseDir.x * m.userData.speed;
                m.position.z += chaseDir.z * m.userData.speed;
            }
            m.lookAt(camera.position.x, 0, camera.position.z);
        } else {
            // Патрулирование
            if (!physics.checkCollision(m.position.x + m.userData.patrolDir.x * 0.4, m.position.z + m.userData.patrolDir.z * 0.4)) {
                m.position.x += m.userData.patrolDir.x * (m.userData.speed * 0.5);
                m.position.z += m.userData.patrolDir.z * (m.userData.speed * 0.5);
            } else {
                m.userData.patrolDir.set(Math.random()-0.5, 0, Math.random()-0.5).normalize();
            }
            const lookTarget = m.position.clone().add(m.userData.patrolDir);
            m.lookAt(lookTarget.x, 0, lookTarget.z);
        }

        if (dist < 1.3 && now - lastDamageTime > 1200) {
            playerHP -= 15;
            document.getElementById('hp-bar-fill').style.width = playerHP + "%";
            document.getElementById('hp-text').innerText = playerHP + "%";
            lastDamageTime = now;
            document.getElementById('damage-flash').style.display = 'block';
            setTimeout(() => { document.getElementById('damage-flash').style.display = 'none'; }, 100);
            if (playerHP <= 0) location.reload();
        }
    });

    drawMinimap();
    renderer.render(scene, camera);
}
