// Модуль физики и коллизий
export class Physics {
    constructor(mapSize) {
        this.mapSize = mapSize;
    }

    // Проверяем, не выходит ли игрок за границы арены
    canMove(x, z) {
        // Мы знаем, что стены стоят по периметру (0 и mapSize-1)
        const margin = 0.8; // Дистанция до стены, чтобы не входить в неё вплотную
        if (x < margin || x > this.mapSize - 1 - margin) return false;
        if (z < margin || z > this.mapSize - 1 - margin) return false;
        return true;
    }
}
