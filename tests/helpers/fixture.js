/**
 * 构造可控对局局面。
 *
 * 做法：先走一次真实的 setup() 拿到完整合法的 state 骨架（20+ 字段，
 * 手写极易漏字段），再覆写需要控制的字段（化身、手牌、战场、常置牌）。
 * 这样测试既确定又不与真实初始化逻辑脱节。
 */

/** 建立一个干净局面：指定双方化身与生命，清空手牌/战场/常置牌。 */
export function scenario(Game, CARDS, opts = {}) {
  const {
    first = 0,
    p0 = { emperor: "天-01", shogun: "将-01", hp: 50 },
    p1 = { emperor: "天-02", shogun: "将-02", hp: 50 },
    turnNo = 1,
  } = opts;

  const emp = (id) => CARDS.emperors.find((c) => c.id === id);
  const sho = (id) => CARDS.shoguns.find((c) => c.id === id);
  const draft = {
    first,
    avatars: [
      { emperor: emp(p0.emperor), shogun: sho(p0.shogun) },
      { emperor: emp(p1.emperor), shogun: sho(p1.shogun) },
    ],
  };

  Game.setup(draft, [p0.hp, p1.hp]);

  for (const pi of [0, 1]) {
    const p = Game.state.players[pi];
    p.hand = [];
    p.field = [];
    p.treasure = [];
    p.hp = pi === 0 ? p0.hp : p1.hp;
    p.maxHp = p.hp;
  }
  Game.state.turnNo = turnNo;
  Game.state.zone = null;
  return Game;
}

/** 往指定玩家战场放一个单位，extra 用于覆盖单位字段。cardKey 可用 id 或名称。 */
export function placeUnit(Game, pi, type, cardKey, extra = {}) {
  const card = Game.__card(type, cardKey);
  const u = Game.newUnit(pi, type, card);
  Object.assign(u, extra);
  Game.state.players[pi].field.push(u);
  return u;
}

/** 放置常置牌（事件 / 城池）。 */
export function placeZone(Game, pi, type, cardKey) {
  const card = Game.__card(type, cardKey);
  Game.state.zone = { type, card, owner: pi, hist: [] };
  return Game.state.zone;
}

/** 给单位装备一件装备。 */
export function equip(Game, pi, type, cardKey, unit) {
  const card = Game.__card(type, cardKey);
  const slot = { blade: "blade", armor: "armor", mount: "mount" }[type];
  unit.eq[slot] = { name: card.name, ...card };
  return unit;
}

/** 取某玩家某一层（武士/公卿/大名）的所有单位。 */
export function layerOf(Game, pi, kind) {
  return Game.state.players[pi].field.filter((u) => u.kind === kind);
}
