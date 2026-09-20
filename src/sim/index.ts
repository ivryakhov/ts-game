/** Публичная граница ядра симуляции — сейм, на котором живут все тесты. */
export { runMatch } from './match.js';
export type {
  CitadelSpec,
  EndReason,
  GameMap,
  MatchEvent,
  MatchResult,
  MatchSetup,
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
