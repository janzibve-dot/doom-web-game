// В начале файла убедись, что переменная объявлена:
let isGameStarted = false; 

// В функции init() измени регистрацию событий:
function init() {
    // ... (весь твой код создания сцены)

    const playBtn = document.getElementById('play-btn');
    if (playBtn) {
        playBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            startGame();
        });
    } else {
        console.error("Кнопка play-btn не найдена в HTML!");
    }

    // Слушатели должны быть созданы ОДИН РАЗ при загрузке
    window.addEventListener('keydown', e => { 
        if(isGameStarted && !isDead && e.code in keys) keys[e.code] = true; 
    });
    window.addEventListener('keyup', e => { 
        if(isGameStarted && !isDead && e.code in keys) keys[e.code] = false; 
    });
    
    animate();
}

function startGame() {
    console.log("Игра запускается..."); // Для отладки в консоли (F12)
    
    // 1. Пытаемся захватить мышь
    document.body.requestPointerLock();

    // 2. Активируем звуки
    if (listener && listener.context.state === 'suspended') {
        listener.context.resume();
    }
    
    if (bgMusicHTML) {
        bgMusicHTML.play().catch(e => console.error("Ошибка музыки:", e));
    }

    // 3. Устанавливаем флаги
    isGameStarted = true;
    isDead = false;
    gameStartTime = Date.now();

    // 4. Скрываем экран
    const startScreen = document.getElementById('start-screen');
    if (startScreen) startScreen.style.display = 'none';

    // 5. Запускаем интервал спавна монстров
    const spawnTimer = setInterval(() => { 
        if (isDead) {
            clearInterval(spawnTimer);
            return;
        }
        if (monsters.length < 15) spawnRandomMonster(); 
    }, 5000);
}
