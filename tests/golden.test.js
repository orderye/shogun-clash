import { describe, it, expect } from "vitest";
import { loadGame } from "./helpers/load.js";

/**
 * 黄金快照（golden snapshot）—— 重构护栏。
 *
 * 固定 seed + 固定操作序列 → 断言关键状态快照。
 * 任何对数值计算、流程顺序、随机数消耗顺序的意外改动都会让快照失配，
 * 从而在「改代码」时立刻暴露，而不是等到玩家在浏览器里才发现数值错了。
 *
 * 快照只取确定性字段：不含时间戳、不含 DOM、不含对象引用顺序。
 */

const SEED = 20240610;

/** 把一局状态压成稳定、可比较的纯数据。 */
function snapshot(Game) {
  const st = Game.state;
  return {
    turnNo: st.turnNo,
    cur: st.cur,
    winner: st.winner,
    deckCount: st.deck.length,
    discard: st.discard.map((c) => `${c.type}:${c.card.id}`),
    zone: st.zone ? `${st.zone.type}:${st.zone.card.id}:${st.zone.owner}` : null,
    players: st.players.map((p) => ({
      emperor: p.emperor.id,
      shogun: p.shogun.id,
      hp: p.hp,
      hand: p.hand.map((c) => `${c.type}:${c.card.id}`),
      field: p.field.map((u) => ({
        kind: u.kind,
        id: u.card.id,
        atk: u.baseAtk,
        def: u.baseDef,
        hp: u.hp,
        eq: ["blade", "armor", "mount"]
          .filter((s) => u.eq[s])
          .map((s) => `${s}:${u.eq[s].id}`),
      })),
      typeAtk: { ...p.typeAtk },
    })),
  };
}

describe("黄金快照 · 开局", () => {
  it("固定 seed 下开局完全可重现", () => {
    const { Game } = loadGame({ seed: SEED });
    Game.setup(null, [50, 50]);
    expect(snapshot(Game)).toMatchInlineSnapshot(`
      {
        "cur": 0,
        "deckCount": 175,
        "discard": [],
        "players": [
          {
            "emperor": "天-09",
            "field": [],
            "hand": [
              "armor:装-06",
              "noble:卿-06",
              "samurai:武-07",
              "mount:骑-01",
              "blade:刃-06",
            ],
            "hp": 50,
            "shogun": "将-09",
            "typeAtk": {},
          },
          {
            "emperor": "天-10",
            "field": [],
            "hand": [
              "samurai:武-42",
              "samurai:武-39",
              "process:进-09",
              "samurai:武-27",
              "samurai:武-54",
            ],
            "hp": 49,
            "shogun": "将-03",
            "typeAtk": {},
          },
        ],
        "turnNo": 1,
        "winner": null,
        "zone": null,
      }
    `);
  });

  it("同一 seed 两次开局结果完全一致", () => {
    const a = loadGame({ seed: SEED });
    a.Game.setup(null, [50, 50]);
    const b = loadGame({ seed: SEED });
    b.Game.setup(null, [50, 50]);
    expect(snapshot(a.Game)).toEqual(snapshot(b.Game));
  });

  it("不同 seed 产生不同化身与手牌", () => {
    const a = loadGame({ seed: 1 });
    a.Game.setup(null, [50, 50]);
    const b = loadGame({ seed: 999 });
    b.Game.setup(null, [50, 50]);
    expect(snapshot(a.Game)).not.toEqual(snapshot(b.Game));
  });
});

describe("黄金快照 · 回合流程", () => {
  it("抽牌 → 召唤武士 → 攻击，状态可重现", () => {
    const { Game } = loadGame({ seed: SEED });
    Game.setup(null, [50, 50]);
    const p = Game.state.players[0];

    // 抽一张牌
    Game.drawCard(p);
    expect(p.hand).toHaveLength(6);

    // 若手牌里有武士则召唤一名
    const si = p.hand.findIndex((c) => c.type === "samurai");
    if (si >= 0) {
      Game.summonSamurai(0, si);
      expect(p.field).toHaveLength(1);
      expect(p.field[0].kind).toBe("samurai");
    }

    expect(snapshot(Game)).toMatchInlineSnapshot(`
      {
        "cur": 0,
        "deckCount": 174,
        "discard": [],
        "players": [
          {
            "emperor": "天-09",
            "field": [
              {
                "atk": 2,
                "def": 3,
                "eq": [],
                "hp": null,
                "id": "武-07",
                "kind": "samurai",
              },
            ],
            "hand": [
              "armor:装-06",
              "noble:卿-06",
              "mount:骑-01",
              "blade:刃-06",
              "noble:卿-02",
            ],
            "hp": 50,
            "shogun": "将-09",
            "typeAtk": {},
          },
          {
            "emperor": "天-10",
            "field": [],
            "hand": [
              "samurai:武-42",
              "samurai:武-39",
              "process:进-09",
              "samurai:武-27",
              "samurai:武-54",
            ],
            "hp": 49,
            "shogun": "将-03",
            "typeAtk": {},
          },
        ],
        "turnNo": 1,
        "winner": null,
        "zone": null,
      }
    `);
  });

  it("结束回合后当前玩家切换，且轮次推进", () => {
    const { Game } = loadGame({ seed: SEED });
    Game.setup(null, [50, 50]);
    const before = Game.state.cur;
    const beforeTurn = Game.state.turnNo;
    Game.endTurn();
    expect(Game.state.cur).not.toBe(before);
    expect(Game.state.turnNo).toBe(beforeTurn + 1);
  });
});
