/** Публичная граница ядра симуляции — сейм, на котором живут все тесты. */
export { runMatch } from './match.js';
export { roadPolyline } from './geometry.js';
export type {
  CitadelSpec,
  EndReason,
  GameMap,
  MatchEvent,
  MatchResult,
  MatchSetup,
  MapSize,
  MatchStats,
  Point,
  ResourcePointSpec,
  RoadSpec,
  ScheduledAction,
  Seed,
  SideId,
  SideSetup,
  WorldSnapshot,
} from './types.js';
