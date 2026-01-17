import * as THREE from 'three';
import { Physics } from './engine/physics.js';

// --- Загрузка данных уровня ---
fetch('./levels/level1.json')
    .then(response => response.json())
    .then(levelData => {
        initGame(levelData);
    });

function initGame(levelData) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x880000); 

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(levelData.spawnPoint.x, 1.6, levelData.spawnPoint.z);

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const physics = new Physics(levelData);
    const loader = new THREE.TextureLoader();
    const wallTexture = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    
    // --- Создание стен ---
    const wallGeo = new THREE.BoxGeometry(1, 4, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture });

    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            }
        });
    });

    // --- Освещение ---
    scene.add(new THREE.AmbientLight(0xffaaaa, 0.8));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(5, 10, 5);
    scene.add(sunLight);

    // --- Первый монстр (спрайт) ---
    // Используем картинку импа из Doom
    const monsterTexture = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/imp_idle.png');
    const monsterMaterial = new THREE.SpriteMaterial({ map: monsterTexture, transparent: true });
    const monster = new THREE.Sprite(monsterMaterial);
    monster.position.set(levelData.spawnPoint.x + 3, 1.5, levelData.spawnPoint.z + 3); // Ставим рядом с игроком
    monster.scale.set(2, 2, 1); // Размер монстра
    scene.add(monster);

    // --- Вспышка выстрела ---
    const flashLight = new THREE.PointLight(0xffff00, 0, 10); // Желтый свет, интенсивность 0 (выключен)
    scene.add(flashLight);
    
    // --- Управление ---
    const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
    let isShooting = false; // Флаг для анимации стрельбы
    let shotTime = 0; // Для отсчета времени вспышки
    
    window.addEventListener('keydown', (e) => { if (e.code in keys) keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { if (e.code in keys) keys[e.code] = false; });
    
    window.addEventListener('click', () => {
        document.body.requestPointerLock();
        if (document.pointerLockElement === document.body) {
            // Анимация выстрела
            isShooting = true;
            shotTime = 0.1; // Вспышка будет длиться 0.1 секунды
        }
    });
    
    window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body) camera.rotation.y -= e.movementX * 0.003;
    });

    // --- Анимация ---
    let stepCount = 0;
    const weaponImg = document.getElementById('weapon');

    function animate(currentTime) {
        requestAnimationFrame(animate);

        const speed = 0.1;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0; dir.normalize();
        const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();

        const oldPos = camera.position.clone();
        let moving = false;

        if (keys.KeyW) { camera.position.addScaledVector(dir, speed); moving = true; }
        if (keys.KeyS) { camera.position.addScaledVector(dir, -speed); moving = true; }
        if (keys.KeyA) { camera.position.addScaledVector(side, speed); moving = true; }
        if (keys.KeyD) { camera.position.addScaledVector(side, -speed); moving = true; }

        if (!physics.canMove(camera.position.x, camera.position.z)) {
            camera.position.copy(oldPos);
        }

        // --- Обновление монстра ---
        monster.lookAt(camera.position); // Монстр всегда смотрит на игрока

        // --- Анимация оружия и вспышки ---
        if (isShooting) {
            weaponImg.style.bottom = '0px'; // Поднять оружие при выстреле
            flashLight.intensity = 200; // Включить яркую вспышку
            isShooting = false; // Сбросить флаг, чтобы не стрелял постоянно
        } else if (shotTime > 0) {
            shotTime -= 0.01; // Уменьшаем время вспышки
            if (shotTime <= 0) {
                flashLight.intensity = 0; // Выключаем вспышку
            }
        } else {
            // Обычное покачивание при ходьбе
            if (moving) {
                stepCount += 0.3;
                weaponImg.style.bottom = (Math.sin(stepCount) * 15) - 10 + 'px';
            } else {
                weaponImg.style.bottom = '0px';
            }
        }
        flashLight.position.copy(camera.position); // Вспышка следует за камерой

        renderer.render(scene, camera);
    }
    animate();
}
