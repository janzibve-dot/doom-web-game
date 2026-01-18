import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let monsters = [], items = [], levelData;
let health = 100, ammo = 50;
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };

fetch('./levels/level1.json')
    .then(r => r.json())
    .then(data => {
        levelData = data;
        init();
    })
    .catch(err => alert("Ошибка карты: " + err.message));

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020000);
    scene.fog = new THREE.Fog(0x020000, 1, 18);

    // ИСПРАВЛЕНИЕ: Near plane = 0.05. Теперь стены не исчезают перед носом!
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    camera.position.set(1.5, 1.6, 1.5); 

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    physics = new Physics(levelData);
    const loader = new THREE.TextureLoader();

    // Загрузка текстур
    const wallTex = loader.load('https://threejs.org/examples/textures/brick_diffuse.jpg');
    wallTex.magFilter = THREE.NearestFilter; // Делаем текстуру "пиксельной" как в Doom
    
    const floorTex = loader.load('https://threejs.org/examples/textures/terrain/grasslight-big.jpg');
    floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
    floorTex.repeat.set(100, 100);

    // Мягкий свет
    scene.add(new THREE.AmbientLight(0x220000, 0.5)); 
    playerLight = new THREE.PointLight(0xffffff, 1.2, 12);
    scene.add(playerLight);

    // СОЗДАНИЕ СТЕН (без дыр)
    // Размер 1.05 чтобы блоки плотно смыкались
    const wallGeo = new THREE.BoxGeometry(1.05, 4, 1.05);
    const wallMat = new THREE.MeshStandardMaterial({ map: wallTex });

    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            } else if (cell === 2) {
                createMonster(x, z, loader);
            } else if (cell === 3) {
                createItem(x, z, loader);
            }
        });
    });

    // ЕДИНЫЙ ПОЛ И ПОТОЛОК (накрывают всё)
    const planeGeo = new THREE.PlaneGeometry(200, 200);
    
    const floor = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ map: floorTex }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(20, 0, 20);
    scene.add(floor);

    const ceil = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ color: 0x111111 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(20, 4, 20);
    scene.add(ceil);

    // Управление
    window.addEventListener('keydown', e => { if(e.code in keys) keys[e.code] = true; });
    window.addEventListener('keyup', e => { if(e.code in keys) keys[e.code] = false; });
    window.addEventListener('mousedown', () => {
        if (!document.pointerLockElement) document.body.requestPointerLock();
        else shoot();
    });
    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) camera.rotation.y -= e.movementX * 0.002;
    });

    animate();
}

function createMonster(x, z, loader) {
    const tex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/imp_idle.png');
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 1.2, z);
    sprite.scale.set(1.8, 1.8, 1);
    monsters.push({ sprite, health: 50 });
    scene.add(sprite);
}

function createItem(x, z, loader) {
    const tex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/medkit.png');
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 0.5, z);
    sprite.scale.set(0.7, 0.7, 1);
    items.push({ sprite, x, z });
    scene.add(sprite);
}

function shoot() {
    if (ammo <= 0) return;
    ammo--;
    document.getElementById('am').innerText = ammo;
    playerLight.intensity = 8;
    setTimeout(() => playerLight.intensity = 1.2, 50);

    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = ray.intersectObjects(monsters.map(m => m.sprite));
    if (hits.length > 0) {
        const target = monsters.find(m => m.sprite === hits[0].object);
        target.health -= 25;
        if (target.health <= 0) {
            scene.remove(target.sprite);
            monsters = monsters.filter(m => m !== target);
        }
    }
}

function animate() {
    requestAnimationFrame(animate);

    const speed = 0.12;
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    const oldP = camera.position.clone();

    if (keys.KeyW) camera.position.addScaledVector(dir, speed);
    if (keys.KeyS) camera.position.addScaledVector(dir, -speed);
    if (keys.KeyA) camera.position.addScaledVector(side, speed);
    if (keys.KeyD) camera.position.addScaledVector(side, -speed);

    // УЛУЧШЕННАЯ ПРОВЕРКА КОЛЛИЗИЙ
    // Проверяем точку чуть впереди игрока (0.3), чтобы камера не входила в стену
    const checkX = camera.position.x + (camera.position.x > oldP.x ? 0.3 : -0.3);
    const checkZ = camera.position.z + (camera.position.z > oldP.z ? 0.3 : -0.3);
    
    if (physics.checkCollision(camera.position.x, camera.position.z) || 
        physics.checkCollision(checkX, checkZ)) {
        camera.position.copy(oldP);
    }

    items = items.filter(it => {
        if (camera.position.distanceTo(it.sprite.position) < 1) {
            health = Math.min(100, health + 20);
            document.getElementById('hp').innerText = health;
            scene.remove(it.sprite);
            return false;
        }
        return true;
    });

    monsters.forEach(m => m.sprite.lookAt(camera.position));
    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
