import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let levelData;

// Настройки патронов
let pistolMag = 10;
let pistolTotal = 120;
let shotgunAmmo = 40;
let isReloading = false;

const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false, KeyR: false };
let pitch = 0;
let isShooting = false;
let shotSound;
const audioLoader = new THREE.AudioLoader();

fetch('./levels/level1.json')
    .then(r => r.json())
    .then(data => { levelData = data; init(); });

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020000);
    scene.fog = new THREE.Fog(0x020000, 1, 30);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    camera.position.set(2, 1.6, 2);
    camera.rotation.order = 'YXZ'; 

    const listener = new THREE.AudioListener();
    camera.add(listener);
    shotSound = new THREE.Audio(listener);
    
    audioLoader.load('audio/sfx/shot.mp3', (buffer) => {
        shotSound.setBuffer(buffer);
        shotSound.setVolume(0.4);
    });

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    physics = new Physics(levelData);
    const loader = new THREE.TextureLoader();

    scene.add(new THREE.AmbientLight(0x220000, 0.5));
    playerLight = new THREE.PointLight(0xffffff, 1.2, 15);
    scene.add(playerLight);

    const wallTex = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    const wallGeo = new THREE.BoxGeometry(1.05, 4, 1.05);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex });

    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            }
        });
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    window.addEventListener('keydown', e => { 
        if(e.code in keys) keys[e.code] = true; 
        if(e.code === 'KeyR') reloadPistol();
    });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    
    window.addEventListener('mousedown', (e) => {
        if (document.pointerLockElement) {
            if (e.button === 0) shoot();
        } else {
            document.body.requestPointerLock();
        }
    });

    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) {
            camera.rotation.y -= e.movementX * 0.002;
            pitch -= e.movementY * 0.002;
            pitch = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch));
            camera.rotation.x = pitch;
            updateWeaponPosition();
        }
    });

    animate();
}

function updateWeaponPosition(offsetY = 0) {
    const weapon = document.getElementById('weapon');
    if (!isReloading) {
        weapon.style.transform = `translateY(${pitch * 20 + offsetY}px)`;
    }
}

function reloadPistol() {
    if (isReloading || pistolMag === 10 || pistolTotal <= 0) return;
    
    isReloading = true;
    const weapon = document.getElementById('weapon');
    weapon.classList.add('reloading');

    // Общее время перезарядки 2 секунды (2000мс)
    setTimeout(() => {
        let needed = 10 - pistolMag;
        let toReload = Math.min(needed, pistolTotal);
        
        pistolMag += toReload;
        pistolTotal -= toReload;

        document.getElementById('mag').innerText = pistolMag;
        document.getElementById('total-ammo').innerText = pistolTotal;

        weapon.classList.remove('reloading');
        
        setTimeout(() => {
            isReloading = false;
            updateWeaponPosition();
        }, 600); // Время на подъем оружия

    }, 1400); // Время нахождения внизу
}

function shoot() {
    if (isShooting || isReloading) return;

    if (pistolMag <= 0) {
        reloadPistol();
        return;
    }

    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;

    if (shotSound.buffer) {
        if (shotSound.isPlaying) shotSound.stop();
        shotSound.play();
    }

    const weapon = document.getElementById('weapon');
    playerLight.intensity = 15;
    
    weapon.style.transition = "none";
    weapon.style.transform = `translateY(${pitch * 20 + 70}px) scale(1.1) rotate(-5deg)`;

    setTimeout(() => {
        playerLight.intensity = 1.2;
        weapon.style.transition = "transform 0.1s ease-out";
        updateWeaponPosition();
        isShooting = false;
        
        if (pistolMag === 0) reloadPistol();
    }, 80);
}

function animate() {
    requestAnimationFrame(animate);

    let speed = keys.ShiftLeft ? 0.12 : 0.05;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); 
    const moveDir = dir.clone();
    moveDir.y = 0; moveDir.normalize();
    
    const side = new THREE.Vector3().crossVectors(camera.up, moveDir).normalize();
    const oldP = camera.position.clone();

    if (keys.KeyW) camera.position.addScaledVector(moveDir, speed);
    if (keys.KeyS) camera.position.addScaledVector(moveDir, -speed);
    if (keys.KeyA) camera.position.addScaledVector(side, speed);
    if (keys.KeyD) camera.position.addScaledVector(side, -speed);

    if (physics.checkCollision(camera.position.x, camera.position.z)) {
        camera.position.copy(oldP);
    }

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
