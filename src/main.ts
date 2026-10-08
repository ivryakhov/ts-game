/**
 * Точка входа браузерной сборки: холст, Подготовка, матч, цикл кадров
 * и управление временем.
 *
 * Игра открывается Подготовкой; матч создаётся заново на каждый старт.
 * Симуляция идёт фиксированным Тиком, экран обновляется чаще и сглаживает
 * положение Юнитов между Тиками. Пауза и ускорение меняют только число
 * Тиков за кадр, поэтому на исход матча не влияют (ADR-0001).
 */
import { createMatch, DEFAULT_BEHAVIOUR, TICKS_PER_SECOND } from '@sim/index';
import type {
  Behaviour,
  LiveMatch,
  MatchSetup,
  ScheduledRelease,
  Seed,
  SideId,
  UnitId,
  UnitKind,
  WorldSnapshot,
} from '@sim/index';
import { bindTimeControls } from './app/controls.js';
import { createPacer, STARTING_SPEED } from './app/pacer.js';
import { playerSide } from './app/player-side.js';
import { bindPointer } from './app/pointer.js';
import { lineupOf, namesOf, type Lineup } from './app/lineup.js';
import { loadOpponents } from './app/opponents.js';
import { parsePresets, type Preset } from './app/presets.js';
import { createReleaseLog, outcomeOf, type PlayedMatch } from './app/replay.js';
import { freshSeed } from './app/seed.js';
import { playTicks } from './app/ticks.js';

import { bindUnitChoice } from './app/unit-choice.js';
import playerFile from './behaviours/player.json';
import presetsFile from './behaviours/presets.json';
import { arena } from './maps/arena.js';
import { createCanvasRenderer } from './render/canvas-renderer.js';
import { allyFromAddress, examFromPage, opponentFromAddress, rememberAlly, rememberOpponent, rememberSeed, seedFromAddress } from './ui/address.js';
import { readEvolved } from './ui/evolved.js';
import { PREVIEW_ID, readPreview } from './ui/preview.js';
import { matchSetupOf, seedOf, showcaseLabel, type ExamMatch } from './app/exam-match.js';
import { createHud } from './ui/hud.js';
import { createInspector } from './ui/inspector.js';
import { bindOutcomeActions } from './ui/outcome.js';
import { createPrep } from './ui/prep.js';
import { createMatchReview } from './ui/review.js';
import { readSaved, writeSaved } from './ui/saved.js';

/**
 * Предел матча — двадцать минут. Матч кончается разрушением Цитадели;
 * предел нужен только затем, чтобы равный матч не шёл вечно.
 */
const MATCH_LIMIT_TICKS = 20 * 60 * TICKS_PER_SECOND;

/** За кого играет человек. Выбор Стороны появится вместе с меню матча. */
const PLAYER_SIDE: SideId = 'A';
const OPPONENT_SIDE: SideId = 'B';

const canvas = document.querySelector<HTMLCanvasElement>('#stage');
if (!canvas) throw new Error('Не найден холст #stage');

const renderer = createCanvasRenderer(canvas, arena, PLAYER_SIDE);
const hud = createHud(PLAYER_SIDE);
/** Заготовки негодными быть не должны, но если файл испорчен — без них, а не без игры. */
let presets: readonly Preset[] = [];
let presetsProblem: string | null = null;
try {
  presets = parsePresets(presetsFile);
} catch (error) {
  presetsProblem = `Файл presets.json отвергнут — ${error instanceof Error ? error.message : String(error)}.`;
}

// Готовые Противники из файлов и Выведенные в Лаборатории — из браузера.
const files = loadOpponents(arena, OPPONENT_SIDE);
const evolved = readEvolved(arena, OPPONENT_SIDE, files.opponents.map((opponent) => opponent.id));
// Претендент Лаборатории — когда адрес его просит: за себя (Матч Экзамена)
// или Противником, выбранным на Подготовке и запомненным в адресе.
const preview = [allyFromAddress(), opponentFromAddress()].includes(PREVIEW_ID) ? readPreview(arena, OPPONENT_SIDE) : null;
const roster = {
  opponents: [...files.opponents, ...evolved.opponents, ...(preview && 'opponent' in preview ? [preview.opponent] : [])],
  problems: [...files.problems, ...evolved.problems, ...(preview && 'problem' in preview ? [preview.problem] : [])],
};
const exam = examFromPage();
/** Матч Экзамена — пока за игрока играет Претендент из Лаборатории. */
const examNow = (): ExamMatch | null => (exam && lineup.ally?.id === PREVIEW_ID ? exam : null);
/** Кто играет за обе Стороны: выбор на Подготовке, запомненный в адресе. */
const lineupFor = (names: { ally: string | null; opponent: string | null }): Lineup =>
  lineupOf(roster.opponents, names, PLAYER_SIDE, OPPONENT_SIDE);
let lineup = lineupFor({ ally: allyFromAddress(), opponent: opponentFromAddress() });

const prep = createPrep({
  onStart(next, behaviour) {
    if (behaviour) playerBehaviour = behaviour;
    startMatch(next);
  },
  onRepeat(behaviour) {
    playerBehaviour = behaviour;
    repeatReleases();
  },
  onEdit: writeSaved,
  onOpponent(id) {
    lineup = lineupFor({ ...namesOf(lineup), opponent: id });
    rememberOpponent(id);
  },
  onAlly(id) {
    lineup = lineupFor({ ...namesOf(lineup), ally: id });
    rememberAlly(id);
  },
  presets,
  opponents: roster.opponents,
});
for (const problem of roster.problems) prep.warn(problem);
if (presetsProblem) prep.warn(presetsProblem);
const review = createMatchReview(PLAYER_SIDE);
const outcome = bindOutcomeActions({
  replay: () => startMatch(seed),
  repeat: () => repeatReleases(),
  edit: () => openPrep(),
  newSeed: () => startMatch(freshSeed(seed)),
});

const player = playerSide(PLAYER_SIDE, playerFile, arena, readSaved(), (message, keep) => {
  if (!keep) hud.warn(message);
  prep.warn(message, keep);
});
/**
 * Поведение игрока — то, с которым начат последний матч: с Подготовки,
 * а до первого старта — сохранённое или из файла. «Переиграть» берёт его же.
 */
let playerBehaviour: Behaviour = player.behaviour;
prep.setPlayer(playerBehaviour, player.file);

/**
 * Матч получает копии Сторон: что бы ни случилось с Поведением на
 * Подготовке после старта, идущий матч оно не задевает.
 */
const setupFor = (seed: Seed, releases: readonly ScheduledRelease[] = []): MatchSetup => {
  const [mine, theirs] = lineup.sides({ ...player.side, behaviour: playerBehaviour });
  const sides = [structuredClone(mine), structuredClone(theirs)] as const;
  return matchSetupOf({ seed, map: arena, sides, releases: [...releases], maxTicks: MATCH_LIMIT_TICKS }, examNow());
};

/** Выпуски игрока в живых матчах — для повтора того же матча. */
const log = createReleaseLog();

/** Подготовка или матч. На Подготовке время стоит и ввод матча молчит. */
let phase: 'prep' | 'match' = 'prep';
// У Матча Экзамена Сид — Экзамена с самого начала: его и покажет Подготовка.
let seed: Seed = seedOf(examNow(), seedFromAddress());
let setup: MatchSetup = setupFor(seed);
let match: LiveMatch = createMatch(setup);

const pacer = createPacer(TICKS_PER_SECOND, STARTING_SPEED);
/** Какой тип Юнита уйдёт по следующему клику. Переключается клавишами 1-3. */
let chosenKind: UnitKind = 'scout';

/** Юнит, чьё Поведение игрок разбирает. */
let selectedUnit: UnitId | null = null;

/** Поведение Стороны — то самое, что передано в матч, а не вторая копия. */
const behaviourOf = (side: SideId): Behaviour =>
  setup.sides.find((entry) => entry.id === side)?.behaviour ?? DEFAULT_BEHAVIOUR;
const inspector = createInspector(behaviourOf);
const inMatch = (): boolean => phase === 'match' && !match.finished;
/** Матч, где игрок сам выпускает Юнитов: в повторе они выходят по журналу, в Показательном — Волнами. */
const playing = (): boolean => inMatch() && !log.replaying && !lineup.showcase;

const pointer = bindPointer(canvas, renderer, {
  onRelease(roadId) {
    if (!playing()) return;
    const release = match.deploy({ side: PLAYER_SIDE, kind: 'deploy', roadId, unit: chosenKind });
    if (release) log.record(release);
  },
  onSelect(unit) {
    if (phase === 'match') selectedUnit = unit;
  },
  selected: () => selectedUnit,
});

let previous: WorldSnapshot = match.snapshot();
let current: WorldSnapshot = match.snapshot();
let lastFrameMs = performance.now();
/** Исход этого матча уже записан в журнал. */
let announced = false;

/** Новый матч с теми же Сторонами. Сид попадает в адрес — матч можно повторить. */
function startMatch(next: Seed, replay: PlayedMatch | null = null, against = lineup): void {
  lineup = against;
  // У Матча Экзамена Сид — Экзамена: его и показывать, и записывать.
  seed = seedOf(examNow(), next);
  if (!replay) log.beginLive(seed, namesOf(lineup));
  rememberSeed(seed);
  if (lineup.opponent) rememberOpponent(lineup.opponent.id);
  rememberAlly(lineup.ally?.id ?? null);
  setup = setupFor(seed, replay?.releases);
  match = createMatch(setup);
  announced = false;
  previous = match.snapshot();
  current = previous;
  selectedUnit = null;
  pacer.restart();
  phase = 'match';
  document.body.dataset['phase'] = phase;
  prep.hide();
}

/** Тот же матч: Сид, противник и Выпуски последнего живого, Правила — текущие. */
function repeatReleases(): void {
  const played = log.beginReplay();
  if (played) startMatch(played.seed, played, lineupFor(played));
}

function openPrep(): void {
  phase = 'prep';
  document.body.dataset['phase'] = phase;
  selectedUnit = null;
  prep.show(seed, namesOf(lineup), log.last !== null);
}

function fit(): void {
  renderer.resize(window.innerWidth, window.innerHeight);
}

function frame(nowMs: number): void {
  const delta = nowMs - lastFrameMs;
  lastFrameMs = nowMs;
  const due = phase === 'match' ? pacer.advance(delta) : 0;

  const played = playTicks(match, due, { previous, current }, PLAYER_SIDE);
  ({ previous, current } = played);
  if (played.refused) hud.refuse();
  const { deaths, citadelHits, obelisksTaken } = played;

  // Когда матч кончился, стоит на паузе или ещё не начат, сглаживать
  // нечего: иначе доля кадра продолжает бегать от нуля к единице, и
  // картинка вечно дёргается между двумя разными снимками.
  const still = phase === 'prep' || match.finished || pacer.paused;
  if (still) previous = current;
  const alpha = still ? 0 : pacer.alpha;

  // Анимации живут по времени матча, а не по часам: иначе свечение
  // на Дорогах продолжало бы бежать на паузе и не ускорялось бы вместе
  // с симуляцией.
  const matchMs = ((current.tick + alpha) * 1000) / TICKS_PER_SECOND;
  renderer.draw({
    previous,
    current,
    deaths,
    citadelHits,
    obelisksTaken,
    alpha,
    matchMs,
    realMs: nowMs,
    highlightedRoad: inMatch() ? pointer.hovered : null,
    selectedUnit,
  });

  // Выделенный погиб или дошёл до конца — выделение снимается само.
  const selected = current.units.find((unit) => unit.id === selectedUnit) ?? null;
  if (!selected) selectedUnit = null;
  inspector.show(selected, current);
  const purse = current.ether.find((entry) => entry.side === PLAYER_SIDE);
  const foe = current.ether.find((entry) => entry.side !== PLAYER_SIDE);
  hud.update({
    tick: current.tick,
    speed: pacer.speed,
    paused: pacer.paused,
    seed,
    ether: purse?.amount ?? 0,
    incomePerSecond: purse?.incomePerSecond ?? 0,
    foeIncomePerSecond: foe?.incomePerSecond ?? 0,
    chosenKind,
    replaying: phase === 'match' && log.replaying,
    showcase: phase === 'match' && lineup.showcase ? showcaseLabel(examNow(), lineup.opponent?.side.waves?.length ?? 0) : null,
  });
  const ended = phase === 'match' && match.finished;
  const names = lineup.ally && { own: lineup.ally.name, foe: lineup.opponent?.name ?? 'Противник' };
  const now = ended ? outcomeOf(match.winner, current) : null;
  if (now && !announced) {
    announced = true;
    log.finish(now);
    review.fill(match.result().stats.sides, setup.sides, names ? { mine: names.own, theirs: names.foe } : undefined);
  }
  hud.announce(now && { now, original: log.replaying ? (log.last?.outcome ?? null) : null, names });
  outcome.show(ended, lineup.showcase, examNow() !== null);
  window.requestAnimationFrame(frame);
}

fit();
bindTimeControls(pacer, inMatch);
bindUnitChoice((kind) => {
  chosenKind = kind;
}, playing);
window.addEventListener('resize', fit);
openPrep();
window.requestAnimationFrame(frame);
