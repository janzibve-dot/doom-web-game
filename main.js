import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight, ambientLight;
let levelData;
let playerHP = 100, pistolMag = 10, pistolTotal = 120;
let isReloading = false, isShooting = false, lastDamageTime = 0;
let monsters = [];
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false, KeyR: false };
let pitch = 0;

let shotSound, reloadSound, bgMusic;
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();

// Определение пути для GitHub Pages
const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

fetch(path + 'levels/level1.json')
    .then(r => r.json())
    .then(data => { 
        levelData = data; 
        physics = new Physics(levelData);
        init(); 
    });

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010101);
    scene.fog = new THREE.Fog(0x010101, 1, 20);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 
    camera.add(listener);

    // Аудио секция
    bgMusic = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/music/fon.mp3', (buffer) => {
        bgMusic.setBuffer(buffer);
        bgMusic.setLoop(true);
        bgMusic.setVolume(0.3);
    });

    shotSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/shot.mp3', (buffer) => {
        shotSound.setBuffer(buffer);
        shotSound.setVolume(0.8);
    });

    reloadSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/reload.mp3', (buffer) => {
        reloadSound.setBuffer(buffer);
        reloadSound.setVolume(0.6);
    });

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Улучшенное освещение
    ambientLight = new THREE.AmbientLight(0xffffff, 0.05); // Очень слабый общий свет
    scene.add(ambientLight);

    playerLight = new THREE.PointLight(0xffffff, 2.5, 15); // Мощный фонарик
    playerLight.decay = 2;
    scene.add(playerLight);

    // Генерация текстуры стен программно (чтобы не зависеть от файлов)
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#333'; ctx.fillRect(0,0,64,64);
    ctx.strokeStyle = '#111'; ctx.lineWidth = 4; ctx.strokeRect(0,0,64,64);
    const wallTexture = new THREE.CanvasTexture(canvas);
    wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(1, 4);

    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture });
    const wallGeo = new THREE.BoxGeometry(1, 4, 1);

    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            }
        });
    });

    // Пол
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(2000, 2000), 
        new THREE.MeshStandardMaterial({ color: 0x050505 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Старт игры
    document.getElementById('start-screen').addEventListener('click', () => {
        document.getElementById('start-screen').style.display = 'none';
        document.body.requestPointerLock();
        
        if (listener.context.state === 'suspended') {
            listener.context.resume().then(() => {
                if (bgMusic.buffer) bgMusic.play();
            });
        } else {
            if (bgMusic.buffer) bgMusic.play();
        }
    });

    window.addEventListener('keydown', e => { 
        if(e.code in keys) keys[e.code] = true; 
        if(e.code === 'KeyR') reloadPistol(); 
    });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    window.addEventListener('mousedown', () => { if (document.pointerLockElement) shoot(); });
    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) {
            camera.rotation.y -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-1.4, Math.min(1.4, pitch));
            camera.rotation.x = pitch;
            updateWeaponPosition();
        }
    });

    spawnMonster(5, 5);
    spawnMonster(10, 8);
    animate();
}

function spawnMonster(x, z) {
    const loader = new THREE.TextureLoader();
    loader.load(path + 'assets/sprites/monster.png', (texture) => {
        const spriteMat = new THREE.SpriteMaterial({ map: texture });
        const monster = new THREE.Sprite(spriteMat);
        monster.position.set(x, 1.2, z);
        monster.scale.set(2, 2, 1);
        monster.userData = { health: 50, speed: 0.015 };
        scene.add(monster);
        monsters.push(monster);
    });
}

function updateWeaponPosition() {
    const weapon = document.getElementById('weapon');
    if (!isReloading) {
        weapon.style.transform = `translateY(${pitch * 25}px)`;
    }
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
    if (isShooting || isReloading || pistolMag <= 0) return;
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    
    if (shotSound.buffer) {
        if (shotSound.isPlaying) shotSound.stop();
        shotSound.play();
    }

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

    const weapon = document.getElementById('weapon');
    weapon.style.transition = "none";
    weapon.style.transform = `translateY(${pitch * 25 + 80}px) scale(1.1) rotate(-4deg)`;
    
    setTimeout(() => {
        weapon.style.transition = "transform 0.1s ease-out";
        updateWeaponPosition();
        isShooting = false;
        if (pistolMag === 0) reloadPistol();
    }, 70);
}

function animate() {
    requestAnimationFrame(animate);
    
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

    const now = Date.now();
    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < 15) {
            const dirM = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            const nX = m.position.x + dirM.x * m.userData.speed;
            const nZ = m.position.z + dirM.z * m.userData.speed;
            
            if (physics && !physics.checkCollision(nX, nZ)) {
                m.position.x = nX; m.position.z = nZ;
            }
            
            if (dist < 1.3 && now - lastDamageTime > 1200) {
                playerHP -= 20;
                document.getElementById('hp-bar-fill').style.width = playerHP + "%";
                document.getElementById('hp-text').innerText = playerHP + "%";
                lastDamageTime = now;
                const flash = document.getElementById('damage-flash');
                flash.style.display = 'block';
                setTimeout(() => flash.style.display = 'none', 100);
                if (playerHP <= 0) location.reload();
            }
        }
    });

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
