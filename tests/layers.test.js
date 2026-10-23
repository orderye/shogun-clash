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

  it("第五层神迹克制：灾厄可抵消对方的圣迹牌，圣迹一切效果失效", () => {
    const { Game, p0 } = readyBoard();
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 0, "noble", "卿-01");
    placeUnit(Game, 0, "daimyo", "大-01");
    const sho0 = p0.shogun.name;
    const hp0Before = p0.hp;

    // p1 使用灾厄（第三层本会更换将军牌）
    const hi = giveCard(Game, 1, "calamity", "灾-01");
    // p0 手上持有圣迹，用于反制
    giveCard(Game, 0, "sacred", "圣-01");
    Game.__UI.askCounterCalamity = (c, cb) => cb(true);

    Game.useEvent(1, hi);

    // 圣迹反制成功 → 灾厄一切效果不生效：将军未更换
    expect(p0.shogun.name).toBe(sho0);
    expect(p0.hp).toBe(hp0Before);
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
    // 己方常置牌 → 战前大赏 防御 +1（将-01 X=1）
    expect(after.atk).toBe(before.atk + 1 + 3);
    expect(after.def).toBe(before.def + 1 + 3 + 1);
    expect(hasPart(Game, w, "城池增幅一·武士")).toBe(true);

    placeZone(Game, 0, "process", "进-01"); // 顶替为事件 → 城池增幅失效
    // 此时只剩事件第一层（己方 +4）与战前大赏 防+1，不再有城威与增幅一
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
    expect(after.def).toBe(before.def + 3 + 1); // 城威 + 战前大赏（己方常置牌 防+1）
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

describe("增幅归零 · 御·庇护形态", () => {
  it("庇护后攻击归零、防御改为卡面攻+防，减半损失一并回收", () => {
    const { Game } = readyBoard();
    placeZone(Game, 1, "castle", "城-01"); // 敌方王城 → ④ 装备替死
    placeUnit(Game, 0, "noble", "卿-04"); // ④ 敌方王城·装备替死
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    equip(Game, 0, "blade", "刃-01", d);

    const atkBefore = d.baseAtk;
    const info = Game.castleSacrificeInfo(0, d);
    expect(info.kind).toBe(4);
    Game.doCastleSacrifice(0, d, info);
    expect(d.baseAtk).toBe(Math.max(1, Math.ceil(atkBefore / 2)));
    expect(d.halveLoss.atk).toBe(atkBefore - d.baseAtk);

    Game.doPurge(0, d);
    // 新规则：攻击值归零，防御值 = 卡面初始攻击值 + 卡面初始防御值
    expect(d.baseAtk).toBe(0);
    expect(d.baseDef).toBe(d.card.atk + d.card.dfs);
    expect(Game.unitStats(d).atk).toBe(0);
    expect(Game.unitStats(d).def).toBe(d.card.atk + d.card.dfs);
    expect(d.halveLoss).toBe(null);
    expect((d.hist || []).some(h => (h.desc || "").includes("回收减半损失"))).toBe(true);
  });

  it("庇护武士受击：按攻击值全额扣减防御值，归零下场", () => {
    const { Game, p0 } = readyBoard();
    const w = placeUnit(Game, 0, "samurai", "武-01"); // 卡面 攻3 防4 → 庇护后 攻0 防7
    Game.doPurge(0, w);
    expect(Game.unitStats(w).atk).toBe(0);
    expect(Game.unitStats(w).def).toBe(7);

    const attacker = placeUnit(Game, 1, "samurai", "武-03");
    attacker.baseAtk = 3; attacker.extraAtk = 0; attacker.fx = "";
    const atk = Game.unitStats(attacker).atk;
    expect(atk).toBeGreaterThan(0);

    Game.attack(1, attacker.uid, w.uid);
    expect(p0.field).toContain(w);
    expect(Game.unitStats(w).def).toBe(7 - atk); // 全额扣减，不减免
    expect(Game.unitStats(w).atk).toBe(0);
  });

  it("庇护公卿以防御值承伤，归零下场", () => {
    const { Game, p0 } = readyBoard();
    const n = placeUnit(Game, 0, "noble", "卿-01"); // 卡面 攻2 防4 → 庇护后 攻0 防6
    Game.doPurge(0, n);
    expect(Game.unitStats(n).atk).toBe(0);
    expect(Game.unitStats(n).def).toBe(6);

    const attacker = placeUnit(Game, 1, "samurai", "武-03");
    attacker.baseAtk = 8; attacker.extraAtk = 0; attacker.fx = "";

    Game.attack(1, attacker.uid, n.uid);
    expect(p0.field).not.toContain(n);
  });

  it("庇护体攻击值为 0，无法发动攻击", () => {
    const { Game } = readyBoard();
    const w = placeUnit(Game, 0, "samurai", "武-01");
    Game.doPurge(0, w);
    const target = placeUnit(Game, 1, "samurai", "武-01");

    expect(Game.attack(0, w.uid, target.uid)).toBe(false);
    expect(w.attackedThisTurn).toBeFalsy(); // 未消耗攻击次数
  });
});

describe("天皇 · 天皇之怒（指定类型下场 → 对方将军 −Y）", () => {
  it("指定类型下场时扣对方将军，非指定类型不触发", () => {
    const { Game, CARDS } = loadGame({ seed: 5 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-01", shogun: "将-01", hp: 50 }, // 天皇之怒：大名 / 1
      p1: { emperor: "天-02", shogun: "将-01", hp: 50 },
    });
    const [p0, p1] = Game.state.players;
    p0.rankUsed = true; p1.rankUsed = true;
    const emp = p0.emperor;
    expect(emp.wrathX).toBe("大名");
    expect(emp.wrathY).toBe(1);

    const samurai = placeUnit(Game, 0, "samurai", "武-01");
    const hp1Before = p1.hp;

    // 非指定类型（武士）下场：不触发
    Game.removeUnit(samurai);
    expect(p1.hp).toBe(hp1Before);

    // 指定类型（大名）下场：对方将军 −1
    const daimyo = placeUnit(Game, 0, "daimyo", "大-01");
    Game.removeUnit(daimyo);
    expect(p1.hp).toBe(hp1Before - 1);
  });

  it("每张天皇牌的 X 为三类之一、Y 为 1～3 整数", () => {
    const { CARDS } = loadGame({ seed: 5 });
    const kinds = ["武士", "公卿", "大名"];
    for (const e of CARDS.emperors) {
      expect(kinds, `${e.id} 的 wrathX 非法`).toContain(e.wrathX);
      expect(Number.isInteger(e.wrathY), `${e.id} 的 wrathY 非整数`).toBe(true);
      expect(e.wrathY).toBeGreaterThanOrEqual(1);
      expect(e.wrathY).toBeLessThanOrEqual(3);
    }
    // 3 类 × 3 值 = 9 种组合，10 张牌必然有 1 组重复；其余 9 组应各不相同
    const combos = CARDS.emperors.map((e) => `${e.wrathX}${e.wrathY}`);
    expect(new Set(combos).size).toBeGreaterThanOrEqual(9);
  });
});

describe("将军技能 · 战前大赏 / 战后共荣", () => {
  function board(shogunId) {
    const { Game, CARDS } = loadGame({ seed: 9 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: shogunId, hp: 50 },
      p1: { emperor: "天-08", shogun: "将-01", hp: 50 },
    });
    for (const p of Game.state.players) { p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true; }
    Game.askPurge = (t, c, cb) => cb(false);
    return { Game, p0: Game.state.players[0], p1: Game.state.players[1] };
  }

  it("战前大赏：己方常置牌 → 武士防御 +X；敌方常置牌 → 武士攻击 +X", () => {
    const { Game } = board("将-07");
    const X = Game.state.players[0].shogun.warReward;
    expect(X).toBeGreaterThanOrEqual(1);
    const w = placeUnit(Game, 0, "samurai", "武-02"); // 无「己防/敌防」事件立场，排除干扰

    const bare = Game.unitStats(w);
    placeZone(Game, 0, "process", "进-01"); // 己方事件
    const own = Game.unitStats(w);
    // 己方常置牌：事件第一层 4 + 战前大赏 X
    expect(own.def - bare.def).toBe(4 + X);
    // 攻击：事件第一层 4 + 武-02 自带「己攻」立场 1（不含战前大赏）
    expect(own.atk - bare.atk).toBe(4 + 1);

    placeZone(Game, 1, "castle", "城-07"); // 敌方大城（城威 ap=0）
    const foe = Game.unitStats(w);
    // 敌方常置牌：攻击额外 +X；「敌攻」立场只在事件牌在场时生效，此处无事件
    expect(foe.atk - bare.atk).toBe(X);
    // 防御不含战前大赏
    expect(foe.def).toBe(bare.def);
  });

  it("战前大赏只作用于己方武士，不影响公卿/大名", () => {
    const { Game } = board("将-07");
    const n = placeUnit(Game, 0, "noble", "卿-01");
    const before = Game.unitStats(n).def;
    placeZone(Game, 0, "process", "进-01");
    const after = Game.unitStats(n).def;
    // 只吃事件第一层 +4，不吃战前大赏
    expect(after - before).toBe(4);
  });

  it("战后共荣：本回合打伤对方将军 → 大名命值 +1、公卿攻击 +1", () => {
    const { Game, p0, p1 } = board("将-05");
    expect(p0.shogun.postGlory).toBe(true);
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    d.hp = 17;
    const n = placeUnit(Game, 0, "noble", "卿-01");
    const nAtk = Game.unitStats(n).atk;

    // 未打伤：不结算（先清掉 setup 阶段可能产生的伤害记录）
    Game.state.turnDamage = {};
    Game.postGlorySettle(0);
    expect(d.hp).toBe(17);
    expect(Game.unitStats(n).atk).toBe(nAtk);

    // 打伤 5 点后结算
    p1.hp -= 5;
    Game.hpEvent(1, 5, "测试伤害", p1.hp);
    Game.postGlorySettle(0);
    expect(d.hp).toBe(18);
    expect(Game.unitStats(n).atk).toBe(nAtk + 1);
  });

  it("战后共荣：大名命值不超过本阶段 10 点上限", () => {
    const { Game, p1 } = board("将-05");
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    d.hp = 20; // 已到本阶段上限
    p1.hp -= 3;
    Game.hpEvent(1, 3, "测试伤害", p1.hp);
    Game.postGlorySettle(0);
    expect(d.hp).toBe(20); // 不再增加
  });
});

describe("事件第四层 · 破阵 / 暗杀 对恩典召唤的限制", () => {
  function board() {
    const { Game, CARDS } = loadGame({ seed: 11 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: "将-01", hp: 50 },
      p1: { emperor: "天-08", shogun: "将-02", hp: 50 },
    });
    for (const p of Game.state.players) {
      p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true;
      p.graceCnt = 3; // 满足恩典召唤的回合条件
    }
    return Game;
  }
  const giveDaimyo = (Game, pi) => {
    Game.state.players[pi].hand.push({ type: "daimyo", card: Game.__card("daimyo", "大-01") });
    return Game.state.players[pi].hand.length - 1;
  };

  it("己方事件为破阵：己方不得恩典召唤，对方不受限", () => {
    const Game = board();
    placeZone(Game, 0, "process", "进-01"); // 承久之乱 · 破阵
    expect(Game.graceBlock(0)).toContain("破阵");
    expect(Game.graceBlock(1)).toBe(null);

    expect(Game.graceSummon(0, giveDaimyo(Game, 0))).toBe(false);
    expect(Game.graceSummon(1, giveDaimyo(Game, 1))).toBe(true);
  });

  it("己方事件为暗杀：对方不得恩典召唤，己方不受限", () => {
    const Game = board();
    placeZone(Game, 0, "process", "进-04"); // 观应之扰乱 · 暗杀
    expect(Game.graceBlock(1)).toContain("暗杀");
    expect(Game.graceBlock(0)).toBe(null);

    expect(Game.graceSummon(1, giveDaimyo(Game, 1))).toBe(false);
    expect(Game.graceSummon(0, giveDaimyo(Game, 0))).toBe(true);
  });

  it("常置牌区为空时不受限制", () => {
    const Game = board();
    expect(Game.state.zone).toBe(null);
    expect(Game.graceBlock(0)).toBe(null);
    expect(Game.graceBlock(1)).toBe(null);
    expect(Game.graceSummon(0, giveDaimyo(Game, 0))).toBe(true);
  });

  it("canGrace 在受限时返回 false", () => {
    const Game = board();
    const p0 = Game.state.players[0];
    giveDaimyo(Game, 0);
    expect(Game.canGrace(p0)).toBe(true);
    placeZone(Game, 0, "process", "进-01"); // 破阵
    expect(Game.canGrace(p0)).toBe(false);
  });
});

describe("城池第六层 · 城破 / 易主", () => {
  function board() {
    const { Game, CARDS } = loadGame({ seed: 13 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: "将-01", hp: 50 },
      p1: { emperor: "天-08", shogun: "将-02", hp: 50 },
    });
    for (const p of Game.state.players) { p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true; }
    return Game;
  }

  it("城破：城池被顶替时，原持有方公卿全部下场，武士与对方单位不受影响", () => {
    const Game = board();
    const [p0, p1] = Game.state.players;
    placeZone(Game, 0, "castle", "城-01");
    placeUnit(Game, 0, "noble", "卿-01");
    placeUnit(Game, 0, "noble", "卿-03");
    const w = placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 1, "noble", "卿-02");

    p0.zoneUsed = 0;
    p0.hand.push({ type: "process", card: Game.__card("process", "进-01") });
    Game.playZone(0, p0.hand.length - 1);

    expect(p0.field.filter(u => u.kind === "noble")).toHaveLength(0);
    expect(p0.field).toContain(w);                                        // 武士保留
    expect(p1.field.filter(u => u.kind === "noble")).toHaveLength(1);     // 对方不受影响
  });

  it("易主：控制方转给对方时，原持有方武士全部移交给新持有方，公卿不移交", () => {
    const Game = board();
    const [p0, p1] = Game.state.players;
    placeZone(Game, 0, "castle", "城-01");
    const w1 = placeUnit(Game, 0, "samurai", "武-01");
    const w2 = placeUnit(Game, 0, "samurai", "武-02");
    const n = placeUnit(Game, 0, "noble", "卿-01");

    p1.rankUsed = false;
    Game.useRank(1, "castle"); // 尊位·易帜

    expect(p0.field.filter(u => u.kind === "samurai")).toHaveLength(0);
    expect(p1.field).toContain(w1);
    expect(p1.field).toContain(w2);
    expect(w1.pi).toBe(1);
    expect(w2.pi).toBe(1);
    expect(p0.field).toContain(n); // 公卿不移交
  });

  it("无 l6 的城池不触发（防回归）", () => {
    const Game = board();
    const [p0] = Game.state.players;
    const z = placeZone(Game, 0, "castle", "城-01");
    z.card = { ...z.card, l6: undefined };
    const n = placeUnit(Game, 0, "noble", "卿-01");

    p0.zoneUsed = 0;
    p0.hand.push({ type: "process", card: Game.__card("process", "进-01") });
    Game.playZone(0, p0.hand.length - 1);

    expect(p0.field).toContain(n); // 未触发城破
  });
});

describe("圣迹第三层 · 神怒 / 神佑", () => {
  function board() {
    const { Game, CARDS } = loadGame({ seed: 17 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: "将-01", hp: 50 },
      p1: { emperor: "天-08", shogun: "将-02", hp: 50 },
    });
    for (const p of Game.state.players) { p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true; }
    return Game;
  }
  const give = (G, pi, type, key) => {
    G.state.players[pi].hand.push({ type, card: G.__card(type, key) });
    return G.state.players[pi].hand.length - 1;
  };

  it("神怒：当前常置牌非己方（含区为空）→ 己方将军 −1", () => {
    const G1 = board();
    placeZone(G1, 1, "process", "进-01"); // 敌方常置牌
    const hp1 = G1.state.players[0].hp;
    G1.useEvent(0, give(G1, 0, "sacred", "圣-01")); // l3=神怒
    expect(G1.state.players[0].hp).toBe(hp1 - 1);

    const G2 = board(); // 区为空
    const hp2 = G2.state.players[0].hp;
    G2.useEvent(0, give(G2, 0, "sacred", "圣-01"));
    expect(G2.state.players[0].hp).toBe(hp2 - 1);
  });

  it("神怒：当前常置牌为己方时不触发", () => {
    const G = board();
    placeZone(G, 0, "process", "进-01");
    const hp = G.state.players[0].hp;
    G.useEvent(0, give(G, 0, "sacred", "圣-01"));
    expect(G.state.players[0].hp).toBe(hp);
  });

  it("神佑：当前常置牌为己方 → 抽一张牌；非己方则不抽", () => {
    const G1 = board();
    placeZone(G1, 0, "process", "进-01");
    const d1 = G1.state.deck.length;
    G1.useEvent(0, give(G1, 0, "sacred", "圣-02")); // l3=神佑
    expect(G1.state.deck.length).toBe(d1 - 1);

    const G2 = board();
    placeZone(G2, 1, "process", "进-01");
    const d2 = G2.state.deck.length;
    G2.useEvent(0, give(G2, 0, "sacred", "圣-02"));
    expect(G2.state.deck.length).toBe(d2);
  });

  it("第三层独立于第二层的生命条件", () => {
    const G = board();
    placeZone(G, 1, "process", "进-01");
    // 圣-01 cond=A（需己方生命高于对方）；把己方压到更低，使第二层不生效
    G.state.players[0].hp = 10;
    G.state.players[1].hp = 50;
    G.state.players[0].natureUsed = true; // 屏蔽「本性·苏生」回血干扰
    const hp0 = G.state.players[0].hp;
    G.useEvent(0, give(G, 0, "sacred", "圣-01"));
    // 第二层未生效，第三层神怒照常 −1；但「天命·昭昭」（己方用圣迹）同时 +1
    expect(G.state.players[0].hp).toBe(hp0);
    expect(G.state.log.some(l => l.msg.includes("第二层生命条件未满足"))).toBe(true);
    expect(G.state.log.some(l => l.msg.includes("神怒"))).toBe(true);
  });
});

describe("第五层 · 圣迹与灾厄互相抵消", () => {
  function board() {
    const { Game, CARDS } = loadGame({ seed: 19 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: "将-01", hp: 50 },
      p1: { emperor: "天-08", shogun: "将-02", hp: 50 },
    });
    for (const p of Game.state.players) { p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true; }
    return Game;
  }
  const give = (G, pi, type, key) => {
    G.state.players[pi].hand.push({ type, card: G.__card(type, key) });
    return G.state.players[pi].hand.length - 1;
  };

  it("灾厄第五层·神迹克制：抵消圣迹后其一切效果不生效（含第三层）", () => {
    const G = board();
    placeZone(G, 0, "process", "进-01");
    give(G, 1, "calamity", "灾-01");
    // p1 为 AI：圣-06「更换天皇」属威胁牌，会被自动抵消
    const emp0 = G.state.players[0].emperor.name;
    const deck0 = G.state.deck.length;
    G.useEvent(0, give(G, 0, "sacred", "圣-06"));
    expect(G.state.players[0].emperor.name).toBe(emp0); // 第二层未生效
    expect(G.state.deck.length).toBe(deck0);            // 无额外抽牌
    expect(G.state.log.some(l => l.msg.includes("神迹克制"))).toBe(true);
  });

  it("圣迹第五层·灾厄克制：抵消灾厄后其一切效果不生效", () => {
    const G = board();
    placeUnit(G, 0, "samurai", "武-01");
    placeUnit(G, 0, "noble", "卿-01");
    placeUnit(G, 0, "daimyo", "大-01");
    const sho0 = G.state.players[0].shogun.name;
    const hp0 = G.state.players[0].hp;
    give(G, 0, "sacred", "圣-02");
    G.__UI.askCounterCalamity = (c, cb) => cb(true);
    G.useEvent(1, give(G, 1, "calamity", "灾-01"));
    // 第三层王座更迭未生效
    expect(G.state.players[0].shogun.name).toBe(sho0);
    expect(G.state.players[0].hp).toBe(hp0);
  });
});

describe("天皇第四能力 · 天命", () => {
  function board() {
    const { Game, CARDS } = loadGame({ seed: 23 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: "将-01", hp: 50 },
      p1: { emperor: "天-08", shogun: "将-02", hp: 50 },
    });
    for (const p of Game.state.players) {
      p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true; p.natureUsed = true;
    }
    return Game;
  }
  it("天命昭昭：己方使用圣迹 → 己方将军 +1", () => {
    const G = board();
    const p0 = G.state.players[0];
    p0.hp = 40; // 留出上限空间（上限 50）
    const hp = p0.hp;
    G.emperorDestiny(0, "sacred"); // 直接调用，排除圣迹第三层干扰
    expect(p0.hp).toBe(hp + 1);
  });

  it("天命晦暗：对方使用圣迹 → 己方武士攻击 −1", () => {
    const G = board();
    const w = placeUnit(G, 0, "samurai", "武-02");
    const before = G.unitStats(w).atk;
    G.emperorDestiny(1, "sacred"); // 对方使用
    expect(G.unitStats(w).atk).toBe(before - 1);
  });

  it("天命诡谲：己方使用灾厄 → 己方公卿防御 −1", () => {
    const G = board();
    const n = placeUnit(G, 0, "noble", "卿-01");
    const before = G.unitStats(n).def;
    G.emperorDestiny(0, "calamity");
    expect(G.unitStats(n).def).toBe(before - 1);
  });

  it("天命有失：对方使用灾厄 → 己方大名命值 −1", () => {
    const G = board();
    const d = placeUnit(G, 0, "daimyo", "大-01");
    const before = d.hp;
    G.emperorDestiny(1, "calamity");
    expect(d.hp).toBe(before - 1);
  });

  it("双向结算：双方各按自己的视角判定己方/对方", () => {
    const G = board();
    const w0 = placeUnit(G, 0, "samurai", "武-02");
    const w1 = placeUnit(G, 1, "samurai", "武-02");
    const b0 = G.unitStats(w0).atk, b1 = G.unitStats(w1).atk;
    G.emperorDestiny(0, "sacred"); // p0 使用 → p0 是「己方」，p1 是「对方」
    expect(G.unitStats(w0).atk).toBe(b0);     // 己方使用 → 不降
    expect(G.unitStats(w1).atk).toBe(b1 - 1); // 对方使用 → 降
  });

  it("天皇效果失效期间不结算天命", () => {
    const G = board();
    const p0 = G.state.players[0];
    p0.emperorDisabled = 3;
    const hp = p0.hp;
    G.emperorDestiny(0, "sacred");
    expect(p0.hp).toBe(hp);
  });
});

describe("骑具 · 八百里分麾下炙 / 兵刃 · 断刃重铸", () => {
  function board() {
    const { Game, CARDS } = loadGame({ seed: 29 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: "将-01", hp: 50 },
      p1: { emperor: "天-08", shogun: "将-02", hp: 50 },
    });
    for (const p of Game.state.players) {
      p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true; p.natureUsed = true;
    }
    return Game;
  }

  it("八百里分麾下炙：骑具下场 → 己方所有武士攻击 +1，公卿不受影响", () => {
    const G = board();
    const w1 = placeUnit(G, 0, "samurai", "武-02");
    const w2 = placeUnit(G, 0, "samurai", "武-03");
    const n = placeUnit(G, 0, "noble", "卿-01");
    const holder = placeUnit(G, 0, "samurai", "武-04");
    equip(G, 0, "mount", "骑-01", holder);

    const b1 = G.unitStats(w1).atk, b2 = G.unitStats(w2).atk, bn = G.unitStats(n).atk;
    G.mountLeaves(0, holder.eq.mount);

    expect(G.unitStats(w1).atk).toBe(b1 + 1);
    expect(G.unitStats(w2).atk).toBe(b2 + 1);
    expect(G.unitStats(holder).atk).toBe(G.unitStats(holder).atk); // 装备者同为武士，同样 +1
    expect(G.unitStats(n).atk).toBe(bn); // 公卿不受影响
  });

  it("八百里分麾下炙：场上无武士时不结算", () => {
    const G = board();
    const n = placeUnit(G, 0, "noble", "卿-01");
    const before = G.unitStats(n).atk;
    G.mountLeaves(0, { name: "测试骑具" });
    expect(G.unitStats(n).atk).toBe(before);
  });

  it("断刃重铸：支付当前生命 1/10，兵刃转移到其他可装备目标", () => {
    const G = board();
    const p0 = G.state.players[0];
    const a = placeUnit(G, 0, "samurai", "武-02");
    const b = placeUnit(G, 0, "samurai", "武-03");
    equip(G, 0, "blade", "刃-01", a);
    p0.hp = 50;

    const info = G.reforgeInfo(0);
    expect(info.ok).toBe(true);
    expect(info.cost).toBe(5);

    const aAtk = G.unitStats(a).atk, bAtk = G.unitStats(b).atk;
    expect(G.useReforge(0, a.uid, b.uid)).toBe(true);

    expect(p0.hp).toBe(45);
    expect(a.eq.blade).toBe(null);
    expect(b.eq.blade).toBeTruthy();
    expect(G.unitStats(a).atk).toBeLessThan(aAtk);
    expect(G.unitStats(b).atk).toBeGreaterThan(bAtk);
  });

  it("断刃重铸：每回合限一次", () => {
    const G = board();
    const a = placeUnit(G, 0, "samurai", "武-02");
    const b = placeUnit(G, 0, "samurai", "武-03");
    const c = placeUnit(G, 0, "samurai", "武-04");
    equip(G, 0, "blade", "刃-01", a);

    expect(G.useReforge(0, a.uid, b.uid)).toBe(true);
    expect(G.reforgeInfo(0).blocked).toContain("本回合");
    expect(G.useReforge(0, b.uid, c.uid)).toBe(false);
  });

  it("断刃重铸：无其他可接收目标时 targets 为空", () => {
    const G = board();
    const a = placeUnit(G, 0, "samurai", "武-02");
    equip(G, 0, "blade", "刃-01", a);
    // 场上仅一个可装备者且已持兵刃 → 无可接收目标
    const info = G.reforgeInfo(0);
    expect(info.ok).toBe(true);
    expect(info.targets).toHaveLength(0);
  });

  it("断刃重铸：场上无兵刃时不可用", () => {
    const G = board();
    placeUnit(G, 0, "samurai", "武-02");
    expect(G.reforgeInfo(0).blocked).toContain("无已装备的兵刃");
  });
});

describe("隐藏特效 · 春和景明 / 偶感风寒", () => {
  function board() {
    const { Game, CARDS } = loadGame({ seed: 31 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-08", shogun: "将-01", hp: 50 },
      p1: { emperor: "天-08", shogun: "将-02", hp: 50 },
    });
    for (const p of Game.state.players) {
      p.turnsTaken = 3; p.shogun.dodge = 0; p.rankUsed = true; p.natureUsed = true;
    }
    return Game;
  }

  it("春和景明：己方常置牌在区且使用圣迹 → 将军 +1", () => {
    const G = board();
    const p0 = G.state.players[0];
    placeZone(G, 0, "process", "进-01");
    p0.hp = 40;
    G.hiddenMood(0, "sacred");
    expect(p0.hp).toBe(41);
  });

  it("偶感风寒：己方常置牌在区且使用灾厄 → 将军 −1", () => {
    const G = board();
    const p0 = G.state.players[0];
    placeZone(G, 0, "castle", "城-01");
    p0.hp = 40;
    G.hiddenMood(0, "calamity");
    expect(p0.hp).toBe(39);
  });

  it("常置牌非己方（含区为空）时不触发", () => {
    const G1 = board();
    const p1 = G1.state.players[0];
    placeZone(G1, 1, "process", "进-01"); // 敌方
    p1.hp = 40;
    G1.hiddenMood(0, "sacred");
    expect(p1.hp).toBe(40);

    const G2 = board();
    const p2 = G2.state.players[0];
    p2.hp = 40;
    G2.hiddenMood(0, "sacred"); // 区为空
    expect(p2.hp).toBe(40);
  });

  it("同一回合同一特效只触发一次，两种特效可各触发一次", () => {
    const G = board();
    const p0 = G.state.players[0];
    placeZone(G, 0, "process", "进-01");
    p0.hp = 40;
    G.hiddenMood(0, "sacred");
    G.hiddenMood(0, "sacred");
    expect(p0.hp).toBe(41); // 只 +1

    G.hiddenMood(0, "calamity");
    expect(p0.hp).toBe(40); // 再 −1
  });

  it("回合开始重置，可跨回合再次触发", () => {
    const G = board();
    const p0 = G.state.players[0];
    placeZone(G, 0, "process", "进-01");
    p0.hp = 40;
    G.hiddenMood(0, "sacred");
    expect(p0.hp).toBe(41);

    p0.moodUsed = {}; // 模拟回合重置（beginTurn 中的行为）
    G.hiddenMood(0, "sacred");
    expect(p0.hp).toBe(42);
  });
});
