import * as THREE from 'three';
import { Physics } from './engine/physics.js';

// Загружаем данные уровня
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
    
    // Создаем стены на основе данных из JSON
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

    // Свет
    scene.add(new THREE.AmbientLight(0xffaaaa, 0.8));
    const sunLight = new THREE.DirectionalLight(0xffffff, 1);
    sunLight.position.set(5, 10, 5);
    scene.add(sunLight);

    // Управление
    const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
    window.addEventListener('keydown', (e) => { if (e.code in keys) keys[e.code] = true; });
    window.addEventListener('keyup', (e) => { if (e.code in keys) keys[e.code] = false; });
    window.addEventListener('click', () => document.body.requestPointerLock());
    window.addEventListener('mousemove', (e) => {
        if (document.pointerLockElement === document.body) camera.rotation.y -= e.movementX * 0.003;
    });

    function animate() {
        requestAnimationFrame(animate);
        const speed = 0.1;
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        dir.y = 0; dir.normalize();
        const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();

        const oldPos = camera.position.clone();

        if (keys.KeyW) camera.position.addScaledVector(dir, speed);
        if (keys.KeyS) camera.position.addScaledVector(dir, -speed);
        if (keys.KeyA) camera.position.addScaledVector(side, speed);
        if (keys.KeyD) camera.position.addScaledVector(side, -speed);

        if (!physics.canMove(camera.position.x, camera.position.z)) {
            camera.position.copy(oldPos);
        }
        renderer.render(scene, camera);
    }
    animate();
}
