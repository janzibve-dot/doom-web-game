import * as THREE from 'three';
import { Physics } from './engine/physics.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, physics, playerLight;
let levelData, playerHP = 100, pistolMag = 10, pistolTotal = 120;
let isReloading = false, isShooting = false, monsters = [];
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyR: false };
let pitch = 0, mixers = [], clock = new THREE.Clock();

const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas.getContext('2d');
minimapCanvas.width = 150; minimapCanvas.height = 150;

let shotSound, reloadSound, bgMusicHTML;
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();
const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

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

    document.getElementById('play-btn').addEventListener('click', startGame);

    window.addEventListener('keydown', e => { if(e.code in keys) keys[e.code] = true; if(e.code === 'KeyR') reloadPistol(); });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) {
            camera.rotation.y -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-1.4, Math.min(1.4, pitch));
            camera.rotation.x = pitch;
        }
    });
    window.addEventListener('mousedown', () => { if (document.pointerLockElement) shoot(); });

    // ПРАВКА №32: Спавним орду из 15 монстров
    spawnWave(15);
    
    animate();
}

function spawnWave(count) {
    let spawned = 0;
    const maxAttempts = 100;
    let attempts = 0;

    while (spawned < count && attempts < maxAttempts) {
        let rx = Math.floor(Math.random() * levelData.map[0].length);
        let rz = Math.floor(Math.random() * levelData.map.length);

        // Проверяем, что в этой клетке нет стены и она далеко от игрока
        if (levelData.map[rz][rx] === 0 && Math.abs(rx - camera.position.x) > 5) {
            spawn3DMonster(rx, rz);
            spawned++;
        }
        attempts++;
    }
}

function spawn3DMonster(x, z) {
    const gltfLoader = new GLTFLoader();
    const modelPath = path + 'assets/sprites/models/monster.glb';
    
    gltfLoader.load(modelPath, (gltf) => {
        const model = gltf.scene;
        
        // Масштабирование (Правка №29 сохранена)
        const box = new THREE.Box3().setFromObject(model);
        const size = box.getSize(new THREE.Vector3());
        const scaleFactor = 1.8 / size.y; 
        model.scale.set(scaleFactor, scaleFactor, scaleFactor);
        model.position.set(x, 0, z);
        
        scene.add(model);

        // ПРАВКА №30: Анимация
        let mixer = null;
        if (gltf.animations.length > 0) {
            mixer = new THREE.AnimationMixer(model);
            // Пытаемся найти анимацию ходьбы или бега, иначе берем первую
            const walkClip = THREE.AnimationClip.findByName(gltf.animations, 'walk') || gltf.animations[0];
            mixer.clipAction(walkClip).play();
            mixers.push(mixer);
        }

        // ПРАВКА №31: Здоровье на 15 попаданий (100 / 7 ≈ 14.2)
        model.userData = { 
            health: 100, 
            speed: 0.02 + Math.random() * 0.01, 
            mixer: mixer 
        };
        monsters.push(model);
    });
}

function shoot() {
    if (isShooting || isReloading || pistolMag <= 0) return;
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    
    if (shotSound && shotSound.buffer) {
        if (shotSound.isPlaying) shotSound.stop();
        shotSound.play();
    }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(monsters, true);
    
    if (intersects.length > 0) {
        let target = intersects[0].object;
        while(target.parent && !target.userData.health) { target = target.parent; }
        
        if (target.userData.health) {
            // ПРАВКА №31: Урон игрока
            target.userData.health -= 7; 
            if (target.userData.health <= 0) {
                scene.remove(target);
                monsters = monsters.filter(m => m !== target);
            }
        }
    }

    const weapon = document.getElementById('weapon');
    weapon.style.transform = `translateY(${pitch * 25 + 60}px) scale(1.1)`;
    setTimeout(() => {
        weapon.style.transform = `translateY(${pitch * 25}px)`;
        isShooting = false;
        if (pistolMag === 0) reloadPistol();
    }, 100);
}

// ... функции reloadPistol, setupBackgroundMusic, loadSFX и startGame остаются без изменений ...
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

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    document.body.requestPointerLock();
    if (listener.context.state === 'suspended') listener.context.resume();
    bgMusicHTML.play();
}

function drawMinimap() {
    minimapCtx.clearRect(0, 0, 150, 150);
    const zoom = 8;
    const centerX = 75;
    const centerY = 75;

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
        minimapCtx.beginPath();
        minimapCtx.arc(dx, dz, 3, 0, Math.PI * 2);
        minimapCtx.fill();
    });

    minimapCtx.save();
    minimapCtx.translate(centerX, centerY);
    minimapCtx.rotate(-camera.rotation.y);
    minimapCtx.fillStyle = "#0f0";
    minimapCtx.beginPath();
    minimapCtx.moveTo(0, -6); minimapCtx.lineTo(4, 4); minimapCtx.lineTo(-4, 4);
    minimapCtx.fill();
    minimapCtx.restore();
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    mixers.forEach(m => m.update(delta));

    const oldP = camera.position.clone();
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const moveDir = dir.clone().setY(0).normalize();
    const sideDir = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();
    let s = keys.ShiftLeft ? 0.12 : 0.05;
    if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
    if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
    if (keys.KeyA) camera.position.addScaledVector(sideDir, s);
    if (keys.KeyD) camera.position.addScaledVector(sideDir, -s);
    if (physics && physics.checkCollision(camera.position.x, camera.position.z)) camera.position.copy(oldP);

    playerLight.position.copy(camera.position);

    const now = Date.now();
    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < 12) {
            const dirM = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            
            // ПРАВКА №33: Движение монстра с учетом стен
            const nextX = m.position.x + dirM.x * m.userData.speed;
            const nextZ = m.position.z + dirM.z * m.userData.speed;
            
            if (physics && !physics.checkCollision(nextX, nextZ)) {
                m.position.x = nextX;
                m.position.z = nextZ;
            }
            
            m.lookAt(camera.position.x, 0, camera.position.z);

            // ПРАВКА №31: Урон игроку при контакте
            if (dist < 1.3 && now - lastDamageTime > 1000) {
                playerHP -= 15;
                document.getElementById('hp-bar-fill').style.width = playerHP + "%";
                document.getElementById('hp-text').innerText = playerHP + "%";
                lastDamageTime = now;
                document.getElementById('damage-flash').style.display = 'block';
                setTimeout(() => { document.getElementById('damage-flash').style.display = 'none'; }, 100);
                if (playerHP <= 0) location.reload();
            }
        }
    });

    drawMinimap();
    renderer.render(scene, camera);
}
