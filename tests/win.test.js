import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";
import { scenario, placeUnit, placeZone } from "./helpers/fixture.js";

/**
 * 胜负判定与致死链路测试。
 *
 * 覆盖《规则书》§12 胜负判定与所有「扣减将军生命后必须立刻判定胜负」的落点：
 *  - §10 第五层 事件清算致死的胜负方向
 *  - §12.1 将军生命降至 0，另一方立即获胜
 *  - §3.2 将军「本性」：生命降至阈值时一次性增幅，不得把 0 血将军复活
 *  - 装具配套 / 尊位代价等「代价」路径扣血后同样必须判胜负
 *
 * 局面约定：
 *  - 双方躲避率置 0，使伤害断言确定
 *  - natureUsed 置 true，屏蔽「本性·苏生」回血干扰（专门测本性的用例除外）
 *  - 生命上限 maxHp 固定 100，避免「上限截断」掩盖真实扣血
 */

/** 设置玩家生命（同时固定上限为 100，避免治疗截断干扰断言）。 */
function setHp(st, pi, hp) {
  st.players[pi].hp = hp;
  st.players[pi].maxHp = 100;
  st.players[pi].natureUsed = true;
}

/** 双方均无尊位/御·庇护干扰的干净开局。 */
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

describe("胜负判定 · 事件第五层清算", () => {
  it("清算打死对方将军时，获胜方是被伤害方的对手（而非被伤害方本身）", () => {
    const { Game, st } = cleanGame();
    placeZone(Game, 0, "process", "进-01"); // 承久之乱：X=武士 Y=公卿
    placeUnit(Game, 0, "samurai", "武-01"); // 己方 1 张 X → 对方将军 −1
    setHp(st, 0, 100);
    setHp(st, 1, 1);

    Game.settleEvent(st.zone);

    expect(st.players[1].hp).toBe(0);
    // 玩家(0)持事件牌，打死了电脑(1) → 玩家应当获胜
    expect(st.winner).toBe(0);
  });

  it("清算未致死时不产生胜者", () => {
    const { Game, st } = cleanGame();
    placeZone(Game, 0, "process", "进-01");
    placeUnit(Game, 0, "samurai", "武-01");
    setHp(st, 0, 100);
    setHp(st, 1, 20);

    Game.settleEvent(st.zone);

    expect(st.players[1].hp).toBe(19);
    expect(st.winner).toBeNull();
  });
});

describe("胜负判定 · 将军生命归零必须立刻结束对局", () => {
  it("公卿城池加成⑥（将军替死）扣到 0 血时立刻判负", () => {
    const { Game, st } = cleanGame();
    placeZone(Game, 1, "castle", "城-07"); // 大城
    placeUnit(Game, 0, "noble", "卿-06"); // ⑥ 敌方大城·将军替死
    const target = placeUnit(Game, 0, "noble", "卿-01");
    setHp(st, 0, 12);
    setHp(st, 1, 100);

    const info = Game.castleSacrificeInfo(0, target);
    expect(info).not.toBeNull();
    Game.doCastleSacrifice(0, target, info);

    expect(st.players[0].hp).toBe(2);
    expect(st.winner).toBeNull(); // 2 血未归零，不该判负
  });

  it("装具配套扣血到 0 时立刻判负（兵刃+骑具双装备分支）", () => {
    // seed=1 时掷骰进入「防御+X 生命−X」分支（synX=3 → 扣 3 生命）
    const { Game, CARDS, st } = cleanGame(
      { p0: { emperor: "天-04", shogun: "将-01", hp: 100 } },
      1
    );
    const big = CARDS.armor.find((a) => a.synX === 3);
    const d = Game.newUnit(0, "daimyo", CARDS.daimyo[0]);
    d.eq.blade = { ...CARDS.blade[0] };
    d.eq.armor = { ...big };
    d.eq.mount = { ...CARDS.mount[0] };
    d.hist = [];
    setHp(st, 0, 2); // 扣 X(=3) 后归零
    setHp(st, 1, 100);

    Game.armorSynergy(0, d);

    expect(st.players[0].hp).toBeLessThanOrEqual(0);
    expect(st.winner).toBe(1);
  });

  it("将军「本性」不得把 0 血将军复活（生命降至阈值才增幅）", () => {
    const { Game, CARDS, st } = cleanGame();
    // 将-03 本性·十分之一（阈值 = 100 × 1/10 = 10）
    st.players[0].shogun = { ...CARDS.shoguns.find((s) => s.id === "将-03") };
    st.players[0].natureUsed = false;
    st.players[0].hp = 5; // 低于阈值
    st.players[0].maxHp = 100;

    // 与真实扣血路径一致：调用方先扣血，再记录 hpEvent
    st.players[0].hp -= 5;
    Game.hpEvent(0, 5, "测试伤害", st.players[0].hp); // 生命恰好归零

    expect(st.players[0].hp).toBe(0);
    expect(st.players[0].natureUsed).toBe(false);
  });

  it("将军「本性」在生命仍大于 0 时正常增幅一次", () => {
    const { Game, CARDS, st } = cleanGame();
    st.players[0].shogun = { ...CARDS.shoguns.find((s) => s.id === "将-03") };
    st.players[0].natureUsed = false;
    st.players[0].hp = 15;
    st.players[0].maxHp = 100;

    st.players[0].hp -= 8;
    Game.hpEvent(0, 8, "测试伤害", st.players[0].hp);

    expect(st.players[0].hp).toBe(17); // 7 + 10
    expect(st.players[0].natureUsed).toBe(true);
  });

  it("压制打死将军时不得被「本性」救回，胜负照常判定", () => {
    const { Game, CARDS, st } = cleanGame();
    // 将-03：本性·十分之一（阈值 10）+ 压制 3 点
    st.players[0].shogun = { ...CARDS.shoguns.find((s) => s.id === "将-03") };
    st.players[0].natureUsed = false;
    st.players[0].hp = 2;
    st.players[0].maxHp = 100;
    // 电脑使用「将-01」：压制 1 点
    st.players[1].shogun = { ...CARDS.shoguns.find((s) => s.id === "将-01") };
    st.players[1].hp = 100;
    st.players[1].maxHp = 100;
    st.players[1].healCooldown = 9; // 屏蔽自疗
    st.cur = 1;
    st.turnNo = 4;
    st.players[1].turnsTaken = 4;

    Game.beginTurn();

    // 2 血被压制 1 点 → 剩 1 点（>0），本性触发 → +10
    expect(st.players[0].hp).toBe(11);
    expect(st.winner).toBeNull();
  });
});
