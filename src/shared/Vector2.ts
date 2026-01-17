/**
 * Neon Arcana - 2D Вектор
 * Класс для математических операций с 2D векторами
 */

export class Vector2 {
  constructor(
    public x: number = 0,
    public y: number = 0
  ) {}

  /**
   * Создать копию вектора
   */
  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  /**
   * Установить значения вектора
   */
  set(x: number, y: number): this {
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Скопировать значения из другого вектора
   */
  copy(v: Vector2): this {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  /**
   * Сложение векторов
   */
  add(v: Vector2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  /**
   * Вычитание векторов
   */
  subtract(v: Vector2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  /**
   * Умножение на скаляр
   */
  multiply(scalar: number): this {
    this.x *= scalar;
    this.y *= scalar;
    return this;
  }

  /**
   * Деление на скаляр
   */
  divide(scalar: number): this {
    if (scalar !== 0) {
      this.x /= scalar;
      this.y /= scalar;
    }
    return this;
  }

  /**
   * Длина вектора
   */
  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  /**
   * Квадрат длины вектора (быстрее чем length())
   */
  lengthSquared(): number {
    return this.x * this.x + this.y * this.y;
  }

  /**
   * Нормализовать вектор (сделать единичным)
   */
  normalize(): this {
    const len = this.length();
    if (len > 0) {
      this.divide(len);
    }
    return this;
  }

  /**
   * Получить нормализованную копию
   */
  normalized(): Vector2 {
    return this.clone().normalize();
  }

  /**
   * Расстояние до другого вектора
   */
  distanceTo(v: Vector2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /**
   * Квадрат расстояния до другого вектора (быстрее)
   */
  distanceToSquared(v: Vector2): number {
    const dx = this.x - v.x;
    const dy = this.y - v.y;
    return dx * dx + dy * dy;
  }

  /**
   * Скалярное произведение
   */
  dot(v: Vector2): number {
    return this.x * v.x + this.y * v.y;
  }

  /**
   * Векторное произведение (возвращает z-компоненту)
   */
  cross(v: Vector2): number {
    return this.x * v.y - this.y * v.x;
  }

  /**
   * Угол вектора в радианах
   */
  angle(): number {
    return Math.atan2(this.y, this.x);
  }

  /**
   * Угол до другого вектора в радианах
   */
  angleTo(v: Vector2): number {
    return Math.atan2(v.y - this.y, v.x - this.x);
  }

  /**
   * Повернуть вектор на угол (в радианах)
   */
  rotate(angle: number): this {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this.x * cos - this.y * sin;
    const y = this.x * sin + this.y * cos;
    this.x = x;
    this.y = y;
    return this;
  }

  /**
   * Линейная интерполяция к другому вектору
   * @param v целевой вектор
   * @param t параметр интерполяции (0-1)
   */
  lerp(v: Vector2, t: number): this {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    return this;
  }

  /**
   * Проверка на равенство (с погрешностью)
   */
  equals(v: Vector2, epsilon: number = 0.0001): boolean {
    return Math.abs(this.x - v.x) < epsilon && Math.abs(this.y - v.y) < epsilon;
  }

  /**
   * Проверка на нулевой вектор
   */
  isZero(epsilon: number = 0.0001): boolean {
    return Math.abs(this.x) < epsilon && Math.abs(this.y) < epsilon;
  }

  /**
   * Ограничить длину вектора
   */
  clampLength(maxLength: number): this {
    const len = this.length();
    if (len > maxLength && len > 0) {
      this.multiply(maxLength / len);
    }
    return this;
  }

  /**
   * Отразить вектор относительно нормали
   */
  reflect(normal: Vector2): this {
    const dot2 = 2 * this.dot(normal);
    this.x -= dot2 * normal.x;
    this.y -= dot2 * normal.y;
    return this;
  }

  /**
   * Получить перпендикулярный вектор (повёрнутый на 90°)
   */
  perpendicular(): Vector2 {
    return new Vector2(-this.y, this.x);
  }

  /**
   * Преобразовать в строку
   */
  toString(): string {
    return `Vector2(${this.x.toFixed(2)}, ${this.y.toFixed(2)})`;
  }

  /**
   * Преобразовать в простой объект (для сериализации)
   */
  toObject(): { x: number; y: number } {
    return { x: this.x, y: this.y };
  }

  // ===========================================
  // СТАТИЧЕСКИЕ МЕТОДЫ
  // ===========================================

  /**
   * Создать вектор из объекта
   */
  static fromObject(obj: { x: number; y: number }): Vector2 {
    return new Vector2(obj.x, obj.y);
  }

  /**
   * Создать вектор из угла и длины
   */
  static fromAngle(angle: number, length: number = 1): Vector2 {
    return new Vector2(Math.cos(angle) * length, Math.sin(angle) * length);
  }

  /**
   * Сложить два вектора (не мутирует)
   */
  static add(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x + b.x, a.y + b.y);
  }

  /**
   * Вычесть два вектора (не мутирует)
   */
  static subtract(a: Vector2, b: Vector2): Vector2 {
    return new Vector2(a.x - b.x, a.y - b.y);
  }

  /**
   * Умножить вектор на скаляр (не мутирует)
   */
  static multiply(v: Vector2, scalar: number): Vector2 {
    return new Vector2(v.x * scalar, v.y * scalar);
  }

  /**
   * Линейная интерполяция между двумя векторами
   */
  static lerp(a: Vector2, b: Vector2, t: number): Vector2 {
    return new Vector2(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  }

  /**
   * Расстояние между двумя точками
   */
  static distance(a: Vector2, b: Vector2): number {
    return a.distanceTo(b);
  }

  /**
   * Нулевой вектор
   */
  static zero(): Vector2 {
    return new Vector2(0, 0);
  }

  /**
   * Единичный вектор вверх
   */
  static up(): Vector2 {
    return new Vector2(0, -1);
  }

  /**
   * Единичный вектор вниз
   */
  static down(): Vector2 {
    return new Vector2(0, 1);
  }

  /**
   * Единичный вектор влево
   */
  static left(): Vector2 {
    return new Vector2(-1, 0);
  }

  /**
   * Единичный вектор вправо
   */
  static right(): Vector2 {
    return new Vector2(1, 0);
  }

  /**
   * Единичный вектор (1, 1)
   */
  static one(): Vector2 {
    return new Vector2(1, 1);
  }

  /**
   * Случайный единичный вектор
   */
  static random(): Vector2 {
    const angle = Math.random() * Math.PI * 2;
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }

  /**
   * Случайный вектор в пределах прямоугольника
   */
  static randomInRect(width: number, height: number): Vector2 {
    return new Vector2(Math.random() * width, Math.random() * height);
  }
}
