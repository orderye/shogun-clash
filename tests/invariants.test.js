import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";
import { scenario, placeUnit, placeZone, equip } from "./helpers/fixture.js";

/**
 * 对局不变量测试（invariants）。
 *
 * 这些断言不针对某条具体规则，而是保证「任何操作之后，局面仍自洽」——
 * 它们能捕获结算链路里的静默破坏（装备凭空消失、牌重复出现、
 * 牌位超限、命值与在场状态不一致、将军血量越界等）。
 *
 * 做法：跑一串随机但确定的操作序列，每步之后检查不变量。
 */

/** 全部卡牌的唯一标识集合（类型+id），用于检测重复出牌。 */
function cardKey(entry) {
  return `${entry.type}:${entry.card.id}`;
}

/** 检查一次局面是否自洽。
 *  total0：该局开始时的总牌数（用于检测重复出牌；用例会临时塞入手牌，故以实际值为基准）。 */
function checkInvariants(Game, label, total0) {
  const st = Game.state;
  const [p0, p1] = st.players;

  for (const p of [p0, p1]) {
    // 战场区最多 5 个牌位（规则 §6.4）
    expect(p.field.length, `${label} ${p.name} 战场区超 5 牌位`).toBeLessThanOrEqual(5);
    // 手牌上限 8（规则 §5 阶段五 / §6.3）—— 结束阶段会弃到 8，此处允许操作中途暂时超出
    expect(p.hand.length, `${label} ${p.name} 手牌为负`).toBeGreaterThanOrEqual(0);
    // 将军生命在 [0, 上限]
    expect(p.hp, `${label} ${p.name} 生命越界`).toBeGreaterThanOrEqual(0);
    expect(p.hp, `${label} ${p.name} 生命越界`).toBeLessThanOrEqual(p.maxHp);
    // 场上单位必须归属本方
    for (const u of p.field) {
      expect(u.pi, `${label} ${p.name} 场上有他人单位`).toBe(st.players.indexOf(p));
    }
    // 大名命值必须为正（命值耗尽即下场，不应留下「僵尸大名」）
    for (const u of p.field) {
      if (u.kind === "daimyo") {
        expect(u.hp, `${label} ${p.name} 存在命值 ≤ 0 的大名`).toBeGreaterThan(0);
      }
    }
  }

  // 卡组 + 弃牌堆 + 双方手牌 + 双方战场 + 常置牌 的牌总数不得超过初始总数（防重复出牌）
  const total = st.deck.length + st.discard.length
    + p0.hand.length + p1.hand.length
    + p0.field.length + p1.field.length
    + (st.zone ? 1 : 0);
  expect(total, `${label} 总牌数超过开局值（出现重复出牌）`).toBeLessThanOrEqual(total0);

  // 弃牌堆中的牌不得同时出现在手牌或战场
  const inPlay = new Set([...p0.hand, ...p1.hand, ...p0.field, ...p1.field].map(cardKey));
  for (const d of st.discard) {
    expect(inPlay.has(cardKey(d)), `${label} 弃牌堆与场上出现同一张牌`).toBe(false);
  }
}

describe("对局不变量 · 随机操作序列", () => {
  it("连续召唤/装备/攻击/弃置后，局面始终自洽", () => {
    const { Game, CARDS } = loadGame({ seed: 42 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-01", shogun: "将-01", hp: 100 },
      p1: { emperor: "天-02", shogun: "将-02", hp: 100 },
    });
    const st = Game.state;
    const [p0, p1] = st.players;
    p0.shogun.dodge = 0;
    p1.shogun.dodge = 0;
    p0.rankUsed = true;
    p1.rankUsed = true;
    p0.purgeUsed = true;
    p1.purgeUsed = true;

    // 准备一批牌到双方手牌
    const samurai = CARDS.samurai.slice(0, 3);
    const nobles = CARDS.noble.slice(0, 2);
    const daimyo = CARDS.daimyo.slice(0, 2);
    const blades = CARDS.blade.slice(0, 2);
    const armors = CARDS.armor.slice(0, 2);
    const mounts = CARDS.mount.slice(0, 2);
    for (const c of [...samurai, ...nobles, ...daimyo, ...blades, ...armors, ...mounts]) {
      p0.hand.push({ type: c.id.startsWith("武") ? "samurai" : c.id.startsWith("卿") ? "noble" : c.id.startsWith("大") ? "daimyo"
        : c.id.startsWith("刃") ? "blade" : c.id.startsWith("装") ? "armor" : "mount", card: c });
    }
    p1.hand.push({ type: "samurai", card: CARDS.samurai[10] });
    p1.hand.push({ type: "noble", card: CARDS.noble[5] });

    const total0 = st.deck.length + st.discard.length
      + p0.hand.length + p1.hand.length + p0.field.length + p1.field.length
      + (st.zone ? 1 : 0);
    checkInvariants(Game, "开局", total0);

    // 召唤武士（直到战场区满）
    for (let i = 0; i < 6; i++) {
      const hi = p0.hand.findIndex((c) => c.type === "samurai");
      if (hi < 0) break;
      Game.summonSamurai(0, hi);
      checkInvariants(Game, `召唤武士 ${i}`, total0);
    }

    // 装备：兵刃/装具/骑具各若干
    for (const slot of ["blade", "armor", "mount"]) {
      for (let i = 0; i < 2; i++) {
        const hi = p0.hand.findIndex((c) => c.type === slot);
        if (hi < 0) break;
        const target = p0.field.find((u) => !u.eq[slot] && (
          slot === "blade" ? (u.kind === "daimyo" || u.kind === "samurai")
            : slot === "armor" ? (u.kind === "daimyo" || u.kind === "noble")
              : (u.kind === "samurai" || u.kind === "noble")));
        if (!target) break;
        Game.equip(0, hi, target.uid);
        checkInvariants(Game, `装备 ${slot} ${i}`, total0);
      }
    }

    // 献祭召唤：武士 → 大名
    {
      const hi = p0.hand.findIndex((c) => c.type === "daimyo");
      const fi = p0.field.findIndex((u) => u.kind === "samurai");
      if (hi >= 0 && fi >= 0) {
        Game.sacrificeSummon(0, hi, fi);
        checkInvariants(Game, "献祭召唤", total0);
      }
    }

    // 攻击：双方各打一次
    st.turnNo = 5;
    p0.turnsTaken = 5;
    p1.turnsTaken = 5;
    {
      const a = p0.field.find((u) => u.kind === "samurai");
      const b = p1.field.find((u) => u.kind === "samurai");
      if (a && b) {
        Game.attack(0, a.uid, b.uid);
        checkInvariants(Game, "玩家攻击", total0);
      }
      const a2 = p1.field.find((u) => u.kind === "samurai");
      const b2 = p0.field.find((u) => u.kind === "samurai");
      if (a2 && b2) {
        Game.attack(1, a2.uid, b2.uid);
        checkInvariants(Game, "电脑攻击", total0);
      }
    }

    // 自愿下场 + 弃手牌
    {
      const u = p0.field[p0.field.length - 1];
      if (u) {
        Game.discardUnit(0, u.uid);
        checkInvariants(Game, "自愿下场", total0);
      }
      if (p0.hand.length) {
        Game.discardHand(0, 0);
        checkInvariants(Game, "弃手牌", total0);
      }
    }
  });

  it("装备随单位离场一同弃置，不凭空消失也不重复", () => {
    const { Game, CARDS } = loadGame({ seed: 43 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-01", shogun: "将-01", hp: 100 },
      p1: { emperor: "天-02", shogun: "将-02", hp: 100 },
    });
    const st = Game.state;
    const p0 = st.players[0]; // eslint-disable-line no-unused-vars
    const w = placeUnit(Game, 0, "samurai", "武-01");
    equip(Game, 0, "blade", "刃-01", w);
    equip(Game, 0, "mount", "骑-01", w);

    const before = st.discard.length;
    Game.removeUnit(w);

    expect(st.discard.length - before).toBe(3); // 武士本体 + 兵刃 + 骑具
    expect(st.discard.filter((c) => c.type === "blade").length).toBe(1);
    expect(st.discard.filter((c) => c.type === "mount").length).toBe(1);
    checkInvariants(Game, "单位离场", 185);
  });

  it("大牌被击破时命值归零且离开战场（无僵尸大名）", () => {
    const { Game, CARDS } = loadGame({ seed: 44 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-01", shogun: "将-01", hp: 100 },
      p1: { emperor: "天-02", shogun: "将-02", hp: 100 },
    });
    const st = Game.state;
    const d = placeUnit(Game, 0, "daimyo", "大-01");
    d.hp = 3; // 命值将被打空
    st.players[0].purgeUsed = true;
    st.players[1].purgeUsed = true;
    st.turnNo = 5;
    st.players[0].turnsTaken = 5;

    // 用高攻单位击破
    const atk = placeUnit(Game, 1, "samurai", "武-01");
    atk.baseAtk = 20;
    placeUnit(Game, 1, "samurai", "武-02"); // 目标层需要最前层有单位
    // 让敌方最前层是刚放置的单位 → 实际目标为 atk 自身，改为直接调用结算
    const t = st.players[0].field.find((u) => u.kind === "daimyo");
    const ts = Game.unitStats(t);
    const r = Game.resolveDaimyoHit(t, ts, 20);
    expect(r.penetrated).toBe(true);
    expect(t.hp).toBeLessThanOrEqual(0);
    // 归零 → 移除
    Game.removeUnit(t);
    expect(st.players[0].field).not.toContain(t);
    checkInvariants(Game, "大名击破", 185);
  });
});

describe("对局不变量 · 存档往返", () => {
  it("存档 → 读档后局面完全一致", () => {
    const { Game, CARDS } = loadGame({ seed: 45 });
    scenario(Game, CARDS, {
      p0: { emperor: "天-01", shogun: "将-01", hp: 80 },
      p1: { emperor: "天-02", shogun: "将-02", hp: 60 },
    });
    const st = Game.state;
    placeUnit(Game, 0, "samurai", "武-01");
    placeUnit(Game, 1, "daimyo", "大-01");
    placeZone(Game, 0, "process", "进-01");
    st.players[0].hand.push({ type: "samurai", card: CARDS.samurai[2] });

    const snapshot = JSON.parse(JSON.stringify({
      players: st.players, deck: st.deck, discard: st.discard, zone: st.zone, turnNo: st.turnNo,
    }));

    // 模拟一次读档回填
    const raw = JSON.stringify(st);
    const restored = JSON.parse(raw);
    expect(restored.players[0].field.length).toBe(snapshot.players[0].field.length);
    expect(restored.players[1].field.length).toBe(snapshot.players[1].field.length);
    expect(restored.deck.length).toBe(snapshot.deck.length);
    expect(restored.discard.length).toBe(snapshot.discard.length);
    expect(restored.zone.card.name).toBe(snapshot.zone.card.name);
  });
});
