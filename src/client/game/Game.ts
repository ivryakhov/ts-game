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
  MAX_UPGRADE_LEVEL,
} from "@shared/constants";
import {
  PlayerId,
  EntityId,
  RoadId,
  ResourcePointId,
  TowerType,
  ResourcePointType,
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
import { ResourcePoint } from "../entities/ResourcePoint";
import { GameLoop, PerformanceStats } from "./GameLoop";
import { CanvasRenderer } from "../rendering/CanvasRenderer";
import { UpgradeSystem, UpgradeType } from "../systems/UpgradeSystem";

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

  /** Ресурсные точки */
  private resourcePoints: Map<ResourcePointId, ResourcePoint> = new Map();

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

  /** Выбранная ресурсная точка */
  private selectedResourcePointId: ResourcePointId | null = null;

  /** Позиция мыши в игровых координатах */
  private mousePosition: Position = { x: 0, y: 0 };

  /** Показывать ли панель улучшений */
  private showUpgradePanel: boolean = false;

  /** Показывать ли панель башни */
  private showTowerPanel: boolean = false;

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
      this.updateSelectionHighlight();
    });

    // Обработка ухода мыши с canvas
    canvas.addEventListener("mouseleave", () => {
      this.clearSelectionHighlight();
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

    // Создаём ресурсные точки
    this.createResourcePoints();

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
   * Создание ресурсных точек
   */
  private createResourcePoints(): void {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    // Главная кристаллическая шахта в центре
    const crystalMine = new ResourcePoint(
      "rp_center",
      ResourcePointType.CRYSTAL_MINE,
      centerX,
      centerY,
    );
    this.resourcePoints.set(crystalMine.id, crystalMine);

    // Малые кристаллы ближе к башням
    const smallCrystalOffsets = [
      { x: -200, y: -100 }, // Ближе к левой башне (верх)
      { x: -200, y: 100 }, // Ближе к левой башне (низ)
      { x: 200, y: -100 }, // Ближе к правой башне (верх)
      { x: 200, y: 100 }, // Ближе к правой башне (низ)
    ];

    smallCrystalOffsets.forEach((offset, index) => {
      const smallCrystal = new ResourcePoint(
        `rp_small_${index}`,
        ResourcePointType.SMALL_CRYSTAL,
        centerX + offset.x,
        centerY + offset.y,
      );
      this.resourcePoints.set(smallCrystal.id, smallCrystal);
    });

    // Нейтральные лагеря вдоль дорог
    const campOffsets = [
      { x: 0, y: -150 }, // Верх от центра
      { x: 0, y: 150 }, // Низ от центра
    ];

    campOffsets.forEach((offset, index) => {
      const camp = new ResourcePoint(
        `rp_camp_${index}`,
        ResourcePointType.NEUTRAL_CAMP,
        centerX + offset.x,
        centerY + offset.y,
      );
      this.resourcePoints.set(camp.id, camp);
    });
  }

  /**
   * Обновление ресурсных точек
   */
  private updateResourcePoints(dt: number): void {
    for (const point of this.resourcePoints.values()) {
      point.update(dt);

      // Регенерация HP юнитов-охранников
      if (point.ownerId && point.config.guardRegenPerSec > 0) {
        for (const unitId of point.guardUnitIds) {
          const unit = this.units.get(unitId);
          if (unit && unit.isAlive) {
            unit.heal(point.config.guardRegenPerSec * dt);
          }
        }
      }
    }
  }

  /**
   * Обработка боёв с нейтральными защитниками
   */
  private processNeutralCombat(_dt: number): void {
    for (const point of this.resourcePoints.values()) {
      // Пропускаем точки без защитников
      if (point.guardians.length === 0) {
        // Если защитников нет, юниты в бою рядом с точкой должны захватить её
        for (const unit of this.units.values()) {
          if (!unit.isAlive) continue;

          const distanceToPoint = unit.position.distanceTo(point.position);

          // Юнит рядом с точкой и сражался?
          if (distanceToPoint <= point.size + 100) {
            // Если юнит в бою - остановить бой и переместить к центру точки
            if (unit.state === UnitBehaviorState.FIGHTING) {
              unit.stopFighting();
              // Переместить юнита к центру точки для захвата
              unit.position.x = point.position.x;
              unit.position.y = point.position.y;
            }
          }
        }
        continue;
      }

      // Находим юнитов рядом с точкой
      for (const unit of this.units.values()) {
        if (!unit.isAlive) continue;
        if (unit.state === UnitBehaviorState.GUARDING) continue;

        const distanceToPoint = unit.position.distanceTo(point.position);

        // Юнит в зоне агрессии защитников? (увеличен радиус для юнитов идущих к точке)
        const isGoingToThisPoint = unit.guardingPointId === point.id;
        const aggroRange = isGoingToThisPoint
          ? point.size + 150
          : point.size + 60;
        if (distanceToPoint > aggroRange) continue;

        // Найти ближайшего защитника и атаковать его
        for (const guardian of point.guardians) {
          if (!guardian.isAlive) continue;

          const distanceToGuardian = unit.position.distanceTo(
            guardian.position,
          );

          // Юнит атакует защитника
          if (distanceToGuardian <= unit.combat.attackRange + guardian.size) {
            // Остановить юнита для боя
            if (unit.state === UnitBehaviorState.MOVING) {
              unit.state = UnitBehaviorState.FIGHTING;
              unit.targetId = guardian.id;
            }

            if (unit.combat.canAttack()) {
              const damage = unit.combat.attack(); // базовый урон без бонусов контр-пиков
              if (damage > 0) {
                guardian.takeDamage(damage);
              }
            }
          }

          // Защитник атакует юнита
          if (distanceToGuardian <= guardian.aggroRadius) {
            guardian.targetId = unit.id;

            if (guardian.canAttack()) {
              const damage = guardian.attack();
              unit.takeDamage(damage);
            }
          }
        }
      }

      // Бой между охранниками игрока и атакующими юнитами
      for (const guardUnitId of point.guardUnitIds) {
        const guardUnit = this.units.get(guardUnitId);
        if (!guardUnit || !guardUnit.isAlive) {
          point.removeGuard(guardUnitId);
          continue;
        }

        // Охранник атакует врагов рядом с точкой
        for (const enemyUnit of this.units.values()) {
          if (!enemyUnit.isAlive) continue;
          if (enemyUnit.ownerId === guardUnit.ownerId) continue;

          const distance = guardUnit.position.distanceTo(enemyUnit.position);
          if (distance <= guardUnit.combat.attackRange + point.size) {
            if (guardUnit.state !== UnitBehaviorState.FIGHTING) {
              guardUnit.startFighting(enemyUnit.id);
            }

            if (guardUnit.combat.canAttack()) {
              const damage = guardUnit.attackTarget(enemyUnit);
              enemyUnit.takeDamage(damage);
            }
          }
        }
      }
    }
  }

  /**
   * Проверка захвата ресурсных точек
   */
  private checkResourcePointCaptures(): void {
    for (const point of this.resourcePoints.values()) {
      // Точка с защитниками не может быть захвачена
      if (point.guardians.length > 0) {
        // Debug: показать что защитники ещё живы
        // console.log(`Point ${point.id} has ${point.guardians.length} guardians alive`);
        continue;
      }

      // Находим юнитов на точке
      for (const unit of this.units.values()) {
        if (!unit.isAlive) continue;
        if (unit.state === UnitBehaviorState.SPAWNING) continue;
        if (unit.state === UnitBehaviorState.GUARDING) continue;

        const distance = unit.position.distanceTo(point.position);

        // Юнит рядом с точкой? (большой радиус для захвата после боя)
        const captureRange = point.size + 100;
        if (distance <= captureRange) {
          const playerIndex = this.playerOrder.indexOf(unit.ownerId);

          // Попытка захвата
          if (point.canBeCaptured()) {
            // Для лагерей проверяем bonusCollected отдельно
            if (
              point.pointType === ResourcePointType.NEUTRAL_CAMP &&
              point.bonusCollected
            ) {
              continue; // Бонус уже собран
            }

            const captured = point.capture(unit.ownerId, playerIndex);

            if (captured) {
              // Для нейтрального лагеря - выдать бонус
              if (point.pointType === ResourcePointType.NEUTRAL_CAMP) {
                const bonus = point.config.oneTimeBonus ?? 0;
                const player = this.players.get(unit.ownerId);
                if (player && bonus > 0) {
                  player.ether += bonus;
                  console.log(
                    `${player.name} получил +${bonus} эфира за нейтральный лагерь!`,
                  );
                }
              } else {
                const player = this.players.get(unit.ownerId);
                console.log(`${player?.name} захватил ${point.config.name}!`);
              }
            }
          }

          // Оставить юнита в качестве охранника (если место есть)
          // Приоритет юнитам, которые специально шли к этой точке
          const isGoingToThisPoint = unit.guardingPointId === point.id;
          if (
            point.ownerId === unit.ownerId &&
            point.config.maxGuards > 0 &&
            (unit.state === UnitBehaviorState.MOVING || isGoingToThisPoint)
          ) {
            if (point.addGuard(unit.id)) {
              unit.startGuarding(point.id);
              unit.position.copy(point.position); // Переместить к центру точки
            }
          }
        }
      }

      // Если точка захвачена, но нет охранников - потерять контроль при атаке
      if (point.ownerId && point.guardUnitIds.length === 0) {
        // Проверяем, есть ли вражеские юниты на точке
        for (const unit of this.units.values()) {
          if (!unit.isAlive) continue;
          if (unit.ownerId === point.ownerId) continue;

          const distance = unit.position.distanceTo(point.position);
          if (distance <= point.size) {
            // Враг на точке без охраны - потеря контроля
            const previousOwner = this.players.get(point.ownerId);
            console.log(
              `${previousOwner?.name} потерял контроль над ${point.config.name}!`,
            );

            point.loseControl();

            // Новый владелец захватывает
            const playerIndex = this.playerOrder.indexOf(unit.ownerId);
            point.capture(unit.ownerId, playerIndex);

            const newOwner = this.players.get(unit.ownerId);
            console.log(`${newOwner?.name} захватил ${point.config.name}!`);
            break;
          }
        }
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

    // Обновляем ресурсные точки
    this.updateResourcePoints(dt);

    // Обновляем юнитов
    this.updateUnits(dt);

    // Обрабатываем бои
    this.processCombat(dt);

    // Обрабатываем бои с нейтралами
    this.processNeutralCombat(dt);

    // Проверяем захват ресурсных точек
    this.checkResourcePointCaptures();

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

      // Доход от ресурсных точек
      for (const point of this.resourcePoints.values()) {
        if (point.ownerId === player.id) {
          player.ether += point.getIncomePerSec() * dt;
        }
      }
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

    // Ресурсные точки (под юнитами)
    this.renderResourcePoints();

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
        ResourcePoints: this.resourcePoints.size,
        Time: Math.floor(this.matchTime),
      });
    }
  }

  /**
   * Рендеринг ресурсных точек
   */
  private renderResourcePoints(): void {
    const ctx = this.renderer.getContext();
    for (const point of this.resourcePoints.values()) {
      // Подсветка выбранной точки
      if (point.id === this.selectedResourcePointId) {
        ctx.save();
        ctx.strokeStyle = "#ffff00";
        ctx.lineWidth = 3;
        ctx.setLineDash([8, 4]);
        ctx.beginPath();
        ctx.arc(
          point.position.x,
          point.position.y,
          point.size + 15,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      point.render(ctx);
    }
  }

  /**
   * Рендеринг UI
   */
  private renderUI(): void {
    const ctx = this.renderer.getContext();
    const player = this.players.get(this.localPlayerId);

    if (!player) return;

    // Подсчитываем доход от ресурсных точек
    let resourcePointIncome = 0;
    for (const point of this.resourcePoints.values()) {
      if (point.ownerId === player.id) {
        resourcePointIncome += point.getIncomePerSec();
      }
    }
    const totalIncome = player.incomePerSec + resourcePointIncome;

    // Панель ресурсов
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(10, GAME_HEIGHT - 80, 300, 70);

    ctx.font = "bold 16px Arial";
    ctx.fillStyle = "#00ffff";
    ctx.fillText(`Эфир: ${Math.floor(player.ether)}`, 20, GAME_HEIGHT - 55);

    ctx.font = "12px Arial";
    ctx.fillStyle = "#888";
    ctx.fillText(`+${totalIncome.toFixed(1)}/сек`, 120, GAME_HEIGHT - 55);

    // Показываем доход от ресурсных точек отдельно
    if (resourcePointIncome > 0) {
      ctx.fillStyle = "#00ff00";
      ctx.fillText(`(+${resourcePointIncome} от точек)`, 200, GAME_HEIGHT - 55);
    }

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
      "1-4: юнит | U: улучшения | R: разблокировка | T: башня | Клик: дорога/точка",
      20,
      GAME_HEIGHT - 10,
    );

    // Индикатор выбранной ресурсной точки
    if (this.selectedResourcePointId) {
      const point = this.resourcePoints.get(this.selectedResourcePointId);
      if (point) {
        ctx.fillStyle = "#ffff00";
        ctx.fillText(`► Цель: ${point.config.name}`, 20, GAME_HEIGHT - 90);
      }
    }

    // Панель улучшений
    if (this.showUpgradePanel) {
      this.renderUpgradePanel(ctx, player);
    }

    // Панель башни
    if (this.showTowerPanel) {
      this.renderTowerPanel(ctx, player);
    }

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
   * Рендеринг панели улучшений
   */
  private renderUpgradePanel(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
  ): void {
    const panelX = GAME_WIDTH - 320;
    const panelY = 60;
    const panelWidth = 310;
    const panelHeight = 280;

    // Фон панели
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

    // Рамка
    ctx.strokeStyle = "#00ffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    // Заголовок
    const unitConfig = UNIT_CONFIG[this.selectedUnitType];
    ctx.font = "bold 16px Arial";
    ctx.fillStyle = "#00ffff";
    ctx.textAlign = "center";
    ctx.fillText(
      `Улучшения: ${unitConfig.name}`,
      panelX + panelWidth / 2,
      panelY + 25,
    );

    // Проверяем, разблокирован ли юнит
    const unlockInfo = UpgradeSystem.getUnlockInfo(
      player,
      this.selectedUnitType,
    );

    if (!unlockInfo.unlocked) {
      // Юнит не разблокирован
      ctx.font = "14px Arial";
      ctx.fillStyle = "#ff6600";
      ctx.fillText(
        "Юнит не разблокирован",
        panelX + panelWidth / 2,
        panelY + 80,
      );

      ctx.fillStyle = "#ffffff";
      ctx.fillText(
        `Стоимость: ${unlockInfo.cost} эфира`,
        panelX + panelWidth / 2,
        panelY + 110,
      );

      ctx.fillStyle = unlockInfo.canUnlock ? "#00ff00" : "#666";
      ctx.fillText("[R] Разблокировать", panelX + panelWidth / 2, panelY + 140);

      ctx.textAlign = "left";
      return;
    }

    // Улучшения
    const upgrades = UpgradeSystem.getAllUpgradeInfo(
      player,
      this.selectedUnitType,
    );
    const upgradeStats = UpgradeSystem.getUpgradedStats(
      player,
      this.selectedUnitType,
    );

    ctx.textAlign = "left";
    ctx.font = "13px Arial";

    let yOffset = panelY + 55;
    const lineHeight = 55;

    // HP
    this.renderUpgradeLine(
      ctx,
      panelX + 15,
      yOffset,
      "Q",
      "❤️ Здоровье",
      upgrades.hp,
      `${upgradeStats.hp} HP`,
      player.ether,
    );
    yOffset += lineHeight;

    // DPS
    this.renderUpgradeLine(
      ctx,
      panelX + 15,
      yOffset,
      "W",
      "⚔️ Урон",
      upgrades.dps,
      `${upgradeStats.dps} DPS`,
      player.ether,
    );
    yOffset += lineHeight;

    // Speed
    this.renderUpgradeLine(
      ctx,
      panelX + 15,
      yOffset,
      "E",
      "💨 Скорость",
      upgrades.speed,
      `${upgradeStats.speed}%`,
      player.ether,
    );

    // Подсказка закрытия
    ctx.font = "11px Arial";
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.fillText(
      "Нажмите [U] чтобы закрыть",
      panelX + panelWidth / 2,
      panelY + panelHeight - 15,
    );
    ctx.textAlign = "left";
  }

  /**
   * Рендеринг панели башни
   */
  private renderTowerPanel(
    ctx: CanvasRenderingContext2D,
    player: PlayerState,
  ): void {
    const tower = this.towers.get(player.towerId);
    if (!tower) return;

    const panelX = 10;
    const panelY = 60;
    const panelWidth = 280;
    const panelHeight = 200;

    // Фон панели
    ctx.fillStyle = "rgba(0, 0, 0, 0.85)";
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);

    // Рамка
    ctx.strokeStyle = tower.color;
    ctx.lineWidth = 2;
    ctx.strokeRect(panelX, panelY, panelWidth, panelHeight);

    // Заголовок
    ctx.font = "bold 16px Arial";
    ctx.fillStyle = tower.color;
    ctx.textAlign = "center";
    ctx.fillText("🏰 Главная башня", panelX + panelWidth / 2, panelY + 25);

    // Информация об улучшении
    const upgradeInfo = UpgradeSystem.getTowerUpgradeInfo(player, tower.level);

    ctx.textAlign = "left";
    ctx.font = "14px Arial";

    // Текущий уровень
    const stars =
      "★".repeat(tower.level) + "☆".repeat(upgradeInfo.maxLevel - tower.level);
    ctx.fillStyle = "#ffd700";
    ctx.fillText(`Уровень: ${stars}`, panelX + 15, panelY + 55);

    // Текущие характеристики
    ctx.fillStyle = "#ffffff";
    ctx.fillText(
      `HP: ${tower.health.current}/${tower.health.max}`,
      panelX + 15,
      panelY + 80,
    );
    ctx.fillText(`DPS: ${tower.combat.dps}`, panelX + 15, panelY + 100);

    // Улучшение
    if (tower.isUpgrading) {
      const remainingTime = Math.max(
        0,
        Math.ceil((tower.upgradeEndTime - Date.now()) / 1000),
      );
      ctx.fillStyle = "#ffff00";
      ctx.fillText(
        `⏳ Улучшение: ${remainingTime} сек...`,
        panelX + 15,
        panelY + 130,
      );
    } else if (tower.level < upgradeInfo.maxLevel) {
      ctx.fillStyle = "#888";
      ctx.fillText("Следующий уровень:", panelX + 15, panelY + 125);

      ctx.fillStyle = "#00ff00";
      ctx.fillText(
        `HP: ${upgradeInfo.currentHp} → ${upgradeInfo.nextHp}`,
        panelX + 25,
        panelY + 145,
      );
      ctx.fillText(
        `DPS: ${upgradeInfo.currentDps} → ${upgradeInfo.nextDps}`,
        panelX + 25,
        panelY + 165,
      );

      // Кнопка улучшения
      ctx.fillStyle = upgradeInfo.canUpgrade ? "#00ffff" : "#444";
      ctx.font = "bold 13px Arial";
      ctx.fillText(
        `[T] Улучшить (${upgradeInfo.cost} ⚡, ${upgradeInfo.upgradeTime}с)`,
        panelX + 15,
        panelY + panelHeight - 20,
      );
    } else {
      ctx.fillStyle = "#00ff00";
      ctx.font = "bold 14px Arial";
      ctx.fillText("✓ Максимальный уровень!", panelX + 15, panelY + 130);
    }

    // Подсказка
    ctx.font = "11px Arial";
    ctx.fillStyle = "#666";
    ctx.textAlign = "center";
    ctx.fillText(
      "Нажмите [T] для улучшения / закрытия",
      panelX + panelWidth / 2,
      panelY + panelHeight - 5,
    );
    ctx.textAlign = "left";
  }

  /**
   * Рендеринг строки улучшения
   */
  private renderUpgradeLine(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    key: string,
    name: string,
    info: {
      level: number;
      maxLevel: number;
      cost: number;
      canUpgrade: boolean;
      currentBonus: number;
    },
    currentValue: string,
    playerEther: number,
  ): void {
    // Клавиша
    ctx.fillStyle = info.canUpgrade ? "#00ffff" : "#444";
    ctx.font = "bold 14px Arial";
    ctx.fillText(`[${key}]`, x, y);

    // Название
    ctx.fillStyle = "#ffffff";
    ctx.font = "13px Arial";
    ctx.fillText(name, x + 35, y);

    // Уровень (звёздочки)
    const stars =
      "★".repeat(info.level) + "☆".repeat(MAX_UPGRADE_LEVEL - info.level);
    ctx.fillStyle = "#ffd700";
    ctx.fillText(stars, x + 130, y);

    // Текущее значение
    ctx.fillStyle = "#00ff00";
    ctx.fillText(currentValue, x + 200, y);

    // Бонус
    if (info.currentBonus > 0) {
      ctx.fillStyle = "#88ff88";
      ctx.font = "11px Arial";
      ctx.fillText(`(+${info.currentBonus}%)`, x + 250, y);
    }

    // Стоимость следующего уровня
    if (info.level < info.maxLevel) {
      ctx.font = "11px Arial";
      ctx.fillStyle = playerEther >= info.cost ? "#ffff00" : "#ff4444";
      ctx.fillText(`${info.cost} ⚡`, x + 35, y + 18);
    } else {
      ctx.font = "11px Arial";
      ctx.fillStyle = "#00ff00";
      ctx.fillText("MAX", x + 35, y + 18);
    }
  }

  /**
   * Обновление подсветки дороги или ресурсной точки под мышью
   */
  private updateSelectionHighlight(): void {
    // Сначала проверяем ресурсные точки (приоритет над дорогами)
    let foundResourcePoint = false;
    for (const point of this.resourcePoints.values()) {
      const distance = Math.sqrt(
        Math.pow(this.mousePosition.x - point.position.x, 2) +
          Math.pow(this.mousePosition.y - point.position.y, 2),
      );

      if (distance <= point.size + 20) {
        this.selectedResourcePointId = point.id;
        foundResourcePoint = true;
        break;
      }
    }

    if (!foundResourcePoint) {
      this.selectedResourcePointId = null;
    }

    // Затем проверяем дороги (только если не выбрана точка)
    let foundRoad = false;
    if (!foundResourcePoint) {
      for (const road of this.roads.values()) {
        if (road.isPointNearRoad(this.mousePosition)) {
          road.highlight();
          this.selectedRoadId = road.id;
          foundRoad = true;
        } else {
          road.unhighlight();
        }
      }
    } else {
      // Снять подсветку с дорог если выбрана точка
      for (const road of this.roads.values()) {
        road.unhighlight();
      }
    }

    if (!foundRoad && !foundResourcePoint) {
      this.selectedRoadId = null;
    }
  }

  /**
   * Снятие подсветки со всех объектов
   */
  private clearSelectionHighlight(): void {
    for (const road of this.roads.values()) {
      road.unhighlight();
    }
    this.selectedRoadId = null;
    this.selectedResourcePointId = null;
  }

  /**
   * Обработка клика
   */
  private handleClick(_position: Position): void {
    // Приоритет: ресурсная точка > дорога
    if (this.selectedResourcePointId) {
      this.spawnUnitToResourcePoint(
        this.selectedUnitType,
        this.selectedResourcePointId,
      );
    } else if (this.selectedRoadId) {
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
      case "u":
      case "U":
        // Toggle upgrade panel
        this.showUpgradePanel = !this.showUpgradePanel;
        this.showTowerPanel = false; // Close other panel
        break;
      case "q":
      case "Q":
        // Upgrade HP
        if (this.showUpgradePanel) {
          this.upgradeUnit(this.selectedUnitType, "hp");
        }
        break;
      case "w":
      case "W":
        // Upgrade DPS
        if (this.showUpgradePanel) {
          this.upgradeUnit(this.selectedUnitType, "dps");
        }
        break;
      case "e":
      case "E":
        // Upgrade Speed
        if (this.showUpgradePanel) {
          this.upgradeUnit(this.selectedUnitType, "speed");
        }
        break;
      case "r":
      case "R":
        // Unlock unit
        this.unlockUnit(this.selectedUnitType);
        break;
      case "t":
      case "T":
        // Tower upgrade panel / upgrade
        if (this.showTowerPanel) {
          this.upgradeTower();
        } else {
          this.showTowerPanel = true;
          this.showUpgradePanel = false; // Close other panel
        }
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
      case "Escape":
        // Close all panels
        this.showUpgradePanel = false;
        this.showTowerPanel = false;
        break;
    }
  }

  /**
   * Улучшить юнита
   */
  private upgradeUnit(unitType: UnitType, upgradeType: UpgradeType): void {
    const player = this.players.get(this.localPlayerId);
    if (!player || !player.isAlive) return;

    const success = UpgradeSystem.applyUpgrade(player, unitType, upgradeType);
    if (success) {
      const upgradeName = UpgradeSystem.getUpgradeName(upgradeType);
      const unitName = UNIT_CONFIG[unitType].name;
      console.log(`Улучшено: ${unitName} - ${upgradeName}`);
    }
  }

  /**
   * Улучшить башню
   */
  private upgradeTower(): void {
    const player = this.players.get(this.localPlayerId);
    if (!player || !player.isAlive) return;

    const tower = this.towers.get(player.towerId);
    if (!tower || tower.isUpgrading) return;

    const upgradeInfo = UpgradeSystem.getTowerUpgradeInfo(player, tower.level);
    if (!upgradeInfo.canUpgrade) return;

    // Снимаем ресурсы
    player.ether -= upgradeInfo.cost;

    // Запускаем улучшение
    tower.upgrade();

    console.log(`Улучшение башни до уровня ${tower.level + 1}...`);
  }

  /**
   * Разблокировать юнита
   */
  private unlockUnit(unitType: UnitType): void {
    const player = this.players.get(this.localPlayerId);
    if (!player || !player.isAlive) return;

    const success = UpgradeSystem.unlockUnit(player, unitType);
    if (success) {
      const unitName = UNIT_CONFIG[unitType].name;
      console.log(`Разблокирован: ${unitName}`);
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

    // Получаем улучшенные характеристики
    const upgradedStats = UpgradeSystem.getUpgradedStats(player, unitType);

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
      upgradedStats,
    );

    unit.waypoints = waypoints;
    unit.targetRoadId = roadId;
    unit.targetTowerId = targetTowerId;
    unit.currentWaypointIndex = 1; // Начинаем с 1, т.к. 0 - это стартовая позиция

    this.units.set(unitId, unit);
  }

  /**
   * Создание юнита для захвата ресурсной точки
   */
  spawnUnitToResourcePoint(
    unitType: UnitType,
    resourcePointId: ResourcePointId,
  ): void {
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

    // Получаем ресурсную точку
    const resourcePoint = this.resourcePoints.get(resourcePointId);
    if (!resourcePoint) return;

    // Получаем башню игрока
    const playerTower = this.towers.get(player.towerId);
    if (!playerTower) return;

    // Снимаем ресурсы
    player.ether -= unitConfig.cost;

    // Получаем улучшенные характеристики
    const upgradedStats = UpgradeSystem.getUpgradedStats(player, unitType);

    // Создаём юнита у башни
    const unitId = generateId();
    const startPos = playerTower.position.toObject();

    const unit = new Unit(
      unitId,
      unitType,
      this.localPlayerId,
      this.playerOrder.indexOf(this.localPlayerId),
      startPos.x,
      startPos.y,
      upgradedStats,
    );

    // Устанавливаем путь к ресурсной точке (прямое движение)
    unit.waypoints = [
      { position: startPos, index: 0 },
      { position: resourcePoint.position.toObject(), index: 1 },
    ];
    unit.targetRoadId = ""; // Нет дороги
    unit.targetTowerId = ""; // Нет целевой башни
    unit.currentWaypointIndex = 1;

    // Помечаем что юнит идёт к ресурсной точке
    unit.guardingPointId = resourcePointId; // Используем это поле для указания цели

    this.units.set(unitId, unit);

    console.log(`${unitConfig.name} отправлен к ${resourcePoint.config.name}`);
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
