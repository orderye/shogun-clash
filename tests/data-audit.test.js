import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";

/**
 * 卡牌数据全量体检（data-audit）。
 *
 * 对 205 张卡牌逐类核对规则书给出的硬约束，并额外检查：
 *  - 字段齐备性（链接字段缺失会让联动效果静默失效）
 *  - 数值区间与配比
 *  - 名称唯一性（重名会让按名称查卡与 UI 弹窗指向错误卡牌）
 *  - 交叉一致性（如 X/Y 有序组合覆盖、l4 数值随等级递减）
 */

const { CARDS } = loadGame({ seed: 1 });
const all = Object.entries(CARDS);

describe("卡牌数据 · 总量与结构", () => {
  it("各类型牌数与规则书一致", () => {
    const counts = Object.fromEntries(all.map(([k, v]) => [k, v.length]));
    expect(counts).toEqual({
      emperors: 10, shoguns: 10,
      daimyo: 20, samurai: 55, noble: 15,
      process: 10, castle: 10, treasure: 10, sacred: 10, calamity: 10,
      blade: 15, armor: 15, mount: 15,
    });
  });

  it("共用卡组合计 185 张（不含 10 天皇 + 10 将军）", () => {
    const shared = all.filter(([k]) => !["emperors", "shoguns"].includes(k))
      .reduce((n, [, v]) => n + v.length, 0);
    expect(shared).toBe(185);
  });

  it("所有卡牌 id 唯一且非空", () => {
    const ids = all.flatMap(([, v]) => v.map((c) => c.id));
    expect(ids.every((id) => typeof id === "string" && id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("所有卡牌名称唯一（重名会让 UI 弹窗指向错误卡牌）", () => {
    const names = all.flatMap(([, v]) => v.map((c) => c.name));
    expect(new Set(names).size).toBe(names.length);
  });

  it("所有卡牌都有名称与简介", () => {
    for (const [, list] of all) {
      for (const c of list) {
        expect(c.name, `${c.id} 缺名称`).toBeTruthy();
        expect(c.intro, `${c.id} 缺简介`).toBeTruthy();
      }
    }
  });
});

describe("卡牌数据 · 人物牌数值上限（规则书 §3.3 / §3.4 / §3.5）", () => {
  it("大名牌：攻 5–10、防 4–7、攻防合计 ≤ 15", () => {
    for (const c of CARDS.daimyo) {
      expect(c.atk, `${c.id} 攻`).toBeGreaterThanOrEqual(5);
      expect(c.atk, `${c.id} 攻`).toBeLessThanOrEqual(10);
      expect(c.dfs, `${c.id} 防`).toBeGreaterThanOrEqual(4);
      expect(c.dfs, `${c.id} 防`).toBeLessThanOrEqual(7);
      expect(c.atk + c.dfs, `${c.id} 合计`).toBeLessThanOrEqual(15);
    }
  });

  it("武士牌：攻 1–5、防 1–5、攻防合计 ≤ 7", () => {
    for (const c of CARDS.samurai) {
      expect(c.atk, `${c.id} 攻`).toBeGreaterThanOrEqual(1);
      expect(c.atk, `${c.id} 攻`).toBeLessThanOrEqual(5);
      expect(c.dfs, `${c.id} 防`).toBeGreaterThanOrEqual(1);
      expect(c.dfs, `${c.id} 防`).toBeLessThanOrEqual(5);
      expect(c.atk + c.dfs, `${c.id} 合计`).toBeLessThanOrEqual(7);
    }
  });

  it("公卿牌：攻 1–5、防 1–5、攻防合计 ≤ 10", () => {
    for (const c of CARDS.noble) {
      expect(c.atk, `${c.id} 攻`).toBeGreaterThanOrEqual(1);
      expect(c.atk, `${c.id} 攻`).toBeLessThanOrEqual(5);
      expect(c.dfs, `${c.id} 防`).toBeGreaterThanOrEqual(1);
      expect(c.dfs, `${c.id} 防`).toBeLessThanOrEqual(5);
      expect(c.atk + c.dfs, `${c.id} 合计`).toBeLessThanOrEqual(10);
    }
  });
});

describe("卡牌数据 · 人物牌联动字段齐备", () => {
  it("武士三层特效齐备且格式正确（规则书 §3.4）", () => {
    for (const c of CARDS.samurai) {
      const parts = String(c.fx || "").split("·");
      expect(parts.length, `${c.id} 层数`).toBe(3);
      expect(["战意", "坚守"], `${c.id} 第一层`).toContain(parts[0]);
      expect(["持刃", "骑术"], `${c.id} 第二层`).toContain(parts[1]);
      const [mine, theirs] = (parts[2] || "").split("/");
      expect(["己攻", "己防"], `${c.id} 己方项`).toContain(mine);
      expect(["敌攻", "敌防"], `${c.id} 敌方项`).toContain(theirs);
    }
  });

  it("大名四层特效齐备（规则书 §3.3）", () => {
    for (const c of CARDS.daimyo) {
      expect(c.l2, `${c.id} 第二层`).toMatch(/(励武|护卿)/);
      expect(c.l4, `${c.id} 第四层`).toMatch(/(天命|文衡|武备|坚城|锋芒)/);
    }
  });

  it("公卿三特效与城池加成齐备（规则书 §3.5）", () => {
    for (const c of CARDS.noble) {
      for (const f of [c.f1, c.f2, c.f3]) {
        expect(f, `${c.id} 特效`).toMatch(/^[①②③④⑤]/);
        expect(f, `${c.id} 特效数值`).toMatch(/\d/);
      }
      expect(c.castle, `${c.id} 城池加成`).toMatch(/[①②③④⑤⑥]/);
    }
  });
});

describe("卡牌数据 · 装备牌字段齐备（联动字段缺失会让效果静默失效）", () => {
  it("兵刃：攻 1–3、成长概率 10–30%、器魂 1–5", () => {
    for (const c of CARDS.blade) {
      expect(c.atk, `${c.id} 攻`).toBeGreaterThanOrEqual(1);
      expect(c.atk, `${c.id} 攻`).toBeLessThanOrEqual(3);
      expect(c.grow, `${c.id} 成长`).toBeGreaterThanOrEqual(10);
      expect(c.grow, `${c.id} 成长`).toBeLessThanOrEqual(30);
      expect(c.soul, `${c.id} 器魂`).toBeGreaterThanOrEqual(1);
      expect(c.soul, `${c.id} 器魂`).toBeLessThanOrEqual(5);
    }
  });

  it("装具：防 1–3、成长概率 10–30%、配套 X/Y 各 1–3", () => {
    for (const c of CARDS.armor) {
      expect(c.dfs, `${c.id} 防`).toBeGreaterThanOrEqual(1);
      expect(c.dfs, `${c.id} 防`).toBeLessThanOrEqual(3);
      expect(c.grow, `${c.id} 成长`).toBeGreaterThanOrEqual(10);
      expect(c.grow, `${c.id} 成长`).toBeLessThanOrEqual(30);
      expect(c.synX, `${c.id} 配套X`).toBeGreaterThanOrEqual(1);
      expect(c.synX, `${c.id} 配套X`).toBeLessThanOrEqual(3);
      expect(c.synY, `${c.id} 配套Y`).toBeGreaterThanOrEqual(1);
      expect(c.synY, `${c.id} 配套Y`).toBeLessThanOrEqual(3);
    }
  });

  it("骑具：躲避率 30–70%、的卢之魂 1–3", () => {
    for (const c of CARDS.mount) {
      expect(c.dodge, `${c.id} 躲避`).toBeGreaterThanOrEqual(30);
      expect(c.dodge, `${c.id} 躲避`).toBeLessThanOrEqual(70);
      expect(c.soul, `${c.id} 魂`).toBeGreaterThanOrEqual(1);
      expect(c.soul, `${c.id} 魂`).toBeLessThanOrEqual(3);
    }
  });
});

describe("卡牌数据 · 化身牌（规则书 §3.1 / §3.2）", () => {
  it("天皇：三条轨道格式正确、庇护代价齐备、天皇之怒齐备", () => {
    for (const c of CARDS.emperors) {
      for (const t of [c.t1, c.t2, c.t3]) {
        expect(t, `${c.id} 轨道`).toMatch(/^御·.+ \+\d+%?$/);
      }
      expect(c.ps, `${c.id} 庇护武士`).toBeGreaterThanOrEqual(5);
      expect(c.ps, `${c.id} 庇护武士`).toBeLessThanOrEqual(15);
      expect(c.pn, `${c.id} 庇护公卿`).toBeGreaterThanOrEqual(10);
      expect(c.pn, `${c.id} 庇护公卿`).toBeLessThanOrEqual(20);
      expect(["武士", "公卿", "大名"], `${c.id} 怒X`).toContain(c.wrathX);
      expect(c.wrathY, `${c.id} 怒Y`).toBeGreaterThanOrEqual(1);
      expect(c.wrathY, `${c.id} 怒Y`).toBeLessThanOrEqual(3);
    }
  });

  it("天皇：三条轨道互不重复", () => {
    for (const c of CARDS.emperors) {
      const names = [c.t1, c.t2, c.t3].map((t) => t.replace(/ \+\d+%?$/, ""));
      expect(new Set(names).size, `${c.id} 轨道重复`).toBe(3);
    }
  });

  it("将军：躲避率 10–30%、双技能/天赋/本性/尊位齐备", () => {
    for (const c of CARDS.shoguns) {
      expect(c.dodge, `${c.id} 躲避`).toBeGreaterThanOrEqual(10);
      expect(c.dodge, `${c.id} 躲避`).toBeLessThanOrEqual(30);
      expect(["自疗", "压制"], `${c.id} 技能`).toContain(c.skill);
      expect(c.skillv, `${c.id} 技能值`).toMatch(/\d/);
      expect(c.talent, `${c.id} 天赋`).toMatch(/天赋·(大名|公卿|武士)/);
      expect(c.nature, `${c.id} 本性`).toMatch(/本性·(十分之一|三分之一|五分之一)/);
      expect(c.rank, `${c.id} 尊位`).toMatch(/尊位·/);
      expect(c.aura, `${c.id} 光环`).toMatch(/武士·公卿 (攻击|防御) \+\d/);
    }
  });
});

describe("卡牌数据 · 事件牌（规则书 §10）", () => {
  it("X/Y 均为人物类型且同牌 X ≠ Y", () => {
    for (const c of CARDS.process) {
      expect(["武士", "公卿", "大名"], `${c.id} X`).toContain(c.x);
      expect(["武士", "公卿", "大名"], `${c.id} Y`).toContain(c.y);
      expect(c.x, `${c.id} X≠Y`).not.toBe(c.y);
    }
  });

  it("X/Y 有序组合覆盖全部 6 种", () => {
    const combos = new Set(CARDS.process.map((c) => `${c.x}-${c.y}`));
    expect(combos.size).toBe(6);
  });

  it("第四层为破阵或暗杀二选一，且代价为正整数", () => {
    for (const c of CARDS.process) {
      expect(["破阵", "暗杀"], `${c.id} 第四层`).toContain(c.l4);
      expect(c.cost, `${c.id} 代价`).toBeGreaterThan(0);
    }
  });

  it("第一层/第二层数值为正整数", () => {
    for (const c of CARDS.process) {
      for (const k of ["a1o", "a1p", "a2o", "a2p"]) {
        expect(c[k], `${c.id} ${k}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("卡牌数据 · 城池牌（规则书 §11）", () => {
  it("等级配比：王城 2 / 名城 4 / 大城 4", () => {
    const byTier = { 王城: 0, 名城: 0, 大城: 0 };
    for (const c of CARDS.castle) {
      expect(Object.keys(byTier), `${c.id} 等级`).toContain(c.tier);
      byTier[c.tier]++;
    }
    expect(byTier).toEqual({ 王城: 2, 名城: 4, 大城: 4 });
  });

  it("大城无第五层（募兵）", () => {
    for (const c of CARDS.castle) {
      if (c.tier === "大城") expect(c.l5, `${c.id} 第五层`).toBe("无");
      else expect(c.l5, `${c.id} 第五层`).toMatch(/募兵/);
    }
  });

  it("第四层四个数值按「己方大名下场／己方公卿下场／敌方公卿上场／敌方大名上场」顺序且随等级递减", () => {
    for (const c of CARDS.castle) {
      // 卡面 l4 以「−」/「+」标注方向；数值本身取绝对值比较
      const nums = c.l4.split("／").map((s) => parseInt(s.match(/(\d+)/)[1], 10));
      expect(nums.length, `${c.id} 第四层数值个数`).toBe(4);
      // 方向标注：前两项为「下场」（负号），后两项为「上场」（正号）
      const parts = c.l4.split("／").map((x) => x.trim());
      expect(parts[0], `${c.id} 大名下场符号`).toMatch(/^−/);
      expect(parts[1], `${c.id} 公卿下场符号`).toMatch(/^−/);
      expect(parts[2], `${c.id} 敌公卿上场符号`).toMatch(/^\+/);
      expect(parts[3], `${c.id} 敌大名上场符号`).toMatch(/^\+/);
      // 等级越高数值越大：王4/名3/大2、王3/名2/大1
      const tier = { 王城: 3, 名城: 2, 大城: 1 }[c.tier];
      expect(nums[0], `${c.id} 大名下场`).toBe(tier + 1);
      expect(nums[1], `${c.id} 公卿下场`).toBe(tier);
      expect(nums[2], `${c.id} 敌公卿上场`).toBe(tier);
      expect(nums[3], `${c.id} 敌大名上场`).toBe(tier + 1);
    }
  });

  it("增幅一为四选一、增幅二为二选一，且数值齐备", () => {
    for (const c of CARDS.castle) {
      expect(c.amp1, `${c.id} 增幅一`).toMatch(/(将军生命|大名|公卿|武士) \+\d+/);
      expect(c.amp2, `${c.id} 增幅二`).toMatch(/(兵刃|装具) \+\d+/);
    }
  });
});

describe("卡牌数据 · 宝物/圣迹/灾厄（规则书 §3.11 / §3.12 / §3.13）", () => {
  it("宝物：第四层为威压/苦肉、一~三层数值齐备", () => {
    for (const c of CARDS.treasure) {
      expect(["威压", "苦肉"], `${c.id} 第四层`).toContain(c.l4);
      for (const k of ["s1", "n1", "d1"]) {
        expect(c[k], `${c.id} ${k}`).toBeGreaterThanOrEqual(1);
        expect(c[k], `${c.id} ${k}`).toBeLessThanOrEqual(3);
      }
    }
  });

  it("圣迹：第三层为神怒/神佑且神怒神佑各 5 张、第二层齐备", () => {
    const l3 = CARDS.sacred.map((c) => c.l3);
    expect(l3.filter((x) => x === "神怒").length).toBe(5);
    expect(l3.filter((x) => x === "神佑").length).toBe(5);
    for (const c of CARDS.sacred) {
      expect(["神怒", "神佑"], `${c.id} 第三层`).toContain(c.l3);
      expect(c.fx, `${c.id} 第二层`).toBeTruthy();
      expect(["A", "B"], `${c.id} 生命条件`).toContain(c.cond);
    }
  });

  it("灾厄：X 为人物类型、第四层天罚齐备", () => {
    for (const c of CARDS.calamity) {
      expect(["武士", "公卿", "大名"], `${c.id} X`).toContain(c.x);
      expect(c.l4, `${c.id} 第四层`).toBeTruthy();
    }
  });

  it("灾厄第四层的四种天罚语义均可被规则书识别", () => {
    const pats = [/摧毁城池/, /摧毁事件/, /骑具/, /兵刃.*装具/, /更换天皇牌.*将军牌/, /减半/];
    for (const c of CARDS.calamity) {
      expect(pats.some((p) => p.test(c.l4)), `${c.id} 天罚无法识别：${c.l4}`).toBe(true);
    }
  });
});
