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

// Базовый путь
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
    scene.background = new THREE.Color(0x050000);
    scene.fog = new THREE.Fog(0x050000, 1, 25);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 
    camera.add(listener);

    // Загрузка аудио
    bgMusic = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/music/fon.mp3', (buffer) => {
        bgMusic.setBuffer(buffer);
        bgMusic.setLoop(true);
        bgMusic.setVolume(0.25);
    });

    shotSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/shot.mp3', (buffer) => {
        shotSound.setBuffer(buffer);
        shotSound.setVolume(1.0);
    });

    reloadSound = new THREE.Audio(listener);
    audioLoader.load(path + 'audio/sfx/reload.mp3', (buffer) => {
        reloadSound.setBuffer(buffer);
        reloadSound.setVolume(0.8);
    });

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xff0000, 0.1)); // Красное свечение
    playerLight = new THREE.PointLight(0xffffff, 1.5, 12);
    scene.add(playerLight);

    // Отрисовка стен БЕЗ внешних текстур (чтобы не было белых пятен)
    const wallGeo = new THREE.BoxGeometry(1, 4, 1);
    const wallMat = new THREE.MeshStandardMaterial({ 
        color: 0x444444, // Серый кирпич
        roughness: 0.9
    });

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
        new THREE.PlaneGeometry(1000, 1000), 
        new THREE.MeshStandardMaterial({ color: 0x111111 })
    );
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    // Клик для старта
    document.getElementById('start-screen').addEventListener('click', startAudio);

    window.addEventListener('keydown', e => { 
        if(e.code in keys) keys[e.code] = true; 
        if(e.code === 'KeyR') reloadPistol(); 
    });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    window.addEventListener('mousedown', () => { if (document.pointerLockElement) shoot(); });
    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) {
            camera.rotation.y -= e.movementX * 0.0022;
            pitch -= e.movementY * 0.0022;
            pitch = Math.max(-1.4, Math.min(1.4, pitch));
            camera.rotation.x = pitch;
            updateWeaponPosition();
        }
    });

    spawnMonster(5, 5);
    spawnMonster(10, 8);
    animate();
}

function startAudio() {
    document.getElementById('start-screen').style.display = 'none';
    document.body.requestPointerLock();
    
    if (listener.context.state === 'suspended') {
        listener.context.resume().then(() => {
            if (bgMusic.buffer && !bgMusic.isPlaying) bgMusic.play();
        });
    } else {
        if (bgMusic.buffer && !bgMusic.isPlaying) bgMusic.play();
    }
}

function spawnMonster(x, z) {
    const loader = new THREE.TextureLoader();
    loader.load(path + 'assets/sprites/monster.png', (texture) => {
        const spriteMat = new THREE.SpriteMaterial({ map: texture, color: 0xffffff });
        const monster = new THREE.Sprite(spriteMat);
        monster.position.set(x, 1.2, z);
        monster.scale.set(2.2, 2.2, 1);
        monster.userData = { health: 50, speed: 0.018 };
        scene.add(monster);
        monsters.push(monster);
    });
}

function updateWeaponPosition() {
    const weapon = document.getElementById('weapon');
    if (!isReloading) {
        weapon.style.transform = `translateY(${pitch * 30}px)`;
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
    if (isShooting || isReloading || pistolMag <= 0) {
        if (pistolMag <= 0) reloadPistol();
        return;
    }
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
    weapon.style.transform = `translateY(${pitch * 30 + 85}px) scale(1.15) rotate(-4deg)`;
    
    setTimeout(() => {
        weapon.style.transition = "transform 0.1s ease-out";
        updateWeaponPosition();
        isShooting = false;
        if (pistolMag === 0) reloadPistol();
    }, 75);
}

function animate() {
    requestAnimationFrame(animate);
    
    const oldP = camera.position.clone();
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir);
    const moveDir = dir.clone().setY(0).normalize();
    const sideDir = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();
    
    let s = keys.ShiftLeft ? 0.13 : 0.06;

    if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
    if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
    if (keys.KeyA) camera.position.addScaledVector(sideDir, s);
    if (keys.KeyD) camera.position.addScaledVector(sideDir, -s);

    // Жесткая проверка коллизий
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
