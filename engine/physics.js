export class Physics {
    constructor(mapData) {
        this.map = mapData.map;
    }
    // Проверка столкновений со стенами
    checkCollision(x, z) {
        const gridX = Math.round(x);
        const gridZ = Math.round(z);
        if (!this.map[gridZ] || this.map[gridZ][gridX] === undefined) return true;
        return this.map[gridZ][gridX] === 1;
    }
}
