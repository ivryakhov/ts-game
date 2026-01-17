/**
 * Neon Arcana - Main Game Class
 * Главный класс игры, координирующий все системы
 */

import {
  GAME_WIDTH,
  GAME_HEIGHT,
  UnitType,
  UNIT_CONFIG,
  STARTING_ETHER,
  PASSIVE_INCOME_PER_SEC,
  MATCH_DURATION_SEC,
} from "@shared/constants";
import {
  PlayerId,
  EntityId,
  RoadId,
  TowerType,
  Position,
  MatchStatus,
  UnitBehaviorState,
  generateId,
  createInitialUnitUpgrades,
  PlayerState,
} from "@shared/types";
import { Tower } from "../entities/Tower";
import { Unit } from "../entities/Unit";
import { Road } from "../entities/Road";
import { GameLoop, PerformanceStats } from "./GameLoop";
import { CanvasRenderer } from "../rendering/CanvasRenderer";

/**
 * Конфигурация игры
 */
export interface GameConfig {
  /** Количество игроков */
  playerCount: number;

  /** ID локального игрока */
  localPlayerId: PlayerId;

  /** Режим отладки */
  debugMode: boolean;
}

/**
 * Главный класс игры
 */
export class Game {
  /** Рендерер */
  private renderer: CanvasRenderer;

  /** Игровой цикл */
  private gameLoop: GameLoop;

  /** Конфигурация */
  private config: GameConfig;

  /** Статус матча */
  private matchStatus: MatchStatus = MatchStatus.WAITING;

  /** Время матча (секунды) */
  private matchTime: number = 0;

  /** Башни */
  private towers: Map<EntityId, Tower> = new Map();

  /** Юниты */
  private units: Map<EntityId, Unit> = new Map();

  /** Дороги */
  private roads: Map<RoadId, Road> = new Map();

  /** Игроки */
  private players: Map<PlayerId, PlayerState> = new Map();

  /** Порядок ID игроков (для индексов цветов) */
  private playerOrder: PlayerId[] = [];

  /** ID локального игрока */
  private localPlayerId: PlayerId;

  /** Выбранный тип юнита для создания */
  private selectedUnitType: UnitType = UnitType.SCOUT;

  /** Выбранная дорога */
  private selectedRoadId: RoadId | null = null;

  /** Позиция мыши в игровых координатах */
  private mousePosition: Position = { x: 0, y: 0 };

  constructor(canvas: HTMLCanvasElement, config: Partial<GameConfig> = {}) {
    this.config = {
      playerCount: 2,
      localPlayerId: "player1",
      debugMode: false,
      ...config,
    };

    this.localPlayerId = this.config.localPlayerId;

    // Инициализируем рендерер
    this.renderer = new CanvasRenderer(canvas, {
      showFps: true,
      showGrid: this.config.debugMode,
      debugMode: this.config.debugMode,
    });

    // Инициализируем игровой цикл
    this.gameLoop = new GameLoop({
      update: this.update.bind(this),
      render: this.render.bind(this),
    });

    // Настраиваем обработчики событий
    this.setupEventListeners(canvas);

    // Инициализируем игровой мир
    this.initializeGame();
  }

  /**
   * Настройка обработчиков событий
   */
  private setupEventListeners(canvas: HTMLCanvasElement): void {
    // Обработка изменения размера окна
    window.addEventListener("resize", () => {
      this.renderer.resize();
    });

    // Обработка движения мыши
    canvas.addEventListener("mousemove", (e) => {
      this.mousePosition = this.renderer.screenToWorld(e.clientX, e.clientY);
      this.updateRoadHighlight();
    });

    // Обработка ухода мыши с canvas
    canvas.addEventListener("mouseleave", () => {
      this.clearRoadHighlight();
    });

    // Обработка клика
    canvas.addEventListener("click", (e) => {
      const worldPos = this.renderer.screenToWorld(e.clientX, e.clientY);
      this.handleClick(worldPos);
    });

    // Обработка клавиатуры
    window.addEventListener("keydown", (e) => {
      this.handleKeyDown(e);
    });
  }

  /**
   * Инициализация игры
   */
  private initializeGame(): void {
    // Создаём игроков
    this.createPlayers();

    // Создаём башни
    this.createTowers();

    // Создаём дороги
    this.createRoads();

    // Устанавливаем статус
    this.matchStatus = MatchStatus.IN_PROGRESS;
  }

  /**
   * Создание игроков
   */
  private createPlayers(): void {
    for (let i = 0; i < this.config.playerCount; i++) {
      const playerId = `player${i + 1}`;
      this.playerOrder.push(playerId);

      const player: PlayerState = {
        id: playerId,
        name: `Player ${i + 1}`,
        color: "",
        ether: STARTING_ETHER,
        incomePerSec: PASSIVE_INCOME_PER_SEC,
        isAlive: true,
        towerId: "",
        unlockedUnits: [UnitType.SCOUT, UnitType.TANK],
        unitUpgrades: createInitialUnitUpgrades(),
        lastAggressionTime: 0,
      };

      this.players.set(playerId, player);
    }
  }

  /**
   * Создание башен
   */
  private createTowers(): void {
    const positions = this.getTowerPositions(this.config.playerCount);

    this.playerOrder.forEach((playerId, index) => {
      const pos = positions[index];
      if (!pos) return;

      const towerId = generateId();
      const tower = new Tower(
        towerId,
        TowerType.MAIN,
        playerId,
        index,
        pos.x,
        pos.y,
      );

      this.towers.set(towerId, tower);

      // Обновляем игрока
      const player = this.players.get(playerId);
      if (player) {
        player.towerId = towerId;
        player.color = tower.color;
      }
    });
  }

  /**
   * Получить позиции башен для количества игроков
   */
  private getTowerPositions(playerCount: number): Position[] {
    const margin = 80;

    switch (playerCount) {
      case 2:
        return [
          { x: margin, y: GAME_HEIGHT / 2 },
          { x: GAME_WIDTH - margin, y: GAME_HEIGHT / 2 },
        ];

      case 3:
        return [
          { x: margin, y: GAME_HEIGHT / 2 },
          { x: GAME_WIDTH - margin, y: margin + 100 },
          { x: GAME_WIDTH - margin, y: GAME_HEIGHT - margin - 100 },
        ];

      case 4:
        return [
          { x: margin, y: margin + 50 },
          { x: GAME_WIDTH - margin, y: margin + 50 },
          { x: margin, y: GAME_HEIGHT - margin - 50 },
          { x: GAME_WIDTH - margin, y: GAME_HEIGHT - margin - 50 },
        ];

      default:
        return [
          { x: margin, y: GAME_HEIGHT / 2 },
          { x: GAME_WIDTH - margin, y: GAME_HEIGHT / 2 },
        ];
    }
  }

  /**
   * Создание дорог
   */
  private createRoads(): void {
    const towerArray = Array.from(this.towers.values());

    // Создаём дороги между каждой парой башен
    for (let i = 0; i < towerArray.length; i++) {
      for (let j = i + 1; j < towerArray.length; j++) {
        const tower1 = towerArray[i];
        const tower2 = towerArray[j];

        if (!tower1 || !tower2) continue;

        // Создаём 2 дороги между башнями (разные пути)
        this.createRoadBetweenTowers(tower1, tower2, 0);
        this.createRoadBetweenTowers(tower1, tower2, 1);
      }
    }
  }

  /**
   * Создание дороги между двумя башнями
   */
  private createRoadBetweenTowers(
    tower1: Tower,
    tower2: Tower,
    variant: number,
  ): void {
    const roadId = `road_${tower1.id}_${tower2.id}_${variant}`;

    const from = tower1.position.toObject();
    const to = tower2.position.toObject();

    // Вычисляем контрольные точки для изогнутой дороги
    const midX = (from.x + to.x) / 2;
    const midY = (from.y + to.y) / 2;

    // Смещение от центра для создания разных путей
    const offset = variant === 0 ? -80 : 80;

    // Определяем направление смещения (перпендикулярно линии между башнями)
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.sqrt(dx * dx + dy * dy);

    // Нормаль к линии
    const nx = -dy / len;
    const ny = dx / len;

    const controlPoint: Position = {
      x: midX + nx * offset,
      y: midY + ny * offset,
    };

    const road = Road.createCurved(roadId, tower1.id, tower2.id, from, to, [
      controlPoint,
    ]);

    this.roads.set(roadId, road);
  }

  /**
   * Обновление игры (фиксированный timestep)
   */
  private update(dt: number): void {
    if (this.matchStatus !== MatchStatus.IN_PROGRESS) return;

    // Обновляем время матча
    this.matchTime += dt;

    // Проверяем окончание времени
    if (this.matchTime >= MATCH_DURATION_SEC) {
      this.endMatch();
      return;
    }

    // Обновляем экономику игроков
    this.updateEconomy(dt);

    // Обновляем башни
    this.updateTowers(dt);

    // Обновляем юнитов
    this.updateUnits(dt);

    // Обрабатываем бои
    this.processCombat(dt);

    // Проверяем условия победы
    this.checkWinConditions();
  }

  /**
   * Обновление экономики
   */
  private updateEconomy(dt: number): void {
    for (const player of this.players.values()) {
      if (!player.isAlive) continue;

      // Пассивный доход
      player.ether += player.incomePerSec * dt;
    }
  }

  /**
   * Обновление башен
   */
  private updateTowers(dt: number): void {
    for (const tower of this.towers.values()) {
      tower.update(dt);

      // Проверяем, завершилось ли улучшение
      if (tower.isUpgrading && Date.now() >= tower.upgradeEndTime) {
        tower.completeUpgrade();
      }

      // Башня атакует ближайшего врага
      this.towerAttack(tower, dt);
    }
  }

  /**
   * Атака башни
   */
  private towerAttack(tower: Tower, _dt: number): void {
    if (tower.isUpgrading || !tower.combat.canAttack()) return;

    // Находим ближайшего вражеского юнита в радиусе
    let nearestEnemy: Unit | null = null;
    let nearestDistance = Infinity;

    for (const unit of this.units.values()) {
      if (unit.ownerId === tower.ownerId || !unit.isAlive) continue;

      const distance = tower.position.distanceTo(unit.position);
      if (distance <= tower.combat.attackRange && distance < nearestDistance) {
        nearestDistance = distance;
        nearestEnemy = unit;
      }
    }

    if (nearestEnemy) {
      tower.targetId = nearestEnemy.id;
      const damage = tower.combat.attack();
      if (damage > 0) {
        nearestEnemy.takeDamage(damage);
      }
    } else {
      tower.targetId = null;
    }
  }

  /**
   * Обновление юнитов
   */
  private updateUnits(dt: number): void {
    const unitsToRemove: EntityId[] = [];

    for (const unit of this.units.values()) {
      if (!unit.isAlive) {
        unitsToRemove.push(unit.id);
        continue;
      }

      unit.update(dt);

      // Проверяем, достиг ли юнит цели (вражеской башни)
      if (unit.state === UnitBehaviorState.MOVING) {
        this.checkUnitReachedTarget(unit);
      }
    }

    // Удаляем мёртвых юнитов
    for (const id of unitsToRemove) {
      this.units.delete(id);
    }
  }

  /**
   * Проверка, достиг ли юнит цели
   */
  private checkUnitReachedTarget(unit: Unit): void {
    const targetTower = this.towers.get(unit.targetTowerId);
    if (!targetTower) return;

    const distance = unit.position.distanceTo(targetTower.position);

    // Если юнит достиг башни, атакуем её
    if (distance <= unit.combat.attackRange + targetTower.size / 2) {
      unit.state = UnitBehaviorState.FIGHTING;
      unit.targetId = targetTower.id;
    }
  }

  /**
   * Обработка боёв
   */
  private processCombat(_dt: number): void {
    // Проверяем столкновения юнитов и начинаем бои
    const unitArray = Array.from(this.units.values()).filter((u) => u.isAlive);

    for (let i = 0; i < unitArray.length; i++) {
      const unit1 = unitArray[i];
      if (!unit1) continue;

      // Юнит атакует башню
      if (unit1.state === UnitBehaviorState.FIGHTING && unit1.targetId) {
        const target = this.towers.get(unit1.targetId);
        if (target && unit1.combat.canAttack()) {
          const damage = unit1.combat.attack() * 0.5; // 50% урона по башням
          const destroyed = target.takeDamage(damage);

          if (destroyed) {
            this.onTowerDestroyed(target);
          }
        }
        continue;
      }

      // Проверяем столкновения с другими юнитами
      for (let j = i + 1; j < unitArray.length; j++) {
        const unit2 = unitArray[j];
        if (!unit2) continue;

        // Пропускаем союзников
        if (unit1.ownerId === unit2.ownerId) continue;

        // Проверяем расстояние
        const distance = unit1.position.distanceTo(unit2.position);
        const combatRange = Math.max(
          unit1.combat.attackRange,
          unit2.combat.attackRange,
        );

        if (distance <= combatRange + UNIT_CONFIG[UnitType.SCOUT].range) {
          // Начинаем бой
          if (unit1.state !== UnitBehaviorState.FIGHTING) {
            unit1.startFighting(unit2.id);
          }
          if (unit2.state !== UnitBehaviorState.FIGHTING) {
            unit2.startFighting(unit1.id);
          }

          // Обмен ударами
          if (unit1.combat.canAttack()) {
            const damage = unit1.attackTarget(unit2);
            if (damage > 0) {
              unit2.takeDamage(damage);
            }
          }

          if (unit2.combat.canAttack() && unit2.isAlive) {
            const damage = unit2.attackTarget(unit1);
            if (damage > 0) {
              unit1.takeDamage(damage);
            }
          }
        }
      }
    }

    // Юниты без целей продолжают движение
    for (const unit of this.units.values()) {
      if (unit.state === UnitBehaviorState.FIGHTING && unit.targetId) {
        // Проверяем, жива ли цель
        const targetUnit = this.units.get(unit.targetId);
        const targetTower = this.towers.get(unit.targetId);

        if (!targetUnit?.isAlive && !targetTower?.isAlive) {
          unit.stopFighting();
        }
      }
    }
  }

  /**
   * Обработка уничтожения башни
   */
  private onTowerDestroyed(tower: Tower): void {
    const player = this.players.get(tower.ownerId);
    if (player) {
      player.isAlive = false;
    }
  }

  /**
   * Проверка условий победы
   */
  private checkWinConditions(): void {
    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.isAlive,
    );

    if (alivePlayers.length <= 1) {
      this.endMatch();
    }
  }

  /**
   * Завершение матча
   */
  private endMatch(): void {
    this.matchStatus = MatchStatus.FINISHED;

    const alivePlayers = Array.from(this.players.values()).filter(
      (p) => p.isAlive,
    );

    if (alivePlayers.length === 1) {
      console.log(`Winner: ${alivePlayers[0]?.name}`);
    } else {
      console.log("Draw!");
    }
  }

  /**
   * Рендеринг игры
   */
  private render(_alpha: number): void {
    this.renderer.beginFrame();

    // Фон и сетка
    this.renderer.renderBackground();
    this.renderer.renderBorder();

    // Дороги
    this.renderer.renderRoads(Array.from(this.roads.values()));

    // Башни
    this.renderer.renderTowers(Array.from(this.towers.values()));

    // Юниты
    this.renderer.renderUnits(Array.from(this.units.values()));

    // UI элементы
    this.renderUI();

    // Статус матча
    if (this.matchStatus === MatchStatus.FINISHED) {
      this.renderer.renderCenterText("GAME OVER", { fontSize: 64 });
    }

    this.renderer.endFrame();

    // FPS
    const stats = this.gameLoop.getStats();
    this.renderer.renderFps(stats.fps, stats.ticksPerSecond);

    // Отладочная информация
    if (this.config.debugMode) {
      this.renderer.renderDebugInfo({
        Units: this.units.size,
        Towers: this.towers.size,
        Roads: this.roads.size,
        Time: Math.floor(this.matchTime),
      });
    }
  }

  /**
   * Рендеринг UI
   */
  private renderUI(): void {
    const ctx = this.renderer.getContext();
    const player = this.players.get(this.localPlayerId);

    if (!player) return;

    // Панель ресурсов
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(10, GAME_HEIGHT - 80, 300, 70);

    ctx.font = "bold 16px Arial";
    ctx.fillStyle = "#00ffff";
    ctx.fillText(`Эфир: ${Math.floor(player.ether)}`, 20, GAME_HEIGHT - 55);

    ctx.font = "12px Arial";
    ctx.fillStyle = "#888";
    ctx.fillText(`+${player.incomePerSec}/сек`, 120, GAME_HEIGHT - 55);

    // Выбранный юнит
    const unitConfig = UNIT_CONFIG[this.selectedUnitType];
    ctx.fillStyle = "#fff";
    ctx.fillText(
      `Юнит: ${unitConfig.name} (${unitConfig.cost} эфира)`,
      20,
      GAME_HEIGHT - 30,
    );

    // Подсказка
    ctx.fillStyle = "#666";
    ctx.fillText(
      "1-4: выбор юнита | Клик по дороге: отправить",
      20,
      GAME_HEIGHT - 10,
    );

    // Таймер
    const remainingTime = Math.max(0, MATCH_DURATION_SEC - this.matchTime);
    const minutes = Math.floor(remainingTime / 60);
    const seconds = Math.floor(remainingTime % 60);

    ctx.font = "bold 20px Arial";
    ctx.fillStyle = remainingTime < 60 ? "#ff0000" : "#fff";
    ctx.textAlign = "center";
    ctx.fillText(
      `${minutes}:${seconds.toString().padStart(2, "0")}`,
      GAME_WIDTH / 2,
      30,
    );
    ctx.textAlign = "left";
  }

  /**
   * Обновление подсветки дороги под мышью
   */
  private updateRoadHighlight(): void {
    let foundRoad = false;

    for (const road of this.roads.values()) {
      if (road.isPointNearRoad(this.mousePosition)) {
        road.highlight();
        this.selectedRoadId = road.id;
        foundRoad = true;
      } else {
        road.unhighlight();
      }
    }

    if (!foundRoad) {
      this.selectedRoadId = null;
    }
  }

  /**
   * Снятие подсветки со всех дорог
   */
  private clearRoadHighlight(): void {
    for (const road of this.roads.values()) {
      road.unhighlight();
    }
    this.selectedRoadId = null;
  }

  /**
   * Обработка клика
   */
  private handleClick(_position: Position): void {
    // Если кликнули по дороге - создаём юнита
    if (this.selectedRoadId) {
      this.spawnUnit(this.selectedUnitType, this.selectedRoadId);
    }
  }

  /**
   * Обработка нажатия клавиши
   */
  private handleKeyDown(e: KeyboardEvent): void {
    switch (e.key) {
      case "1":
        this.selectedUnitType = UnitType.SCOUT;
        break;
      case "2":
        this.selectedUnitType = UnitType.TANK;
        break;
      case "3":
        this.selectedUnitType = UnitType.RANGER;
        break;
      case "4":
        this.selectedUnitType = UnitType.SUPPORT;
        break;
      case "g":
        // Toggle grid
        const config = this.renderer.getConfig();
        this.renderer.updateConfig({ showGrid: !config.showGrid });
        break;
      case "d":
        // Toggle debug
        this.config.debugMode = !this.config.debugMode;
        this.renderer.updateConfig({ debugMode: this.config.debugMode });
        break;
    }
  }

  /**
   * Создание юнита
   */
  spawnUnit(unitType: UnitType, roadId: RoadId): void {
    const player = this.players.get(this.localPlayerId);
    if (!player || !player.isAlive) return;

    const unitConfig = UNIT_CONFIG[unitType];

    // Проверяем, разблокирован ли юнит
    if (!player.unlockedUnits.includes(unitType)) {
      console.log("Unit not unlocked");
      return;
    }

    // Проверяем, хватает ли ресурсов
    if (player.ether < unitConfig.cost) {
      console.log("Not enough ether");
      return;
    }

    // Получаем дорогу
    const road = this.roads.get(roadId);
    if (!road) return;

    // Получаем башню игрока
    const playerTower = this.towers.get(player.towerId);
    if (!playerTower) return;

    // Проверяем, связана ли дорога с башней игрока
    const waypoints = road.getWaypointsFrom(player.towerId);
    if (waypoints.length === 0) return;

    const targetTowerId = road.getTargetTowerFrom(player.towerId);
    if (!targetTowerId) return;

    // Снимаем ресурсы
    player.ether -= unitConfig.cost;

    // Создаём юнита
    const unitId = generateId();
    const startPos = waypoints[0]?.position ?? playerTower.position.toObject();

    const unit = new Unit(
      unitId,
      unitType,
      this.localPlayerId,
      this.playerOrder.indexOf(this.localPlayerId),
      startPos.x,
      startPos.y,
    );

    unit.waypoints = waypoints;
    unit.targetRoadId = roadId;
    unit.targetTowerId = targetTowerId;
    unit.currentWaypointIndex = 1; // Начинаем с 1, т.к. 0 - это стартовая позиция

    this.units.set(unitId, unit);
  }

  /**
   * Запуск игры
   */
  start(): void {
    this.gameLoop.start();

    // Скрываем экран загрузки
    const loadingScreen = document.getElementById("loading");
    if (loadingScreen) {
      loadingScreen.classList.add("hidden");
    }
  }

  /**
   * Остановка игры
   */
  stop(): void {
    this.gameLoop.stop();
  }

  /**
   * Пауза
   */
  pause(): void {
    this.gameLoop.pause();
  }

  /**
   * Продолжить
   */
  resume(): void {
    this.gameLoop.resume();
  }

  /**
   * Получить статистику производительности
   */
  getStats(): PerformanceStats {
    return this.gameLoop.getStats();
  }

  /**
   * Получить локального игрока
   */
  getLocalPlayer(): PlayerState | undefined {
    return this.players.get(this.localPlayerId);
  }

  /**
   * Получить всех игроков
   */
  getPlayers(): PlayerState[] {
    return Array.from(this.players.values());
  }

  /**
   * Получить статус матча
   */
  getMatchStatus(): MatchStatus {
    return this.matchStatus;
  }

  /**
   * Получить время матча
   */
  getMatchTime(): number {
    return this.matchTime;
  }
}
