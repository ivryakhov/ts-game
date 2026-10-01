/** Публичная граница ядра симуляции — сейм, на котором живут все тесты. */
export { createMatch, runMatch, type LiveMatch } from './match.js';
export { measureRoad, roadPolyline, type RoadMetrics } from './geometry.js';
export { sideFromFile } from './side-file.js';
export type { Wave } from './waves.js';
export {
  DEFAULT_BEHAVIOUR,
  conditionsOf,
  isFallback,
  parseBehaviour,
  type Action,
  type Behaviour,
  type Condition,
  type JointCondition,
  type Rule,
} from './rules.js';
export {
  BODY_RADIUS,
  CITADEL_RADIUS,
  CITADEL_STATS,
  ECONOMY,
  MELEE_GAP,
  MELEE_RANGE,
  NEARBY_RANGE,
  TICKS_PER_SECOND,
  UNIT_KINDS,
  UNIT_STATS,
} from './balance.js';
export type { UnitKind, UnitStats } from './balance.js';
export type {
  CitadelSnapshot,
  CitadelSpec,
  Release,
  EtherSnapshot,
  EndReason,
  GameMap,
  Killer,
  MatchEvent,
  MatchResult,
  MatchSetup,
  MapSize,
  MatchStats,
  Point,
  UnscheduledRelease,
  RefusalReason,
  ResourcePointSpec,
  RoadSpec,
  ScheduledRelease,
  Seed,
  SideId,
  SideSetup,
  UnitId,
  UnitSnapshot,
  UnitState,
  WorldSnapshot,
} from './types.js';
