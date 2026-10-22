import { describe, it, expect } from "vitest";
import { loadGame, allCards } from "./helpers/load.js";

describe("smoke · 引擎可在 Node 中加载", () => {
  it("能取到 CARDS 与 Game", () => {
    const { CARDS, Game } = loadGame();
    expect(typeof CARDS).toBe("object");
    expect(typeof Game.setup).toBe("function");
    expect(allCards(CARDS).length).toBe(190);
  });

  it("setup 能开一局并分好牌", () => {
    const { Game } = loadGame();
    Game.setup(null, [50, 50]);
    expect(Game.state.players).toHaveLength(2);
    expect(Game.state.deck.length + 10).toBe(170); // 170 张共用卡组，10 张已发到双方手牌
    expect(Game.state.players[0].hand).toHaveLength(5);
    expect(Game.state.players[1].hand).toHaveLength(5);
  });
});
