import * as THREE from 'three';
import { Physics } from './engine/physics.js';

// ФУНКЦИЯ ДЛЯ ВЫВОДА ОШИБКИ НА ЭКРАН
function criticalError(msg) {
    const errorBox = document.createElement('div');
    errorBox.style.cssText = "position:fixed; top:10px; left:10px; background:white; color:red; padding:20px; border:5px solid red; z-index:9999; font-family:serif; font-weight:bold;";
    errorBox.innerHTML = "<h1>ОШИБКА ИГРЫ:</h1><p>" + msg + "</p><p>Проверь консоль (F12) для деталей.</p>";
    document.body.appendChild(errorBox);
}

console.log("Запуск загрузки карты...");

fetch('./levels/level1.json')
    .then(r => {
        if (!r.ok) throw new Error("Файл level1.json не найден в папке levels! Проверь имя файла.");
        return r.json();
    })
    .then(data => {
        console.log("Карта загружена успешно. Начинаю запуск движка...");
        try {
            init(data);
        } catch (e) {
            criticalError("Сбой в движке: " + e.message);
        }
    })
    .catch(err => {
        criticalError("Сбой при чтении карты: " + err.message + ". Скорее всего, в файле level1.json пропущена запятая или скобка.");
    });

function init(levelData) {
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0000);
    
    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(1.5, 1.6, 1.5); 

    const renderer = new THREE.WebGLRenderer();
    renderer.setSize(window.innerWidth, window.innerHeight);
    document.body.appendChild(renderer.domElement);

    const physics = new Physics(levelData);
    const loader = new THREE.TextureLoader();

    scene.add(new THREE.AmbientLight(0xff0000, 0.1));
    const pLight = new THREE.PointLight(0xffffff, 80, 15);
    scene.add(pLight);

    const wallGeo = new THREE.BoxGeometry(1, 4, 1);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x444444 });

    // Рисуем карту
    if (!levelData.map) throw new Error("В файле JSON нет раздела 'map'!");

    levelData.map.forEach((row, z) => {
        row.forEach((cell, x) => {
            if (cell === 1) {
                const wall = new THREE.Mesh(wallGeo, wallMat);
                wall.position.set(x, 2, z);
                scene.add(wall);
            }
        });
    });

    const floor = new THREE.Mesh(new THREE.PlaneGeometry(100, 100), new THREE.MeshStandardMaterial({ color: 0x111111 }));
    floor.rotation.x = -Math.PI / 2;
    scene.add(floor);

    window.addEventListener('click', () => {
        document.body.requestPointerLock();
    });

    window.addEventListener('mousemove', e => {
        if (document.pointerLockElement) camera.rotation.y -= e.movementX * 0.0025;
    });

    function animate() {
        requestAnimationFrame(animate);
        pLight.position.copy(camera.position);
        renderer.render(scene, camera);
    }
    animate();
    console.log("Движок работает!");
}
