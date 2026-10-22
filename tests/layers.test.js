import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";
import { scenario, placeUnit, placeZone, equip } from "./helpers/fixture.js";

/**
 * 多层卡牌特效测试。
 *
 * 覆盖《规则书》中按层生效、且容易被「整体生效」简化掉的规则：
 *  - 武士第三层·事件立场（随常置牌易主实时切换；增幅归零后失效）
 *  - 大名第二层·辅佐（励武/护卿：指定唯一目标，目标离场后改指）
 *  - 大名第三层·城盟（己方王城在区 → 命值上限 30；离区回落 20）
 *  - 大名第四层·天命（事件入场即结算，每名大名一次）
 *  - 公卿城池加成 ①~⑥（弃置物入弃牌堆；④⑤ 减半含累积特效数值）
 *  - 事件第五层·清算（顶替与灾厄摧毁两条路径）
 *  - 灾厄第二层·灾殃（攻击总和伤害 + 己方反噬）
 *  - 灾厄第五层·神迹克制（对方本回合用过圣迹 → 第三、四层失效）
 *
 * 局面约定：将军躲避率置 0，使伤害断言完全确定；替换弹窗一律「放弃」。
 */

/** 双方进入可攻击状态、且不受尊位/躲避干扰的干净局面。 */
function readyBoard(opts = {}) {
  const { Game, CARDS } = loadGame({ seed: 11 });
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
  p0.rankUsed = true;
  p1.rankUsed = true;
  p0.maxHp = 100;
  p1.maxHp = 100;
  Game.askPurge = (t, cost, cb) => cb(false);
  return { Game, CARDS, p0, p1 };
}

/** 往玩家手牌塞一张牌，返回其在手牌中的下标。 */
function giveCard(Game, pi, type, cardKey) {
  const card = Game.__card(type, cardKey);
  Game.state.players[pi].hand.push({ type, card });
  return Game.state.players[pi].hand.length - 1;
}

/** 数值构成明细里是否含某一项（如「事件立场·己防」「大名【北条时宗】励武」）。 */
function hasPart(Game, u, key) {
  const P = Game.unitStatParts(u);
  return P.AP.concat(P.DP).some(x => x.k.includes(key));
}

describe("武士第三层 · 事件立场", () => {
  it("己方事件在区时按己方项生效，敌方事件在区时切到敌方项", () => {
    const { Game } = readyBoard();
    // 武-05：坚守·持刃·己防/敌攻
    const w = placeUnit(Game, 0, "samurai", "武-05");

    placeZone(Game, 0, "process", "进-01"); // 己方事件
    expect(hasPart(Game, w, "事件立场·己防")).toBe(true);
    expect(hasPart(Game, w, "事件立场·敌攻")).toBe(false);

    placeZone(Game, 1, "process", "进-02"); // 敌方顶替 → 立即切换
    expect(hasPart(Game, w, "事件立场·己防")).toBe(false);
    expect(hasPart(Game, w, "事件立场·敌攻")).toBe(true);
  });

  it("增幅归零（御·庇护）后三层特效全部失效", () => {
    const { Game, p0 } = readyBoard();
    const w = placeUnit(Game, 0, "samurai", "武-05");
    placeZone(Game, 0, "process", "进-01");
    expect(hasPart(Game, w, "事件立场·己防")).toBe(true);

    Game.doPurge(0, w);
    expect(w.purged).toBe(true);
    expect(hasPart(Game, w, "事件立场·己防")).toBe(false);
    expect(hasPart(Game, w, "事件立场·敌攻")).toBe(false);
    expect(p0.hp).toBe(50 - p0.emperor.ps); // 支付了庇护代价
  });

  it("增幅归零后不再累积战意/坚守", () => {
    const { Game } = readyBoard();
    // 武-01：坚守·骑术·己防/敌防
    const w = placeUnit(Game, 0, "samurai", "武-01");
    Game.doPurge(0, w);
    const defBefore = Game.unitStats(w).def;
    Game.afterAttack(Game.state.players[0], w, "shogun");
    expect(Game.unitStats(w).def).toBe(defBefore); // 战意只加攻击
    expect(w.extraAtk).toBe(0);
  });
});

describe("大名第二层 · 辅佐（励武 / 护卿）", () => {
  it("只对被指定的一名目标生效，其余同名类型不受影响", () => {
    const { Game } = readyBoard();
    const d = placeUnit(Game, 0, "daimyo", "大-01"); // 励武·武士攻击 +2
    const w1 = placeUnit(Game, 0, "samurai", "武-01");
    const w2 = placeUnit(Game, 0, "samurai", "武-02");

    expect(Game.l2TargetOf(d).uid).toBe(w1.uid); // 默认指定首个合法目标
    expect(hasPart(Game, w1, "励武")).toBe(true);
    expect(hasPart(Game, w2, "励武")).toBe(false);
  });

  it("玩家可重新指定目标；两名大名的辅佐各自独立", () => {
    const { Game } = readyBoard();
    const d1 = placeUnit(Game, 0, "daimyo", "大-01"); // 励武 +2
    const d2 = placeUnit(Game, 0, "daimyo", "大-11"); // 励武 +2
    const w1 = placeUnit(Game, 0, "samurai", "武-01");
    const w2 = placeUnit(Game, 0, "samurai", "武-02");

    expect(Game.designateL2Target(0, d1.uid, w1.uid)).toBe(true);
    expect(Game.designateL2Target(0, d2.uid, w2.uid)).toBe(true);
    expect(hasPart(Game, w1, "大名【北条时宗】励武")).toBe(true);
    expect(hasPart(Game, w2, "大名【北条时宗】励武")).toBe(false);
    expect(hasPart(Game, w2, "大名【武田信玄】励武")).toBe(true);
  });

  it("指定目标离场后自动改指场上首个合法目标", () => {
    const { Game } = readyBoard();
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    const w1 = placeUnit(Game, 0, "samurai", "武-01");
    const w2 = placeUnit(Game, 0, "samurai", "武-02");
    Game.designateL2Target(0, d.uid, w1.uid);
    expect(Game.l2TargetOf(d).uid).toBe(w1.uid);

    Game.removeUnit(w1);
    expect(Game.l2TargetOf(d).uid).toBe(w2.uid);
    expect(hasPart(Game, w2, "励武")).toBe(true);
  });
});

describe("大名第三层 · 城盟（己方王城）", () => {
  it("己方王城在区时命值上限 30；后登场的大名同样适用", () => {
    const { Game } = readyBoard();
    const d1 = placeUnit(Game, 0, "daimyo", "大-01");
    expect(d1.hp).toBe(20);
    expect(Game.daimyoHpCap(d1)).toBe(20);

    const hi = giveCard(Game, 0, "castle", "城-01"); // 京都（王城）
    expect(Game.playZone(0, hi)).toBe(true);
    expect(Game.daimyoHpCap(d1)).toBe(30);
    expect(d1.hp).toBe(30);

    const d2 = placeUnit(Game, 0, "daimyo", "大-02");
    expect(d2.hp).toBe(30);
  });

  it("王城被顶替后命值上限回落 20，超出部分回收", () => {
    const { Game, p0 } = readyBoard();
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    const hi = giveCard(Game, 0, "castle", "城-01");
    Game.playZone(0, hi);
    expect(d.hp).toBe(30);

    p0.zoneUsed = 0;
    const hi2 = giveCard(Game, 0, "process", "进-01");
    expect(Game.playZone(0, hi2)).toBe(true);
    expect(Game.daimyoHpCap(d)).toBe(20);
    expect(d.hp).toBe(20);
  });
});

describe("大名第四层 · 天命", () => {
  it("事件入场即结算：己方将军 +10，且每名大名只结算一次", () => {
    const { Game, p0 } = readyBoard();
    p0.hp = 40;
    const d = placeUnit(Game, 0, "daimyo", "大-07"); // 天命·将军生命 +10
    expect(p0.hp).toBe(40);

    const hi = giveCard(Game, 0, "process", "进-01");
    expect(Game.playZone(0, hi)).toBe(true);
    expect(p0.hp).toBe(50);
    expect(d._tianmingUsed).toBe(true);

    p0.zoneUsed = 0;
    const hi2 = giveCard(Game, 0, "process", "进-02");
    Game.playZone(0, hi2);
    expect(p0.hp).toBe(50); // 同一名大名不重复结算
  });

  it("天命大名在事件已在区时登场，同样立即结算", () => {
    const { Game, p0 } = readyBoard();
    p0.hp = 40;
    const hi = giveCard(Game, 0, "process", "进-01");
    Game.playZone(0, hi);
    expect(p0.hp).toBe(40);

    const d = placeUnit(Game, 0, "daimyo", "大-08"); // 天命·将军生命 +10
    Game.onUnitEntered(0, d); // 入场挂钩：事件在区 → 天命结算
    expect(p0.hp).toBe(50);
  });
});

describe("公卿 · 城池加成", () => {
  it("① 己方王城·替大名：弃置的公卿进入弃牌堆", () => {
    const { Game, p0 } = readyBoard();
    placeZone(Game, 0, "castle", "城-01"); // 己方王城
    const noble = placeUnit(Game, 0, "noble", "卿-01"); // ① 己方王城·替大名
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    d.hp = 3;

    const info = Game.castleSacrificeInfo(0, d);
    expect(info && info.kind).toBe(1);
    Game.doCastleSacrifice(0, d, info);

    expect(p0.field).not.toContain(noble);
    expect(Game.state.discard.some(c => c.card.id === "卿-01")).toBe(true);
    expect(p0.field).toContain(d); // 大名存活
  });

  it("② 己方名城·替公卿：弃置的武士进入弃牌堆", () => {
    const { Game, p0 } = readyBoard();
    placeZone(Game, 0, "castle", "城-03"); // 大阪（名城）
    const noble = placeUnit(Game, 0, "noble", "卿-02"); // ② 己方名城·替公卿
    const w = placeUnit(Game, 0, "samurai", "武-01");
    const n2 = placeUnit(Game, 0, "noble", "卿-08"); // 另一个公卿充当被打者
    n2.baseAtk = 1;

    const info = Game.castleSacrificeInfo(0, n2);
    expect(info && info.kind).toBe(2);
    Game.doCastleSacrifice(0, n2, info);

    expect(p0.field).not.toContain(w);
    expect(Game.state.discard.some(c => c.card.id === "武-01")).toBe(true);
    expect(p0.field).toContain(noble);
  });

  it("④ 敌方王城·装备替死：装备弃置，攻防与累积特效数值一并减半", () => {
    const { Game, p0 } = readyBoard();
    placeZone(Game, 1, "castle", "城-01"); // 敌方王城
    placeUnit(Game, 0, "noble", "卿-04"); // ④ 敌方王城·装备替死
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    equip(Game, 0, "blade", "刃-01", d);
    d.extraAtk = 4; // 累积特效数值
    const atkBefore = d.baseAtk, defBefore = d.baseDef;

    const info = Game.castleSacrificeInfo(0, d);
    expect(info && info.kind).toBe(4);
    Game.doCastleSacrifice(0, d, info);

    expect(d.eq.blade).toBe(null);
    expect(d.baseAtk).toBe(Math.max(1, Math.ceil(atkBefore / 2)));
    expect(d.baseDef).toBe(Math.max(1, Math.ceil(defBefore / 2)));
    expect(d.extraAtk).toBe(2);
    expect(p0.field).toContain(d); // 存活
  });
});

describe("事件第五层 · 清算", () => {
  it("灾厄摧毁事件牌时同样结算清算（X/Y 印记）", () => {
    const { Game, p0, p1 } = readyBoard();
    placeZone(Game, 0, "process", "进-01"); // X=武士、Y=公卿
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 0, "samurai", "武-02");
    placeUnit(Game, 1, "noble", "卿-01");

    const hp0Before = p0.hp;
    const hp1Before = p1.hp;

    // 灾-06 旱灾饥荒：第四层摧毁事件牌
    const hi = giveCard(Game, 1, "calamity", "灾-06");
    expect(Game.useEvent(1, hi)).toBe(true);

    expect(Game.state.zone).toBe(null); // 事件已被摧毁
    expect(p1.hp).toBe(hp1Before - 2); // 己方每有 1 张 X(武士) → 对方将军 −1
    expect(p0.hp).toBe(hp0Before - 1); // 对方每有 1 张 Y(公卿) → 己方将军 −1
  });
});

describe("灾厄多层", () => {
  it("第二层灾殃：对方该类型攻击值总和伤害，己方受一半反噬", () => {
    const { Game, p0, p1 } = readyBoard();
    // 灾-01 天火焚城：X=武士
    const w1 = placeUnit(Game, 0, "samurai", "武-01");
    const w2 = placeUnit(Game, 0, "samurai", "武-05");
    const total = Game.unitStats(w1).atk + Game.unitStats(w2).atk;
    const hp0Before = p0.hp;
    const hp1Before = p1.hp;

    const hi = giveCard(Game, 1, "calamity", "灾-01");
    expect(Game.useEvent(1, hi)).toBe(true);

    expect(p0.hp).toBe(hp0Before - total); // 对方将军受攻击总和伤害
    expect(p1.hp).toBe(hp1Before - Math.floor(total / 2)); // 己方受一半（反噬）
  });

  it("第三层王座更迭：对方三类型俱全时双方更换将军牌（生命不变）", () => {
    const { Game, p0, p1 } = readyBoard();
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 0, "noble", "卿-01");
    placeUnit(Game, 0, "daimyo", "大-01");
    const sho0 = p0.shogun.name, sho1 = p1.shogun.name;
    // 灾-01 的灾殃（X=武士）先结算：对方将军受武士攻击总和伤害，己方受一半反噬
    const w = p0.field.find(u => u.kind === "samurai");
    const total = Game.unitStats(w).atk;
    const hp0 = p0.hp, hp1 = p1.hp;

    const hi = giveCard(Game, 1, "calamity", "灾-01");
    expect(Game.useEvent(1, hi)).toBe(true);

    expect(p0.shogun.name).not.toBe(sho0);
    expect(p1.shogun.name).not.toBe(sho1);
    // 更换将军牌不改变生命：血量变化只来自灾殃
    expect(p0.hp).toBe(hp0 - total);
    expect(p1.hp).toBe(hp1 - Math.floor(total / 2));
  });

  it("第五层神迹克制：对方本回合使用过圣迹牌时第三、四层失效", () => {
    const { Game, p0 } = readyBoard();
    // 对方三类型俱全 → 若无克制，第三层会更换将军牌
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 0, "noble", "卿-01");
    placeUnit(Game, 0, "daimyo", "大-01");
    const sho0 = p0.shogun.name;

    // p0 本回合以圣迹牌响应（消解一次攻击）
    const sHi = giveCard(Game, 0, "sacred", "圣-01");
    expect(Game.useEvent(0, sHi, true)).toBe(true);

    const hi = giveCard(Game, 1, "calamity", "灾-01");
    expect(Game.useEvent(1, hi)).toBe(true);

    expect(p0.shogun.name).toBe(sho0); // 第三层被克制，未更换将军
  });
});

describe("装备成长与事件装备共鸣", () => {
  it("兵刃：攻击结算完成后掷骰，成长命中则攻击加成 +1（永久）", () => {
    const { Game } = readyBoard();
    const atk = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "blade", "刃-01", atk);
    atk.eq.blade.grow = 100; // 固定必然命中
    const before = atk.eq.blade.atk;
    const def = placeUnit(Game, 1, "samurai", "武-01");
    expect(Game.attack(0, atk.uid, def.uid)).toBe(true);
    expect(atk.eq.blade.atk).toBe(before + 1);
  });

  it("装具：完成防御结算后掷骰，防御加成 +1（永久）", () => {
    const { Game } = readyBoard();
    const atk = placeUnit(Game, 0, "samurai", "武-01");
    const def = placeUnit(Game, 1, "samurai", "武-01");
    equip(Game, 1, "armor", "装-01", def);
    def.eq.armor.grow = 100;
    const before = def.eq.armor.dfs;
    expect(Game.attack(0, atk.uid, def.uid)).toBe(true);
    expect(def.eq.armor.dfs).toBe(before + 1);
  });

  it("成长概率：事件第一层装备共鸣（己方 +10%／对方 +5%）；大城只作用于装具", () => {
    const { Game } = readyBoard();
    const u = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "blade", "刃-01", u);
    equip(Game, 0, "armor", "装-01", u);
    expect(Game.growChance(u, "blade")).toBe(10); // 卡面 10%
    expect(Game.growChance(u, "armor")).toBe(10);

    placeZone(Game, 0, "process", "进-01"); // 己方事件
    expect(Game.growChance(u, "blade")).toBe(20);
    expect(Game.growChance(u, "armor")).toBe(20);

    placeZone(Game, 1, "process", "进-02"); // 敌方事件
    expect(Game.growChance(u, "blade")).toBe(15);
    expect(Game.growChance(u, "armor")).toBe(15);

    placeZone(Game, 0, "castle", "城-07"); // 己方大城
    expect(Game.growChance(u, "blade")).toBe(10); // 大城不作用于兵刃成长
    expect(Game.growChance(u, "armor")).toBe(15); // 大城作用于装具 +5%
  });
});

describe("事件第二层 · 天佑将军（每回合）", () => {
  it("事件为己方时己方 +a2o、对方回合对方 +a2p，且每回合重复结算", () => {
    const { Game, p0, p1 } = readyBoard();
    placeZone(Game, 0, "process", "进-01"); // a2o=2 / a2p=1
    // 避开将军本性阈值（1/3 生命），只观察天佑本身
    p0.hp = 60;
    p1.hp = 60;

    expect(Game.eventTianyou(0)).toBe(2); // 己方回合 → 己方 +2
    expect(p0.hp).toBe(62);
    expect(Game.eventTianyou(1)).toBe(1); // 对方回合 → 对方 +1
    expect(p1.hp).toBe(61);

    // 每回合都结算（不再是每局一次）
    expect(Game.eventTianyou(0)).toBe(2);
    expect(p0.hp).toBe(64);
    expect(Game.eventTianyou(1)).toBe(1);
    expect(p1.hp).toBe(62);
  });

  it("生命已达上限时不溢出", () => {
    const { Game, p0 } = readyBoard();
    placeZone(Game, 0, "process", "进-01");
    p0.hp = p0.maxHp;
    expect(Game.eventTianyou(0)).toBe(0);
    expect(p0.hp).toBe(p0.maxHp);
  });

  it("事件区为空或为城池时不结算", () => {
    const { Game, p0 } = readyBoard();
    expect(Game.eventTianyou(0)).toBe(0);
    placeZone(Game, 0, "castle", "城-01");
    expect(Game.eventTianyou(0)).toBe(0);
    expect(p0.hp).toBe(50);
  });
});

describe("城池第一层 · 两种增幅（常置光环）", () => {
  it("增幅一（类型单位）：己方武士攻防各 +N（叠加城威），城池被顶替后消失", () => {
    const { Game } = readyBoard();
    const w = placeUnit(Game, 0, "samurai", "武-01");
    const before = Game.unitStats(w);
    placeZone(Game, 0, "castle", "城-07"); // 横滨 大城：城威 +1、武士 +3
    const after = Game.unitStats(w);
    expect(after.atk).toBe(before.atk + 1 + 3);
    expect(after.def).toBe(before.def + 1 + 3);
    expect(hasPart(Game, w, "城池增幅一·武士")).toBe(true);

    placeZone(Game, 0, "process", "进-01"); // 顶替为事件 → 城池增幅失效
    // 此时只剩事件第一层（己方 +4）的加成，不再有城威与增幅一
    expect(Game.unitStats(w).atk).toBe(before.atk + 4);
    expect(hasPart(Game, w, "城池增幅一·武士")).toBe(false);
  });

  it("增幅一（类型单位）只作用于对应类型", () => {
    const { Game } = readyBoard();
    const w = placeUnit(Game, 0, "samurai", "武-01");
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    // 大名第一层动态：己方武士多于对方 → 大名攻击 +1，先建立基线
    const wBefore = Game.unitStats(w), dBefore = Game.unitStats(d);
    placeZone(Game, 0, "castle", "城-07"); // 城威 +1、武士 +3
    expect(Game.unitStats(w).atk).toBe(wBefore.atk + 1 + 3);
    // 大名只吃城威 +1 与城盟（大城攻防 +1），不吃「武士」增幅一
    expect(Game.unitStats(d).atk).toBe(dBefore.atk + 1 + 1);
    expect(hasPart(Game, d, "城池增幅一·武士")).toBe(false);
    expect(hasPart(Game, w, "城池增幅一·武士")).toBe(true);
  });

  it("增幅一（将军生命）：每回合开始 +N，可重复结算", () => {
    const { Game, p0 } = readyBoard();
    placeZone(Game, 0, "castle", "城-01"); // 京都 王城：将军生命 +3
    p0.hp = 40;
    expect(Game.castleAmpTurnStart(0)).toBe(3);
    expect(p0.hp).toBe(43);
    expect(Game.castleAmpTurnStart(0)).toBe(3);
    expect(p0.hp).toBe(46);
    p0.hp = p0.maxHp;
    expect(Game.castleAmpTurnStart(0)).toBe(0);
  });

  it("增幅一（将军生命）只对城池归属方生效", () => {
    const { Game, p0, p1 } = readyBoard();
    placeZone(Game, 0, "castle", "城-01");
    p0.hp = 40; p1.hp = 40;
    expect(Game.castleAmpTurnStart(1)).toBe(0);
    expect(p1.hp).toBe(40);
    expect(p0.hp).toBe(40);
  });

  it("增幅二（兵刃）：装备兵刃的单位攻击再 +N（叠加城威）", () => {
    const { Game } = readyBoard();
    const u = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "blade", "刃-01", u); // 兵刃攻击 +3
    const before = Game.unitStats(u).atk;
    placeZone(Game, 0, "castle", "城-01"); // 京都 王城：城威 +3、兵刃 +2
    expect(Game.unitStats(u).atk).toBe(before + 3 + 2);
  });

  it("增幅二（装具）：装备装具的单位防御再 +N（叠加城威）", () => {
    const { Game } = readyBoard();
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    equip(Game, 0, "armor", "装-01", d); // 装具防御 +3
    const before = Game.unitStats(d).def;
    placeZone(Game, 0, "castle", "城-02"); // 江户 王城：城威 +3、装具 +2
    expect(Game.unitStats(d).def).toBe(before + 3 + 2);
  });

  it("未装备对应装备的单位不吃增幅二", () => {
    const { Game } = readyBoard();
    const u = placeUnit(Game, 0, "samurai", "武-01");
    const before = Game.unitStats(u);
    placeZone(Game, 0, "castle", "城-01"); // 京都：城威 +3、兵刃 +2
    const after = Game.unitStats(u);
    expect(after.atk).toBe(before.atk + 3); // 只吃城威（无兵刃）
    expect(after.def).toBe(before.def + 3);
  });
});

describe("城池第二层 · 王城骑具共享与躲避奖励", () => {
  it("王城在区：未装备骑具的己方单位获得共享躲避率", () => {
    const { Game } = readyBoard();
    const a = placeUnit(Game, 0, "samurai", "武-01");
    const b = placeUnit(Game, 0, "samurai", "武-02");
    equip(Game, 0, "mount", "骑-01", a); // 躲避 70
    expect(Game.unitDodge(b)).toBe(0); // 无王城 → 不共享

    placeZone(Game, 0, "castle", "城-01"); // 京都 王城
    expect(Game.unitDodge(a)).toBe(70);
    expect(Game.unitDodge(b)).toBe(70); // 共享到同一件骑具
  });

  it("名城/大城不共享骑具；敌方王城也不共享", () => {
    const { Game } = readyBoard();
    const a = placeUnit(Game, 0, "samurai", "武-01");
    const b = placeUnit(Game, 0, "samurai", "武-02");
    equip(Game, 0, "mount", "骑-01", a);

    placeZone(Game, 0, "castle", "城-03"); // 大阪 名城
    expect(Game.unitDodge(b)).toBe(0);

    placeZone(Game, 1, "castle", "城-01"); // 敌方王城
    expect(Game.unitDodge(b)).toBe(0);
  });

  it("每件骑具只共享给一名借用者（两件骑具 → 两名借用者）", () => {
    const { Game } = readyBoard();
    const a = placeUnit(Game, 0, "samurai", "武-01");
    const b = placeUnit(Game, 0, "samurai", "武-02");
    const c = placeUnit(Game, 0, "samurai", "武-03");
    const d = placeUnit(Game, 0, "samurai", "武-05");
    const e = placeUnit(Game, 0, "samurai", "武-06");
    equip(Game, 0, "mount", "骑-01", a); // 70
    equip(Game, 0, "mount", "骑-02", b); // 60
    placeZone(Game, 0, "castle", "城-01");

    expect(Game.unitDodge(a)).toBe(70);
    expect(Game.unitDodge(b)).toBe(60);
    expect(Game.unitDodge(c)).toBe(70); // 借用第 1 件骑具
    expect(Game.unitDodge(d)).toBe(60); // 借用第 2 件骑具
    expect(Game.unitDodge(e)).toBe(0); // 骑具数量不足，第三名无共享
  });

  it("王城：骑具躲避成功令敌方一位武士攻击 +1（永久）", () => {
    const { Game, p0 } = readyBoard();
    const a = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "mount", "骑-01", a);
    const enemy = placeUnit(Game, 1, "samurai", "武-01");
    placeZone(Game, 0, "castle", "城-01"); // 己方王城

    const before = Game.unitStats(enemy).atk;
    Game.mountDodgeReward(0);
    expect(enemy.extraAtk).toBe(1);
    expect(Game.unitStats(enemy).atk).toBe(before + 1);
    expect(p0.field).toContain(a);
  });

  it("非王城 / 敌方无武士时不结算奖励", () => {
    const { Game } = readyBoard();
    const enemy = placeUnit(Game, 1, "samurai", "武-01");
    placeZone(Game, 0, "castle", "城-03"); // 名城 → 无奖励
    Game.mountDodgeReward(0);
    expect(enemy.extraAtk).toBe(0);

    placeZone(Game, 0, "castle", "城-01"); // 王城，但敌方武士先移除
    Game.state.players[1].field = [];
    Game.mountDodgeReward(0);
    expect(enemy.extraAtk).toBe(0);
  });
});

describe("圣迹 · 八咫乌引路", () => {
  it("选择「更换将军牌」：原将军入弃牌堆，生命不变", () => {
    const { Game, p0 } = readyBoard();
    const oldShogun = p0.shogun;
    p0.hp = 37;
    Game.applyYatagarasu(0, "shogun");
    expect(p0.shogun.name).not.toBe(oldShogun.name);
    expect(Game.state.discard.some(d => d.type === "shogun" && d.card.name === oldShogun.name)).toBe(true);
    expect(p0.hp).toBe(37);
  });

  it("选择「更换天皇牌」：原天皇入弃牌堆，宝物一并弃置", () => {
    const { Game, p0 } = readyBoard();
    const oldEmperor = p0.emperor;
    p0.treasure = [{ card: Game.__card("treasure", "宝-01"), tgt: { samurai: null, noble: null, daimyo: null } }];
    Game.applyYatagarasu(0, "emperor");
    expect(p0.emperor.name).not.toBe(oldEmperor.name);
    expect(Game.state.discard.some(d => d.type === "emperor" && d.card.name === oldEmperor.name)).toBe(true);
    expect(Game.state.discard.some(d => d.type === "treasure" && d.card.name === "天丛云剑")).toBe(true);
    expect(p0.treasure).toEqual([]);
  });

  it("选择「放弃」：双方化身都不变", () => {
    const { Game, p0, p1 } = readyBoard();
    const e0 = p0.emperor.name, s0 = p0.shogun.name;
    const e1 = p1.emperor.name, s1 = p1.shogun.name;
    Game.applyYatagarasu(0, null);
    expect([p0.emperor.name, p0.shogun.name, p1.emperor.name, p1.shogun.name]).toEqual([e0, s0, e1, s1]);
  });

  it("流程：玩家先选、AI 后选（AI 逆境换将军）", () => {
    const { Game, p0, p1 } = readyBoard();
    p0.hp = 50; p1.hp = 20; // 电脑处于逆境
    const oldShogun0 = p0.shogun.name, oldShogun1 = p1.shogun.name;
    Game.yatagarasuFlow(0); // 玩家侧应答默认「放弃」
    expect(p0.shogun.name).toBe(oldShogun0);
    expect(p1.shogun.name).not.toBe(oldShogun1);
  });
});

describe("增幅归零 · 回收减半造成的数值变化", () => {
  it("装备替死减半后，御·庇护增幅归零把减半损失一并回收", () => {
    const { Game } = readyBoard();
    placeZone(Game, 1, "castle", "城-01"); // 敌方王城 → ④ 装备替死
    placeUnit(Game, 0, "noble", "卿-04"); // ④ 敌方王城·装备替死
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    equip(Game, 0, "blade", "刃-01", d);

    const atkBefore = d.baseAtk, defBefore = d.baseDef;
    const info = Game.castleSacrificeInfo(0, d);
    expect(info.kind).toBe(4);
    Game.doCastleSacrifice(0, d, info);
    expect(d.baseAtk).toBe(Math.max(1, Math.ceil(atkBefore / 2)));
    expect(d.halveLoss.atk).toBe(atkBefore - d.baseAtk);

    Game.doPurge(0, d);
    expect(d.baseAtk).toBe(atkBefore);
    expect(d.baseDef).toBe(defBefore);
    expect(d.halveLoss).toBe(null);
    expect((d.hist || []).some(h => (h.desc || "").includes("回收减半损失"))).toBe(true);
  });
});
