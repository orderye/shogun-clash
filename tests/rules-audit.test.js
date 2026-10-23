import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";
import { scenario, placeUnit, placeZone, equip } from "./helpers/fixture.js";

/**
 * 《规则书》逐条核对测试（rules-audit）。
 *
 * 本文件针对「规则书写了、但此前没有对应断言」的条款建立回归用例。
 * 每条用例的注释标明对应的规则书章节，便于反向核对。
 *
 * 局面约定：
 *  - 双方躲避率置 0，使伤害断言确定
 *  - natureUsed 置 true，屏蔽「将军本性·苏生」回血干扰
 *  - maxHp 固定 100，避免治疗上限截断掩盖真实扣血
 */

/** 设置玩家生命（固定上限 100）。 */
function setHp(st, pi, hp) {
  st.players[pi].hp = hp;
  st.players[pi].maxHp = 100;
  st.players[pi].natureUsed = true;
}

/** 干净开局：双方无尊位/御·庇护干扰。 */
function cleanGame(opts = {}, seed = 11) {
  const { Game, CARDS } = loadGame({ seed });
  scenario(Game, CARDS, {
    p0: { emperor: "天-01", shogun: "将-01", hp: 100 },
    p1: { emperor: "天-02", shogun: "将-01", hp: 100 },
    ...opts,
  });
  const [p0, p1] = Game.state.players;
  p0.shogun.dodge = 0;
  p1.shogun.dodge = 0;
  p0.rankUsed = true;
  p1.rankUsed = true;
  p0.purgeUsed = true;
  p1.purgeUsed = true;
  return { Game, CARDS, st: Game.state };
}

describe("规则书 §3.12 / §3.13 · 圣迹与灾厄", () => {
  it("圣-01 天照大神：弃牌堆洗回卡组，但天皇/将军牌不随之回池", () => {
    // cond=A → 需己方生命高于对方
    const { Game, CARDS, st } = cleanGame({
      p0: { emperor: "天-01", shogun: "将-01", hp: 80 },
      p1: { emperor: "天-02", shogun: "将-02", hp: 40 },
    });
    st.discard.push({ type: "emperor", card: CARDS.emperors[0] });
    st.discard.push({ type: "shogun", card: CARDS.shoguns[0] });
    st.discard.push({ type: "samurai", card: CARDS.samurai[0] });
    st.players[0].hand.push({ type: "sacred", card: CARDS.sacred.find((c) => c.id === "圣-01") });

    Game.useEvent(0, 0);

    expect(st.deck.some((c) => c.type === "emperor" || c.type === "shogun")).toBe(false);
    expect(st.deck.some((c) => c.type === "samurai")).toBe(true);
  });

  it("圣-02 祓除：还原天命造成的减益与天皇失效", () => {
    const { Game, CARDS, st } = cleanGame({
      p0: { emperor: "天-01", shogun: "将-01", hp: 80 },
      p1: { emperor: "天-02", shogun: "将-02", hp: 30 },
    });
    const n = placeUnit(Game, 0, "noble", "卿-01");
    const baseDef = n.baseDef;
    // 己方使用灾厄 → 天命诡谲（公卿防御 −1）
    st.players[0].hand.push({ type: "calamity", card: CARDS.calamity.find((c) => c.id === "灾-01") });
    Game.useEvent(0, 0);
    expect(n.baseDef).toBe(baseDef - 1);
    // 施加负面常置效果：天皇失效
    st.players[0].emperorDisabled = 3;
    // 圣-02 祓除
    st.players[0].hand.push({ type: "sacred", card: CARDS.sacred.find((c) => c.id === "圣-02") });
    Game.useEvent(0, 0);

    expect(n.baseDef).toBe(baseDef);
    expect(st.players[0].emperorDisabled).toBe(0);
  });

  it("圣-04 献祭：祭品装备随弃，且触发天皇之怒", () => {
    // 天-02 的天皇之怒为「武士下场 → 对方将军 −2」
    const { Game, CARDS, st } = cleanGame({
      p0: { emperor: "天-02", shogun: "将-01", hp: 30 },
      p1: { emperor: "天-01", shogun: "将-02", hp: 80 },
    });
    const sac = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "blade", "刃-01", sac);
    st.discard.push({ type: "daimyo", card: CARDS.daimyo[0] });
    st.players[0].hand.push({ type: "sacred", card: CARDS.sacred.find((c) => c.id === "圣-04") });
    setHp(st, 0, 30);
    setHp(st, 1, 80);

    Game.useEvent(0, 0);

    // 祭品的兵刃随之弃置（不凭空消失）
    expect(st.discard.some((c) => c.type === "blade")).toBe(true);
    // 祭品离场触发天皇之怒（武士 −2）
    expect(st.players[1].hp).toBe(78);
  });

  it("圣-04 献祭：手牌中的武士也可作为祭品", () => {
    const { Game, CARDS, st } = cleanGame({
      p0: { emperor: "天-02", shogun: "将-01", hp: 30 },
      p1: { emperor: "天-01", shogun: "将-02", hp: 80 },
    });
    // 圣-04 cond=B → 需己方生命低于对方（30 < 80）
    // 场上无武士，仅手牌有
    st.players[0].hand.push({ type: "samurai", card: CARDS.samurai[0] });
    st.discard.push({ type: "daimyo", card: CARDS.daimyo[0] });
    st.players[0].hand.push({ type: "sacred", card: CARDS.sacred.find((c) => c.id === "圣-04") });
    setHp(st, 0, 30);
    setHp(st, 1, 80);

    const si = st.players[0].hand.findIndex((h) => h.type === "sacred");
    Game.useEvent(0, si);

    const dm = st.players[0].field.find((u) => u.kind === "daimyo");
    expect(dm).toBeDefined();
    expect(st.players[0].field.length).toBe(1);
  });

  it("圣-04 复活的大名本回合不可攻击", () => {
    const { Game, CARDS, st } = cleanGame({
      p0: { emperor: "天-02", shogun: "将-01", hp: 30 },
      p1: { emperor: "天-01", shogun: "将-02", hp: 80 },
    });
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 1, "samurai", "武-02");
    st.discard.push({ type: "daimyo", card: CARDS.daimyo[0] });
    st.players[0].hand.push({ type: "sacred", card: CARDS.sacred.find((c) => c.id === "圣-04") });
    st.turnNo = 5;
    st.players[0].turnsTaken = 5;
    setHp(st, 0, 30);
    setHp(st, 1, 80);

    Game.useEvent(0, 0);

    const dm = st.players[0].field.find((u) => u.kind === "daimyo");
    expect(Game.attack(0, dm.uid, st.players[1].field[0].uid)).toBe(false);
  });

  it("圣-10 丰玉姬化龙：大名在回合结束才下场", () => {
    const { Game, st } = cleanGame();
    const dm = placeUnit(Game, 0, "daimyo", "大-01");
    st.cur = 0;
    setHp(st, 0, 100);
    setHp(st, 1, 100);

    Game.ryujinStrike(0);

    // 直击后仍在场上（回合结束才下场）
    expect(st.players[0].field).toContain(dm);
  });
});

describe("规则书 §11 · 城池", () => {
  it("第四层兴衰损益：敌方大名上场与敌方公卿上场各按卡面顺序取值", () => {
    // 城-01 京都（王城）l4 = "−4 ／ −3 ／ +3 ／ +4"
    // 顺序：己方大名下场／己方公卿下场／敌方公卿上场／敌方大名上场
    const { Game, CARDS, st } = cleanGame();
    placeZone(Game, 1, "castle", "城-01");
    setHp(st, 0, 100);
    setHp(st, 1, 10);

    const d = Game.newUnit(0, "daimyo", CARDS.daimyo[0]);
    st.players[0].field.push(d);
    Game.onUnitEntered(0, d);
    expect(st.players[1].hp).toBe(14); // 敌方大名上场 → +4

    const n = Game.newUnit(0, "noble", CARDS.noble[0]);
    st.players[0].field.push(n);
    Game.onUnitEntered(0, n);
    expect(st.players[1].hp).toBe(17); // 敌方公卿上场 → +3
  });

  it("第四层兴衰损益：己方大名/公卿下场使对方将军扣血", () => {
    const { Game, st } = cleanGame();
    placeZone(Game, 1, "castle", "城-01");
    setHp(st, 0, 100);
    setHp(st, 1, 100);

    const d = placeUnit(Game, 1, "daimyo", "大-01");
    Game.removeUnit(d);
    expect(st.players[0].hp).toBe(96); // 己方大名下场 → 敌方 −4

    const n = placeUnit(Game, 1, "noble", "卿-01");
    Game.removeUnit(n);
    expect(st.players[0].hp).toBe(93); // 己方公卿下场 → 敌方 −3
  });

  it("第三层概率倾斜：大城的 +5% 作用于骑具躲避率", () => {
    const { Game, CARDS } = cleanGame();
    const w = placeUnit(Game, 0, "samurai", "武-01");
    w.eq.mount = { ...CARDS.mount[0] };
    const before = Game.unitDodge(w);

    placeZone(Game, 0, "castle", "城-07"); // 横滨（大城）

    expect(Game.unitDodge(w)).toBe(before + 5);
  });

  it("第三层概率倾斜：王城的 ±% 不作用于骑具躲避率", () => {
    const { Game, CARDS } = cleanGame();
    const w = placeUnit(Game, 0, "samurai", "武-01");
    w.eq.mount = { ...CARDS.mount[0] };
    const before = Game.unitDodge(w);

    placeZone(Game, 0, "castle", "城-01"); // 京都（王城）

    expect(Game.unitDodge(w)).toBe(before);
  });

  it("第六层城破：灾厄摧毁城池时原持有方公卿全部下场", () => {
    const { Game, CARDS, st } = cleanGame();
    placeZone(Game, 0, "castle", "城-03");
    const nb = placeUnit(Game, 0, "noble", "卿-01");
    st.players[0].hand.push({ type: "calamity", card: CARDS.calamity.find((c) => c.id === "灾-01") });

    Game.useEvent(0, 0);

    expect(st.zone).toBeNull();
    expect(st.players[0].field).not.toContain(nb);
  });
});

describe("规则书 §3.12 · 神木的报应", () => {
  it("天皇失效期间，三条增幅轨道不生效", () => {
    const { Game, st } = cleanGame({ p0: { emperor: "天-01", shogun: "将-01", hp: 100 } });
    // 天-01：御·武士之锋 +2、御·兵刃之锐 +2、御·公卿之智 +1
    const w = placeUnit(Game, 0, "samurai", "武-01");
    const b = placeUnit(Game, 0, "samurai", "武-02");
    equip(Game, 0, "blade", "刃-01", b);
    const atkBefore = Game.unitStats(w).atk;
    const bladeAtkBefore = Game.unitStats(b).atk;

    st.players[0].emperorDisabled = 3;

    expect(Game.unitStats(w).atk).toBe(atkBefore - 2); // 武士之锋 +2 失效
    expect(Game.unitStats(b).atk).toBe(bladeAtkBefore - 4); // 兵刃之锐 +2 与公卿之智无关，仅 +2 失效
  });

  it("天皇失效期间，装备破格（骑具之灵/兵刃之锐/装具之固）不生效", () => {
    const { Game, st } = cleanGame({ p0: { emperor: "天-04", shogun: "将-01", hp: 100 } });
    // 天-04：御·装具之固 +2、御·公卿之智 +2、御·骑具之灵 +10%
    expect(Game.canMountOnDaimyo(0)).toBe(true);
    expect(Game.canArmorOnSamurai(0)).toBe(true);

    st.players[0].emperorDisabled = 3;

    expect(Game.canMountOnDaimyo(0)).toBe(false);
    expect(Game.canArmorOnSamurai(0)).toBe(false);
  });
});

describe("规则书 §6.2 · 召唤", () => {
  it("献祭召唤的大名本回合不可攻击", () => {
    const { Game, CARDS, st } = cleanGame();
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 1, "samurai", "武-02");
    st.players[0].hand.push({ type: "daimyo", card: CARDS.daimyo[0] });
    st.turnNo = 5;
    st.players[0].turnsTaken = 5;
    setHp(st, 0, 100);
    setHp(st, 1, 100);

    Game.sacrificeSummon(0, 0, 0);

    const dm = st.players[0].field.find((u) => u.kind === "daimyo");
    expect(Game.attack(0, dm.uid, st.players[1].field[0].uid)).toBe(false);
  });

  it("恩典召唤的大名本回合不可攻击", () => {
    const { Game, CARDS, st } = cleanGame();
    placeUnit(Game, 1, "samurai", "武-02");
    st.players[0].hand.push({ type: "daimyo", card: CARDS.daimyo[0] });
    st.players[0].graceCnt = 3;
    st.turnNo = 5;
    st.players[0].turnsTaken = 5;
    setHp(st, 0, 100);
    setHp(st, 1, 100);

    Game.graceSummon(0, 0);

    const dm = st.players[0].field.find((u) => u.kind === "daimyo");
    expect(Game.attack(0, dm.uid, st.players[1].field[0].uid)).toBe(false);
  });

  it("基础召唤的武士当回合即可攻击", () => {
    const { Game, CARDS, st } = cleanGame();
    placeUnit(Game, 1, "samurai", "武-02");
    st.players[0].hand.push({ type: "samurai", card: CARDS.samurai[0] });
    st.turnNo = 5;
    st.players[0].turnsTaken = 5;
    setHp(st, 0, 100);
    setHp(st, 1, 100);

    Game.summonSamurai(0, 0);

    const w = st.players[0].field.find((u) => u.kind === "samurai");
    expect(Game.attack(0, w.uid, st.players[1].field[0].uid)).toBe(true);
  });
});

describe("规则书 §3.1 / §5 · 御·事件之速", () => {
  it("事件/城池牌每回合额度 = 1 + 天皇「事件之速」加成", () => {
    const cases = [
      ["天-01", 1], // 无事件之速
      ["天-02", 2], // 御·事件之速 +1
      ["天-10", 3], // 御·事件之速 +2
    ];
    for (const [emp, expectQuota] of cases) {
      const { Game, CARDS, st } = cleanGame({ p0: { emperor: emp, shogun: "将-01", hp: 100 } });
      expect(Game.zoneQuota(0)).toBe(expectQuota);
      const cards = [CARDS.process[0], CARDS.process[1], CARDS.process[2]];
      for (const c of cards) st.players[0].hand.push({ type: "process", card: c });
      let used = 0;
      for (const c of cards) {
        const hi = st.players[0].hand.findIndex((h) => h.card === c);
        if (hi >= 0 && Game.playZone(0, hi)) used++;
      }
      expect(used).toBe(expectQuota);
    }
  });
});

describe("规则书 §6.3 / §12.2 · 卡组耗尽", () => {
  it("第一次耗尽：弃牌堆洗回卡组（整局仅一次），化身不随之回池", () => {
    const { Game, CARDS, st } = cleanGame();
    st.deck = [];
    st.discard.push({ type: "samurai", card: CARDS.samurai[0] });
    st.discard.push({ type: "emperor", card: CARDS.emperors[0] });
    st.players[0].drawnThisTurn = false;

    const c = Game.drawCard(st.players[0]);

    expect(c).not.toBeNull();
    expect(st.reshuffled).toBe(true);
    expect(st.deck.some((x) => x.type === "emperor")).toBe(false);
  });

  it("第二次耗尽：比较双方剩余生命，高者获胜", () => {
    const { Game, st } = cleanGame();
    st.reshuffled = true;
    st.deck = [];
    st.discard = [];
    setHp(st, 0, 30);
    setHp(st, 1, 60);
    st.players[0].drawnThisTurn = false;

    Game.drawCard(st.players[0]);

    expect(st.winner).toBe(1);
  });

  it("第二次耗尽且生命相同：和局", () => {
    const { Game, st } = cleanGame();
    st.reshuffled = true;
    st.deck = [];
    st.discard = [];
    setHp(st, 0, 40);
    setHp(st, 1, 40);
    st.players[0].drawnThisTurn = false;

    Game.drawCard(st.players[0]);

    expect(st.winner).toBe(-1);
  });
});

describe("规则书 §4.3 · 起手重抽", () => {
  it("起手无武士牌时可重抽 5 张，且仅一次", () => {
    const { Game, CARDS } = loadGame({ seed: 1, answers: { askOpeningRedraw: true } });
    scenario(Game, CARDS, {});
    const st = Game.state;
    // 重置「仅一次」计数，模拟起手阶段
    Game.openingRedraw = 0;
    st.players[0].hand = [{ type: "process", card: CARDS.process[0] },
                           { type: "process", card: CARDS.process[1] },
                           { type: "process", card: CARDS.process[2] },
                           { type: "process", card: CARDS.process[3] },
                           { type: "process", card: CARDS.process[4] }];
    const deckBefore = st.deck.length;

    expect(Game.doOpeningRedraw(0)).toBe(true);
    expect(st.players[0].hand.length).toBe(5);
    expect(st.deck.length).toBe(deckBefore); // 弃 5 张回卡组，再抽 5 张 → 卡组数量不变

    // 仅一次：第二次不再生效
    expect(Game.doOpeningRedraw(0)).toBe(false);
  });
});
