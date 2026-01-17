export class Physics {
    constructor(mapData) {
        this.map = mapData.map;
    }

    canMove(x, z) {
        const gridX = Math.round(x);
        const gridZ = Math.round(z);

        // Проверка границ массива
        if (this.map[gridZ] === undefined || this.map[gridZ][gridX] === undefined) {
            return false;
        }

        // Нельзя ходить сквозь 1 (стены) и 2 (колонны)
        const cell = this.map[gridZ][gridX];
        if (cell === 1 || cell === 2) {
            return false;
        }

        return true;
    }
}
