import * as THREE from 'three';
import { Physics } from './engine/physics.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

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

fetch(path + 'levels/level1.json').then(r => r.json()).then(data => { 
    levelData = data; 
    physics = new Physics(levelData);
    init(); 
});

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); 
    scene.fog = new THREE.Fog(0x000000, 1, 10); 

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 
    camera.add(listener);

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    loadAllSounds();

    playerLight = new THREE.SpotLight(0xffffff, 5, 20, Math.PI/4, 0.5);
    scene.add(playerLight);
    scene.add(playerLight.target);

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

    const floorMat = new THREE.MeshStandardMaterial({ color: 0x050505 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), floorMat);
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    document.getElementById('play-btn').onclick = () => startGame();

    window.onkeydown = (e) => { if(isGameStarted && !isDead && e.code in keys) keys[e.code] = true; };
    window.onkeyup = (e) => { if(isGameStarted && !isDead && e.code in keys) keys[e.code] = false; };
    window.onmousemove = (e) => {
        if (isGameStarted && document.pointerLockElement && !isDead) {
            camera.rotation.y -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-1.4, Math.min(1.4, pitch));
            camera.rotation.x = pitch;
            // Обновляем положение оружия при повороте головы
            document.getElementById('weapon').style.transform = `translateY(${pitch * 20}px)`;
        }
    };
    window.onmousedown = () => { if (isGameStarted && !isDead) shoot(); };
    window.addEventListener('keydown', e => { if(isGameStarted && e.code === 'KeyR') reloadPistol(); });

    animate();
}

function startGame() {
    isGameStarted = true;
    gameStartTime = Date.now();
    document.getElementById('start-screen').style.display = 'none';
    document.body.requestPointerLock();
    if (listener.context.state === 'suspended') listener.context.resume();
    if (bgMusicHTML) bgMusicHTML.play();
    setInterval(() => { if (monsters.length < 15 && !isDead) spawnRandomMonster(); }, 5000);
}

function spawnRandomMonster() {
    let rx, rz;
    do {
        rx = Math.floor(Math.random() * (levelData.map[0].length - 2)) + 1;
        rz = Math.floor(Math.random() * (levelData.map.length - 2)) + 1;
    } while (levelData.map[rz] && levelData.map[rz][rx] === 1);
    
    const gltfLoader = new GLTFLoader();
    gltfLoader.load(path + 'assets/sprites/models/monster.glb', (gltf) => {
        const model = gltf.scene;
        model.position.set(rx, 0, rz);
        model.scale.set(1.5, 1.5, 1.5);
        scene.add(model);
        if (gltf.animations.length > 0) {
            const mixer = new THREE.AnimationMixer(model);
            const action = mixer.clipAction(gltf.animations[0]);
            action.time = 3; action.play();
            mixers.push(mixer);
        }
        model.userData = { health: 100, speed: 0.045 };
        monsters.push(model);
    });
}

function animate() {
    requestAnimationFrame(animate);
    if (!isGameStarted || isDead) return;

    const delta = clock.getDelta();
    mixers.forEach(m => m.update(delta));

    const oldP = camera.position.clone();
    let s = keys.ShiftLeft ? 0.15 : 0.07;
    const dir = new THREE.Vector3(); camera.getWorldDirection(dir);
    const moveDir = dir.clone().setY(0).normalize();
    const sideDir = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();

    if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
    if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
    if (keys.KeyA) camera.position.addScaledVector(sideDir, s);
    if (keys.KeyD) camera.position.addScaledVector(sideDir, -s);

    let collision = false;
    if (physics && physics.checkCollision(camera.position.x, camera.position.z)) collision = true;
    monsters.forEach(m => { if(camera.position.distanceTo(m.position) < 1.0) collision = true; });
    if (collision) camera.position.copy(oldP);

    playerLight.position.copy(camera.position);
    const targetPos = new THREE.Vector3(); camera.getWorldDirection(targetPos);
    playerLight.target.position.copy(camera.position).add(targetPos);

    let minMonsterDist = 20;
    const now = Date.now();

    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < minMonsterDist) minMonsterDist = dist;
        if (dist < 12) { 
            const dirM = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            if (physics && !physics.checkCollision(m.position.x + dirM.x*0.4, m.position.z + dirM.z*0.4)) {
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

    if (minMonsterDist < 7) {
        let intensity = 1 - (minMonsterDist / 7);
        if (heartbeatSound) heartbeatSound.setVolume(intensity);
        if (flickerSound) flickerSound.setVolume(intensity * 0.5);
        if (Math.random() > (minMonsterDist / 7)) playerLight.intensity = Math.random() * 0.3;
        else playerLight.intensity = 5;
    } else {
        if (heartbeatSound) heartbeatSound.setVolume(0);
        if (flickerSound) flickerSound.setVolume(0);
        playerLight.intensity = 5;
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
    weapon.style.transform = `translateY(${pitch * 20 - 40}px) scale(1.1)`;

    setTimeout(() => {
        weapon.style.transition = 'transform 0.1s ease-out';
        weapon.style.transform = `translateY(${pitch * 20}px)`;
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
                monsters = monsters.filter(m => m !== obj);
                kills++; document.getElementById('kill-counter').innerText = "УБИТО: " + kills;
            }
        }
    }
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
    shotSound = new THREE.Audio(listener); audioLoader.load(path + 'audio/sfx/shot.mp3', b => shotSound.setBuffer(b));
    reloadSound = new THREE.Audio(listener); audioLoader.load(path + 'audio/sfx/reload.mp3', b => reloadSound.setBuffer(b));
    flickerSound = new THREE.Audio(listener); audioLoader.load(path + 'audio/sfx/flicker.mp3', b => { flickerSound.setBuffer(b); flickerSound.setLoop(true); flickerSound.setVolume(0); flickerSound.play(); });
    heartbeatSound = new THREE.Audio(listener); audioLoader.load(path + 'audio/sfx/heartbeat.mp3', b => { heartbeatSound.setBuffer(b); heartbeatSound.setLoop(true); heartbeatSound.setVolume(0); heartbeatSound.play(); });
}
