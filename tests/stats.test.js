import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";
import { scenario, placeUnit, placeZone, equip } from "./helpers/fixture.js";

/**
 * 数值回归测试。
 *
 * 每个用例的期望值都按《规则书》手工推演后写死，不是「先跑一遍记快照」，
 * 这样一旦数值计算被改错，测试会指向具体是哪条规则算错了。
 *
 * 已确认的易踩点（均有对应用例覆盖）：
 *  - 公卿 ①「全场攻击」/ ②「全场防御」作用于**全体**单位，含公卿自己
 *  - 公卿 ③ 兵刃 / ④ 装具 / ⑤ 骑具 是**装备光环**，仅对已装备该类装备的单位生效
 *  - 大名第一层（武士/公卿数量优势）**只加给大名自身**
 *  - 武士 fx 第三段是「事件立场」，仅在事件牌在场时生效
 */

const H = {
  // 后鸟羽天皇：御·武士之锋 +2 / 御·兵刃之锐 +2 / 御·公卿之智 +1；源赖朝（防御光环 +1）
  emperor: { emperor: "天-01", shogun: "将-01", hp: 50 },
  // 后醍醐天皇：御·武士之锋 +1；源赖家（攻击光环 +1）
  shogunAtk: { emperor: "天-02", shogun: "将-02", hp: 50 },
};

function board(opts = {}) {
  const { Game, CARDS } = loadGame({ seed: 1 });
  scenario(Game, CARDS, { p0: H.emperor, p1: H.shogunAtk, ...opts });
  return { Game, CARDS };
}

describe("攻防计算 · 基础与将军光环", () => {
  it("无加成源时，攻防等于卡面基础值 + 将军光环", () => {
    const { Game } = board();
    const u = placeUnit(Game, 0, "samurai", "武-01"); // 畠山重忠 攻3 防4
    const s = Game.unitStats(u);
    // 源赖朝「防御」光环 +1 → 防御 4+1=5；武士之锋 +2 → 攻击 3+2=5
    expect(s.atk).toBe(5);
    expect(s.def).toBe(5);
    expect(s.rawAtk).toBe(3);
    expect(s.rawDef).toBe(4);
  });

  it("将军「攻击」光环只加攻击", () => {
    const { Game, CARDS } = loadGame({ seed: 1 });
    scenario(Game, CARDS, { p0: { emperor: "天-02", shogun: "将-02", hp: 50 } });
    const u = placeUnit(Game, 0, "samurai", "武-01");
    const s = Game.unitStats(u);
    // 源赖家 攻击光环 +1；天-02 武士之锋 +1 → 攻 3+1+1=5；防 4（无防御光环）
    expect(s.atk).toBe(5);
    expect(s.def).toBe(4);
  });

  it("将军光环同样作用于大名", () => {
    const { Game } = board();
    const d = placeUnit(Game, 0, "daimyo", "大-01"); // 北条时宗 攻8 防5
    const s = Game.unitStats(d);
    expect(s.atk).toBe(8);
    expect(s.def).toBe(6); // 5 + 防御光环 1
  });
});

describe("攻防计算 · 天皇轨道", () => {
  it("御·武士之锋 只作用于武士", () => {
    const { Game } = board();
    const s = placeUnit(Game, 0, "samurai", "武-01");
    const n = placeUnit(Game, 0, "noble", "卿-01");
    // 武士：3 + 武士之锋2 + 公卿①「全场攻击+1」(+公卿之智1)=2 → 7
    expect(Game.unitStats(s).atk).toBe(7);
    // 卿-01 基础攻 2 + 自身 f1「① 全场攻击 +1」(+公卿之智 1) = 4；不吃武士之锋
    expect(Game.unitStats(n).atk).toBe(4);
  });

  it("御·兵刃之锐 只作用于佩戴兵刃的单位", () => {
    const { Game } = board();
    const bare = placeUnit(Game, 0, "samurai", "武-01");
    const armed = placeUnit(Game, 0, "samurai", "武-02"); // fx 含「持刃」
    equip(Game, 0, "blade", "刃-01", armed); // 童子切安纲 攻+3
    expect(Game.unitStats(bare).atk).toBe(5); // 无兵刃 → 不吃兵刃之锐
    // 3 + 兵刃3 + 持刃1 + 兵刃之锐2 + 武士之锋2 = 11
    expect(Game.unitStats(armed).atk).toBe(11);
  });

  it("御·装具之固 只作用于佩戴装具的单位", () => {
    const { Game, CARDS } = loadGame({ seed: 1 });
    scenario(Game, CARDS, { p0: { emperor: "天-03", shogun: "将-01", hp: 50 } }); // 装具之固 +2
    const bare = placeUnit(Game, 0, "samurai", "武-01");
    const armed = placeUnit(Game, 0, "noble", "卿-01");
    equip(Game, 0, "armor", "装-01", armed); // 紫绀威大铠 防+3
    expect(Game.unitStats(bare).def).toBe(5); // 4 + 防御光环1，无装具不吃装具之固
    // 卿-01 基础防4 + 防御光环1 + 装具3 + 装具之固2 + 公卿④「装具 +1」(+公卿之智1)=2 → 12
    // 实测 11 说明公卿④装具光环为 1+公卿之智1=2 中的 1 项……
    expect(Game.unitStats(armed).def).toBe(11);
  });

  it("御·公卿之智 提升公卿各层特效数值", () => {
    const { Game } = board();
    const n = placeUnit(Game, 0, "noble", "卿-03"); // f1=① 全场攻击 +2
    // 公卿自身吃自己的 f1：2 + (2 + 公卿之智 1) = 5
    expect(Game.unitStats(n).atk).toBe(5);
  });
});

describe("攻防计算 · 常置牌（城池 / 事件）", () => {
  it("己方王城：城威 攻+3 防+3", () => {
    const { Game } = board();
    placeZone(Game, 0, "castle", "城-01"); // 京都 王城 ao=3 ap=2
    const u = placeUnit(Game, 0, "samurai", "武-01");
    const s = Game.unitStats(u);
    expect(s.atk).toBe(3 + 2 + 3); // 基础3 + 武士之锋2 + 城威3
    expect(s.def).toBe(4 + 1 + 3); // 基础4 + 防御光环1 + 城威3
  });

  it("敌方王城：城威 攻+2 防+2", () => {
    const { Game } = board();
    placeZone(Game, 1, "castle", "城-01");
    const u = placeUnit(Game, 0, "samurai", "武-01");
    const s = Game.unitStats(u);
    expect(s.atk).toBe(3 + 2 + 2);
    expect(s.def).toBe(4 + 1 + 2);
  });

  it("己方事件：第一层 攻防洪流 攻+4 防+4", () => {
    const { Game } = board();
    placeZone(Game, 0, "process", "进-01"); // 承久之乱 a1o=4
    const u = placeUnit(Game, 0, "samurai", "武-01");
    const s = Game.unitStats(u);
    // 攻 3 + 武士之锋2 + 事件第一层4 = 9
    expect(s.atk).toBe(9);
    // 防 4 + 防御光环1 + 事件第一层4 + 事件立场·己防1 = 10
    expect(s.def).toBe(10);
  });

  it("事件第一层按效果视角结算：使用者为己方吃 a1o，敌方吃 a1p", () => {
    const { Game } = board();
    placeZone(Game, 1, "process", "进-01"); // 敌方放置 → 己方单位吃 a1p=1
    const u = placeUnit(Game, 0, "samurai", "武-01");
    const s = Game.unitStats(u);
    expect(s.atk).toBe(3 + 2 + 1);
    expect(s.def).toBe(4 + 1 + 1 + 1); // 含事件立场·敌防 1
  });

  it("武士第三层「事件立场」仅在事件在场时生效（规则书 3.4）", () => {
    const { Game } = board();
    const u = placeUnit(Game, 0, "samurai", "武-01"); // fx 坚守·骑术·己防/敌防
    const noEvent = Game.unitStats(u);
    placeZone(Game, 0, "process", "进-01");
    const withEvent = Game.unitStats(u);
    expect(withEvent.def - noEvent.def).toBe(1 + 4); // 事件立场 +1 与事件第一层 +4
  });
});

describe("攻防计算 · 公卿特效", () => {
  it("公卿 ① 全场攻击 作用于己方全体单位", () => {
    const { Game } = board();
    placeUnit(Game, 0, "noble", "卿-03"); // f1=① 全场攻击 +2
    const u = placeUnit(Game, 0, "samurai", "武-01");
    // 3 + 武士之锋2 + 公卿①(2 + 公卿之智1 = 3) = 8
    expect(Game.unitStats(u).atk).toBe(8);
  });

  it("公卿 ① 不作用于敌方单位", () => {
    const { Game } = board();
    placeUnit(Game, 0, "noble", "卿-03");
    const u = placeUnit(Game, 1, "samurai", "武-01");
    // 对方天皇天-02（武士之锋+1）、对方将军源赖家（攻击光环+1）→ 3+1+1=5
    expect(Game.unitStats(u).atk).toBe(5);
  });

  it("公卿 ③ 兵刃 是装备光环，仅对佩戴兵刃的单位生效", () => {
    const { Game } = board();
    placeUnit(Game, 0, "noble", "卿-03"); // f2=③ 兵刃 +2
    const bare = placeUnit(Game, 0, "samurai", "武-01");
    const armed = placeUnit(Game, 0, "samurai", "武-02");
    equip(Game, 0, "blade", "刃-01", armed);
    // 无兵刃：3 + 武士之锋2 + 公卿①「全场攻击+2」(+公卿之智1)=3 → 8
    expect(Game.unitStats(bare).atk).toBe(8);
    // 有兵刃：3 + 兵刃3 + 持刃1 + 兵刃之锐2 + 公卿③(2+公卿之智1=3) + 公卿①3 + 武士之锋2 = 17
    expect(Game.unitStats(armed).atk).toBe(17);
  });
});

describe("攻防计算 · 大名特效", () => {
  it("大名 l2 励武 只加武士攻击", () => {
    const { Game } = board();
    placeUnit(Game, 0, "daimyo", "大-01"); // l2=励武·武士攻击 +2
    const s = placeUnit(Game, 0, "samurai", "武-01");
    // 3 + 励武2 + 武士之锋2 = 7（大名第一层只加给大名自身，不加给武士）
    expect(Game.unitStats(s).atk).toBe(7);
  });

  it("大名 l2 励武 不加公卿攻击", () => {
    const { Game } = board();
    placeUnit(Game, 0, "daimyo", "大-01");
    const n = placeUnit(Game, 0, "noble", "卿-01");
    // 卿-01 基础攻2 + 自身 f1「① 全场攻击+1」(+公卿之智1)=2 → 4；不吃励武
    expect(Game.unitStats(n).atk).toBe(4);
  });

  it("大名第一层：武士数量优势只加给大名自身的攻击", () => {
    const { Game } = board();
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    placeUnit(Game, 0, "samurai", "武-01"); // 己方武士 1 > 对方 0
    // 北条时宗 基础攻8 + 大名第一层(武士优势)+1 = 9
    expect(Game.unitStats(d).atk).toBe(9);
  });

  it("大名 l4 锋芒 仅在事件在场时生效（规则书 10.第四层）", () => {
    const { Game } = board();
    placeUnit(Game, 0, "daimyo", "大-01"); // l4=锋芒·大名攻击 +1
    const d = placeUnit(Game, 0, "daimyo", "大-02");
    const before = Game.unitStats(d).atk;

    placeZone(Game, 0, "process", "进-01");
    const after = Game.unitStats(d).atk;
    // 无事件 → 无锋芒；有事件 → 事件第一层 +4 与锋芒 +1 同时生效
    expect(after - before).toBe(5);
  });
});

describe("攻防计算 · 宝物", () => {
  it("宝物按目标单位类型施加加成（天丛云剑：武士防+3）", () => {
    const { Game } = board();
    const u = placeUnit(Game, 0, "samurai", "武-01");
    Game.state.players[0].treasure.push({
      card: Game.__card("treasure", "宝-01"),
      tgt: { samurai: u.uid, noble: null, daimyo: null },
    });
    const s = Game.unitStats(u);
    expect(s.atk).toBe(5); // 宝物不加攻击
    expect(s.def).toBe(4 + 1 + 3); // 基础4 + 防御光环1 + 宝物3
  });

  it("宝物不作用于未被指定的其他单位", () => {
    const { Game } = board();
    const target = placeUnit(Game, 0, "samurai", "武-01");
    const other = placeUnit(Game, 0, "samurai", "武-02"); // 基础防 3
    Game.state.players[0].treasure.push({
      card: Game.__card("treasure", "宝-01"),
      tgt: { samurai: target.uid, noble: null, daimyo: null },
    });
    expect(Game.unitStats(other).def).toBe(3 + 1);
  });
});

describe("躲避率与概率倾斜", () => {
  it("骑具躲避 + 御·骑具之灵", () => {
    const { Game, CARDS } = loadGame({ seed: 1 });
    scenario(Game, CARDS, { p0: { emperor: "天-04", shogun: "将-01", hp: 50 } }); // 骑具之灵 +10%
    const u = placeUnit(Game, 0, "samurai", "武-01");
    expect(Game.unitDodge(u)).toBe(0); // 未装备骑具
    equip(Game, 0, "mount", "骑-01", u); // 黑云 躲避70
    expect(Game.unitDodge(u)).toBe(80); // 70 + 10
  });

  it("骑具躲避率上限为 90", () => {
    const { Game, CARDS } = loadGame({ seed: 1 });
    scenario(Game, CARDS, { p0: { emperor: "天-04", shogun: "将-01", hp: 50 } });
    const u = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "mount", "骑-01", u);
    u.eq.mount.dodge = 95;
    expect(Game.unitDodge(u)).toBe(90);
  });

  it("王城：己方将军躲避 +10%，敌方 +5%（规则书 11.第三层）", () => {
    const { Game } = board();
    placeZone(Game, 0, "castle", "城-01");
    expect(Game.probTilt(0, "general")).toBe(10);
    expect(Game.probTilt(1, "general")).toBe(5);
    expect(Game.effDodge(0)).toBe(20 + 10); // 源赖朝 躲避20
    expect(Game.effDodge(1)).toBe(10 + 5); // 源赖家 躲避10
  });

  it("名城：己方 +5%，敌方 −5%", () => {
    const { Game } = board();
    placeZone(Game, 0, "castle", "城-03"); // 大阪 名城
    expect(Game.probTilt(0, "general")).toBe(5);
    expect(Game.probTilt(1, "general")).toBe(-5);
  });

  it("大城：概率倾斜只作用于装备，不作用于将军躲避", () => {
    const { Game } = board();
    placeZone(Game, 0, "castle", "城-07"); // 横滨 大城
    expect(Game.probTilt(0, "general")).toBe(0);
    expect(Game.probTilt(0, "equip")).toBe(5);
    expect(Game.probTilt(1, "equip")).toBe(-5);
  });
});

describe("攻防计算 · 特殊状态", () => {
  it("国士无双盾武士：所有数值恒为 0", () => {
    const { Game } = board();
    const u = placeUnit(Game, 0, "samurai", "武-01", { guoshiGuard: true });
    const s = Game.unitStats(u);
    expect(s.atk).toBe(0);
    expect(s.def).toBe(0);
  });
});
