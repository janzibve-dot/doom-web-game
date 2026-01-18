import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let levelData;
let health = 100, ammo = 100;
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false };

// Координаты прицела на экране (в пикселях)
let crosshairX = window.innerWidth / 2;
let crosshairY = window.innerHeight / 2;

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

    window.addEventListener('keydown', e => { if(e.code in keys) keys[e.code] = true; });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    
    // Блокировка курсора для захвата движений мыши
    window.addEventListener('mousedown', () => {
        if (!document.pointerLockElement) {
            document.body.requestPointerLock();
        } else {
            shoot();
        }
    });

    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) {
            // Двигаем прицел
            crosshairX += e.movementX;
            crosshairY += e.movementY;

            // Ограничиваем прицел краями экрана
            crosshairX = Math.max(0, Math.min(window.innerWidth, crosshairX));
            crosshairY = Math.max(0, Math.min(window.innerHeight, crosshairY));

            // Поворачиваем камеру, если прицел у края
            const edgeThreshold = 100; // зона активации поворота у края
            if (crosshairX > window.innerWidth - edgeThreshold) camera.rotation.y -= 0.02;
            if (crosshairX < edgeThreshold) camera.rotation.y += 0.02;

            updateCrosshairPosition();
        }
    });

    animate();
}

function updateCrosshairPosition() {
    const ch = document.getElementById('crosshair');
    const wp = document.getElementById('weapon');

    // Обновляем позицию прицела на экране
    ch.style.left = crosshairX + 'px';
    ch.style.top = crosshairY + 'px';

    // Наклоняем пистолет в сторону прицела (параллакс)
    const offsetX = (crosshairX - window.innerWidth / 2) / 10;
    const offsetY = (window.innerHeight / 2 - crosshairY) / 15;
    if (!isShooting) {
        wp.style.transform = `translateX(${offsetX}px) translateY(${offsetY}px)`;
    }
}

function shoot() {
    if (isShooting || ammo <= 0) return;
    isShooting = true;
    ammo--;
    document.getElementById('am').innerText = ammo;

    if (shotSound.buffer) {
        if (shotSound.isPlaying) shotSound.stop();
        shotSound.play();
    }

    const weapon = document.getElementById('weapon');
    playerLight.intensity = 15;

    // Анимация выстрела с сохранением текущего смещения прицела
    const currentTransform = weapon.style.transform;
    weapon.style.transform = `${currentTransform} scale(1.1) rotate(-5deg)`;

    setTimeout(() => {
        playerLight.intensity = 1.2;
        updateCrosshairPosition(); // Возвращаем к позиции прицела
        isShooting = false;
    }, 80);
}

function animate() {
    requestAnimationFrame(animate);

    let speed = keys.ShiftLeft ? 0.12 : 0.05;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    const oldP = camera.position.clone();

    if (keys.KeyW) camera.position.addScaledVector(dir, speed);
    if (keys.KeyS) camera.position.addScaledVector(dir, -speed);
    if (keys.KeyA) camera.position.addScaledVector(side, speed);
    if (keys.KeyD) camera.position.addScaledVector(side, -speed);

    if (physics.checkCollision(camera.position.x, camera.position.z)) camera.position.copy(oldP);

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
