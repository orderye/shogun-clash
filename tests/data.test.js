import { describe, it, expect } from "vitest";
import { loadGame, allCards } from "./helpers/load.js";

const { CARDS } = loadGame();

/** 规则书 3.x 各章节规定的牌数。 */
const EXPECTED_COUNTS = {
  emperors: 10,
  shoguns: 10,
  daimyo: 20,
  samurai: 55,
  noble: 15,
  process: 10,
  castle: 10,
  treasure: 10,
  sacred: 10,
  calamity: 10,
  blade: 15,
  armor: 15,
  mount: 15,
};

/** 事件牌 X/Y 在数据中用中文书写，settleEvent 内部再做中英映射。 */
const UNIT_KINDS_CN = ["大名", "公卿", "武士"];

describe("数据完整性 · 牌数与标识", () => {
  it("卡牌总数为 205", () => {
    expect(allCards(CARDS)).toHaveLength(205);
  });

  it.each(Object.entries(EXPECTED_COUNTS))("%s 有 %i 张", (type, n) => {
    expect(CARDS[type]).toHaveLength(n);
  });

  it("共用卡组为 185 张（205 减去 10 天皇 + 10 将军）", () => {
    const deckTypes = Object.keys(EXPECTED_COUNTS).filter(
      (t) => t !== "emperors" && t !== "shoguns"
    );
    const deckSize = deckTypes.reduce((sum, t) => sum + CARDS[t].length, 0);
    expect(deckSize).toBe(185);
  });

  it("所有卡牌 id 唯一且非空", () => {
    const ids = allCards(CARDS).map((c) => c.card.id);
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("所有卡牌有名称与简介", () => {
    for (const { type, card } of allCards(CARDS)) {
      expect(typeof card.name, `${type}/${card.id} 缺 name`).toBe("string");
      expect(typeof card.intro, `${type}/${card.id} 缺 intro`).toBe("string");
    }
  });
});

describe("数据完整性 · 规则书对各卡牌类型的约束", () => {
  it("事件牌：X/Y 均为人物类型且 X ≠ Y（规则书 10.第五层）", () => {
    for (const card of CARDS.process) {
      expect(UNIT_KINDS_CN, `${card.id} 的 X 非法`).toContain(card.x);
      expect(UNIT_KINDS_CN, `${card.id} 的 Y 非法`).toContain(card.y);
      expect(card.x, `${card.id} 的 X 与 Y 相同`).not.toBe(card.y);
    }
  });

  it("事件牌：X/Y 有序组合覆盖全部 6 种（规则书 10.第五层）", () => {
    // X/Y 位置有意义（X 作用于己方、Y 作用于对方），故用有序组合统计
    const combos = new Set(CARDS.process.map((c) => `${c.x}/${c.y}`));
    expect(combos.size).toBe(6);
  });

  it("城池牌：等级为 王城/名城/大城 之一（规则书 11）", () => {
    for (const card of CARDS.castle) {
      expect(["王城", "名城", "大城"], `${card.id} 等级非法`).toContain(card.tier);
    }
  });

  it("城池牌：王城 2 张、名城 4 张、大城 4 张（规则书 11 等级表）", () => {
    const count = (tier) => CARDS.castle.filter((c) => c.tier === tier).length;
    expect(count("王城")).toBe(2);
    expect(count("名城")).toBe(4);
    expect(count("大城")).toBe(4);
  });

  it("城池牌：大城无第五层（规则书 11「第五层 · 募兵」：大城无第五层）", () => {
    for (const card of CARDS.castle.filter((c) => c.tier === "大城")) {
      expect(card.l5, `${card.id} 是大城，不应有募兵`).toBe("无");
    }
    for (const card of CARDS.castle.filter((c) => c.tier !== "大城")) {
      expect(card.l5, `${card.id} 非大城，应有第五层募兵`).toBeTruthy();
      expect(card.l5, `${card.id} 非大城，募兵不应为「无」`).not.toBe("无");
    }
  });

  it("天皇：三条轨道均为「御·xxx +N」形式且带数值", () => {
    for (const card of CARDS.emperors) {
      for (const key of ["t1", "t2", "t3"]) {
        expect(card[key], `${card.id} 缺 ${key}`).toBeTruthy();
        expect(card[key], `${card.id}.${key} 缺少数值`).toMatch(/\d/);
        expect(card[key], `${card.id}.${key} 未以「御·」开头`).toMatch(/^御·/);
      }
    }
  });

  it("将军：躲避率为 0-100 的整数，光环带类型与数值", () => {
    for (const card of CARDS.shoguns) {
      expect(Number.isInteger(card.dodge), `${card.id} 躲避率非整数`).toBe(true);
      expect(card.dodge).toBeGreaterThanOrEqual(0);
      expect(card.dodge).toBeLessThanOrEqual(100);
      expect(["攻击", "防御"], `${card.id} 光环类型非法`).toContain(card.aura_type);
      expect(Number.isInteger(card.aura_val), `${card.id} 光环数值非整数`).toBe(true);
    }
  });

  it("人物牌：攻/防为正整数", () => {
    for (const type of ["daimyo", "samurai", "noble"]) {
      for (const card of CARDS[type]) {
        expect(Number.isInteger(card.atk), `${card.id} 攻击非整数`).toBe(true);
        expect(Number.isInteger(card.dfs), `${card.id} 防御非整数`).toBe(true);
        expect(card.atk).toBeGreaterThan(0);
        expect(card.dfs).toBeGreaterThan(0);
      }
    }
  });

  /* 规则书的属性上限（3.3 大名 / 3.4 武士 / 3.5 公卿）——
     新增卡牌时若越界，这里会直接失败，而不是等到对局里才发现。 */

  it("大名牌：攻 5–10、防 4–7、攻防合计 ≤ 15（规则书 3.3）", () => {
    for (const card of CARDS.daimyo) {
      expect(card.atk, `${card.id} 攻击越界`).toBeGreaterThanOrEqual(5);
      expect(card.atk, `${card.id} 攻击越界`).toBeLessThanOrEqual(10);
      expect(card.dfs, `${card.id} 防御越界`).toBeGreaterThanOrEqual(4);
      expect(card.dfs, `${card.id} 防御越界`).toBeLessThanOrEqual(7);
      expect(card.atk + card.dfs, `${card.id} 攻防合计超上限 15`).toBeLessThanOrEqual(15);
    }
  });

  it("武士牌：攻 1–5、防 1–5、攻防合计 ≤ 7（规则书 3.4）", () => {
    for (const card of CARDS.samurai) {
      expect(card.atk, `${card.id} 攻击越界`).toBeGreaterThanOrEqual(1);
      expect(card.atk, `${card.id} 攻击越界`).toBeLessThanOrEqual(5);
      expect(card.dfs, `${card.id} 防御越界`).toBeGreaterThanOrEqual(1);
      expect(card.dfs, `${card.id} 防御越界`).toBeLessThanOrEqual(5);
      expect(card.atk + card.dfs, `${card.id} 攻防合计超上限 7`).toBeLessThanOrEqual(7);
    }
  });

  it("公卿牌：攻 1–5、防 1–5、攻防合计 ≤ 10（规则书 3.5）", () => {
    for (const card of CARDS.noble) {
      expect(card.atk, `${card.id} 攻击越界`).toBeGreaterThanOrEqual(1);
      expect(card.atk, `${card.id} 攻击越界`).toBeLessThanOrEqual(5);
      expect(card.dfs, `${card.id} 防御越界`).toBeGreaterThanOrEqual(1);
      expect(card.dfs, `${card.id} 防御越界`).toBeLessThanOrEqual(5);
      expect(card.atk + card.dfs, `${card.id} 攻防合计超上限 10`).toBeLessThanOrEqual(10);
    }
  });

  it("公卿牌：城池加成必须是 ①～⑥ 之一（规则书 3.5 六选一）", () => {
    const VALID = ["①", "②", "③", "④", "⑤", "⑥"];
    for (const card of CARDS.noble) {
      expect(card.castle, `${card.id} 缺 castle`).toBeTruthy();
      const m = card.castle.match(/^([①②③④⑤⑥])/);
      expect(m, `${card.id} castle 未以圈号开头: ${card.castle}`).toBeTruthy();
      expect(VALID, `${card.id} castle 圈号非法`).toContain(m[1]);
    }
  });

  it("公卿：三层特效带圈号层级与数值（规则书 3.5：①攻击 ②防御 ③兵刃 ④装具 ⑤骑具）", () => {
    for (const card of CARDS.noble) {
      const tiers = [];
      for (const key of ["f1", "f2", "f3"]) {
        expect(card[key], `${card.id} 缺 ${key}`).toBeTruthy();
        const m = card[key].match(/^([①②③④⑤])/);
        expect(m, `${card.id}.${key} 未以圈号开头: ${card[key]}`).toBeTruthy();
        expect(card[key], `${card.id}.${key} 缺少数值`).toMatch(/\d/);
        tiers.push(m[1]);
      }
      expect(new Set(tiers).size, `${card.id} 三层特效圈号有重复`).toBe(3);
    }
  });

  it("兵刃/装具/骑具：数值与联动字段齐备", () => {
    for (const card of CARDS.blade) {
      expect(Number.isInteger(card.atk)).toBe(true);
      expect(card.atk).toBeGreaterThan(0);
      expect(card.grow, `${card.id} 缺成长概率`).toBeGreaterThanOrEqual(0);
      expect(card.grow).toBeLessThanOrEqual(100);
    }
    for (const card of CARDS.armor) {
      expect(Number.isInteger(card.dfs)).toBe(true);
      expect(card.dfs).toBeGreaterThan(0);
      expect(card.grow).toBeGreaterThanOrEqual(0);
      expect(card.grow).toBeLessThanOrEqual(100);
      expect(card.synX, `${card.id} 缺配套 X`).toBeTruthy();
      expect(card.synY, `${card.id} 缺配套 Y`).toBeTruthy();
    }
    for (const card of CARDS.mount) {
      expect(Number.isInteger(card.dodge)).toBe(true);
      expect(card.dodge).toBeGreaterThanOrEqual(0);
      expect(card.dodge).toBeLessThanOrEqual(100);
    }
  });

  it("事件牌：数值字段为正整数", () => {
    for (const card of CARDS.process) {
      for (const key of ["a1o", "a1p", "a2o", "a2p"]) {
        expect(Number.isInteger(card[key]), `${card.id}.${key} 非整数`).toBe(true);
        expect(card[key]).toBeGreaterThan(0);
      }
    }
  });
});
