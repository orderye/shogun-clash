/**
 * 在 Node 中加载浏览器端的 js/data.js 与 js/game.js。
 *
 * 关键点：
 * 1. 两个文件都是经典 <script>（非 ESM），内部用顶层 const 互相引用。
 *    用同一个 vm context 顺序执行即可复现浏览器的全局词法作用域语义。
 * 2. game.js 零 DOM 引用，但会调用 UI.*（110 处）。这里注入一个 UI 桩，
 *    弹窗询问类 API（askXXX）统一同步回调，使被测流程可在 Node 中跑完。
 * 3. Math.random 被替换为可播种的 PRNG，使洗牌/判定完全可重现 —— 黄金快照的前提。
 */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/** mulberry32：32 位可播种 PRNG，序列稳定，跨 Node 版本一致。 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 弹窗询问类 UI API 的默认应答。
 * 统一策略：默认「放弃」，即不改变规则流程的正常路径；
 * 需要主动触发的用例可通过 answers 覆盖。
 */
const DEFAULT_ANSWERS = {
  askPurge: false,
  askCastleSacrifice: false,
  askDiluSacrifice: false,
  askNoUnitSummon: false,
  askCounterSacred: false,
  askCounterCalamity: false,
  askRankBlock: false,
  askNegate: null,
  askYatagarasu: null,
};

const ASK_METHODS = Object.keys(DEFAULT_ANSWERS);

function makeUIStub(answers, calls) {
  const stub = {
    renderAll: () => {},
    renderLog: () => {},
    unitEnter: () => {},
    floatDamage: () => {},
    flashUnit: () => {},
    effectBurst: () => {},
    shakeUnit: () => {},
    flashZone: () => {},
    flashDiscard: () => {},
    flashShogun: () => {},
    flashHand: () => {},
    flashEmperor: () => {},
    defendFlash: () => {},
    showEventAnimation: () => {},
    imperialPurge: () => {},
    guoshiEffect: () => {},
    showModal: () => {},
    hideModal: () => {},
  };
  for (const name of ASK_METHODS) {
    stub[name] = (...args) => {
      calls.push({ method: name, args });
      const cb = args[args.length - 1];
      if (typeof cb === "function") cb(answers[name]);
    };
  }
  return stub;
}

/**
 * 加载一份全新的 game.js 实例（每个测试用例独立，避免状态串扰）。
 * @param {object} [opts]
 * @param {number} [opts.seed]      PRNG 种子
 * @param {object} [opts.answers]   askXXX 的应答覆盖
 * @returns {{ Game: object, CARDS: object, calls: Array, random: Function }}
 */
export function loadGame(opts = {}) {
  const { seed = 20240610, answers = {} } = opts;
  const random = mulberry32(seed);
  const calls = [];
  const mergedAnswers = { ...DEFAULT_ANSWERS, ...answers };

  const math = Object.create(Math);
  math.random = random;

  const sandbox = {
    Math: math,
    console: { log() {}, warn() {}, error() {} },
    // AI 回合用 setTimeout 步进；测试中不推进真实计时器
    setTimeout: () => 0,
    clearTimeout: () => {},
  };
  sandbox.globalThis = sandbox;
  sandbox.UI = makeUIStub(mergedAnswers, calls);

  const context = vm.createContext(sandbox);
  const run = (file) => {
    const code = fs.readFileSync(path.join(ROOT, file), "utf8");
    vm.runInContext(code, context, { filename: file });
  };

  run("js/data.js");
  run("js/game.js");

  // 顶层 const 属于全局词法作用域，不挂在 context 对象上，需主动求值取回
  const CARDS = vm.runInContext("CARDS", context);
  const Game = vm.runInContext("Game", context);

  // 测试用索引：按「类型/id」或「类型/名称」都能查到卡牌。
  // Game.findCard 只能按名称查找，而测试里用 id 引用卡牌更稳定，故在此另建索引。
  const cardIndex = new Map();
  for (const [type, list] of Object.entries(CARDS)) {
    for (const card of list) {
      cardIndex.set(`${type}::${card.id}`, card);
      cardIndex.set(`${type}::${card.name}`, card);
    }
  }
  const card = (type, key) => {
    const found = cardIndex.get(`${type}::${key}`);
    if (!found) throw new Error(`找不到卡牌 ${type}/${key}`);
    return found;
  };
  // 挂到测试实例上，便于 fixture 只凭 Game 查卡牌（生产代码不受影响）
  Game.__card = card;

  return { Game, CARDS, calls, random, card };
}

/** 读取全部卡牌数据，扁平化为 [{ type, card }]，便于统一断言。 */
export function allCards(CARDS) {
  const out = [];
  for (const [type, list] of Object.entries(CARDS)) {
    for (const card of list) out.push({ type, card });
  }
  return out;
}
