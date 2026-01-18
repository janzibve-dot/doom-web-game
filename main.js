function shoot() {
    if (isShooting || isReloading || pistolMag <= 0 || isDead) return;
    
    isShooting = true;
    pistolMag--;
    document.getElementById('mag').innerText = pistolMag;
    
    // Звук
    if (shotSound && shotSound.buffer) {
        if (shotSound.isPlaying) shotSound.stop();
        shotSound.play();
    }

    // АНИМАЦИЯ ВЫСТРЕЛА (Отдача)
    const weapon = document.getElementById('weapon');
    weapon.style.transition = 'none'; // Мгновенный рывок вверх
    weapon.style.transform = `translateY(${pitch * 20 - 50}px) scale(1.1) rotate(-2deg)`;

    // Возврат оружия на место через 100мс
    setTimeout(() => {
        weapon.style.transition = 'transform 0.2s ease-out';
        weapon.style.transform = `translateY(${pitch * 20}px)`;
        isShooting = false;
        if (pistolMag === 0) reloadPistol();
    }, 100);

    // Логика попадания
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(0, 0), camera);
    const intersects = raycaster.intersectObjects(monsters, true);
    
    if (intersects.length > 0) {
        let obj = intersects[0].object;
        while (obj && !obj.userData.health) obj = obj.parent;
        if (obj && obj.userData.health) {
            obj.userData.health -= 35;
            if (obj.userData.health <= 0) {
                scene.remove(obj);
                monsters = monsters.filter(m => m !== obj);
                kills++;
                document.getElementById('kill-counter').innerText = "УБИТО: " + kills;
                spawnRandomMonster();
            }
        }
    }
}

function reloadPistol() {
    if (isReloading || pistolMag === 10 || pistolTotal <= 0) return;
    
    isReloading = true;
    if (reloadSound && reloadSound.buffer) reloadSound.play();
    
    const weapon = document.getElementById('weapon');
    weapon.classList.add('reloading'); // Оружие уходит вниз (см. CSS)

    setTimeout(() => {
        let toReload = Math.min(10 - pistolMag, pistolTotal);
        pistolMag += toReload;
        pistolTotal -= toReload;
        
        document.getElementById('mag').innerText = pistolMag;
        document.getElementById('total-ammo').innerText = pistolTotal;
        
        weapon.classList.remove('reloading'); // Оружие возвращается
        
        setTimeout(() => { isReloading = false; }, 600); // Задержка до конца анимации подъема
    }, 1200); 
}
