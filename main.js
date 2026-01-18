import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let monsters = [], levelData;
let health = 100, ammo = 100;
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false };
let isShooting = false;

// Звуковые переменные
let listener, shotSound;
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

    // Инициализация аудио-слушателя
    listener = new THREE.AudioListener();
    camera.add(listener);

    // Инициализация звука выстрела
    shotSound = new THREE.Audio(listener);

    // Загрузка звука
    audioLoader.load('audio/sfx/shot.mp3', (buffer) => {
        shotSound.setBuffer(buffer);
        shotSound.setVolume(0.4); // Громкость 40%
    });

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    physics = new Physics(levelData);
    const loader = new THREE.TextureLoader();

    scene.add(new THREE.AmbientLight(0x220000, 0.5));
    playerLight = new THREE.PointLight(0xffffff, 1.2, 15);
    scene.add(playerLight);

    // Стены
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

    // События ввода
    window.addEventListener('keydown', e => { if(e.code in keys) keys[e.code] = true; });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    
    // Мгновенная реакция на нажатие (mousedown - это самый быстрый способ поймать клик)
    window.addEventListener('mousedown', (e) => {
        if (document.pointerLockElement) {
            if (e.button === 0) shoot();
        } else {
            document.body.requestPointerLock();
        }
    });

    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) camera.rotation.y -= e.movementX * 0.002;
    });

    animate();
}

function shoot() {
    // Если анимация еще идет или кончились патроны — выходим
    if (isShooting || ammo <= 0) return;
    
    isShooting = true;
    ammo--;
    document.getElementById('am').innerText = ammo;

    // 1. ЗВУК: Мгновенный запуск
    if (shotSound.buffer) {
        if (shotSound.isPlaying) shotSound.stop(); // Остановка предыдущего, если стреляем быстро
        shotSound.play();
    }

    // 2. АНИМАЦИЯ: Мгновенная отдача
    const weapon = document.getElementById('weapon');
    playerLight.intensity = 15; // Вспышка ярче
    
    // Сдвиг вверх и легкий поворот назад (эффект подброса ствола)
    weapon.style.transition = "none"; // Убираем плавность для мгновенного рывка
    weapon.style.transform = "translateY(70px) scale(1.1) rotate(-5deg)"; 

    // 3. ВОЗВРАТ: Плавное возвращение в исходную позицию
    setTimeout(() => {
        playerLight.intensity = 1.2;
        weapon.style.transition = "transform 0.1s ease-out"; // Возвращаем плавно
        weapon.style.transform = "translateY(0) scale(1) rotate(0deg)";
        
        // Разрешаем следующий выстрел чуть раньше, чем закончится анимация возврата
        setTimeout(() => {
            isShooting = false;
        }, 50); 
    }, 60); // 60мс — время "вспышки"
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

    if (physics.checkCollision(camera.position.x, camera.position.z)) {
        camera.position.copy(oldP);
    }

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
