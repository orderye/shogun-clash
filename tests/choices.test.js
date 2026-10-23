import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";
import { scenario, placeUnit, placeZone, equip } from "./helpers/fixture.js";

/**
 * 「选一单位」类规则的玩家抉择。
 *
 * 覆盖规则书里所有写「选一张单位 / 指定一位」的地方：
 *  - 事件第三层 · 受创 / 敌攻 / 我攻（我攻需先选攻击或防御）
 *  - 宝物第一~三层指定、第五层上场/下场
 *  - 公卿城池加成 ②武士 与 ③④⑤装备 的可选弃置
 *  - 王城骑具共享的第二名受益者
 *
 * 约定：玩家侧的选择通过 answers.askPickUnit 精确指定；AI 侧不弹窗（走默认策略）。
 */

function readyBoard(opts = {}) {
  const { Game, CARDS, calls } = loadGame({ seed: 23, ...opts });
  scenario(Game, CARDS, {
    p0: { emperor: "天-01", shogun: "将-01", hp: 50 },
    p1: { emperor: "天-02", shogun: "将-01", hp: 50 },
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
  return { Game, CARDS, calls, p0, p1 };
}

function giveCard(Game, pi, type, cardKey) {
  const card = Game.__card(type, cardKey);
  Game.state.players[pi].hand.push({ type, card });
  return Game.state.players[pi].hand.length - 1;
}

/** 覆盖玩家的单位抉择应答 */
function answerPick(Game, fn) {
  Game.__UI.askPickUnit = (job, cb) => {
    const pick = fn(job);
    expect(pick, "用例必须对每一次抉择给出答案").toBeTruthy();
    cb(pick.uid, pick.mode === undefined ? null : pick.mode);
  };
}

describe("事件第三层 · 受创（己方选一单位防御 +1）", () => {
  it("玩家为事件归属方时弹窗，可指定非首位单位", () => {
    const { Game, p0 } = readyBoard({
      answers: { askPickUnit: () => null },
    });
    answerPick(Game, () => ({ uid: second.uid }));
    placeZone(Game, 0, "process", "进-01"); // a2 层：己方事件
    const first = placeUnit(Game, 0, "samurai", "武-01");
    const second = placeUnit(Game, 0, "samurai", "武-02");

    Game.hpEvent(0, 3, "测试伤害", p0.hp);

    expect(first.extraDef || 0).toBe(0);
    expect(second.extraDef).toBe(1);
  });

  it("AI 为事件归属方时不弹窗，按首位结算", () => {
    const { Game, p1, calls } = readyBoard();
    placeZone(Game, 1, "process", "进-02");
    const a = placeUnit(Game, 1, "samurai", "武-01");
    placeUnit(Game, 1, "samurai", "武-02");

    Game.hpEvent(1, 3, "测试伤害", p1.hp);

    expect(a.extraDef).toBe(1);
    expect(calls.filter(c => c.method === "askPickUnit")).toHaveLength(0);
  });
});

describe("事件第三层 · 我攻（对方选一单位攻击或防御 +1）", () => {
  it("玩家为防守方时先选攻/防再选单位", () => {
    const { Game } = readyBoard();
    placeZone(Game, 1, "process", "进-02"); // 事件归属电脑：电脑单位攻击后由玩家点选
    const attacker = placeUnit(Game, 1, "samurai", "武-01");
    const defFirst = placeUnit(Game, 0, "samurai", "武-01");
    const defSecond = placeUnit(Game, 0, "samurai", "武-02");

    const seen = [];
    answerPick(Game, (job) => {
      seen.push({ modes: job.modes && job.modes.map(m => m.key), n: job.cands.length });
      return { uid: defSecond.uid, mode: "def" };
    });

    Game.afterAttack(Game.state.players[1], attacker, "shogun");

    expect(seen).toHaveLength(1);
    expect(seen[0].modes).toEqual(["atk", "def"]);
    expect(seen[0].n).toBe(2);
    expect(defFirst.extraDef || 0).toBe(0);
    expect(defSecond.extraDef).toBe(1);
    expect(defSecond.extraAtk || 0).toBe(0);
  });

  it("选择「攻击 +1」时只加攻击", () => {
    const { Game } = readyBoard();
    placeZone(Game, 1, "process", "进-02");
    const attacker = placeUnit(Game, 1, "samurai", "武-01");
    const def = placeUnit(Game, 0, "samurai", "武-02");
    answerPick(Game, () => ({ uid: def.uid, mode: "atk" }));

    Game.afterAttack(Game.state.players[1], attacker, "shogun");

    expect(def.extraAtk).toBe(1);
    expect(def.extraDef || 0).toBe(0);
  });
});

describe("宝物 · 第一~三层指定与第五层上场/下场", () => {
  it("装备时由玩家指定目标类型单位（非首位）", () => {
    const { Game, p0 } = readyBoard();
    const s1 = placeUnit(Game, 0, "samurai", "武-01");
    const s2 = placeUnit(Game, 0, "samurai", "武-02");
    const base1 = Game.unitStats(s1).def;
    const base2 = Game.unitStats(s2).def;
    const hi = giveCard(Game, 0, "treasure", "宝-01"); // 天丛云剑：武士防 +3

    answerPick(Game, (job) => (job.cands.some(u => u.uid === s2.uid) ? { uid: s2.uid } : null));
    Game.playTreasure(0, hi, 0);

    expect(p0.treasure).toHaveLength(1);
    expect(p0.treasure[0].tgt.samurai).toBe(s2.uid);
    expect(Game.unitStats(s1).def).toBe(base1);
    expect(Game.unitStats(s2).def).toBe(base2 + 3);
  });

  it("designateTreasureTarget 可改指，加成随之转移", () => {
    const { Game, p0 } = readyBoard();
    const s1 = placeUnit(Game, 0, "samurai", "武-01");
    const s2 = placeUnit(Game, 0, "samurai", "武-02");
    const base1 = Game.unitStats(s1).def;
    const base2 = Game.unitStats(s2).def;
    const hi = giveCard(Game, 0, "treasure", "宝-01");
    answerPick(Game, () => ({ uid: s1.uid }));
    Game.playTreasure(0, hi, 0);
    expect(Game.unitStats(s1).def).toBe(base1 + 3);

    expect(Game.designateTreasureTarget(0, 0, "samurai", s2.uid)).toBe(true);
    expect(p0.treasure[0].tgt.samurai).toBe(s2.uid);
    expect(Game.unitStats(s1).def).toBe(base1);
    expect(Game.unitStats(s2).def).toBe(base2 + 3);
  });

  it("目标离场后 tgt 清空，可重新指定给新单位", () => {
    const { Game, p0 } = readyBoard();
    const s1 = placeUnit(Game, 0, "samurai", "武-01");
    const hi = giveCard(Game, 0, "treasure", "宝-01");
    answerPick(Game, () => ({ uid: s1.uid }));
    Game.playTreasure(0, hi, 0);
    expect(p0.treasure[0].tgt.samurai).toBe(s1.uid);

    Game.removeUnit(s1);
    expect(p0.treasure[0].tgt.samurai).toBe(null);

    const s3 = placeUnit(Game, 0, "samurai", "武-03");
    const base3 = Game.unitStats(s3).def;
    expect(Game.designateTreasureTarget(0, 0, "samurai", s3.uid)).toBe(true);
    expect(Game.unitStats(s3).def).toBe(base3 + 3);
  });

  it("第五层上场只加给玩家点选的单位；下场同理", () => {
    const { Game, p0 } = readyBoard();
    const s1 = placeUnit(Game, 0, "samurai", "武-01");
    const s2 = placeUnit(Game, 0, "samurai", "武-02");
    const hi = giveCard(Game, 0, "treasure", "宝-01");
    answerPick(Game, () => ({ uid: s2.uid }));
    Game.playTreasure(0, hi, 0);

    expect(s2.extraAtk).toBe(1); // 第五层·上场
    expect(s1.extraAtk || 0).toBe(0);

    Game.discardTreasure(0, 0);
    expect(p0.treasure).toHaveLength(0);
    expect(s2.extraDef).toBe(1); // 第五层·下场（点选的仍是 s2）
  });
});

describe("公卿城池加成 · 可选弃置项", () => {
  it("② 己方名城·替公卿：两名武士时按所选弃置", () => {
    const { Game } = readyBoard();
    placeZone(Game, 0, "castle", "城-03"); // 大阪 名城
    placeUnit(Game, 0, "noble", "卿-02"); // ② 己方名城·替公卿
    const w1 = placeUnit(Game, 0, "samurai", "武-01");
    const w2 = placeUnit(Game, 0, "samurai", "武-02");
    const noble = placeUnit(Game, 0, "noble", "卿-01");

    const info = Game.castleSacrificeInfo(0, noble);
    expect(info.kind).toBe(2);
    expect(info.ws.map(u => u.uid)).toEqual([w1.uid, w2.uid]);

    Game.doCastleSacrifice(0, noble, info, w2.uid);
    expect(Game.state.players[0].field).toContain(w1);
    expect(Game.state.players[0].field).not.toContain(w2);
  });

  it("③ 己方大城·替武士：兵刃与骑具都在时按所选弃置", () => {
    const { Game } = readyBoard();
    placeZone(Game, 0, "castle", "城-07"); // 横滨 大城
    placeUnit(Game, 0, "noble", "卿-03"); // ③ 己方大城·替武士
    const w = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "blade", "刃-01", w);
    equip(Game, 0, "mount", "骑-01", w);

    const info = Game.castleSacrificeInfo(0, w);
    expect(info.kind).toBe(3);
    expect(info.slots.slice().sort()).toEqual(["blade", "mount"]);

    Game.doCastleSacrifice(0, w, info, "mount");
    expect(w.eq.mount).toBe(null);
    expect(w.eq.blade).toBeTruthy();
  });

  it("④ 敌方王城·装备替死：三件装备时按所选弃置", () => {
    const { Game } = readyBoard();
    placeZone(Game, 1, "castle", "城-01"); // 京都 王城（敌）
    placeUnit(Game, 0, "noble", "卿-04"); // ④ 敌方王城·装备替死
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    equip(Game, 0, "blade", "刃-01", d);
    equip(Game, 0, "armor", "装-01", d);
    equip(Game, 0, "mount", "骑-01", d);

    const info = Game.castleSacrificeInfo(0, d);
    expect(info.kind).toBe(4);
    expect(info.slots).toEqual(["blade", "armor", "mount"]);

    Game.doCastleSacrifice(0, d, info, "armor");
    expect(d.eq.armor).toBe(null);
    expect(d.eq.blade).toBeTruthy();
    expect(d.eq.mount).toBeTruthy();
  });

  it("替死流程把可选武士一并交给弹窗，并按玩家选中的那位弃置", () => {
    const { Game } = readyBoard({ answers: { askCastleSacrifice: null } });
    placeZone(Game, 0, "castle", "城-03"); // 大阪 名城
    placeUnit(Game, 0, "noble", "卿-02"); // ② 己方名城·替公卿
    const w1 = placeUnit(Game, 0, "samurai", "武-01");
    const w2 = placeUnit(Game, 0, "samurai", "武-02");
    const noble = placeUnit(Game, 0, "noble", "卿-01");

    let chosen = null;
    Game.__UI.askCastleSacrifice = (info, cb) => { chosen = info; cb(true, w2.uid); };
    const r = Game.castleSacrificeFlow(0, noble, () => { throw new Error("不应承受击破"); });

    expect(r).toBe("pending");
    expect(chosen.kind).toBe(2);
    expect(chosen.ws.map(u => u.uid)).toEqual([w1.uid, w2.uid]);
    expect(Game.state.players[0].field).toContain(w1);
    expect(Game.state.players[0].field).not.toContain(w2);
    expect(Game.state.players[0].field).toContain(noble);
  });
});

describe("王城骑具共享 · 可点击指定受益者", () => {
  it("designateMountShare 覆盖默认按序配对", () => {
    const { Game } = readyBoard();
    const holder = placeUnit(Game, 0, "samurai", "武-01");
    const b1 = placeUnit(Game, 0, "samurai", "武-02");
    const b2 = placeUnit(Game, 0, "samurai", "武-03");
    equip(Game, 0, "mount", "骑-01", holder); // 躲避 70
    placeZone(Game, 0, "castle", "城-01"); // 京都 王城

    expect(Game.unitDodge(b1)).toBe(70); // 默认按序：第 1 名未装备者
    expect(Game.unitDodge(b2)).toBe(0);

    expect(Game.designateMountShare(0, holder.uid, b2.uid)).toBe(true);
    expect(Game.unitDodge(b2)).toBe(70);
    expect(Game.unitDodge(b1)).toBe(0);
  });

  it("取消指定后恢复按序配对", () => {
    const { Game } = readyBoard();
    const holder = placeUnit(Game, 0, "samurai", "武-01");
    const b1 = placeUnit(Game, 0, "samurai", "武-02");
    const b2 = placeUnit(Game, 0, "samurai", "武-03");
    equip(Game, 0, "mount", "骑-01", holder);
    placeZone(Game, 0, "castle", "城-01");

    Game.designateMountShare(0, holder.uid, b2.uid);
    Game.designateMountShare(0, holder.uid, null);
    expect(Game.unitDodge(b1)).toBe(70);
    expect(Game.unitDodge(b2)).toBe(0);
  });

  it("受益者自己装备骑具或离场后共享解除", () => {
    const { Game } = readyBoard();
    const holder = placeUnit(Game, 0, "samurai", "武-01");
    const b1 = placeUnit(Game, 0, "samurai", "武-02");
    equip(Game, 0, "mount", "骑-01", holder);
    placeZone(Game, 0, "castle", "城-01");
    Game.designateMountShare(0, holder.uid, b1.uid);
    expect(Game.unitDodge(b1)).toBe(70);

    // 受益者离场
    Game.removeUnit(b1);
    expect(holder.shareTo).toBe(null);
  });

  it("一名单位同时只能借用一件骑具", () => {
    const { Game } = readyBoard();
    const h1 = placeUnit(Game, 0, "samurai", "武-01");
    const h2 = placeUnit(Game, 0, "samurai", "武-02");
    const b = placeUnit(Game, 0, "samurai", "武-03");
    equip(Game, 0, "mount", "骑-01", h1);
    equip(Game, 0, "mount", "骑-02", h2);
    placeZone(Game, 0, "castle", "城-01");

    Game.designateMountShare(0, h1.uid, b.uid);
    Game.designateMountShare(0, h2.uid, b.uid);
    expect(h1.shareTo).toBe(null);
    expect(h2.shareTo).toBe(b.uid);
    expect(Game.unitDodge(b)).toBe(60); // 池月 60
  });

  it("大名只有天皇御·骑具之灵时才是共享候选", () => {
    const { Game, CARDS } = loadGame({ seed: 23 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-04", shogun: "将-01", hp: 50 }, // 御·骑具之灵
      p1: { emperor: "天-02", shogun: "将-01", hp: 50 },
    });
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    expect(Game.mountShareBorrowers(0)).toContain(d);
  });
});

describe("骑具躲避奖励 · 攻击方点选受益武士", () => {
  it("玩家为攻击方时可选非最高攻的武士", () => {
    const { Game } = readyBoard();
    placeZone(Game, 1, "castle", "城-01"); // 对方王城
    const low = placeUnit(Game, 0, "samurai", "武-01");
    const high = placeUnit(Game, 0, "samurai", "武-03"); // 攻 4 + 光环 = 6
    answerPick(Game, (job) => ({ uid: low.uid }));
    Game.mountDodgeReward(1);

    expect(low.extraAtk).toBe(1);
    expect(high.extraAtk || 0).toBe(0);
  });

  it("AI 为攻击方时不弹窗，自动选最高攻", () => {
    const { Game, calls } = readyBoard();
    placeZone(Game, 0, "castle", "城-01"); // 己方王城
    const low = placeUnit(Game, 1, "samurai", "武-01");
    const high = placeUnit(Game, 1, "samurai", "武-03");
    Game.mountDodgeReward(0);

    expect(high.extraAtk).toBe(1);
    expect(low.extraAtk || 0).toBe(0);
    expect(calls.filter(c => c.method === "askPickUnit")).toHaveLength(0);
  });
});

describe("将军天赋 · 玩家点选单位", () => {
  it("有多个候选时由玩家指定（将-02 天赋·武士）", () => {
    const { Game, p0 } = readyBoard();
    p0.shogun = Game.__card("shoguns", "将-02"); // 天赋·武士
    p0.talentCooldown = 0;
    const a = placeUnit(Game, 0, "samurai", "武-01");
    const b = placeUnit(Game, 0, "samurai", "武-02");

    let asked = null;
    answerPick(Game, (job) => { asked = job; return { uid: b.uid }; });
    p0.hp = 40; // 避开本性阈值
    Game.state.cur = 0;
    Game.beginTurn();

    expect(asked).toBeTruthy();
    expect(asked.cands).toHaveLength(2);
    expect(b._talentUsed).toBe(true);
    expect(a._talentUsed).toBeUndefined();
  });
});

describe("事件之速 · 夺取武士由玩家点选", () => {
  it("两名可夺武士时按所选转移控制权", () => {
    const { Game, p0, p1 } = readyBoard();
    placeZone(Game, 1, "process", "进-02"); // 事件为对方 → 夺取武士
    const s1 = placeUnit(Game, 1, "samurai", "武-01");
    const s2 = placeUnit(Game, 1, "samurai", "武-03");
    answerPick(Game, () => ({ uid: s2.uid }));

    expect(Game.useTempo(0)).toBe(true);
    expect(p1.field).toContain(s1);
    expect(p1.field).not.toContain(s2);
    expect(p0.field.map(u => u.uid)).toContain(s2.uid);
    expect(s2.pi).toBe(0);
  });
});
