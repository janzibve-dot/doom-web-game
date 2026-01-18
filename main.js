import * as THREE from 'three';
import { Physics } from './engine/physics.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

let scene, camera, renderer, physics, playerLight;
let levelData, playerHP = 100, pistolMag = 10, pistolTotal = 120, kills = 0;
let isReloading = false, isShooting = false, lastDamageTime = 0;
let monsters = [], mixers = [], clock = new THREE.Clock();
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, KeyR: false, ShiftLeft: false };
let pitch = 0, isGameStarted = false, isDead = false, gameStartTime = 0;

let shotSound, reloadSound, bgMusicHTML, heartbeatSound, flickerSound;
const audioLoader = new THREE.AudioLoader();
const listener = new THREE.AudioListener();
const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

window.addEventListener('DOMContentLoaded', () => {
    fetch(path + 'levels/level1.json').then(r => r.json()).then(data => { 
        levelData = data; 
        physics = new Physics(levelData);
        init(); 
    }).catch(e => console.error("Карта не загружена:", e));
});

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); 
    scene.fog = new THREE.Fog(0x000000, 0.1, 12); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 300);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 
    camera.add(listener);

    renderer = new THREE.WebGLRenderer({ 
        antialias: true, 
        logarithmicDepthBuffer: true,
        precision: "highp" 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.body.appendChild(renderer.domElement);

    loadAllSounds();

    playerLight = new THREE.SpotLight(0xffffff, 8, 16, Math.PI/4, 0.4);
    scene.add(playerLight);
    scene.add(playerLight.target);

    // Оптимизация: Сборка лабиринта
    const wallGeoms = [], floorGeoms = [], ceilGeoms = [];
    const wallBox = new THREE.BoxGeometry(1, 4, 1);
    const tileBox = new THREE.BoxGeometry(1, 0.1, 1);

    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const g = wallBox.clone(); g.translate(x, 2, z); wallGeoms.push(g);
            } else {
                const f = tileBox.clone(); f.translate(x, 0, z); floorGeoms.push(f);
                const c = tileBox.clone(); c.translate(x, 4, z); ceilGeoms.push(c);
            }
        });
    });

    const wallTex = new THREE.TextureLoader().load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    wallTex.wrapS = wallTex.wrapT = THREE.RepeatWrapping;

    scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(wallGeoms), new THREE.MeshStandardMaterial({ map: wallTex })));
    scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(floorGeoms), new THREE.MeshStandardMaterial({ color: 0x050505 })));
    scene.add(new THREE.Mesh(BufferGeometryUtils.mergeGeometries(ceilGeoms), new THREE.MeshStandardMaterial({ color: 0x080808 })));

    document.getElementById('play-btn').onclick = () => { if(!isGameStarted) startGame(); };

    window.onkeydown = (e) => { if(isGameStarted && !isDead && e.code in keys) keys[e.code] = true; };
    window.onkeyup = (e) => { if(isGameStarted && !isDead && e.code in keys) keys[e.code] = false; };
    window.onmousemove = (e) => {
        if (isGameStarted && document.pointerLockElement && !isDead) {
            camera.rotation.y -= e.movementX * 0.0022;
            pitch -= e.movementY * 0.0022;
            pitch = Math.max(-1.3, Math.min(1.3, pitch));
            camera.rotation.x = pitch;
            document.getElementById('weapon').style.transform = `translateY(${pitch * 25}px)`;
        }
    };
    window.onmousedown = () => { if (isGameStarted && !isDead) shoot(); };
    window.addEventListener('keydown', e => { if(isGameStarted && e.code === 'KeyR' && !isReloading) reloadPistol(); });

    animate();
}

function startGame() {
    isGameStarted = true; gameStartTime = Date.now();
    document.getElementById('start-screen').style.display = 'none';
    document.body.requestPointerLock();
    if (listener.context.state === 'suspended') listener.context.resume();
    if (bgMusicHTML) bgMusicHTML.play().catch(() => {});
    setInterval(() => { if (monsters.length < 15 && !isDead) spawnRandomMonster(); }, 5000);
}

function spawnRandomMonster() {
    let rx, rz;
    do {
        rx = Math.floor(Math.random() * (levelData.map[0].length - 2)) + 1;
        rz = Math.floor(Math.random() * (levelData.map.length - 2)) + 1;
    } while (levelData.map[rz] && levelData.map[rz][rx] === 1);
    
    new GLTFLoader().load(path + 'assets/sprites/models/monster.glb', (gltf) => {
        const model = gltf.scene;
        model.position.set(rx, 0, rz);
        model.scale.set(1.3, 1.3, 1.3);
        scene.add(model);
        if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const action = mixer.clipAction(gltf.animations[0]);
            action.time = 3; action.play();
            mixers.push({ mixer, model });
        }
        model.userData = { health: 100, speed: 0.046 };
        monsters.push(model);
    });
}

function animate() {
    requestAnimationFrame(animate);
    if (!isGameStarted || isDead) return;

    const delta = clock.getDelta();
    mixers.forEach((mObj) => {
        mObj.mixer.update(delta);
        const action = mObj.mixer._actions[0];
        if (action && action.time >= action._clip.duration - 3) action.time = 3;
    });

    const oldP = camera.position.clone();
    let s = keys.ShiftLeft ? 0.16 : 0.08;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const moveDir = dir.clone().setY(0).normalize();
    const sideDir = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();

    if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
    if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
    if (keys.KeyA) camera.position.addScaledVector(sideDir, s);
    if (keys.KeyD) camera.position.addScaledVector(sideDir, -s);

    if (physics && physics.checkCollision(camera.position.x, camera.position.z)) camera.position.copy(oldP);
    monsters.forEach(m => { if(camera.position.distanceTo(m.position) < 0.8) camera.position.copy(oldP); });

    playerLight.position.copy(camera.position);
    const targetPos = new THREE.Vector3(); camera.getWorldDirection(targetPos);
    playerLight.target.position.copy(camera.position).add(targetPos);

    let minMonsterDist = 20;
    const now = Date.now();

    monsters.forEach((m) => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < minMonsterDist) minMonsterDist = dist;
        if (dist < 12) { 
            const dirM = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            if (physics && !physics.checkCollision(m.position.x + dirM.x * 0.4, m.position.z + dirM.z * 0.4)) {
                m.position.x += dirM.x * m.userData.speed; m.position.z += dirM.z * m.userData.speed;
            }
            m.lookAt(camera.position.x, 0, camera.position.z);
            if (dist < 1.4 && now - lastDamageTime > 1200) {
                playerHP -= 20;
                document.getElementById('hp-bar-fill').style.width = playerHP + "%";
                document.getElementById('hp-text').innerText = playerHP + "%";
                lastDamageTime = now;
                document.getElementById('damage-flash').style.display = 'block';
                setTimeout(() => { document.getElementById('damage-flash').style.display = 'none'; }, 100);
                if (playerHP <= 0) gameOver();
            }
        }
    });

    if (minMonsterDist < 7.5) {
        let intensity = 1 - (minMonsterDist / 7.5);
        if (heartbeatSound && heartbeatSound.buffer) heartbeatSound.setVolume(intensity);
        if (flickerSound && flickerSound.buffer) flickerSound.setVolume(intensity * 0.5);
        if (Math.random() > (minMonsterDist / 7.5)) playerLight.intensity = Math.random() * 0.2;
        else playerLight.intensity = 6;
    } else {
        if (heartbeatSound && heartbeatSound.buffer) heartbeatSound.setVolume(0);
        if (flickerSound && flickerSound.buffer) flickerSound.setVolume(0);
        playerLight.intensity = 6;
    }
    renderer.render(scene, camera);
}

function shoot() {
    if (isShooting || isReloading || pistolMag <= 0) return;
    isShooting = true; pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    if (shotSound && shotSound.buffer) { if (shotSound.isPlaying) shotSound.stop(); shotSound.play(); }

    const weapon = document.getElementById('weapon');
    weapon.style.transition = 'none';
    weapon.style.transform = `translateY(${pitch * 25 - 45}px) scale(1.1)`;

    setTimeout(() => {
        weapon.style.transition = 'transform 0.1s ease-out';
        weapon.style.transform = `translateY(${pitch * 25}px)`;
        isShooting = false;
        if (pistolMag === 0) reloadPistol();
    }, 100);

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(monsters, true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.health) obj = obj.parent;
        if (obj && obj.userData.health) {
            obj.userData.health -= 35;
            if (obj.userData.health <= 0) {
                scene.remove(obj);
                mixers = mixers.filter(m => m.model !== obj);
                monsters = monsters.filter(m => m !== obj);
                kills++; document.getElementById('kill-counter').innerText = "УБИТО: " + kills;
            }
        }
    }
}

function reloadPistol() {
    isReloading = true;
    if (reloadSound && reloadSound.buffer) reloadSound.play();
    document.getElementById('weapon').classList.add('reloading');
    setTimeout(() => {
        let toReload = Math.min(10 - pistolMag, pistolTotal);
        pistolMag += toReload; pistolTotal -= toReload;
        document.getElementById('mag').innerText = pistolMag;
        document.getElementById('total-ammo').innerText = pistolTotal;
        document.getElementById('weapon').classList.remove('reloading');
        setTimeout(() => { isReloading = false; }, 600);
    }, 1200); 
}

function gameOver() {
    isDead = true; document.exitPointerLock();
    const time = Math.floor((Date.now() - gameStartTime) / 1000);
    document.getElementById('stats-text').innerText = `УБИТО: ${kills} | ВРЕМЯ: ${time}с`;
    document.getElementById('death-screen').style.display = 'flex';
}

function loadAllSounds() {
    bgMusicHTML = new Audio(path + 'FON1.ogg'); bgMusicHTML.loop = true; bgMusicHTML.volume = 0.1;
    const sfx = [
        {name: 'shot', url: 'audio/sfx/shot.mp3', obj: shotSound = new THREE.Audio(listener)},
        {name: 'reload', url: 'audio/sfx/reload.mp3', obj: reloadSound = new THREE.Audio(listener)},
        {name: 'flicker', url: 'audio/sfx/flicker.mp3', obj: flickerSound = new THREE.Audio(listener), loop: true},
        {name: 'heartbeat', url: 'audio/sfx/heartbeat.mp3', obj: heartbeatSound = new THREE.Audio(listener), loop: true}
    ];
    sfx.forEach(s => {
        audioLoader.load(path + s.url, b => {
            s.obj.setBuffer(b);
            if (s.loop) { s.obj.setLoop(true); s.obj.setVolume(0); s.obj.play(); }
        }, undefined, e => console.warn(`Звук ${s.name} не загружен: ${s.url}`));
    });
}
