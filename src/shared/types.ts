/**
 * Neon Arcana - Общие типы
 * Этот файл используется и клиентом, и сервером
 */

import { UnitType } from './constants';

// ===========================================
// БАЗОВЫЕ ТИПЫ
// ===========================================

/** ID игрока */
export type PlayerId = string;

/** ID сущности */
export type EntityId = string;

/** ID дороги */
export type RoadId = string;

/** ID ресурсной точки */
export type ResourcePointId = string;

// ===========================================
// ПОЗИЦИЯ И ГЕОМЕТРИЯ
// ===========================================

/** Простая позиция (для сериализации) */
export interface Position {
  x: number;
  y: number;
}

/** Прямоугольник */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// ===========================================
// ИГРОК
// ===========================================

/** Состояние игрока */
export interface PlayerState {
  id: PlayerId;
  name: string;
  color: string;
  ether: number;
  incomePerSec: number;
  isAlive: boolean;
  towerId: EntityId;

  /** Разблокированные юниты */
  unlockedUnits: UnitType[];

  /** Уровни улучшений юнитов [тип юнита -> { hp, dps, speed }] */
  unitUpgrades: Record<UnitType, UnitUpgrades>;

  /** Время последней агрессии (для штрафа к доходу) */
  lastAggressionTime: number;
}

/** Уровни улучшений юнита */
export interface UnitUpgrades {
  hp: number;    // уровень 0-3
  dps: number;   // уровень 0-3
  speed: number; // уровень 0-3
}

// ===========================================
// БАШНИ
// ===========================================

/** Тип башни */
export enum TowerType {
  MAIN = 'main',
  DEFENSIVE = 'defensive',
  BUFF = 'buff',
  ECONOMIC = 'economic',
}

/** Состояние башни */
export interface TowerState {
  id: EntityId;
  type: TowerType;
  ownerId: PlayerId;
  position: Position;
  hp: number;
  maxHp: number;
  dps: number;
  level: number;
  attackRange: number;

  /** Башня в процессе улучшения */
  isUpgrading: boolean;
  upgradeEndTime: number;

  /** Текущая цель */
  targetId: EntityId | null;
}

// ===========================================
// ЮНИТЫ
// ===========================================

/** Состояние юнита */
export interface UnitState {
  id: EntityId;
  type: UnitType;
  ownerId: PlayerId;
  position: Position;

  /** Характеристики */
  hp: number;
  maxHp: number;
  dps: number;
  speed: number;
  attackRange: number;

  /** Движение */
  targetRoadId: RoadId;
  targetTowerId: EntityId;
  currentWaypointIndex: number;

  /** Состояние */
  state: UnitBehaviorState;
  targetId: EntityId | null;
  targetPosition?: Position;

  /** Для поддержки: цель лечения */
  healTargetId: EntityId | null;

  /** Охрана ресурсной точки */
  guardingPointId: ResourcePointId | null;
  isRecalling: boolean;
  recallEndTime: number;
}

/** Состояние поведения юнита */
export enum UnitBehaviorState {
  SPAWNING = 'spawning',
  MOVING = 'moving',
  FIGHTING = 'fighting',
  GUARDING = 'guarding',
  DEAD = 'dead',
}

// ===========================================
// ДОРОГИ
// ===========================================

/** Путевая точка дороги */
export interface Waypoint {
  position: Position;
  /** Индекс этой точки в массиве */
  index: number;
}

/** Состояние дороги */
export interface RoadState {
  id: RoadId;

  /** Башни, которые соединяет дорога */
  fromTowerId: EntityId;
  toTowerId: EntityId;

  /** Путевые точки для движения */
  waypoints: Waypoint[];

  /** Длина дороги в пикселях */
  length: number;
}

// ===========================================
// РЕСУРСНЫЕ ТОЧКИ
// ===========================================

/** Тип ресурсной точки */
export enum ResourcePointType {
  CRYSTAL_MINE = 'crystal_mine',
  SMALL_CRYSTAL = 'small_crystal',
  NEUTRAL_CAMP = 'neutral_camp',
}

/** Состояние ресурсной точки */
export interface ResourcePointState {
  id: ResourcePointId;
  type: ResourcePointType;
  position: Position;

  /** Владелец (null = нейтральная) */
  ownerId: PlayerId | null;

  /** Нейтральные защитники */
  guardians: NeutralGuardian[];

  /** Юниты игрока, охраняющие точку */
  guardUnitIds: EntityId[];

  /** Время следующего респавна нейтралов */
  nextRespawnTime: number;

  /** Количество респавнов (для escalation) */
  respawnCount: number;
}

/** Нейтральный защитник */
export interface NeutralGuardian {
  id: EntityId;
  hp: number;
  maxHp: number;
  dps: number;
  position: Position;
  targetId: EntityId | null;
}

// ===========================================
// ПРЕПЯТСТВИЯ
// ===========================================

/** Тип препятствия */
export enum ObstacleType {
  BARRICADE = 'barricade',
  SLOW_ZONE = 'slow_zone',
  NEUTRAL_POST = 'neutral_post',
}

/** Состояние препятствия */
export interface ObstacleState {
  id: EntityId;
  type: ObstacleType;
  position: Position;
  hp?: number;
  maxHp?: number;
  isDestroyed: boolean;
}

// ===========================================
// СНАРЯДЫ (для визуализации)
// ===========================================

/** Состояние снаряда */
export interface ProjectileState {
  id: EntityId;
  fromPosition: Position;
  toPosition: Position;
  startTime: number;
  duration: number;
  color: string;
}

// ===========================================
// ПОЛНОЕ СОСТОЯНИЕ ИГРЫ
// ===========================================

/** Полное состояние игры */
export interface GameState {
  /** Текущий тик сервера */
  tick: number;

  /** Время матча (секунды с начала) */
  matchTime: number;

  /** Состояние матча */
  matchStatus: MatchStatus;

  /** Игроки */
  players: Record<PlayerId, PlayerState>;

  /** Башни */
  towers: Record<EntityId, TowerState>;

  /** Юниты */
  units: Record<EntityId, UnitState>;

  /** Дороги */
  roads: Record<RoadId, RoadState>;

  /** Ресурсные точки */
  resourcePoints: Record<ResourcePointId, ResourcePointState>;

  /** Препятствия */
  obstacles: Record<EntityId, ObstacleState>;

  /** Снаряды (для визуализации) */
  projectiles: ProjectileState[];

  /** ID победителя (если игра окончена) */
  winnerId: PlayerId | null;
}

/** Статус матча */
export enum MatchStatus {
  WAITING = 'waiting',
  STARTING = 'starting',
  IN_PROGRESS = 'in_progress',
  FINISHED = 'finished',
}

// ===========================================
// ДЕЙСТВИЯ ИГРОКА (КЛИЕНТ -> СЕРВЕР)
// ===========================================

/** Базовое действие */
interface BaseAction {
  playerId: PlayerId;
  tick: number;
}

/** Создание юнита */
export interface SpawnUnitAction extends BaseAction {
  type: 'spawn_unit';
  unitType: UnitType;
  roadId: RoadId;
}

/** Улучшение юнита */
export interface UpgradeUnitAction extends BaseAction {
  type: 'upgrade_unit';
  unitType: UnitType;
  upgradeType: 'hp' | 'dps' | 'speed';
}

/** Разблокировка юнита */
export interface UnlockUnitAction extends BaseAction {
  type: 'unlock_unit';
  unitType: UnitType;
}

/** Улучшение башни */
export interface UpgradeTowerAction extends BaseAction {
  type: 'upgrade_tower';
}

/** Постройка вспомогательной башни */
export interface BuildSupportTowerAction extends BaseAction {
  type: 'build_support_tower';
  towerType: TowerType.DEFENSIVE | TowerType.BUFF | TowerType.ECONOMIC;
}

/** Отзыв охраны */
export interface RecallGuardsAction extends BaseAction {
  type: 'recall_guards';
  resourcePointId: ResourcePointId;
  roadId: RoadId;
}

/** Все возможные действия игрока */
export type PlayerAction =
  | SpawnUnitAction
  | UpgradeUnitAction
  | UnlockUnitAction
  | UpgradeTowerAction
  | BuildSupportTowerAction
  | RecallGuardsAction;

// ===========================================
// СОБЫТИЯ ИГРЫ (СЕРВЕР -> КЛИЕНТ)
// ===========================================

/** Юнит создан */
export interface UnitSpawnedEvent {
  type: 'unit_spawned';
  unit: UnitState;
}

/** Юнит погиб */
export interface UnitDiedEvent {
  type: 'unit_died';
  unitId: EntityId;
  killerId: EntityId | null;
}

/** Нанесён урон */
export interface DamageDealtEvent {
  type: 'damage_dealt';
  targetId: EntityId;
  damage: number;
  attackerId: EntityId;
}

/** Башня уничтожена */
export interface TowerDestroyedEvent {
  type: 'tower_destroyed';
  towerId: EntityId;
  ownerId: PlayerId;
}

/** Ресурсная точка захвачена */
export interface ResourcePointCapturedEvent {
  type: 'resource_point_captured';
  pointId: ResourcePointId;
  newOwnerId: PlayerId | null;
  previousOwnerId: PlayerId | null;
}

/** Игрок выбыл */
export interface PlayerEliminatedEvent {
  type: 'player_eliminated';
  playerId: PlayerId;
  place: number;
}

/** Игра окончена */
export interface GameOverEvent {
  type: 'game_over';
  winnerId: PlayerId | null;
  reason: 'tower_destroyed' | 'timeout' | 'disconnect';
}

/** Все возможные игровые события */
export type GameEvent =
  | UnitSpawnedEvent
  | UnitDiedEvent
  | DamageDealtEvent
  | TowerDestroyedEvent
  | ResourcePointCapturedEvent
  | PlayerEliminatedEvent
  | GameOverEvent;

// ===========================================
// СЕТЕВЫЕ СООБЩЕНИЯ
// ===========================================

/** Сообщение от клиента к серверу */
export type ClientMessage =
  | { type: 'join'; playerName: string }
  | { type: 'ready' }
  | { type: 'action'; action: PlayerAction }
  | { type: 'ping'; timestamp: number };

/** Сообщение от сервера к клиенту */
export type ServerMessage =
  | { type: 'joined'; playerId: PlayerId; roomId: string }
  | { type: 'player_joined'; player: PlayerState }
  | { type: 'player_left'; playerId: PlayerId }
  | { type: 'game_starting'; countdown: number }
  | { type: 'game_state'; state: GameState }
  | { type: 'events'; events: GameEvent[] }
  | { type: 'pong'; timestamp: number; serverTime: number }
  | { type: 'error'; message: string };

// ===========================================
// УТИЛИТЫ
// ===========================================

/** Генерация уникального ID */
export function generateId(): EntityId {
  return Math.random().toString(36).substring(2, 15) +
    Math.random().toString(36).substring(2, 15);
}

/** Создание начальных улучшений юнита */
export function createInitialUpgrades(): UnitUpgrades {
  return { hp: 0, dps: 0, speed: 0 };
}

/** Создание начального состояния улучшений для всех юнитов */
export function createInitialUnitUpgrades(): Record<UnitType, UnitUpgrades> {
  return {
    [UnitType.SCOUT]: createInitialUpgrades(),
    [UnitType.TANK]: createInitialUpgrades(),
    [UnitType.RANGER]: createInitialUpgrades(),
    [UnitType.SUPPORT]: createInitialUpgrades(),
  };
}
