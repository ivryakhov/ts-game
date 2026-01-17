# Neon Arcana — Техническое исследование

**Версия:** 1.0  
**Дата:** 2024

---

## Цель исследования

Выбрать оптимальный технологический стек для разработки браузерной мультиплеерной RTS-игры с учётом:
- Производительности рендеринга (много юнитов на экране)
- Простоты разработки
- Качества мультиплеера (low latency, синхронизация)
- Поддержки TypeScript

---

## 1. Рендеринг

### Варианты

| Технология | Описание | Плюсы | Минусы |
|------------|----------|-------|--------|
| **Canvas 2D** | Нативный браузерный API | Простота, нет зависимостей, хорошая документация | Ограниченная производительность при >500 объектах |
| **WebGL (чистый)** | Низкоуровневый GPU-рендеринг | Максимальная производительность | Сложность разработки, много boilerplate |
| **PixiJS** | 2D WebGL библиотека | Отличная производительность, простой API, спрайты, батчинг | Дополнительная зависимость (~500KB) |
| **Phaser** | Полноценный игровой фреймворк | Всё включено (физика, звук, input) | Избыточен для нашей игры, своя архитектура |
| **Three.js** | 3D библиотека | Можно использовать для 2D | Оверкилл, сложнее чем PixiJS для 2D |

### Анализ для Neon Arcana

**Требования:**
- До 100 юнитов одновременно на экране
- Анимации и эффекты частиц
- Плавное движение (60 FPS)
- Туман войны

**Вывод:**
- Для **прототипа (MVP):** Canvas 2D — быстрый старт, легко понять и отладить
- Для **продакшена:** PixiJS — если Canvas станет узким местом

### Рекомендация: Canvas 2D → PixiJS

Начать с Canvas 2D для простоты. Архитектуру строить так, чтобы рендеринг был изолирован и легко заменяем.

```typescript
// Абстракция рендерера
interface IRenderer {
  clear(): void;
  drawSprite(sprite: Sprite, x: number, y: number): void;
  drawCircle(x: number, y: number, radius: number, color: string): void;
  // ...
}

class CanvasRenderer implements IRenderer { /* ... */ }
class PixiRenderer implements IRenderer { /* ... */ }  // Добавим позже при необходимости
```

---

## 2. Сборщик проекта

### Варианты

| Сборщик | Скорость dev | Скорость build | Конфигурация | TypeScript |
|---------|-------------|----------------|--------------|------------|
| **Vite** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Минимальная | Встроенная |
| **Webpack** | ⭐⭐⭐ | ⭐⭐⭐⭐ | Сложная | Через loader |
| **Parcel** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Zero-config | Встроенная |
| **esbuild** | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Минимальная | Встроенная |

### Анализ

- **Vite** — современный стандарт, HMR из коробки, отличная поддержка TypeScript
- **Webpack** — проверенный временем, но сложная конфигурация
- **Parcel** — zero-config, но меньше контроля
- **esbuild** — молниеносный, но меньше фич

### Рекомендация: Vite

- Мгновенный HMR для быстрой итерации
- TypeScript из коробки
- Простая конфигурация
- Оптимизированный production build

---

## 3. Архитектура игры

### Варианты

#### 3.1 Object-Oriented Programming (OOP)

```typescript
class Unit {
  hp: number;
  position: Vector2;
  
  update(dt: number): void { /* ... */ }
  render(ctx: CanvasRenderingContext2D): void { /* ... */ }
}

class Scout extends Unit { /* ... */ }
class Tank extends Unit { /* ... */ }
```

**Плюсы:** Интуитивно, знакомо, легко начать  
**Минусы:** Сложно комбинировать поведения, глубокие иерархии

#### 3.2 Entity-Component-System (ECS)

```typescript
// Компоненты — чистые данные
interface Position { x: number; y: number; }
interface Health { current: number; max: number; }
interface Velocity { vx: number; vy: number; }

// Системы — логика
class MovementSystem {
  update(entities: Entity[], dt: number) {
    for (const e of entities.with(Position, Velocity)) {
      e.position.x += e.velocity.vx * dt;
      e.position.y += e.velocity.vy * dt;
    }
  }
}
```

**Плюсы:** Гибкость, производительность, легко добавлять новое поведение  
**Минусы:** Сложнее понять, больше boilerplate для маленьких проектов

#### 3.3 Гибридный подход

```typescript
// Базовые классы для структуры
class Entity {
  id: string;
  components: Map<string, Component>;
  
  addComponent<T extends Component>(component: T): void;
  getComponent<T extends Component>(type: ComponentType<T>): T | null;
}

// Системы для логики
class CombatSystem {
  process(entities: Entity[]): void { /* ... */ }
}
```

### Анализ для Neon Arcana

**Наша игра имеет:**
- Ограниченное количество типов сущностей (юниты, башни, снаряды)
- Чёткую логику для каждого типа
- Необходимость синхронизации по сети (проще с явными классами)

### Рекомендация: OOP с элементами компонентов

```typescript
// Базовый класс
abstract class Entity {
  id: string;
  position: Vector2;
  
  abstract update(dt: number, game: GameState): void;
}

// Конкретные типы
class Unit extends Entity {
  health: Health;
  movement: Movement;
  combat: Combat;
  owner: PlayerId;
  
  update(dt: number, game: GameState): void {
    this.movement.update(dt, this);
    this.combat.update(dt, this, game);
  }
}

// Компоненты для переиспользуемой логики
class Health {
  current: number;
  max: number;
  
  takeDamage(amount: number): void { /* ... */ }
  heal(amount: number): void { /* ... */ }
}
```

---

## 4. Сетевой стек (Мультиплеер)

### Варианты

| Технология | Тип | Плюсы | Минусы |
|------------|-----|-------|--------|
| **Socket.io** | WebSocket + fallbacks | Популярный, много примеров | Overhead, не оптимален для игр |
| **ws** | Чистый WebSocket | Лёгкий, быстрый | Нужно писать всё самому |
| **Colyseus** | Игровой сервер | Специализирован для игр, синхронизация состояния | Привязка к их архитектуре |
| **Geckos.io** | UDP-like over WebRTC | Низкая задержка | Сложнее настроить |

### Архитектуры мультиплеера

#### 4.1 Authoritative Server (рекомендуется)

```
Client                    Server                    Client
  |                         |                         |
  |-- Input (move unit) --> |                         |
  |                         | -- процессит логику --  |
  |<-- State update --------|-------- State update -->|
```

**Плюсы:** Защита от читов, консистентность  
**Минусы:** Задержка между действием и результатом

#### 4.2 Client-Side Prediction + Server Reconciliation

```
Client                    Server
  |                         |
  |-- Input + предсказание локально
  |-- Input ------------->  |
  |                         | -- процессит
  |<-- Confirmed state -----|
  |-- корректирует если расхождение
```

**Плюсы:** Отзывчивость, плавность  
**Минусы:** Сложнее реализовать

### Протокол сообщений

```typescript
// Клиент → Сервер
type ClientMessage = 
  | { type: 'spawn_unit'; unitType: UnitType; roadId: string }
  | { type: 'upgrade_unit'; unitType: UnitType }
  | { type: 'recall_guards'; pointId: string; roadId: string };

// Сервер → Клиент  
type ServerMessage =
  | { type: 'game_state'; state: GameState; tick: number }
  | { type: 'unit_spawned'; unit: UnitData }
  | { type: 'unit_died'; unitId: string }
  | { type: 'damage_dealt'; targetId: string; amount: number };
```

### Рекомендация: ws + собственная архитектура

Для обучения и контроля — использовать чистый `ws` с авторитарным сервером.

Для ускорения разработки — рассмотреть **Colyseus** (имеет встроенную синхронизацию состояния).

**Решение:** Начать с простого `ws`, если станет сложно — мигрировать на Colyseus.

---

## 5. Серверная платформа

### Варианты

| Платформа | Производительность | Экосистема | TypeScript |
|-----------|-------------------|------------|------------|
| **Node.js** | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Через ts-node/tsx |
| **Deno** | ⭐⭐⭐⭐ | ⭐⭐⭐ | Нативная |
| **Bun** | ⭐⭐⭐⭐⭐ | ⭐⭐ | Нативная |

### Рекомендация: Node.js

- Самая большая экосистема
- Проверенная стабильность
- Легко найти хостинг
- Использовать `tsx` для нативного запуска TypeScript

---

## 6. Синхронизация состояния

### Подходы

#### 6.1 Full State Sync

Каждый тик отправлять полное состояние игры.

```typescript
// Каждые 50ms
{
  tick: 1234,
  units: [...all units...],
  towers: [...all towers...],
  resources: {...}
}
```

**Плюсы:** Простота, нет рассинхронизаций  
**Минусы:** Большой трафик

#### 6.2 Delta Compression

Отправлять только изменения.

```typescript
{
  tick: 1234,
  changes: [
    { type: 'update', entity: 'unit_123', position: {x: 100, y: 200} },
    { type: 'remove', entity: 'unit_456' }
  ]
}
```

**Плюсы:** Меньше трафика  
**Минусы:** Сложнее реализовать, риск рассинхронизации

#### 6.3 Snapshot Interpolation

Клиент хранит 2 последних состояния и интерполирует между ними.

```typescript
// Рендер с задержкой в 2 тика
const renderTime = serverTime - (2 * TICK_DURATION);
const state = interpolate(prevSnapshot, nextSnapshot, renderTime);
```

**Плюсы:** Плавное движение даже при потерях пакетов  
**Минусы:** Визуальная задержка (но незаметная)

### Рекомендация: Full State + Interpolation

Для MVP — Full State Sync (простота).  
Добавить интерполяцию для плавности.  
Оптимизировать delta compression позже при необходимости.

---

## 7. Game Loop

### Архитектура

```typescript
// Фиксированный timestep для игровой логики
const TICK_RATE = 20; // тиков в секунду
const TICK_DURATION = 1000 / TICK_RATE; // 50ms

class GameLoop {
  private accumulator = 0;
  private lastTime = 0;
  
  start(): void {
    requestAnimationFrame(this.loop.bind(this));
  }
  
  private loop(currentTime: number): void {
    const deltaTime = currentTime - this.lastTime;
    this.lastTime = currentTime;
    
    this.accumulator += deltaTime;
    
    // Фиксированный update для логики
    while (this.accumulator >= TICK_DURATION) {
      this.update(TICK_DURATION / 1000);
      this.accumulator -= TICK_DURATION;
    }
    
    // Рендер с интерполяцией
    const alpha = this.accumulator / TICK_DURATION;
    this.render(alpha);
    
    requestAnimationFrame(this.loop.bind(this));
  }
  
  private update(dt: number): void { /* игровая логика */ }
  private render(alpha: number): void { /* рендеринг с интерполяцией */ }
}
```

---

## 8. Структура проекта

### Рекомендуемая структура

```
ts-game/
├── docs/
│   ├── game-concept.md
│   ├── development-plan.md
│   └── tech-research.md
├── src/
│   ├── client/
│   │   ├── index.ts              # Точка входа клиента
│   │   ├── game/
│   │   │   ├── Game.ts           # Главный игровой класс
│   │   │   ├── GameLoop.ts       # Игровой цикл
│   │   │   └── InputHandler.ts   # Обработка ввода
│   │   ├── entities/
│   │   │   ├── Entity.ts         # Базовый класс
│   │   │   ├── Unit.ts           # Юнит
│   │   │   ├── Tower.ts          # Башня
│   │   │   └── Projectile.ts     # Снаряд
│   │   ├── rendering/
│   │   │   ├── Renderer.ts       # Абстракция рендерера
│   │   │   ├── CanvasRenderer.ts # Canvas реализация
│   │   │   └── Camera.ts         # Камера/вьюпорт
│   │   ├── ui/
│   │   │   ├── UI.ts             # Главный UI менеджер
│   │   │   ├── UnitPanel.ts      # Панель юнитов
│   │   │   └── ResourceBar.ts    # Индикатор ресурсов
│   │   └── network/
│   │       ├── Client.ts         # WebSocket клиент
│   │       └── Protocol.ts       # Типы сообщений
│   ├── server/
│   │   ├── index.ts              # Точка входа сервера
│   │   ├── GameServer.ts         # Главный серверный класс
│   │   ├── Room.ts               # Игровая комната
│   │   └── ServerGameLoop.ts     # Серверный игровой цикл
│   └── shared/
│       ├── types.ts              # Общие типы
│       ├── constants.ts          # Константы (HP, DPS, цены)
│       ├── Vector2.ts            # Математика
│       └── GameState.ts          # Структура состояния игры
├── public/
│   ├── index.html
│   └── assets/
│       ├── sprites/
│       └── sounds/
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

---

## 9. Итоговые рекомендации

### Выбранный стек

| Категория | Выбор | Обоснование |
|-----------|-------|-------------|
| **Рендеринг** | Canvas 2D (MVP) → PixiJS | Простой старт, легко мигрировать |
| **Сборщик** | Vite | Быстрый, современный, TypeScript из коробки |
| **Архитектура** | OOP + компоненты | Баланс простоты и гибкости |
| **Сеть** | ws (WebSocket) | Лёгкий, полный контроль |
| **Сервер** | Node.js + tsx | Экосистема, стабильность |
| **Синхронизация** | Full State + Interpolation | Простота для MVP |

### Приоритеты разработки

1. **Сначала — локальный прототип** (без сети)
2. **Затем — добавление сервера** (когда геймплей проверен)
3. **Потом — оптимизации** (если нужны)

### Следующий шаг

Создать базовую структуру проекта с Vite + TypeScript + Canvas 2D.

---

## 10. Полезные ресурсы

### Статьи

- [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/) — Game loop
- [Networked Physics](https://gafferongames.com/categories/networked-physics/) — Сетевая синхронизация
- [Client-Server Game Architecture](https://www.gabrielgambetta.com/client-server-game-architecture.html) — Мультиплеер

### Библиотеки

- [PixiJS](https://pixijs.com/) — 2D рендеринг
- [Colyseus](https://colyseus.io/) — Игровой сервер
- [Planck.js](https://piqnt.com/planck.js/) — 2D физика (если понадобится)

### Примеры

- [Agar.io clone](https://github.com/nicklatkovich/agario-clone) — Простой мультиплеер
- [Slither.io architecture](https://www.smashingmagazine.com/2019/01/designing-architecture-real-time-web-application/) — Масштабирование

---

*Исследование завершено. Готов к началу разработки!*