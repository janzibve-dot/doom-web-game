export class Physics {
    constructor(mapData) {
        this.map = mapData.map;
    }

    canMove(x, z) {
        // Переводим мировые координаты в индексы массива (сетку)
        const gridX = Math.round(x);
        const gridZ = Math.round(z);

        // Проверяем, не вышли ли за пределы массива
        if (this.map[gridZ] === undefined || this.map[gridZ][gridX] === undefined) {
            return false;
        }

        // Если в этой клетке 1 — это стена
        if (this.map[gridZ][gridX] === 1) {
            return false;
        }

        return true;
    }
}
