import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";
import { scenario, placeUnit, placeZone, equip } from "./helpers/fixture.js";

/**
 * 流程规则测试。
 *
 * 覆盖《规则书》中可被机器判定的核心规则：召唤、献祭、攻击限制、伤害结算、
 * 事件清算、手牌上限、回收兑换等。
 *
 * 局面约定（避免干扰项）：
 *  - 双方将军均选「尊位·事件失效」者，不触发 AI 自动发动的「尊位·御破」
 *    （御破会在 AI 生命宽裕时自动消耗 1/10 生命使攻击失效，代价 hp/10）
 *  - 标记 purgeUsed，屏蔽 AI 自动发动的「御·庇护」（会支付生命保住被击破单位）
 *  - 将军躲避率置 0，使伤害与清算断言完全确定
 *  - 涉及玩家抉择的弹窗（替死 / 消解）统一自动「放弃」
 *
 * 已确认的规则细节：
 *  - 武士按**防御**承伤，公卿按**攻击**承伤，大名按**命值**承伤
 *  - 溢出伤害作用于**被击破方的将军**（规则书 8.2 第 4 点：「对方将军」
 *    指防守方；例 2 中 c 击破 b，溢出打给 b 的将军）
 */

/** 双方进入可攻击状态、且不受尊位/躲避干扰的干净局面。 */
function readyBoard(opts = {}) {
  const { Game, CARDS } = loadGame({ seed: 7 });
  scenario(Game, CARDS, {
    p0: { emperor: "天-01", shogun: "将-01", hp: 50 },
    p1: { emperor: "天-02", shogun: "将-01", hp: 50 },
    ...opts,
  });
  const [p0, p1] = Game.state.players;
  p0.turnsTaken = 3;
  p1.turnsTaken = 3;
  p0.shogun.dodge = 0;
  p1.shogun.dodge = 0;
  p0.rankUsed = true; // 跳过尊位一次性效果
  p1.rankUsed = true;
  // Game.askPurge 是引擎层询问（AI 侧会「生命宽裕时自动庇护」），
  // 测试中统一覆写为放弃，使击破流程可确定地走完。
  Game.askPurge = (t, cost, cb) => cb(false);
  return { Game, CARDS, p0, p1 };
}

/** 往玩家手牌塞一张牌，返回其在手牌中的下标。 */
function giveCard(Game, pi, type, cardKey) {
  const card = Game.__card(type, cardKey);
  Game.state.players[pi].hand.push({ type, card });
  return Game.state.players[pi].hand.length - 1;
}

/** 取最近一条战报。 */
function lastLog(Game) {
  const log = Game.state.log;
  return log[log.length - 1] ? log[log.length - 1].msg : "";
}

describe("召唤规则", () => {
  it("手牌中的武士可召唤上场，基础值取自卡面", () => {
    const { Game, p0 } = readyBoard();
    const hi = giveCard(Game, 0, "samurai", "武-01");
    expect(Game.summonSamurai(0, hi)).toBe(true);
    expect(p0.field).toHaveLength(1);
    expect(p0.field[0].card.id).toBe("武-01");
    expect(p0.field[0].baseAtk).toBe(3);
    expect(p0.field[0].baseDef).toBe(4);
    expect(p0.hand).toHaveLength(0);
  });

  it("非武士牌不能通过普通召唤上场", () => {
    const { Game } = readyBoard();
    const hi = giveCard(Game, 0, "noble", "卿-01");
    expect(Game.summonSamurai(0, hi)).toBe(false);
    expect(Game.state.players[0].field).toHaveLength(0);
  });

  it("战场区满 5 个时无法继续召唤", () => {
    const { Game, p0 } = readyBoard();
    for (let i = 0; i < 5; i++) placeUnit(Game, 0, "samurai", "武-01");
    const hi = giveCard(Game, 0, "samurai", "武-02");
    expect(Game.summonSamurai(0, hi)).toBe(false);
    expect(p0.field).toHaveLength(5);
  });

  it("献祭召唤：祭品入弃牌堆，新单位上场", () => {
    const { Game, p0 } = readyBoard();
    const sac = placeUnit(Game, 0, "samurai", "武-01");
    // 本回合刚召唤的不可献祭
    sac.summonedTurn = Game.state.turnNo;
    expect(Game.sacrificeSummon(0, giveCard(Game, 0, "daimyo", "大-01"), 0)).toBe(false);

    sac.summonedTurn = Game.state.turnNo - 1; // 上一回合召唤的，可献祭
    expect(Game.sacrificeSummon(0, giveCard(Game, 0, "daimyo", "大-01"), 0)).toBe(true);
    expect(p0.field).toHaveLength(1);
    expect(p0.field[0].kind).toBe("daimyo");
    expect(Game.state.discard.some((c) => c.card.id === "武-01")).toBe(true);
  });
});

describe("攻击限制", () => {
  it("前两回合不能攻击（第 3 回合起才可）", () => {
    const { Game, p0 } = readyBoard();
    p0.turnsTaken = 1;
    expect(Game.canAttack(p0)).toBe(false);
    p0.turnsTaken = 2;
    expect(Game.canAttack(p0)).toBe(false);
    p0.turnsTaken = 3;
    expect(Game.canAttack(p0)).toBe(true);
  });

  it("只能攻击对方最前层的单位", () => {
    const { Game } = readyBoard();
    const attacker = placeUnit(Game, 0, "samurai", "武-01");
    const front = placeUnit(Game, 1, "samurai", "武-01");
    const back = placeUnit(Game, 1, "noble", "卿-01");
    // 公卿在后方，被武士层挡住
    expect(Game.attack(0, attacker.uid, back.uid)).toBe(false);
    expect(lastLog(Game)).toContain("只能攻击最前层");
    expect(Game.attack(0, attacker.uid, front.uid)).toBe(true);
  });

  it("每种类型每回合仅一位单位可发动攻击", () => {
    const { Game } = readyBoard();
    const a = placeUnit(Game, 0, "samurai", "武-01");
    const b = placeUnit(Game, 0, "samurai", "武-02");
    const target = placeUnit(Game, 1, "samurai", "武-01");
    expect(Game.attack(0, a.uid, target.uid)).toBe(true);
    expect(Game.attack(0, b.uid, target.uid)).toBe(false);
    expect(lastLog(Game)).toContain("已发动过攻击");
  });

  it("同一单位一回合不能再次攻击", () => {
    const { Game } = readyBoard();
    const a = placeUnit(Game, 0, "samurai", "武-01");
    // 目标防御足够，攻击后仍存活，便于第二次攻击同一单位
    const t = placeUnit(Game, 1, "samurai", "武-01");
    equip(Game, 1, "armor", "装-01", t);
    expect(Game.attack(0, a.uid, t.uid)).toBe(true);
    expect(Game.attack(0, a.uid, t.uid)).toBe(false);
  });
});

describe("伤害结算", () => {
  it("武士按防御承伤：防御归零即下场，溢出伤害给防守方将军", () => {
    const { Game, p1 } = readyBoard();
    const attacker = placeUnit(Game, 0, "samurai", "武-03"); // 攻 4 + 武士之锋2 = 6
    const victim = placeUnit(Game, 1, "samurai", "武-01"); // 防 4 + 防御光环1 = 5
    const hpBefore = p1.hp;
    Game.attack(0, attacker.uid, victim.uid);
    // 下场：移出战场并进入弃牌堆
    expect(p1.field).not.toContain(victim);
    expect(Game.state.discard.some((c) => c.card.id === "武-01")).toBe(true);
    // 溢出 = 攻击6 − 防御5 = 1，作用于防守方将军
    expect(p1.hp).toBe(hpBefore - 1);
  });

  it("防御足够时只削减防御，不产生溢出伤害", () => {
    const { Game, p1 } = readyBoard();
    const attacker = placeUnit(Game, 0, "samurai", "武-01"); // 攻 3 + 2 = 5
    const victim = placeUnit(Game, 1, "samurai", "武-01"); // 防 4 + 光环1 = 5
    equip(Game, 1, "armor", "装-01", victim); // 装具 防+3 → 防御 8
    const hpBefore = p1.hp;
    Game.attack(0, attacker.uid, victim.uid);
    expect(p1.field).toContain(victim);
    expect(p1.hp).toBe(hpBefore);
  });

  it("公卿按攻击承伤（规则书 8.2）", () => {
    const { Game, p1 } = readyBoard();
    const attacker = placeUnit(Game, 0, "samurai", "武-01"); // 攻 5
    const noble = placeUnit(Game, 1, "noble", "卿-01"); // 攻 2 + ①全场攻击1 = 3
    const hpBefore = p1.hp;
    Game.attack(0, attacker.uid, noble.uid);
    expect(p1.field).not.toContain(noble);
    // 溢出 = 攻击5 − 公卿攻击3 = 2
    expect(p1.hp).toBe(hpBefore - 2);
  });

  it("大名以命值承伤，20 点命值耗尽才下场", () => {
    const { Game, p1 } = readyBoard();
    const attacker = placeUnit(Game, 0, "samurai", "武-01"); // 攻 5
    const daimyo = placeUnit(Game, 1, "daimyo", "大-01"); // 命值 20
    const hpBefore = p1.hp;
    Game.attack(0, attacker.uid, daimyo.uid);
    expect(p1.field).toContain(daimyo);
    expect(daimyo.hp).toBe(15);
    expect(p1.hp).toBe(hpBefore); // 无溢出
  });

  it("大名命值不足时按差额溢出", () => {
    const { Game, p1 } = readyBoard();
    const attacker = placeUnit(Game, 0, "samurai", "武-01"); // 攻 5
    const daimyo = placeUnit(Game, 1, "daimyo", "大-01", { hp: 3 });
    const hpBefore = p1.hp;
    Game.attack(0, attacker.uid, daimyo.uid);
    expect(p1.field).not.toContain(daimyo);
    expect(p1.hp).toBe(hpBefore - 2); // 溢出 5 − 3 = 2
  });
});

describe("事件常置与清算", () => {
  it("事件第一层攻防洪流在常置期间持续生效", () => {
    const { Game } = readyBoard();
    placeZone(Game, 0, "process", "进-01"); // 承久之乱 a1o=4
    const u = placeUnit(Game, 0, "samurai", "武-01");
    expect(Game.unitStats(u).atk).toBe(3 + 2 + 4);
  });

  it("事件被顶替时结算第五层清算（X/Y 印记）", () => {
    const { Game, p0, p1 } = readyBoard();
    // 己方事件进-01：X=武士、Y=公卿
    placeZone(Game, 0, "process", "进-01");
    // 己方 2 名武士（X），对方 1 名公卿（Y）
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 0, "samurai", "武-02");
    placeUnit(Game, 1, "noble", "卿-01");

    const hp0Before = p0.hp;
    const hp1Before = p1.hp;

    const hi = giveCard(Game, 0, "process", "进-02");
    expect(Game.playZone(0, hi)).toBe(true);

    // 己方每有 1 张 X(武士) → 对方将军 −1，共 2 点
    expect(p1.hp).toBe(hp1Before - 2);
    // 对方每有 1 张 Y(公卿) → 己方将军 −1，共 1 点
    expect(p0.hp).toBe(hp0Before - 1);
  });

  it("被顶替的常置牌进入弃牌堆", () => {
    const { Game } = readyBoard();
    placeZone(Game, 0, "process", "进-01");
    const hi = giveCard(Game, 0, "process", "进-02");
    Game.playZone(0, hi);
    expect(Game.state.discard.some((c) => c.card.id === "进-01")).toBe(true);
    expect(Game.state.zone.card.id).toBe("进-02");
  });

  it("每回合限使用 1 张事件/城池牌", () => {
    const { Game } = readyBoard();
    const hi1 = giveCard(Game, 0, "process", "进-01");
    expect(Game.playZone(0, hi1)).toBe(true);
    const hi2 = giveCard(Game, 0, "process", "进-02");
    expect(Game.playZone(0, hi2)).toBe(false);
    expect(lastLog(Game)).toContain("已使用过事件/城池牌");
  });
});

describe("手牌与回收兑换", () => {
  it("手牌上限 8：回合结束时超出部分被弃置", () => {
    const { Game, p0 } = readyBoard();
    for (let i = 0; i < 12; i++) giveCard(Game, 0, "samurai", "武-01");
    expect(p0.hand).toHaveLength(12);
    Game.endTurn();
    expect(p0.hand.length).toBeLessThanOrEqual(8);
    expect(Game.state.discard.length).toBe(4);
  });

  it("回收兑换分类：3 张圣迹/城池/事件 各对应可回收类型", () => {
    const { Game, p0 } = readyBoard();
    for (let i = 0; i < 3; i++) giveCard(Game, 0, "sacred", "圣-01");
    for (let i = 0; i < 3; i++) giveCard(Game, 0, "castle", "城-01");
    for (let i = 0; i < 3; i++) giveCard(Game, 0, "process", "进-01");
    Game.state.discard.push({ type: "samurai", card: Game.__card("samurai", "武-01") });

    expect(Game.canExchange(p0)).toBe(true);
    const cats = Game.exchangeCats();
    expect(cats.map((c) => c.cat).sort()).toEqual(["castle", "process", "sacred"]);
    expect(cats.find((c) => c.cat === "sacred").allowed).toEqual(["daimyo", "noble", "samurai"]);
    expect(cats.find((c) => c.cat === "castle").allowed).toEqual(["noble", "samurai"]);
    expect(cats.find((c) => c.cat === "process").allowed).toEqual(["samurai"]);
  });
});
