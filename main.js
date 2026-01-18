import * as THREE from 'three';
import { Physics } from './engine/physics.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, physics, playerLight;
let levelData, playerHP = 100, pistolMag = 10, pistolTotal = 120;
let isReloading = false, isShooting = false, lastDamageTime = 0;
let monsters = [];
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false, KeyR: false };
let pitch = 0, mixers = [], clock = new THREE.Clock();

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

    playerLight = new THREE.PointLight(0xffffff, 1.3, 12);
    scene.add(playerLight);
    scene.add(new THREE.AmbientLight(0x404040, 0.2));

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

    window.addEventListener('keydown', e => { 
        if(e.code in keys) keys[e.code] = true; 
        if(e.code === 'KeyR' && !isReloading) reloadPistol(); 
    });
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

    // Спавним монстра сразу
    spawn3DMonster(5, 5);
    animate();
}

function spawn3DMonster(x, z) {
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(path + 'assets/sprites/models/monster.glb', (gltf) => {
        const model = gltf.scene;
        model.position.set(x, 0, z);
        model.scale.set(1.5, 1.5, 1.5);
        scene.add(model);

        if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const clip = gltf.animations[0];
            const action = mixer.clipAction(clip);
            
            // ПРАВКА: Обрезаем первые 3 и последние 3 секунды
            const startTime = 3;
            const endTime = clip.duration - 3;
            
            if (endTime > startTime) {
                action.time = startTime;
                action.play();
                // Ограничиваем цикл воспроизведения
                mixer.addEventListener('loop', () => { action.time = startTime; });
            } else {
                action.play(); // Если анимация слишком короткая, играем как есть
            }
            mixers.push(mixer);
        }

        model.userData = { health: 60, speed: 0.02 };
        monsters.push(model);
    });
}

function shoot() {
    if (isShooting || isReloading || pistolMag <= 0) return;
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    
    if (shotSound.buffer) { if(shotSound.isPlaying) shotSound.stop(); shotSound.play(); }

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    
    // ПРАВКА: Глубокая проверка попадания в монстров
    const intersects = raycaster.intersectObjects(monsters, true);
    if (intersects.length > 0) {
        let hitObject = intersects[0].object;
        // Ищем родителя, у которого есть userData.health
        let target = hitObject;
        while (target && !target.userData.health) {
            target = target.parent;
        }

        if (target && target.userData.health) {
            target.userData.health -= 20;
            if (target.userData.health <= 0) {
                scene.remove(target);
                monsters = monsters.filter(m => m !== target);
            }
        }
    }

    // Визуальная отдача
    const weapon = document.getElementById('weapon');
    weapon.style.transform = `translateY(${pitch * 25 + 60}px) scale(1.1)`;
    setTimeout(() => {
        weapon.style.transform = `translateY(${pitch * 25}px)`;
        isShooting = false;
        if (pistolMag === 0) reloadPistol();
    }, 100);
}

function reloadPistol() {
    if (isReloading || pistolMag === 10 || pistolTotal <= 0) return;
    isReloading = true;
    
    if (reloadSound.buffer) reloadSound.play();
    document.getElementById('weapon').classList.add('reloading');

    setTimeout(() => {
        let needed = 10 - pistolMag;
        let toReload = Math.min(needed, pistolTotal);
        pistolMag += toReload;
        pistolTotal -= toReload;
        
        document.getElementById('mag').innerText = pistolMag;
        document.getElementById('total-ammo').innerText = pistolTotal;
        document.getElementById('weapon').classList.remove('reloading');
        
        // Гарантированный сброс флага
        isReloading = false;
    }, 1200); 
}

// Остальные функции (animate, setupBackgroundMusic и т.д.) остаются прежними
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

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    mixers.forEach(m => m.update(delta));

    if (document.pointerLockElement) {
        const oldP = camera.position.clone();
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const moveDir = dir.clone().setY(0).normalize();
        const sideDir = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();
        
        let s = keys.ShiftLeft ? 0.12 : 0.05;
        if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
        if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
        if (keys.KeyA) camera.position.addScaledVector(sideDir, s);
        if (keys.KeyD) camera.position.addScaledVector(sideDir, -s);

        if (physics && physics.checkCollision(camera.position.x, camera.position.z)) {
            camera.position.copy(oldP);
        }
    }

    playerLight.position.copy(camera.position);
    const now = Date.now();

    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < 15) {
            const dirM = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            m.position.x += dirM.x * m.userData.speed;
            m.position.z += dirM.z * m.userData.speed;
            m.lookAt(camera.position.x, 0, camera.position.z);

            if (dist < 1.3 && now - lastDamageTime > 1200) {
                playerHP -= 20;
                document.getElementById('hp-bar-fill').style.width = playerHP + "%";
                lastDamageTime = now;
                if (playerHP <= 0) location.reload();
            }
        }
    });

    renderer.render(scene, camera);
}
