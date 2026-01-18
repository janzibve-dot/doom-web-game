import * as THREE from 'three';
import { Physics } from './engine/physics.js';
import { GLTFLoader } from 'https://unpkg.com/three@0.160.0/examples/jsm/loaders/GLTFLoader.js';

let scene, camera, renderer, physics, playerLight;
let levelData, playerHP = 100, pistolMag = 10, pistolTotal = 120;
let isReloading = false, isShooting = false, lastDamageTime = 0;
let monsters = [], mixers = [], clock = new THREE.Clock();
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false, KeyR: false };
let pitch = 0;

const path = window.location.pathname.substring(0, window.location.pathname.lastIndexOf('/') + 1);

fetch(path + 'levels/level1.json').then(r => r.json()).then(data => { 
    levelData = data; 
    physics = new Physics(levelData);
    init(); 
});

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x000000); 
    scene.fog = new THREE.Fog(0x000000, 1, 8); // Туман: полная тьма на 8 метрах

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.01, 1000);
    camera.position.set(1.5, 1.6, 1.5);
    camera.rotation.order = 'YXZ'; 

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    // Фонарик (SpotLight)
    playerLight = new THREE.SpotLight(0xffffff, 4, 15, Math.PI/4, 0.5);
    playerLight.decay = 2;
    scene.add(playerLight);
    scene.add(playerLight.target);

    const loader = new THREE.TextureLoader();
    const wallTex = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex });

    // Отрисовка огромной карты 80x80
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

    // Спавн монстров
    for(let i=0; i<15; i++) {
        let rx, rz;
        do {
            rx = Math.floor(Math.random() * 70) + 5;
            rz = Math.floor(Math.random() * 70) + 5;
        } while (levelData.map[rz][rx] === 1);
        spawn3DMonster(rx, rz);
    }
    
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
            const action = mixer.clipAction(gltf.animations[0]);
            action.time = 3; 
            action.play();
            mixers.push(mixer);
        }
        model.userData = { health: 100, speed: 0.04 };
        monsters.push(model);
    });
}

function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    mixers.forEach(m => m.update(delta));

    let minMonsterDist = 15; // Для расчета мерцания

    if (document.pointerLockElement) {
        const oldP = camera.position.clone();
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        const moveDir = dir.clone().setY(0).normalize();
        const sideDir = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();
        
        let s = keys.ShiftLeft ? 0.15 : 0.07;
        if (keys.KeyW) camera.position.addScaledVector(moveDir, s);
        if (keys.KeyS) camera.position.addScaledVector(moveDir, -s);
        if (keys.KeyA) camera.position.addScaledVector(sideDir, s);
        if (keys.KeyD) camera.position.addScaledVector(sideDir, -s);

        if (physics && physics.checkCollision(camera.position.x, camera.position.z)) {
            camera.position.copy(oldP);
        }

        // Обновляем фонарик
        playerLight.position.copy(camera.position);
        const targetPos = new THREE.Vector3();
        camera.getWorldDirection(targetPos);
        playerLight.target.position.copy(camera.position).add(targetPos);
    }

    const now = Date.now();
    monsters.forEach(m => {
        const dist = m.position.distanceTo(camera.position);
        if (dist < minMonsterDist) minMonsterDist = dist;

        if (dist < 10) { 
            const dirM = new THREE.Vector3().subVectors(camera.position, m.position).normalize();
            if (physics && !physics.checkCollision(m.position.x + dirM.x*0.4, m.position.z + dirM.z*0.4)) {
                m.position.x += dirM.x * m.userData.speed;
                m.position.z += dirM.z * m.userData.speed;
            }
            m.lookAt(camera.position.x, 0, camera.position.z);

            if (dist < 1.4 && now - lastDamageTime > 1000) {
                playerHP -= 20;
                document.getElementById('hp-bar-fill').style.width = playerHP + "%";
                lastDamageTime = now;
                if (playerHP <= 0) location.reload();
            }
        }
    });

    // ПРАВКА №58: Логика мерцания фонарика
    if (minMonsterDist < 5) {
        // Чем ближе монстр, тем выше шанс мерцания
        if (Math.random() > (minMonsterDist / 5)) {
            playerLight.intensity = Math.random() * 0.5;
        } else {
            playerLight.intensity = 4;
        }
    } else {
        playerLight.intensity = 4;
    }

    renderer.render(scene, camera);
}

// Функции стрельбы и перезарядки (исправленные ранее)
function shoot() {
    if (isShooting || isReloading || pistolMag <= 0) return;
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(monsters, true);
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.health) obj = obj.parent;
        if (obj && obj.userData.health) {
            obj.userData.health -= 34;
            if (obj.userData.health <= 0) {
                scene.remove(obj);
                monsters = monsters.filter(m => m !== obj);
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

function reloadPistol() {
    if (isReloading || pistolMag === 10 || pistolTotal <= 0) return;
    isReloading = true;
    document.getElementById('weapon').classList.add('reloading');
    setTimeout(() => {
        let toReload = Math.min(10 - pistolMag, pistolTotal);
        pistolMag += toReload; pistolTotal -= toReload;
        document.getElementById('mag').innerText = pistolMag;
        document.getElementById('total-ammo').innerText = pistolTotal;
        document.getElementById('weapon').classList.remove('reloading');
        isReloading = false;
    }, 1200); 
}

function startGame() {
    document.getElementById('start-screen').style.display = 'none';
    document.body.requestPointerLock();
    bgMusicHTML.play();
}

function setupBackgroundMusic() {
    bgMusicHTML = new Audio(path + 'FON1.ogg');
    bgMusicHTML.loop = true;
    bgMusicHTML.volume = 0.15; 
}
