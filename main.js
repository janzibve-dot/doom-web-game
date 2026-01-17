import * as THREE from 'three';
import { Physics } from './engine/physics.js';

fetch('./levels/level1.json')
    .then(response => response.json())
    .then(levelData => {
        initGame(levelData);
    });

function initGame(levelData) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x220000); 
    scene.fog = new THREE.Fog(0x220000, 1, 15);

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(levelData.spawnPoint.x, 1.6, levelData.spawnPoint.z);

    const renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const physics = new Physics(levelData);
    const loader = new THREE.TextureLoader();
    
    // Текстуры
    const wallTex = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    const floorTex = loader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(20, 20);

    // --- Свет ---
    const ambientLight = new THREE.AmbientLight(0xff0000, 0.2); 
    scene.add(ambientLight);
    const playerLight = new THREE.PointLight(0xffffff, 100, 10);
    scene.add(playerLight);

    // --- Окружение (Стены, Колонны, Потолок) ---
    const wallGeo = new THREE.BoxGeometry(1, 4, 1);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex });
    const colMat = new THREE.MeshStandardMaterial({ color: 0x444444 });

    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            } else if (cell === 2) {
                const col = new THREE.Mesh(new THREE.BoxGeometry(0.5, 4, 0.5), colMat);
                col.position.set(x, 2, z);
                scene.add(col);
            }
        });
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(10, 0, 10);
    scene.add(floor);

    const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    ceiling.rotation.x = Math.PI / 2;
    ceiling.position.set(10, 4, 10);
    scene.add(ceiling);

    // --- Монстр ---
    const monsterTex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/imp_idle.png');
    const monsterMat = new THREE.SpriteMaterial({ map: monsterTex, transparent: true });
    const monster = new THREE.Sprite(monsterMat);
    monster.position.set(7, 1.2, 7);
    monster.scale.set(2, 2, 1);
    scene.add(monster);

    // --- Управление ---
    const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
    let isShooting = false;
    let shotTime = 0;
    
    window.addEventListener('keydown', (e) => { if (e.code in keys) keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { if (e.code in keys) keys[e.code] = false; });
    window.addEventListener('click', () => {
        document.body.requestPointerLock();
        if (document.pointerLockElement === document.body) { isShooting = true; shotTime = 0.1; }
    });
    window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body) camera.rotation.y -= e.movementX * 0.003;
    });

    const weaponImg = document.getElementById('weapon');
    let stepCount = 0;

    function animate() {
        requestAnimationFrame(animate);
        const speed = 0.12;
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

        if (!physics.canMove(camera.position.x, camera.position.z)) camera.position.copy(oldPos);

        playerLight.position.copy(camera.position);
        monster.lookAt(camera.position);

        // Оружие и стрельба
        if (isShooting) {
            weaponImg.style.bottom = '10px';
            playerLight.intensity = 500;
            isShooting = false;
        } else if (shotTime > 0) {
            shotTime -= 0.02;
            if (shotTime <= 0) playerLight.intensity = 100;
        } else {
            if (moving) {
                stepCount += 0.25;
                weaponImg.style.bottom = (Math.sin(stepCount) * 10) - 10 + 'px';
            } else {
                weaponImg.style.bottom = '-10px';
            }
        }

        renderer.render(scene, camera);
    }
    animate();
}
