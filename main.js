import * as THREE from 'three';
import { Physics } from './engine/physics.js';

let scene, camera, renderer, physics, playerLight;
let monsters = [], items = [], levelData;
let health = 100, ammo = 50;
const keys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false, ShiftLeft: false };

let currentWeapon = 'shotgun'; 
let isShooting = false;
let bobbingCounter = 0;

fetch('./levels/level1.json')
    .then(r => r.json())
    .then(data => { levelData = data; init(); })
    .catch(err => alert("Ошибка: " + err.message));

function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x020000);
    scene.fog = new THREE.Fog(0x020000, 1, 30);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.05, 1000);
    camera.position.set(2, 1.6, 2); 

    renderer = new THREE.WebGLRenderer({ antialias: false });
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    physics = new Physics(levelData);
    const loader = new THREE.TextureLoader();

    // Свет
    scene.add(new THREE.AmbientLight(0x440000, 0.5)); 
    playerLight = new THREE.PointLight(0xffffff, 1.5, 15);
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
            } else if (cell === 2) {
                createMonster(x, z, loader);
            } else if (cell === 3) {
                createItem(x, z, loader);
            }
        });
    });

    // Пол и потолок
    const planeGeo = new THREE.PlaneGeometry(2000, 2000);
    const floor = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ color: 0x111111 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    const ceil = new THREE.Mesh(planeGeo, new THREE.MeshStandardMaterial({ color: 0x050000 }));
    ceil.rotation.x = Math.PI / 2; ceil.position.y = 4;
    scene.add(ceil);

    // Управление
    window.addEventListener('keydown', e => { 
        if(e.code in keys) keys[e.code] = true;
        if(e.key === '1') switchWeapon('shotgun');
        if(e.key === '2') switchWeapon('pistol');
    });
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

function switchWeapon(type) {
    if (isShooting) return;
    currentWeapon = type;
    const weaponImg = document.getElementById('weapon');
    if (type === 'shotgun') {
        weaponImg.style.backgroundImage = "url('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/shotgun.png')";
        weaponImg.style.width = "400px";
    } else {
        weaponImg.style.backgroundImage = "url('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/pistol.png')";
        weaponImg.style.width = "250px";
    }
}

function shoot() {
    if (ammo <= 0 || isShooting) return;
    isShooting = true;
    ammo--;
    document.getElementById('am').innerText = ammo;
    
    playerLight.intensity = 10;
    const weaponImg = document.getElementById('weapon');
    weaponImg.style.transform = "translateY(50px)"; // Отдача

    const ray = new THREE.Raycaster();
    ray.setFromCamera({ x: 0, y: 0 }, camera);
    const hits = ray.intersectObjects(monsters.filter(m => !m.isDead).map(m => m.sprite));
    
    if (hits.length > 0) {
        const target = monsters.find(m => m.sprite === hits[0].object);
        target.health -= (currentWeapon === 'shotgun') ? 25 : 12;
        if (target.health <= 0) {
            target.isDead = true;
            target.sprite.scale.y = 0.2;
            target.sprite.position.y = 0.1;
            target.sprite.material.color.set(0x440000);
        }
    }

    setTimeout(() => {
        playerLight.intensity = 1.5;
        weaponImg.style.transform = "translateY(0)";
        isShooting = false;
    }, currentWeapon === 'shotgun' ? 600 : 200);
}

function createMonster(x, z, loader) {
    const tex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/imp_idle.png');
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 1.2, z); sprite.scale.set(1.8, 1.8, 1);
    monsters.push({ sprite, health: 50, isDead: false });
    scene.add(sprite);
}

function createItem(x, z, loader) {
    const tex = loader.load('https://raw.githubusercontent.com/pajadam/pajadam.github.io/master/doom-assets/medkit.png');
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true });
    const sprite = new THREE.Sprite(mat);
    sprite.position.set(x, 0.5, z); sprite.scale.set(0.7, 0.7, 1);
    items.push({ sprite });
    scene.add(sprite);
}

function animate() {
    requestAnimationFrame(animate);

    let speed = keys.ShiftLeft ? 0.14 : 0.06; 
    const dir = new THREE.Vector3();
    camera.getWorldDirection(dir); dir.y = 0; dir.normalize();
    const side = new THREE.Vector3().crossVectors(camera.up, dir).normalize();
    const oldP = camera.position.clone();

    let moving = false;
    if (keys.KeyW) { camera.position.addScaledVector(dir, speed); moving = true; }
    if (keys.KeyS) { camera.position.addScaledVector(dir, -speed); moving = true; }
    if (keys.KeyA) { camera.position.addScaledVector(side, speed); moving = true; }
    if (keys.KeyD) { camera.position.addScaledVector(side, -speed); moving = true; }

    if (physics.checkCollision(camera.position.x, camera.position.z)) camera.position.copy(oldP);

    // Покачивание оружия
    const weaponImg = document.getElementById('weapon');
    if (moving && !isShooting) {
        bobbingCounter += speed * 2.5;
        const bX = Math.cos(bobbingCounter) * 20;
        const bY = Math.abs(Math.sin(bobbingCounter)) * 15;
        weaponImg.style.marginLeft = bX + "px";
        weaponImg.style.marginBottom = bY + "px";
    }

    monsters.forEach(m => {
        if(!m.isDead) {
            m.sprite.lookAt(camera.position);
            const dist = m.sprite.position.distanceTo(camera.position);
            if(dist < 1.2 && Math.random() < 0.05) {
                 health -= 1; document.getElementById('hp').innerText = health;
                 if(health <= 0) location.reload();
            }
        }
    });

    playerLight.position.copy(camera.position);
    renderer.render(scene, camera);
}
