import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let levelData;
let playerHP = 100, pistolMag = 10, pistolTotal = 120;
let isReloading = false, isShooting = false, lastDamageTime = 0;
let monsters = [];
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false, KeyR: false };
let pitch = 0;

let shotSound, reloadSound, bgMusicHTML;
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();

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
    scene.fog = new THREE.Fog(0x000000, 1, 15);

    // ИСПРАВЛЕНИЕ 1: Near plane установлен на 0.01, чтобы стены не исчезали вблизи
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 
    camera.add(listener);

    setupBackgroundMusic();
    loadSFX();

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // ИСПРАВЛЕНИЕ 2: Свет отодвинут от центра камеры и имеет меньшую интенсивность
    playerLight = new THREE.PointLight(0xffffff, 1.5, 12);
    playerLight.decay = 2;
    scene.add(playerLight);
    scene.add(new THREE.AmbientLight(0x222222, 0.2));

    // Стены с четкой сеткой
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#111'; ctx.fillRect(0,0,128,128);
    ctx.strokeStyle = '#333'; ctx.lineWidth = 4; ctx.strokeRect(0,0,128,128);
    const wallTexture = new THREE.CanvasTexture(canvas);
    wallTexture.wrapS = wallTexture.wrapT = THREE.RepeatWrapping;
    wallTexture.repeat.set(1, 2);

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

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(1000,1000), new THREE.MeshStandardMaterial({color:0x050505}));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    document.getElementById('start-screen').addEventListener('click', startGame);

    window.addEventListener('keydown', e => { if(e.code in keys) keys[e.code] = true; if(e.code === 'KeyR') reloadPistol(); });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) {
            camera.rotation.y -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-1.4, Math.min(1.4, pitch));
            camera.rotation.x = pitch;
            updateWeaponPosition();
        }
    });
    window.addEventListener('mousedown', () => { if (document.pointerLockElement) shoot(); });

    spawnMonster(5, 5);
    animate();
}

function setupBackgroundMusic() {
    bgMusicHTML = new Audio(path + 'audio/music/FON1.mp3');
    bgMusicHTML.loop = true;
    bgMusicHTML.volume = 0.3;
}

function loadSFX() {
    shotSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/shot.mp3', (buffer) => { shotSound.setBuffer(buffer); shotSound.setVolume(0.6); });
    reloadSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/reload.mp3', (buffer) => { reloadSound.setBuffer(buffer); reloadSound.setVolume(0.4); });
}

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    document.body.requestPointerLock();
    if (listener.context.state === 'suspended') listener.context.resume();
    bgMusicHTML.play().catch(() => console.log("Музыка FON1.mp3 не найдена"));
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
    if (isShooting || isReloading || pistolMag <= 0) return;
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    if (shotSound.buffer) { if(shotSound.isPlaying) shotSound.stop(); shotSound.play(); }

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

    // ИСПРАВЛЕНИЕ 3: Позиция света чуть выше камеры, чтобы не слепить стену перед лицом
    playerLight.position.copy(camera.position);
    playerLight.position.y += 0.5;

    const now = Date.now();
    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < 15) {
            const dirM = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            m.position.x += dirM.x * m.userData.speed;
            m.position.z += dirM.z * m.userData.speed;
            if (dist < 1.3 && now - lastDamageTime > 1200) {
                playerHP -= 20;
                document.getElementById('hp-bar-fill').style.width = playerHP + "%";
                document.getElementById('hp-text').innerText = playerHP + "%";
                lastDamageTime = now;
                document.getElementById('damage-flash').style.display = 'block';
                setTimeout(() => document.getElementById('damage-flash').style.display = 'none', 100);
                if (playerHP <= 0) location.reload();
            }
        }
    });
    renderer.render(scene, camera);
}
