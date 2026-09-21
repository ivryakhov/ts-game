/** Публичная граница ядра симуляции — сейм, на котором живут все тесты. */
export { createMatch, runMatch, type LiveMatch } from './match.js';
export { measureRoad, roadPolyline, type RoadMetrics } from './geometry.js';
export { TICKS_PER_SECOND, UNIT_COST } from './balance.js';
export type {
  CitadelSnapshot,
  CitadelSpec,
  DeployAction,
  EtherSnapshot,
  EndReason,
  GameMap,
  MatchEvent,
  MatchResult,
  MatchSetup,
  MapSize,
  MatchStats,
  Point,
  UnscheduledAction,
  RefusalReason,
  ResourcePointSpec,
  RoadSpec,
  ScheduledAction,
  Seed,
  SideId,
  SideSetup,
  UnitId,
  UnitSnapshot,
  UnitState,
  WorldSnapshot,
} from './types.js';
