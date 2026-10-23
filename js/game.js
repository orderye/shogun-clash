/* ============================================================
   幕府争锋 · 核心逻辑
   ⚠ 说明：以规则书为基础实现核心可玩流程；部分多层卡牌特效
   （如事件第五层清算、城池募兵、宝物更换天皇、武士第三层事件立场等）
   已按「简化版」实现或标注，可后续扩展。
   ============================================================ */
"use strict";

const KIND_CN = { samurai: "武士", noble: "公卿", daimyo: "大名" };
const TYPE_CN = {
  process: "事件", castle: "城池", treasure: "宝物", blade: "兵刃",
  armor: "装具", mount: "骑具", sacred: "圣迹", calamity: "灾厄"
};

const Game = {
  state: null,
  _uid: 0,

  uid() { return ++this._uid; },

  /* ---------- 对局存档（刷新恢复现场，不重新开局） ---------- */
  SAVE_KEY: "shogunClash.save",
  save() {
    if (typeof localStorage === "undefined") return;
    try {
      // transient 条目（如「已从存档恢复现场」）只在本次会话显示，不写入存档，
      // 否则每次刷新都会往战报里再叠一条同类记录
      const payload = this.state.log.some((l) => l.transient)
        ? { ...this.state, log: this.state.log.filter((l) => !l.transient) }
        : this.state;
      localStorage.setItem(this.SAVE_KEY, JSON.stringify(payload));
    } catch (e) {}
  },
  clearSave() {
    if (typeof localStorage === "undefined") return;
    try { localStorage.removeItem(this.SAVE_KEY); } catch (e) {}
  },
  load() {
    if (typeof localStorage === "undefined") return null;
    let raw = null;
    try { raw = localStorage.getItem(this.SAVE_KEY); } catch (e) { return null; }
    if (!raw) return null;
    try {
      const st = JSON.parse(raw);
      if (!st || !st.players || !Array.isArray(st.players) || st.players.length !== 2 ||
          typeof st.turnNo !== "number" || !Array.isArray(st.deck) || !Array.isArray(st.discard)) return null;
      for (const pl of st.players) { if (!pl.maxHp) pl.maxHp = pl.hp || 50; }
      this.state = st;
      this.backfillCardFields(st); // 旧存档补齐联动字段（装具 synX/synY、兵刃/骑具 soul）
      this.backfillArmorSynergy(); // 已装备装具缺配套记录 → 补算
      this.migrateCastleAmp(st); // 城池增幅由「一次性写入基础值」改为常置光环 → 回退旧档写入值
      return st;
    } catch (e) { return null; }
  },
  /* 旧存档兼容：按卡牌 id 从 CARDS 补齐装备联动字段（配套 X/Y、器魂/的卢之魂 soul） */
  backfillCardFields(st) {
    if (typeof CARDS === "undefined") return;
    const byId = (list) => { const m = {}; for (const c of list) m[c.id] = c; return m; };
    const armors = byId(CARDS.armor), blades = byId(CARDS.blade), mounts = byId(CARDS.mount);
    const fix = (card) => {
      if (!card || !card.id) return;
      if (armors[card.id]) { if (card.synX === undefined) card.synX = armors[card.id].synX; if (card.synY === undefined) card.synY = armors[card.id].synY; }
      if (blades[card.id] && card.soul === undefined) card.soul = blades[card.id].soul;
      if (mounts[card.id] && card.soul === undefined) card.soul = mounts[card.id].soul;
    };
    for (const c of st.deck) fix(c.card);
    for (const c of st.discard) fix(c.card);
    for (const pl of st.players) {
      for (const c of pl.hand || []) fix(c.card);
      for (const u of pl.field || []) {
        for (const s of ["blade", "armor", "mount"]) if (u.eq && u.eq[s]) fix(u.eq[s]);
      }
    }
  },
  /* 旧存档兼容：已装备装具但 hist 无配套记录 → 补算一次配套（按当前兵刃/骑具组合） */
  backfillArmorSynergy() {
    const st = this.state;
    for (let pi = 0; pi < 2; pi++) {
      for (const u of st.players[pi].field || []) {
        if (u.eq && u.eq.armor && !(u.hist || []).some(h => h.src === "装具配套")) {
          try { this.armorSynergy(pi, u); } catch (e) {}
        }
      }
    }
  },
  /* 旧存档兼容：城池增幅曾按「放置时一次性」写入 baseAtk/baseDef，现改为常置光环。
     扫描单位 hist 里的一次性增幅记录，把数值回退掉，避免旧档多算一遍。 */
  migrateCastleAmp(st) {
    for (const pl of st.players || []) {
      for (const u of pl.field || []) {
        if (!Array.isArray(u.hist)) continue;
        const legacy = u.hist.filter(h => h.src === "城池增幅一" || h.src === "城池增幅二");
        if (!legacy.length) continue;
        for (const h of legacy) {
          const n = parseInt((h.desc || "").match(/(\d+)/)?.[1] || "0");
          if (!n) continue;
          if (h.src === "城池增幅二" && (h.desc || "").includes("装具")) {
            u.baseDef = Math.max(0, u.baseDef - n);
          } else {
            u.baseAtk = Math.max(0, u.baseAtk - n);
            if (h.src === "城池增幅一") u.baseDef = Math.max(0, u.baseDef - n);
          }
        }
        u.hist = u.hist.filter(h => h.src !== "城池增幅一" && h.src !== "城池增幅二");
        u.hist.push({ t: st.turnNo || 0, src: "存档迁移", desc: "城池增幅改为常置光环，回退旧档一次性写入值" });
      }
    }
  },
  /* 刷新恢复：AI 回合由 UI 轮询自动续跑（等待 waitingAI 复位后触发 aiGo） */
  resumeAfterReload() {
    const st = this.state;
    if (!st) return;
    st.waitingAI = false;
    // 刷新会丢掉未完成的抉择弹窗，弃置队列并解除等待标记，避免 AI 卡在 prompting
    if ((this._choiceQ && this._choiceQ.length) || st.prompting) {
      this.clearChoices();
      this.log("↻ 刷新丢失了待完成的单位选择，本次效果按默认目标结算", "sys", null, true);
    }
    this.log(`↻ 已从存档恢复现场（第 ${st.turnNo} 回合 · ${st.players[st.cur].name} 的回合）`, "sys", null, true);
    UI.renderAll();
  },

  /* 将军生命事件记录（供详情页伤害历史）；isDamage=true 时触发事件第三层「受创」 */
  hpEvent(pi, dmg, src, hpAfter, isDamage) {
    const p = this.state.players[pi];
    if (!p) return;
    p.hpHist = p.hpHist || [];
    p.hpHist.push({ t: this.state.turnNo, src, dmg, hp: hpAfter });
    if (p.hpHist.length > 14) p.hpHist.shift();
    // 战后共荣：记录「本回合该将军是否成功受到伤害」（用于其对手的回合末结算）
    if (isDamage !== false && dmg > 0) {
      this.state.turnDamage = this.state.turnDamage || {};
      this.state.turnDamage[pi] = (this.state.turnDamage[pi] || 0) + dmg;
    }
    if (isDamage !== false && dmg > 0) this.warFireTough(pi);
    // 将军本性：生命降至阈值后，仅一次增幅总生命 1/10
    // 生命已归零者不再受本性与治疗（规则 §12.1：生命降至 0 即判负）
    if (!p.natureUsed && p.shogun.nature && p.maxHp && p.hp > 0) {
      const n = p.shogun.nature;
      const ratio = n.includes("十分之一") ? 0.1 : n.includes("三分之一") ? 1 / 3 : n.includes("五分之一") ? 0.2 : 0;
      if (ratio && p.hp <= p.maxHp * ratio) {
        p.natureUsed = true;
        const heal = Math.ceil(p.maxHp * 0.1);
        p.hp = Math.min(p.maxHp, p.hp + heal);
        p.hpHist.push({ t: this.state.turnNo, src: "本性·苏生", dmg: -heal, hp: p.hp });
        this.log(`🌸 将军本性【${n}】：生命降至阈值，一次性增幅 +${heal} → ${p.hp}`);
      }
    }
  },

  /* 事件第三层 · 战火磨砺「受创」：己方将军受伤后，己方选一单位防御 +1（玩家点选，AI 取首位） */
  warFireTough(pi) {
    const st = this.state;
    const zz = st.zone;
    if (!zz || zz.type !== "process" || zz.owner !== pi) return;
    const field = st.players[pi].field.slice();
    if (!field.length) return;
    const done = (uid) => {
      const cand = st.players[pi].field.find(x => x.uid === uid);
      if (!cand) return;
      cand.extraDef = (cand.extraDef || 0) + 1;
      cand.hist = cand.hist || [];
      cand.hist.push({ t: st.turnNo, src: "战火·受创", desc: "己方将军受伤，防御 +1" });
      this.zHist(zz, "第三层·战火磨砺·受创", `施展对象：【${cand.card.name}】防御 +1`, zz.owner);
      this.log(`🔥 事件【${zz.card.name}】战火磨砺·受创：${st.players[pi].name} 将军受伤，【${cand.card.name}】防御 +1`);
    };
    this.askPick(pi, {
      title: "🔥 战火磨砺 · 受创",
      body: `己方将军受到伤害：请选择己方战场区一位单位，<b>防御 +1</b>（永久累积）。`,
      cands: field,
      onPick: (uid) => done(uid),
    });
  },

  /* transient=true 的记录仅在本次会话显示，不随存档持久化 */
  log(msg, who = "sys", card = null, transient = false) {
    this._lastAct = Date.now();
    this.state.log.push({ msg, who, card, transient });
    UI.renderLog();
  },

  /* 天皇的三条增幅轨道；「神木的报应」生效期间天皇效果全部失效（规则 §3.12） */
  emperorTracks(p) {
    if (!p || !p.emperor) return [];
    if ((p.emperorDisabled || 0) > 0) return [];
    return [p.emperor.t1, p.emperor.t2, p.emperor.t3].filter(Boolean);
  },

  /* ---------- 开局 ---------- */
  /* 化身抽选（每局开始）：随机先手，先手先抽，不可同卡；剩余化身出局（弃牌堆） */
  draftAvatars() {
    const empPool = [...CARDS.emperors];
    const shoPool = [...CARDS.shoguns];
    const first = Math.random() < 0.5 ? 0 : 1; // 0=玩家先手, 1=电脑先手
    const drawOne = (pool) => pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    const a = [null, null];
    const order = first === 0 ? [0, 1] : [1, 0];
    a[order[0]] = { emperor: drawOne(empPool), shogun: drawOne(shoPool) };
    a[order[1]] = { emperor: drawOne(empPool), shogun: drawOne(shoPool) };
    return { first, avatars: a }; // avatars[0]=玩家, avatars[1]=电脑
  },

  setup(draft, hpArr) {
    this._uid = 0;
    const hp = hpArr || [100, 100]; // 将军生命：玩家 / 电脑（规则 §3.2 基础生命 100）
    const deck = [];
    for (const t of ["daimyo", "samurai", "noble", "process", "castle", "treasure",
                     "sacred", "calamity", "blade", "armor", "mount"]) {
      for (const c of CARDS[t]) deck.push({ type: t, card: c });
    }
    // 洗牌
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    // 化身（抽选结果或内部随机；不可同卡，弃牌堆出局）
    const d = draft || this.draftAvatars();
    const first = d.first;
    const mk = (name, isAI, emp, sho, mhp) => ({
      name, isAI, emperor: emp, shogun: sho,
      hp: mhp, maxHp: mhp, hand: [], field: [], treasure: [], hpHist: [], typeAtk: {},
      emperorHist: [{ t: 0, src: "即位", desc: "开局化身抽选" }],
      turnsTaken: 0, graceCnt: 0, zoneUsed: 0, attackUsed: 0, drawnThisTurn: false,
      summonedThisTurn: 0, summonedDaimyoOrNoble: false,
      noAtkUntil: 0, recruitUsed: false, healCooldown: 0, purgeUsed: false, bypassUsed: false, assassinUsed: false,
      talentCooldown: 3, natureUsed: false, rankUsed: false, rankBlockAttack: false, tempoUsed: false,
      noUnitStreak: 0, // 连续无人物牌（场上+手牌）的己方回合数
      duelStrikeUsed: false, // 春秋义战：对方空场时本回合是否已直击将军（每回合一次）
      imperialT1Used: false, // 帝王之征·条件1（每局一次）
      imperialT2Used: false, // 帝王之征·条件2（每局一次）
      forgeUsed: false, // 装具·熔炉（每回合一次）
      reforgeUsed: false, // 兵刃·断刃重铸（每回合一次）
      moodUsed: {}, // 隐藏特效（春和景明／偶感风寒）每回合各限一次
      gracePenaltyUsed: false, // 义战之恩（每回合一次）
    });
    const players = [mk("玩家", false, d.avatars[0].emperor, d.avatars[0].shogun, hp[0]),
                     mk("电脑", true, d.avatars[1].emperor, d.avatars[1].shogun, hp[1])];
    this.state = {
      players, deck, discard: [], zone: null, log: [],
      turnNo: 1, cur: first, winner: null, waitingAI: false, l4Used: {},
      reshuffled: false, // 卡组洗回标记（整局仅一次，规则 §6.3）
    };
    this.clearChoices();
    const deckTotal = deck.length;
    for (const p of players) { for (let i = 0; i < 5; i++) p.hand.push(deck.pop()); }
    // 起手重抽（规则 §4.3）：起手若无任何武士牌，可将 5 张全部弃置并重抽 5 张（仅一次）
    this.openingRedraw = 0;
    for (const p of players) {
      if (p.hand.some(c => c.type === "samurai")) continue;
      const pi = players.indexOf(p);
      if (p.isAI) {
        this.doOpeningRedraw(pi);
      } else {
        // 玩家：弹出抉择（可放弃）
        this.state.prompting = true;
        UI.askOpeningRedraw(() => {
          this.state.prompting = false;
          this.doOpeningRedraw(pi);
          UI.renderAll();
        });
      }
    }
    this.log("⚔ 开局：共用卡组 " + deckTotal + " 张");
    this.log(`玩家：天皇【${players[0].emperor.name}】 将军【${players[0].shogun.name}】`, "me");
    this.log(`电脑：天皇【${players[1].emperor.name}】 将军【${players[1].shogun.name}】`, "ai");
    this.log("先手：" + (first === 0 ? "玩家" : "电脑") + "（第1、2回合不能攻击）");
    UI.renderAll();
    this.beginTurn();
  },

  /* 起手重抽（规则 §4.3，仅一次）：将 5 张手牌全部弃置并重抽 5 张 */
  doOpeningRedraw(pi) {
    const st = this.state;
    const p = st.players[pi];
    if (this.openingRedraw >= 1) return false;
    if (p.hand.length !== 5) return false;
    if (p.hand.some(c => c.type === "samurai")) return false;
    this.openingRedraw = 1;
    for (const c of p.hand) st.deck.push(c); // 5 张全部弃置（回卡组）
    p.hand = [];
    for (let i = 0; i < 5; i++) p.hand.push(st.deck.pop());
    this.log(`${p.name} 起手无武士牌 → 弃置 5 张并重抽 5 张（仅一次）`, p.isAI ? "ai" : "me");
    return true;
  },

  /* ---------- 属性计算（含光环） ---------- */
  zoneOwner() { return this.state.zone ? this.state.zone.owner : -1; },

  // 城池/事件/天皇/将军 对某玩家的攻防光环加成
  aura(p) {
    const pi = this.state.players.indexOf(p);
    let atk = 0, def = 0;
    let blade = 0, armor = 0, mount = 0;
    // 将军增幅光环：武士·公卿 攻/防 +X
    if (p.shogun.aura_type === "攻击") atk += p.shogun.aura_val;
    else def += p.shogun.aura_val;
    // 天皇轨道
    let bladeBoost = 0, armorBoost = 0, nobleBoost = 0, samuraiAtk = 0;
    for (const tr of this.emperorTracks(p)) {
      if (tr.includes("武士之锋")) samuraiAtk += parseInt(tr.match(/(\d+)/)[1]); // 仅武士攻击 +X
      if (tr.includes("公卿之智")) nobleBoost += parseInt(tr.match(/(\d+)/)[1]); // 公卿特效数值 +X
      if (tr.includes("兵刃之锐")) bladeBoost += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("装具之固")) armorBoost += parseInt(tr.match(/(\d+)/)[1]);
    }
    // 城池（城威与增幅一/二均为常置光环；攻防类增幅在 unitStatParts 中按单位结算）
    const z = this.state.zone;
    if (z && z.type === "castle" && z.owner === pi) {
      atk += z.card.ao; def += z.card.ao; // 城威
    } else if (z && z.type === "castle") {
      atk += z.card.ap; def += z.card.ap; // 敌方城威
    }
    // 事件第一层
    if (z && z.type === "process") {
      const own = z.owner === pi;
      atk += own ? z.card.a1o : z.card.a1p;
      def += own ? z.card.a1o : z.card.a1p;
    }
    // 公卿特效光环（① 全场攻击 / ② 全场防御 / ③ 兵刃+ / ④ 装具+ / ⑤ 骑具+%）
    for (const u of p.field) {
      if (u.kind === "noble") {
        for (const f of [u.card.f1, u.card.f2, u.card.f3]) {
          if (!f) continue;
          if (f.startsWith("①")) atk += parseInt(f.match(/(\d+)/)[1]) + nobleBoost;
          else if (f.startsWith("②")) def += parseInt(f.match(/(\d+)/)[1]) + nobleBoost;
          else if (f.startsWith("③")) blade += parseInt(f.match(/(\d+)/)[1]) + nobleBoost;
          else if (f.startsWith("④")) armor += parseInt(f.match(/(\d+)/)[1]) + nobleBoost;
          else if (f.startsWith("⑤")) mount += parseInt(f.match(/(\d+)/)[1]) + nobleBoost;
        }
      }
    }
    // 大名第二～四层（辅佐/城盟/事件之势）与事件、城池的攻防均为「按单位结算」，
    // 统一在 unitStatParts 中计算，此处不再重复（避免两份规则各自漂移）。
    return { atk, def, blade: blade + bladeBoost, armor: armor + armorBoost, mount, samuraiAtk };
  },

  // 单位当前攻防（含光环与装备）
  /* 每回合可使用的事件/城池牌额度：基准 1 张 + 天皇「事件之速」轨道加成
     （规则 §5 阶段三.1 / §9.1 / §10「每回合限制」/ Q5）。 */
  zoneQuota(pi) {
    const p = this.state.players[pi];
    let bonus = 0;
    for (const tr of this.emperorTracks(p)) {
      if (tr.includes("事件之速")) bonus += parseInt(tr.match(/(\d+)/)[1]);
    }
    return 1 + bonus;
  },

  /* 天皇·事件之速：新效果（每局一次）
     当前事件为己方 → 给予对方总生命 1/10 伤害；当前事件为对方 → 夺取对方一名武士 */
  tempoInfo(pi) {
    const st = this.state;
    const p = st.players[pi];
    if (p.tempoUsed) return { blocked: "本局已使用过事件之速" };
    const z = st.zone;
    if (!z) return { blocked: "事件/城池区为空" };
    if (z.owner === pi) return { kind: "hit", label: "给予对方总生命 1/10 伤害", ok: true };
    const hasSam = st.players[1 - pi].field.some(u => u.kind === "samurai");
    if (!hasSam) return { kind: "steal", blocked: "对方场上无武士可夺取" };
    if (st.players[pi].field.length >= 5) return { kind: "steal", blocked: "己方战场区已满" };
    return { kind: "steal", label: "夺取对方一名武士", ok: true };
  },

  /* 帝王之征（逆境特惠，每局各一次）
     条件1：敌方生命 ≥ 己方生命的 2 倍（多一倍，如我 5 敌 10）→ 回复已失去生命的一半，舍弃所有手牌
     条件2：敌方生命 ≥ 己方生命的 3 倍（多两倍，如我 5 敌 15）→ 回复相差值（敌−己）的一半，舍弃所有手牌与战场区所有牌
     条件达成时右上角显示按钮，条件不够时隐藏 */
  imperialInfo(pi) {
    const st = this.state;
    const p = st.players[pi];
    const opp = st.players[1 - pi];
    const results = [];
    if (!p.imperialT1Used && opp.hp >= p.hp * 2) {
      const lost = Math.max(0, (p.maxHp || 100) - p.hp);
      results.push({ kind: 1, label: `帝王之征·Ⅰ（回复已失去生命的一半 ${Math.floor(lost / 2)}，舍弃所有手牌）`, heal: Math.floor(lost / 2), ok: true });
    }
    if (!p.imperialT2Used && opp.hp >= p.hp * 3) {
      const diff = Math.max(0, opp.hp - p.hp);
      results.push({ kind: 2, label: `帝王之征·Ⅱ（回复相差值的一半 ${Math.floor(diff / 2)}，舍弃手牌与战场区）`, heal: Math.floor(diff / 2), ok: true });
    }
    return results;
  },
  useImperial(pi, kind) {
    const st = this.state;
    const p = st.players[pi];
    const opp = st.players[1 - pi];
    if (kind === 1) {
      if (p.imperialT1Used || opp.hp < p.hp * 2) { this.log("帝王之征·Ⅰ 当前不可用"); return false; }
      const lost = Math.max(0, (p.maxHp || 100) - p.hp);
      const heal = Math.floor(lost / 2);
      p.hp = Math.min(p.maxHp || 100, p.hp + heal);
      this.hpEvent(pi, -heal, "帝王之征·Ⅰ", p.hp);
      for (const c of p.hand) st.discard.push(c);
      const n = p.hand.length;
      p.hand = [];
      p.imperialT1Used = true;
      this.eHist(pi, "帝王之征·Ⅰ", `回复 ${heal}，舍弃手牌 ${n} 张`);
      this.log(`👑 帝王之征·Ⅰ：${p.name} 敌方生命 ≥ 己方，回复 ${heal} 点（已失去生命一半），舍弃所有手牌 ${n} 张 → HP ${p.hp}`, p.isAI ? "ai" : "me");
      UI.renderAll();
      return true;
    }
    if (kind === 2) {
      if (p.imperialT2Used || opp.hp < p.hp * 3) { this.log("帝王之征·Ⅱ 当前不可用"); return false; }
      const diff = Math.max(0, opp.hp - p.hp);
      const heal = Math.floor(diff / 2);
      p.hp = Math.min(p.maxHp || 100, p.hp + heal);
      this.hpEvent(pi, -heal, "帝王之征·Ⅱ", p.hp);
      for (const c of p.hand) st.discard.push(c);
      const n = p.hand.length;
      p.hand = [];
      // 舍弃战场区所有牌（单位下场）
      let m = 0;
      for (const u of p.field.slice()) {
        st.discard.push({ type: u.kind, card: u.card });
        m++;
      }
      p.field = [];
      p.imperialT2Used = true;
      this.eHist(pi, "帝王之征·Ⅱ", `回复 ${heal}，舍弃手牌 ${n} 张与战场区 ${m} 张`);
      this.log(`👑 帝王之征·Ⅱ：${p.name} 敌方生命 ≥ 己方两倍，回复 ${heal} 点（相差值一半），舍弃手牌 ${n} 张与战场区 ${m} 张 → HP ${p.hp}`, p.isAI ? "ai" : "me");
      UI.renderAll();
      return true;
    }
    return false;
  },
  useTempo(pi) {
    const st = this.state;
    const p = st.players[pi];
    const info = this.tempoInfo(pi);
    if (!info || !info.ok) { this.log("事件之速当前不可用"); return false; }
    const z = st.zone;
    p.tempoUsed = true;
    this.eHist(pi, "事件之速", info.kind === "hit" ? "给予对方总生命 1/10 伤害" : "夺取对方一名武士");
    if (info.kind === "hit") {
      const opp = st.players[1 - pi];
      const dmg = Math.max(1, Math.ceil((opp.maxHp || 100) / 10));
      opp.hp -= dmg;
      this.hpEvent(1 - pi, dmg, "事件之速·天罚", opp.hp);
      this.log(`⚡ 事件之速：当前事件为己方【${z.card.name}】，给予对方将军 ${dmg} 点伤害 → ${opp.hp}`);
      if (opp.hp <= 0) { this.win(pi); return true; }
    } else {
      const opp = st.players[1 - pi];
      const cands = opp.field.filter(u => u.kind === "samurai");
      if (!cands.length) { this.log("事件之速：对方场上无武士可夺取"); UI.renderAll(); return false; }
      this.askPick(pi, {
        title: "⚡ 事件之速 · 夺取武士",
        body: `当前事件为对方【${z.card.name}】：请选择要夺取控制权的一位对方武士。`,
        cands,
        onPick: (uid) => {
          const i = opp.field.findIndex(x => x.uid === uid);
          if (i < 0) return;
          const u = opp.field.splice(i, 1)[0];
          u.pi = pi;
          p.field.push(u);
          u.hist = u.hist || [];
          u.hist.push({ t: st.turnNo, src: "事件之速·夺", desc: "控制权转移至己方" });
          this.log(`⚡ 事件之速：当前事件为对方【${z.card.name}】，夺取对方武士【${u.card.name}】控制权！`);
          if (UI.unitEnter) UI.unitEnter(u.uid);
          if (UI.flashUnit) UI.flashUnit(pi, u.uid);
          UI.renderAll();
        },
      });
    }
    UI.renderAll();
    return true;
  },

  /* 大名第二层 · 辅佐：励武（指定一位己方武士 +N 攻击）／护卿（指定一位己方公卿 +N 防御）
     目标由玩家指定（AI 取首个合法目标）；目标离场后自动改指首个合法目标，仍可重新指定 */
  l2Info(d) {
    if (!d.card || !d.card.l2) return null;
    const m = d.card.l2.match(/(励武|护卿)\s*·?\s*([^+]*?)\s*\+?(\d+)/);
    if (!m) return null;
    return { type: m[1], kind: m[1] === "励武" ? "samurai" : "noble", val: parseInt(m[3]) };
  },
  /* 解析该大名当前实际生效的辅佐目标（指定失效时回退为首个合法目标） */
  l2TargetOf(d) {
    const info = this.l2Info(d);
    if (!info) return null;
    const p = this.state.players[d.pi];
    const cur = d.l2Target != null ? p.field.find(x => x.uid === d.l2Target && x.kind === info.kind) : null;
    if (cur) return cur;
    return p.field.find(x => x.kind === info.kind) || null;
  },
  /* 玩家指定辅佐目标 */
  designateL2Target(pi, daimyoUid, targetUid) {
    const p = this.state.players[pi];
    const d = p.field.find(x => x.uid === daimyoUid && x.kind === "daimyo");
    if (!d) return false;
    const info = this.l2Info(d);
    if (!info) return false;
    const t = p.field.find(x => x.uid === targetUid && x.kind === info.kind);
    if (!t) return false;
    d.l2Target = t.uid;
    d.hist = d.hist || [];
    d.hist.push({ t: this.state.turnNo, src: "辅佐·" + info.type, desc: `指定【${t.card.name}】` });
    this.log(`【${d.card.name}】${info.type}：辅佐目标指定为【${t.card.name}】`);
    UI.renderAll();
    return true;
  },

  /* 攻防数值构成明细：返回 { atk, def, rawAtk, rawDef, AP, DP }（AP/DP = [{k,v}]） */
  unitStatParts(u) {
    const st = this.state;
    const p = st.players[u.pi];
    const pi = u.pi;
    // 御·庇护形态：攻击 0、防御 = 卡面攻+防（受击后递减），且本局不再受任何光环增幅
    if (u.purged) {
      const base = (u.card.atk || 0) + (u.card.dfs || 0);
      const def = Math.max(0, base - (u.purgeLoss || 0));
      return {
        atk: 0, def, rawAtk: 0, rawDef: def,
        AP: [{ k: "御·庇护（攻击归零）", v: 0 }],
        DP: [
          { k: "御·庇护（卡面攻+防）", v: base },
          ...(u.purgeLoss ? [{ k: "庇护损耗（受击）", v: -u.purgeLoss }] : []),
        ],
      };
    }
    // 国士无双盾武士：所有数值恒为 0（不受光环/装备影响）
    if (u.guoshiGuard) {
      return { atk: 0, def: 0, rawAtk: 0, rawDef: 0, AP: [{ k: "基础攻击", v: 0 }, { k: "国士无双盾", v: 0 }], DP: [{ k: "基础防御", v: 0 }, { k: "国士无双盾", v: 0 }] };
    }
    const AP = [], DP = [];
    let atk = u.baseAtk, def = u.baseDef;
    AP.push({ k: "基础攻击", v: u.baseAtk });
    DP.push({ k: "基础防御", v: u.baseDef });
    // 将军增幅光环
    if (p.shogun.aura_type === "攻击") { atk += p.shogun.aura_val; AP.push({ k: "将军光环·攻击", v: p.shogun.aura_val }); }
    else { def += p.shogun.aura_val; DP.push({ k: "将军光环·防御", v: p.shogun.aura_val }); }
    // 天皇轨道
    let bladeBoost = 0, armorBoost = 0, nobleBoost = 0, samuraiAtk = 0;
    for (const tr of this.emperorTracks(p)) {
      if (tr.includes("武士之锋")) samuraiAtk += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("公卿之智")) nobleBoost += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("兵刃之锐")) bladeBoost += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("装具之固")) armorBoost += parseInt(tr.match(/(\d+)/)[1]);
      // 御·骑具之灵只影响躲避率，在 unitDodge 中结算，此处不叠加攻防
    }
    // 城池（城威为常置光环；增幅一/二亦为常置光环，在下方按类型/装备结算）
    const z = st.zone;
    if (z && z.type === "castle") {
      if (z.owner === pi) {
        atk += z.card.ao; def += z.card.ao;
        AP.push({ k: "城池城威·己方", v: z.card.ao }); DP.push({ k: "城池城威·己方", v: z.card.ao });
      } else {
        atk += z.card.ap; def += z.card.ap;
        AP.push({ k: "城池城威·敌方", v: z.card.ap }); DP.push({ k: "城池城威·敌方", v: z.card.ap });
      }
    }
    // 城池第一层·增幅一（类型单位数值）：己方城池时，己方对应类型单位攻防各 +N
    const amp = this.castleAmpInfo(pi);
    if (amp && amp.kind && amp.kind === KIND_CN[u.kind] && amp.unit) {
      atk += amp.unit; def += amp.unit;
      AP.push({ k: `城池增幅一·${amp.kind}`, v: amp.unit }); DP.push({ k: `城池增幅一·${amp.kind}`, v: amp.unit });
    }
    // 事件第一层
    if (z && z.type === "process") {
      const own = z.owner === pi;
      const v = own ? z.card.a1o : z.card.a1p;
      atk += v; def += v;
      AP.push({ k: "事件第一层·" + (own ? "己方" : "敌方"), v }); DP.push({ k: "事件第一层·" + (own ? "己方" : "敌方"), v });
    }
    // 大名第一层 · 动态数量（通用）：己方武士多于对方 → 大名攻击 +1；己方公卿多于对方 → 大名防御 +1
    if (u.kind === "daimyo") {
      const opp = st.players[1 - pi];
      const mySam = p.field.filter(x => x.kind === "samurai").length;
      const opSam = opp.field.filter(x => x.kind === "samurai").length;
      if (mySam > opSam) { atk += 1; AP.push({ k: "大名第一层·武士优势", v: 1 }); }
      const myNob = p.field.filter(x => x.kind === "noble").length;
      const opNob = opp.field.filter(x => x.kind === "noble").length;
      if (myNob > opNob) { def += 1; DP.push({ k: "大名第一层·公卿优势", v: 1 }); }
    }
    // 公卿光环（① 攻击 ② 防御 ③ 兵刃 ④ 装具 ⑤ 骑具；含公卿之智）
    for (const u2 of p.field) {
      if (u2.kind !== "noble") continue;
      for (const f of [u2.card.f1, u2.card.f2, u2.card.f3]) {
        if (!f) continue;
        const bv = parseInt(f.match(/(\d+)/)[1]) + nobleBoost;
        if (f.startsWith("①")) { atk += bv; AP.push({ k: `公卿【${u2.card.name}】全场攻击`, v: bv }); }
        else if (f.startsWith("②")) { def += bv; DP.push({ k: `公卿【${u2.card.name}】全场防御`, v: bv }); }
        else if (f.startsWith("③")) bladeBoost += bv;
        else if (f.startsWith("④")) armorBoost += bv;
        // ⑤ 骑具只影响躲避率，在 unitDodge / aura 中结算，此处不叠加攻防
      }
    }
    // 大名 l2 励武/护卿（仅对当前指定的唯一目标生效）
    for (const u2 of p.field) {
      if (u2.kind !== "daimyo" || !u2.card.l2) continue;
      const m = u2.card.l2.match(/(励武|护卿)\s*·?\s*([^+]*?)\s*\+?(\d+)/);
      if (!m) continue;
      const target = this.l2TargetOf(u2);
      if (!target || target.uid !== u.uid) continue;
      const v = parseInt(m[3]);
      if (m[1] === "励武" && u.kind === "samurai") { atk += v; AP.push({ k: `大名【${u2.card.name}】励武`, v }); }
      else if (m[1] === "护卿" && u.kind === "noble") { def += v; DP.push({ k: `大名【${u2.card.name}】护卿`, v }); }
    }
    // 大名 l4 事件之势（事件区为事件牌时）
    if (z && z.type === "process") {
      for (const u2 of p.field) {
        if (u2.kind !== "daimyo" || !u2.card.l4) continue;
        const f = u2.card.l4;
        if (f.includes("文衡") && u.kind === "noble") { def += 1; DP.push({ k: `大名【${u2.card.name}】文衡`, v: 1 }); }
        else if (f.includes("武备") && u.kind === "samurai") { atk += 1; AP.push({ k: `大名【${u2.card.name}】武备`, v: 1 }); }
        else if (f.includes("坚城") && u.kind === "daimyo") { def += 1; DP.push({ k: `大名【${u2.card.name}】坚城`, v: 1 }); }
        else if (f.includes("锋芒") && u.kind === "daimyo") { atk += 1; AP.push({ k: `大名【${u2.card.name}】锋芒`, v: 1 }); }
      }
    }
    // 大名城盟（名城/大城）
    if (z && z.type === "castle" && z.owner === pi && (z.card.tier === "名城" || z.card.tier === "大城") && u.kind === "daimyo") {
      atk += 1; def += 1;
      AP.push({ k: "城盟·" + z.card.tier, v: 1 }); DP.push({ k: "城盟·" + z.card.tier, v: 1 });
    }
    // 装备（bladeBonus/armorBonus 含城池共鸣/大城比例）
    // equipAtk/equipDef 只记录「装备牌本体」的数值——大名被穿透后仅这类增幅仍然生效
    let bladeBonus = 0, armorBonus = 0;
    let equipAtk = 0, equipDef = 0;
    let hasBladeEffect = !!u.eq.blade; // 是否享受兵刃效果（自身装备或王城/名城共享）
    if (u.eq.blade) {
      let b = u.eq.blade.atk;
      if (u.kind === "samurai" && !u.purged && u.fx && u.fx.includes("持刃")) b += 1;
      bladeBonus += b;
      equipAtk += b;
    }
    if (u.eq.armor) { armorBonus += u.eq.armor.dfs; equipDef += u.eq.armor.dfs; }
    const cc = z;
    if (cc && cc.type === "castle") {
      const own = cc.owner === pi;
      const tier = cc.card.tier;
      const team = p.field;
      if (own && (tier === "王城" || tier === "名城")) {
        if (!u.eq.blade && (u.kind === "daimyo" || u.kind === "samurai")) {
          const sharer = team.find(x => x.eq.blade && x.uid !== u.uid);
          if (sharer) { bladeBonus += sharer.eq.blade.atk; hasBladeEffect = true; }
        }
      }
      if (!own && (tier === "王城" || tier === "名城")) {
        if (!u.eq.armor && (u.kind === "daimyo" || u.kind === "noble")) {
          const sharer = team.find(x => x.eq.armor && x.uid !== u.uid);
          if (sharer) armorBonus += sharer.eq.armor.dfs;
        }
      }
      if (own && tier === "大城" && u.eq.blade) bladeBonus += Math.ceil(u.eq.blade.atk * 0.5);
      if (!own && tier === "大城" && u.eq.blade) bladeBonus -= Math.floor(u.eq.blade.atk * 0.3);
    }
    // 城池第一层·增幅二（装备数值）：己方城池时，己方兵刃/装具数值 +N（仅对享受该装备效果的单位）
    if (amp && amp.equip && amp.equipN) {
      if (amp.equip === "blade" && hasBladeEffect) bladeBonus += amp.equipN;
      else if (amp.equip === "armor" && u.eq.armor) armorBonus += amp.equipN;
    }
    atk += bladeBonus; if (bladeBonus !== 0) AP.push({ k: "兵刃" + (u.eq.blade ? "【" + u.eq.blade.name + "】" : "（共享）"), v: bladeBonus });
    def += armorBonus; if (armorBonus !== 0) DP.push({ k: "装具" + (u.eq.armor ? "【" + u.eq.armor.name + "】" : "（共享）"), v: armorBonus });
    // 装具光环也属于「装备带来的加成」，穿透后仍生效，单独记账
    if (u.eq.armor && armorBoost !== 0) equipDef += armorBoost;
    // 兵刃光环同理（锐/③/城增）——仅兵刃本体仍可用的场合
    if (u.eq.blade && bladeBoost !== 0) equipAtk += bladeBoost;
    // 兵刃·器魂（动态条件，实时判定；仅装备者生效，不随共享）
    if (u.eq.blade && u.eq.blade.soul) {
      const opp = st.players[1 - pi];
      const soul = u.eq.blade.soul;
      let sv = 0, sk = "";
      if (soul === 1 && p.hp < opp.hp) { sv = 1; sk = "己方将军生命低于对方"; }
      else if (soul === 2 && p.field.length < opp.field.length) { sv = 1; sk = "己方战场卡少于对方"; }
      else if (soul === 3 && !p.field.some(x => x.kind === "noble")) { sv = 1; sk = "己方场上无公卿"; }
      else if (soul === 4 && z && z.owner !== pi) { sv = 1; sk = "场上事件/城池非己方"; }
      else if (soul === 5) {
        const n = p.field.filter(x => x.eq.blade).length;
        if (n === 1) { sv = 2; sk = "己方场上仅一张兵刃"; }
        else if (n > 1) { sv = -1; sk = "己方场上兵刃不止一张"; }
      }
      if (sv) {
        atk = Math.max(0, atk + sv);
        AP.push({ k: "器魂·" + u.eq.blade.name, v: sv, cond: sk });
      }
    }
    // 装备光环（兵刃之锐/公卿③/城池增幅二 —— a.blade 已聚合）
    if (u.eq.blade && bladeBoost !== 0) { atk += bladeBoost; AP.push({ k: "兵刃光环（锐/③/城增）", v: bladeBoost }); }
    if (u.eq.armor && armorBoost !== 0) { def += armorBoost; DP.push({ k: "装具光环（固/④/城增）", v: armorBoost }); }
    // 武士之锋（仅武士）
    if (u.kind === "samurai" && samuraiAtk) { atk += samuraiAtk; AP.push({ k: "天皇·武士之锋", v: samuraiAtk }); }
    // 将军技能·战前大赏（仅武士）：己方事件/城池 → 防御 +X；敌方事件/城池 → 攻击 +X
    if (u.kind === "samurai" && p.shogun.warReward) {
      const x = p.shogun.warReward;
      if (z && z.owner === pi) { def += x; DP.push({ k: `将军【${p.shogun.name}】战前大赏·己方常置防`, v: x }); }
      else if (z) { atk += x; AP.push({ k: `将军【${p.shogun.name}】战前大赏·敌方常置攻`, v: x }); }
    }
    // 骑术（武士+骑具；增幅归零后三层特效失效）
    if (u.kind === "samurai" && !u.purged && u.eq.mount && u.fx && u.fx.includes("骑术")) { def += 1; DP.push({ k: "骑术", v: 1 }); }
    // 宝物目标加成
    for (const tr of p.treasure) {
      if (tr.tgt.samurai === u.uid && u.kind === "samurai") { def += tr.card.s1; DP.push({ k: "宝物【" + tr.card.name + "】武士", v: tr.card.s1 }); }
      if (tr.tgt.noble === u.uid && u.kind === "noble") { atk += tr.card.n1; AP.push({ k: "宝物【" + tr.card.name + "】公卿", v: tr.card.n1 }); }
      if (tr.tgt.daimyo === u.uid && u.kind === "daimyo") { atk += tr.card.d1; def += tr.card.d1; AP.push({ k: "宝物【" + tr.card.name + "】大名", v: tr.card.d1 }); DP.push({ k: "宝物【" + tr.card.name + "】大名", v: tr.card.d1 }); }
    }
    // 事件立场（fx 第三段；增幅归零后三层特效失效）
    if (u.kind === "samurai" && !u.purged && z && z.type === "process" && u.fx) {
      const parts = u.fx.split("·");
      if (parts.length >= 3) {
        const l3 = parts[2];
        const own = z.owner === u.pi;
        const [mine, theirs] = l3.split("/");
        if (own && mine.startsWith("己攻")) { atk += 1; AP.push({ k: "事件立场·己攻", v: 1 }); }
        if (own && mine.startsWith("己防")) { def += 1; DP.push({ k: "事件立场·己防", v: 1 }); }
        if (!own && theirs.startsWith("敌攻")) { atk += 1; AP.push({ k: "事件立场·敌攻", v: 1 }); }
        if (!own && theirs.startsWith("敌防")) { def += 1; DP.push({ k: "事件立场·敌防", v: 1 }); }
      }
    }
    // 特效累积（战意/坚守/受创/我攻/宝物上下场…）
    if (u.extraAtk) { atk += u.extraAtk; AP.push({ k: "特效累积·攻击", v: u.extraAtk }); }
    if (u.extraDef) { def += u.extraDef; DP.push({ k: "特效累积·防御", v: u.extraDef }); }
    let rawAtk = u.baseAtk + (u.extraAtk || 0);
    let rawDef = u.baseDef + (u.extraDef || 0);

    // 大名：防御值被削的部分（护盾损耗）从最终值中扣除，最低 0
    if (u.kind === "daimyo" && u.defLoss) {
      const cut = Math.min(def, u.defLoss);
      def -= cut;
      DP.push({ k: "护盾损耗（被削）", v: -cut });
    }
    // 大名：防御被穿透后，本阶段内除装备外的增幅全部失效
    if (u.kind === "daimyo" && u.penetrated) {
      atk = Math.max(0, u.baseAtk + equipAtk);
      def = Math.max(0, u.baseDef + equipDef - (u.defLoss || 0));
      AP.length = 0;
      AP.push({ k: "基础攻击", v: u.baseAtk });
      if (equipAtk) AP.push({ k: "装备加成（穿透后仍生效）", v: equipAtk });
      AP.push({ k: "穿透·其他增幅失效", v: 0 });
      DP.length = 0;
      DP.push({ k: "基础防御", v: u.baseDef });
      if (equipDef) DP.push({ k: "装备加成（穿透后仍生效）", v: equipDef });
      if (u.defLoss) DP.push({ k: "护盾损耗（被削）", v: -Math.min(u.baseDef + equipDef, u.defLoss) });
      rawAtk = u.baseAtk + equipAtk;
      rawDef = def;
    }
    return { atk, def, rawAtk, rawDef, AP, DP };
  },

  unitStats(u) {
    const P = this.unitStatParts(u);
    return { atk: P.atk, def: P.def, rawAtk: P.rawAtk, rawDef: P.rawDef };
  },

  /* 受击伤害：攻击值 − 减免值（武士以其攻击值抵消，公卿以其防御值抵消），至少为 0。
     武士：伤害打防御值（防御值兼作生命）；公卿：伤害打攻击值（攻击值兼作生命）。
     大名不使用本函数——其防御值作为护盾，见 resolveDaimyoHit。 */
  hitDamage(atk, ts, kind) {
    const reduce = kind === "samurai" ? ts.atk : ts.def;
    return Math.max(0, atk - reduce);
  },

  /* 大名命值阶段：每 10 点为一段，最后一段为本命，其余为替死（王城时多一段替死） */
  daimyoStage(hp) {
    return hp <= 0 ? 0 : Math.ceil(hp / 10);
  },

  /* 本阶段命值上限：每阶段 10 点（如命值 17 → 本阶段上限 20；命值 6 → 10） */
  daimyoStageCap(hp) {
    return this.daimyoStage(hp) * 10;
  },

  /* 城池第六层 · 城破：该城池牌下场时，原持有方场上公卿全部下场 */
  castleL6OnBroken(z, reason) {
    const st = this.state;
    if (!z || z.type !== "castle" || !z.card || !z.card.l6) return;
    const owner = z.owner;
    const p = st.players[owner];
    if (!p) return;
    const nobles = p.field.filter(u => u.kind === "noble");
    if (!nobles.length) return;
    this.zHist(z, "第六层·城破", `${reason}：己方公卿 ${nobles.length} 位下场`, owner);
    this.log(`🏯 城破【${z.card.name}】${reason}：${p.name} 场上公卿全部下场`);
    for (const n of nobles.slice()) {
      n.hist = n.hist || [];
      n.hist.push({ t: st.turnNo, src: "城破", desc: `城池【${z.card.name}】${reason}，公卿下场` });
      this.removeUnit(n);
    }
  },

  /* 城池第六层 · 易主：城池控制方转给对方时，原持有方场上武士全部移交给新持有方 */
  castleL6OnOwnerChange(z, prevOwner, newOwner) {
    const st = this.state;
    if (!z || z.type !== "castle" || !z.card || !z.card.l6) return;
    const from = st.players[prevOwner];
    const to = st.players[newOwner];
    if (!from || !to) return;
    const sams = from.field.filter(u => u.kind === "samurai");
    if (!sams.length) return;
    this.zHist(z, "第六层·易主", `控制方 ${from.name} → ${to.name}：己方武士 ${sams.length} 位移交`, newOwner);
    this.log(`🏯 城池易主【${z.card.name}】：${from.name} 场上武士移交给 ${to.name}`);
    for (const u of sams.slice()) {
      if (to.field.length >= 5) { this.log(`战场区已满，武士【${u.card.name}】无法移交（留在原方）`); continue; }
      const i = from.field.indexOf(u);
      if (i < 0) continue;
      from.field.splice(i, 1);
      u.pi = newOwner;
      to.field.push(u);
      u.hist = u.hist || [];
      u.hist.push({ t: st.turnNo, src: "城池易主", desc: `随城池【${z.card.name}】移交至${to.name}` });
      if (UI.flashUnit) UI.flashUnit(newOwner, u.uid);
    }
    // 装备与骑具共享按新归属重新判定
    this.clearMountShareFor(prevOwner);
    this.clearMountShareFor(newOwner);
  },

  /* 将军技能·战后共荣：本回合成功给予对方将军伤害 → 己方大名命值 +1（不超本阶段上限）、公卿攻击 +1 */
  postGlorySettle(pi) {
    const st = this.state;
    const p = st.players[pi];
    if (!p || !p.shogun.postGlory) return;
    const dealt = (st.turnDamage && st.turnDamage[1 - pi]) || 0;
    if (dealt <= 0) return;

    for (const u of p.field) {
      if (u.kind === "daimyo" && u.hp > 0) {
        const cap = Math.min(this.daimyoStageCap(u.hp), this.daimyoHpCap(u));
        if (u.hp < cap) {
          u.hp += 1;
          u.hist = u.hist || [];
          u.hist.push({ t: st.turnNo, src: "战后共荣", desc: `本回合打伤对方将军，命值 +1 → ${u.hp}（阶段上限 ${cap}）` });
        }
      } else if (u.kind === "noble") {
        u.extraAtk = (u.extraAtk || 0) + 1;
        u.hist = u.hist || [];
        u.hist.push({ t: st.turnNo, src: "战后共荣", desc: "本回合打伤对方将军，攻击 +1" });
      }
    }
    this.eHist(pi, "战后共荣", `本回合打伤对方将军 ${dealt} 点：己方大名命值 +1、公卿攻击 +1`);
    this.log(`🎖 将军【${p.shogun.name}】战后共荣：本回合打伤对方将军 ${dealt} 点 → 己方大名命值 +1、公卿攻击 +1`);
  },

  /* 大名受击：防御值作护盾被攻击值削减；不足时「穿透」——扣命值、装备下场、防御回满、
     本阶段内除装备外的增幅全部失效。返回 { penetrated, overflow, remain } */
  resolveDaimyoHit(t, ts, atk) {
    const curDef = ts.def;
    if (atk <= curDef) {
      t.defLoss = (t.defLoss || 0) + atk;
      return { penetrated: false, overflow: 0, remain: t.hp, defAfter: curDef - atk };
    }
    // 穿透：溢出 = 攻击值 − 当前防御
    const overflow = atk - curDef;
    const oldStage = this.daimyoStage(t.hp);
    t.hp -= overflow;
    t.defLoss = 0;            // 防御值回满
    t.penetrated = true;      // 本阶段内：除装备卡外的增幅失效
    // 每一次穿透，弃置一件装备（装具 → 兵刃 → 骑具）
    for (const slot of ["armor", "blade", "mount"]) {
      if (t.eq[slot]) {
        const eq = t.eq[slot];
        this.state.discard.push({ type: slot, card: eq });
        t.eq[slot] = null;
        if (slot === "mount") this.mountLeaves(t.pi, eq);
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "穿透", desc: `防御被穿透，${TYPE_CN[slot]}【${eq.name}】下场` });
        this.log(`💥 穿透：大名【${t.card.name}】的${TYPE_CN[slot]}【${eq.name}】下场`);
        break;
      }
    }
    // 命值跌入下一阶段（替死 → 本命，或替死 → 替死）：装备清零、增幅恢复
    const newStage = this.daimyoStage(t.hp);
    if (newStage > 0 && newStage < oldStage) {
      for (const slot of ["blade", "armor", "mount"]) {
        if (t.eq[slot]) {
          const eq = t.eq[slot];
          this.state.discard.push({ type: slot, card: eq });
          t.eq[slot] = null;
          if (slot === "mount") this.mountLeaves(t.pi, eq);
        }
      }
      t.penetrated = false;
      t.defLoss = 0;
      t.hist = t.hist || [];
      t.hist.push({ t: this.state.turnNo, src: "阶段转换", desc: newStage === 1 ? "进入本命：装备清零，增幅恢复" : "替死阶段转换：装备清零，增幅恢复" });
      this.log(`🩸 大名【${t.card.name}】${newStage === 1 ? "进入「本命」" : "转入下一次「替死」"}：装备清零，增幅恢复`);
    }
    return { penetrated: true, overflow, remain: t.hp, defAfter: 0 };
  },

  /* 预测某单位在本次攻击下是否将被击破（供 AI 消解/替死判断） */
  willBeKilled(t, ts, atk) {
    if (t.kind === "daimyo") return ts.def < atk && (atk - ts.def) >= t.hp;
    // 御·庇护形态：攻击值全额打防御值
    if (t.purged) return atk >= ts.def;
    if (t.kind === "samurai") return this.hitDamage(atk, ts, t.kind) >= ts.def;
    return this.hitDamage(atk, ts, t.kind) >= ts.atk;
  },

  unitDodge(u) {
    let d = 0;
    let mountBoost = 0;
    for (const tr of this.emperorTracks(this.state.players[u.pi])) if (tr.includes("骑具之灵")) mountBoost += parseInt(tr.match(/(\d+)/)[1]);
    mountBoost += (this.aura(this.state.players[u.pi]).mount || 0); // 公卿 ⑤ 骑具 +X%（仅对已装备骑具的单位生效）
    // 城池第三层「概率倾斜」：大城的 ±5% 只作用于骑具、装具（王城/名城作用于骑具之外的概率）
    const tilt = this.equipProbTilt(u.pi);
    if (u.eq.mount) d = u.eq.mount.dodge + mountBoost + tilt;
    else {
      // 王城第二层：己方骑具可同时作用于两名己方单位（装备者 + 一名未装备骑具的己方单位）
      const shared = this.sharedMountFor(u);
      if (shared) d = shared.dodge + mountBoost + tilt;
    }
    // 的卢之魂 · 效果 1：己方生命低于对方 → 躲避率随机 +5%～10%（动态实时判定；仅装备者）
    if (u.eq.mount && u.eq.mount.soul === 1) {
      const p = this.state.players[u.pi], opp = this.state.players[1 - u.pi];
      if (p.hp < opp.hp) d += 5 + Math.floor(Math.random() * 6); // 5~10 随机整数
    }
    // 骑具躲避仅对装备骑具（或经王城共享）的单位生效；未装备/未共享的单位为 0
    return Math.min(d, 90);
  },

  /* 王城第二层：己方骑具同时作用于两名己方单位——装备者 + 一名未装备骑具的己方单位。
     受益者可点击指定（holder.shareTo）；未指定时按战场区顺序配对（第 i 件骑具 → 第 i 名未装备单位）。
     候选与「可装备骑具的单位」一致（武士/公卿；大名仅在天皇御·骑具之灵时）。 */
  mountShareBorrowers(pi) {
    const p = this.state.players[pi];
    const canDaimyo = this.canMountOnDaimyo(pi);
    return p.field.filter(x => !x.eq.mount && (x.kind === "samurai" || x.kind === "noble" || (x.kind === "daimyo" && canDaimyo)));
  },
  sharedMountFor(u) {
    const st = this.state;
    const z = st.zone;
    if (!z || z.type !== "castle" || z.owner !== u.pi || z.card.tier !== "王城") return null;
    if (u.eq.mount) return null;
    const field = st.players[u.pi].field;
    const mounts = field.filter(x => x.eq.mount);
    if (!mounts.length) return null;
    const explicit = mounts.find(m => m.shareTo === u.uid);
    if (explicit) return explicit.eq.mount;
    const claimed = new Set(mounts.filter(m => m.shareTo != null).map(m => m.shareTo));
    if (claimed.has(u.uid)) return null; // 已被显式指派给另一件骑具
    const freeMounts = mounts.filter(m => m.shareTo == null);
    const borrowers = this.mountShareBorrowers(u.pi).filter(x => !claimed.has(x.uid));
    const idx = borrowers.indexOf(u);
    return idx >= 0 && idx < freeMounts.length ? freeMounts[idx].eq.mount : null;
  },

  /* 显式指定某件骑具的第二名受益者；borrowerUid=null 表示恢复自动配对 */
  designateMountShare(pi, holderUid, borrowerUid) {
    const st = this.state;
    const p = st.players[pi];
    const holder = p.field.find(x => x.uid === holderUid && x.eq.mount);
    if (!holder) return false;
    if (borrowerUid == null) {
      holder.shareTo = null;
      holder.hist = holder.hist || [];
      holder.hist.push({ t: st.turnNo, src: "骑具共享", desc: "取消指定，改为按战场区顺序配对" });
      this.log(`🐎 骑具【${holder.eq.mount.name}】取消共享指定（恢复按顺序配对）`);
      UI.renderAll();
      return true;
    }
    const t = p.field.find(x => x.uid === borrowerUid && !x.eq.mount);
    if (!t) { this.log("共享目标必须是未装备骑具的己方单位"); return false; }
    // 一名单位同时只能借用一件骑具
    for (const m of p.field) if (m.uid !== holder.uid && m.shareTo === borrowerUid) m.shareTo = null;
    holder.shareTo = borrowerUid;
    holder.hist = holder.hist || [];
    holder.hist.push({ t: st.turnNo, src: "骑具共享", desc: `第二名受益者指定为【${t.card.name}】` });
    t.hist = t.hist || [];
    t.hist.push({ t: st.turnNo, src: "骑具共享", desc: `获得骑具【${holder.eq.mount.name}】的躲避率（王城共享）` });
    this.log(`🐎 王城骑具共享：【${holder.eq.mount.name}】的第二名受益者指定为【${t.card.name}】`);
    UI.renderAll();
    return true;
  },

  /* 玩家在己方王城在区时装备骑具 → 择定共享受益者（AI/无候选自动处理） */
  mountShareOnEquip(pi, holder) {
    const st = this.state;
    const z = st.zone;
    if (!holder || !holder.eq.mount) return;
    if (!z || z.type !== "castle" || z.owner !== pi || z.card.tier !== "王城") return;
    const borrowers = this.mountShareBorrowers(pi);
    if (!borrowers.length) return;
    const p = st.players[pi];
    if (p.isAI || borrowers.length === 1) {
      const free = borrowers.find(b => b.shareTo == null && !p.field.some(m => m.eq.mount && m.uid !== holder.uid && m.shareTo === b.uid));
      if (free) holder.shareTo = free.uid;
      return;
    }
    this.askPick(pi, {
      title: "🐎 王城骑具共享 · 指定受益者",
      body: `王城在区：骑具【${holder.eq.mount.name}】除装备者外，还可同时作用于一位己方单位。请选择第二名受益者（也可稍后点击骑具上的「共享」徽标改指）。`,
      cands: borrowers,
      onPick: (uid) => this.designateMountShare(pi, holder.uid, uid),
    });
  },

  /* 单位离场/装备骑具等场景：清掉指向它的共享指派 */
  clearMountShareFor(pi, uid) {
    const p = this.state.players[pi];
    for (const m of p.field) if (m.shareTo === uid) m.shareTo = null;
  },

  /* 王城第二层：己方骑具躲避判定成功 → 敌方一位武士攻击值 +1（永久）。攻击方为玩家时点选，AI 取最高攻。 */
  mountDodgeReward(defPi) {
    const st = this.state;
    const z = st.zone;
    if (!z || z.type !== "castle" || z.owner !== defPi || z.card.tier !== "王城") return;
    const atkPi = 1 - defPi;
    const atkP = st.players[atkPi];
    const cands = atkP.field.filter(x => x.kind === "samurai");
    if (!cands.length) {
      this.zHist(z, "第二层·装备共鸣·骑具", "躲避成功，但敌方战场区无武士，奖励不结算", z.owner);
      this.log("🏯 王城骑具共鸣：躲避成功，但敌方战场区无武士，奖励不结算");
      return;
    }
    const gain = (uid) => {
      const pick = atkP.field.find(x => x.uid === uid) || cands[0];
      pick.extraAtk = (pick.extraAtk || 0) + 1;
      pick.hist = pick.hist || [];
      pick.hist.push({ t: st.turnNo, src: "王城·骑具共鸣", desc: "敌方骑具躲避成功，攻击 +1（永久）" });
      this.zHist(z, "第二层·装备共鸣·骑具", `躲避成功：敌方武士【${pick.card.name}】攻击 +1（永久）`, z.owner);
      this.log(`🏯 王城骑具共鸣：躲避成功，敌方武士【${pick.card.name}】攻击 +1（永久）`);
    };
    this.askPick(atkPi, {
      title: "🏯 王城骑具共鸣 · 选择受益武士",
      body: `对方王城骑具躲避成功：请选择己方一位武士，<b>攻击 +1</b>（永久累积）。`,
      cands,
      aiPick: (cs) => ({ uid: cs.reduce((a, b) => (this.unitStats(b).atk > this.unitStats(a).atk ? b : a)).uid }),
      onPick: (uid) => gain(uid),
    });
  },

  /* ---------- 回合流程 ---------- */
  beginTurn() {
    const st = this.state;
    st.waitingAI = false;
    const p = st.players[st.cur];
    p.turnsTaken++;
    p.zoneUsed = 0;
    p.attackUsed = 0;
    p.drawnThisTurn = false;
    p.typeAtk = {}; // 每类型每回合一次攻击
    if ((p.recruitTurnsLeft || 0) > 0) p.recruitTurnsLeft--; // 募兵冷却
    p.purgeUsed = false; // 御·庇护每回合一次
    p.bypassUsed = false; // 破阵每回合一次
    p.assassinUsed = false; // 暗杀每回合一次
    p.duelStrikeUsed = false; // 春秋义战：每回合直击一次
    p.forgeUsed = false; // 装具·熔炉：每回合一次
    p.reforgeUsed = false; // 兵刃·断刃重铸：每回合一次
    p.moodUsed = {}; // 隐藏特效（春和景明／偶感风寒）：每回合各限一次
    p.gracePenaltyUsed = false; // 义战之恩：每回合一次
    UI.renderAll();

    // 阶段一 · 开始
    this.log(`—— 第 ${st.turnNo} 回合 · ${p.name} ——`, p.isAI ? "ai" : "me");
    // 天皇失效（神木报应）：3 回合失去效果
    if ((p.emperorDisabled || 0) > 0) {
      p.emperorDisabled--;
      this.log(`🌲 天皇【${p.emperor.name}】效果失效中（剩 ${p.emperorDisabled} 回合）`);
    } else {
    // 天皇三条增幅轨道施展对象记录
    {
      const trs = [p.emperor.t1, p.emperor.t2, p.emperor.t3].map(tr => {
        const m = tr.match(/^御·(.*?)\s*\+?(\d+)(%?)$/);
        const name = m ? m[1] : tr.replace("御·", "");
        const v = m ? m[2] : "";
        const pct = m && m[3] ? "%" : "";
        const target = name.includes("武士之锋") ? "己方所有武士 攻击"
          : name.includes("公卿之智") ? "己方所有公卿 特效"
          : name.includes("兵刃之锐") ? "己方佩戴兵刃单位 攻击"
          : name.includes("装具之固") ? "己方佩戴装具单位 防御"
          : name.includes("骑具之灵") ? "己方佩戴骑具单位 躲避"
          : name.includes("事件之速") ? "待命（每局一次）"
          : "己方将军 生命";
        return `【${name}】施展对象：${target} +${v}${pct}`;
      }).join("；");
      this.eHist(st.cur, "增幅轨道施展", trs);
    }
    // 天皇·将军之佑（若己方场上有大名则不生效）
    const hasDaimyoBless = p.field.some(u => u.kind === "daimyo");
    for (const t of [p.emperor.t1, p.emperor.t2, p.emperor.t3]) {
      if (t.includes("将军之佑")) {
        if (hasDaimyoBless) {
          this.log(`天皇【${p.emperor.name}】将军之佑：己方场上有大名，本回合不生效`);
          continue;
        }
        const v = parseInt(t.match(/(\d+)/)[1]);
        p.hp = Math.min(p.maxHp || 100, p.hp + v);
        this.log(`天皇【${p.emperor.name}】将军之佑 +${v} → ${p.name} HP ${p.hp}`);
      }
    }
    } // 天皇效果（含失效跳过）
    // 城池增幅一（将军生命）：常置光环，每回合己方回合开始 +N
    this.castleAmpTurnStart(st.cur);
    // 事件第二层 · 天佑将军（每回合开始时结算）
    this.eventTianyou(st.cur);
    // 大名第四层 · 天命：事件在区时，己方将军一次性 +10（每名天命大名一次）
    this.checkTianming(st.cur);
    // 将军技能：自疗（每 3 回合一次）＋ 压制（每回合）
    const shoSkills = this.shogunSkills(p.shogun);
    let healed = false;
    if ((p.healCooldown || 0) > 0) p.healCooldown--;
    if ((p.healCooldown || 0) <= 0 && shoSkills.heal > 0) {
      p.hp = Math.min(p.maxHp || 100, p.hp + shoSkills.heal);
      this.hpEvent(st.cur, -shoSkills.heal, "自疗", p.hp);
      p.healCooldown = 3;
      healed = true;
      this.log(`将军【${p.shogun.name}】自疗 +${shoSkills.heal} → HP ${p.hp}`);
    }
    if (!healed && shoSkills.heal > 0) this.log(`将军【${p.shogun.name}】自疗冷却中（每 3 回合一次，剩 ${p.healCooldown} 回合）`);
    if (shoSkills.press > 0) {
      const opp = st.players[1 - st.cur];
      opp.hp -= shoSkills.press;
      this.hpEvent(1 - st.cur, shoSkills.press, "压制", opp.hp);
      if (UI.floatDamage) UI.floatDamage("shogun:" + (1 - st.cur), shoSkills.press);
      this.log(`将军【${p.shogun.name}】压制：对方将军 −${shoSkills.press} → ${opp.hp}`);
      if (opp.hp <= 0) { this.win(st.cur); return; }
    }
    // 将军天赋：每 3 个己方回合，为己方场上一指定类型单位 +1~2 攻或防（玩家点选单位；数额随机）
    if (p.talentCooldown > 0) p.talentCooldown--;
    if (p.talentCooldown <= 0 && p.shogun.talent) {
      p.talentCooldown = 3;
      const tm = p.shogun.talent.match(/天赋·(大名|公卿|武士)/);
      if (tm) {
        const KM = { 大名: "daimyo", 公卿: "noble", 武士: "samurai" };
        const kind = KM[tm[1]] || "samurai";
        const cands = p.field.filter(u => u.kind === kind && !u._talentUsed);
        if (cands.length) {
          this.askPick(st.cur, {
            title: "✨ 将军天赋",
            body: `将军【${p.shogun.name}】的天赋：请选择一位己方${tm[1]}，随机获得 <b>攻击或防御 +1~2</b>（每位单位每局一次）。`,
            cands,
            aiPick: (cs) => ({ uid: cs[Math.floor(Math.random() * cs.length)].uid }),
            onPick: (uid) => {
              const t2 = p.field.find(x => x.uid === uid);
              if (!t2) return;
              t2._talentUsed = true; // 每单位每局仅享受一次
              const isAtk = Math.random() < 0.5;
              const v = 1 + Math.floor(Math.random() * 2); // 1~2
              if (isAtk) t2.extraAtk = (t2.extraAtk || 0) + v;
              else t2.extraDef = (t2.extraDef || 0) + v;
              t2.hist = t2.hist || [];
              t2.hist.push({ t: st.turnNo, src: "天赋·" + tm[1], desc: (isAtk ? "攻击" : "防御") + " +" + v + "（每局一次）" });
              this.log(`✨ 将军天赋【${p.shogun.talent}】：${tm[1]}【${t2.card.name}】${isAtk ? "攻击" : "防御"} +${v}（每局一次）`);
            },
          });
        } else {
          this.log(`✨ 将军天赋【${p.shogun.talent}】：己方${tm[1]}均已享受过天赋增幅（每位每局一次），本回合不触发`);
        }
      }
    }
    // 事件·暗杀：改为己方行动阶段手动发动（右上角按钮），不再自动触发
    // 圣迹·丰玉姬化龙待命：对方回合使用时下一己方回合生效
    if (p._ryujinPending) {
      this.ryujinStrike(st.cur);
      p._ryujinPending = null;
    }
    // 圣迹/灾厄代价检查
    if (p.noAtkUntil >= st.turnNo) this.log(`⚠ ${p.name} 本回合不能攻击（圣迹/灾厄代价）`);
    // 特殊召唤·绝境来援：连续 3 个己方回合无人物牌 → 从弃牌堆随机召唤一位人物（玩家弹窗/AI 自动）
    this.checkNoUnitSummon(st.cur);
    // 天皇·国士无双：战场区无牌且生命低于对方 → 自动从弃牌堆召唤盾武士
    this.guoshiSummon(st.cur);
    UI.renderAll();
  },

  /* 城池第一层增幅解析：{ hp, kind, unit, equip, equipN }（仅己方城池在区时非 null）
     amp1：将军生命 +N 或 大名/公卿/武士 +N（二选一印于卡面）
     amp2：兵刃 +N 或 装具 +N */
  castleAmpInfo(pi) {
    const z = this.state.zone;
    if (!z || z.type !== "castle" || z.owner !== pi) return null;
    const m1 = (z.card.amp1 || "").match(/(将军生命|大名|公卿|武士)\s*\+?(\d+)/);
    const m2 = (z.card.amp2 || "").match(/(兵刃|装具)\s*\+?(\d+)/);
    return {
      hp: m1 && m1[1] === "将军生命" ? parseInt(m1[2]) : 0,
      kind: m1 && m1[1] !== "将军生命" ? m1[1] : null,
      unit: m1 ? parseInt(m1[2]) : 0,
      equip: m2 ? (m2[1] === "兵刃" ? "blade" : "armor") : null,
      equipN: m2 ? parseInt(m2[2]) : 0,
    };
  },

  /* 城池增幅一（将军生命）：常置光环，每回合己方回合开始 +N（上限为将军总生命） */
  castleAmpTurnStart(pi) {
    const amp = this.castleAmpInfo(pi);
    if (!amp || !amp.hp) return 0;
    const p = this.state.players[pi], z = this.state.zone;
    const before = p.hp;
    p.hp = Math.min(p.maxHp || 100, p.hp + amp.hp);
    const gained = p.hp - before;
    this.hpEvent(pi, -gained, "城池增幅一", p.hp);
    this.zHistKeyed(z, "第一层·城威·增幅一", `施展对象：${p.name} 将军 +${gained}（每回合开始）`, z.owner);
    this.log(`🏯 城池【${z.card.name}】增幅一：${p.name} 将军 +${gained} → ${p.hp}`);
    return gained;
  },

  /* 事件第二层 · 天佑将军：每回合开始时，事件使用者视角的「己方」将军 +a2o、「对方」将军 +a2p */
  eventTianyou(pi) {
    const st = this.state;
    const z = st.zone;
    if (!z || z.type !== "process") return 0;
    const p = st.players[pi];
    const v = z.owner === pi ? z.card.a2o : z.card.a2p;
    if (!v) return 0;
    const before = p.hp;
    p.hp = Math.min(p.maxHp || 100, p.hp + v);
    const gained = p.hp - before;
    this.hpEvent(pi, -gained, "事件天佑", p.hp);
    this.zHistKeyed(z, "第二层·天佑将军", `施展对象：${p.name} 将军 +${gained}（每回合开始）`, z.owner);
    this.log(`事件【${z.card.name}】天佑：${p.name} 将军 +${gained} → ${p.hp}`);
    return gained;
  },

  /* 卡组耗尽处理（规则 §6.3 / §12.2）：
     第一次耗尽 → 将弃牌堆洗回构成新卡组（整局仅一次；天皇/将军牌不随之回池）；
     第二次耗尽 → 比较双方将军剩余生命值，高者获胜，相等为和局。 */
  reshuffleIfNeeded() {
    const st = this.state;
    if (st.deck.length) return false;
    if (!st.reshuffled) {
      st.reshuffled = true;
      let n = 0;
      while (st.discard.length) {
        const c = st.discard.pop();
        if (c.type === "emperor" || c.type === "shogun") continue; // 化身不随之回池
        st.deck.push(c);
        n++;
      }
      // 洗回后打乱
      for (let i = st.deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [st.deck[i], st.deck[j]] = [st.deck[j], st.deck[i]];
      }
      this.log(`♻ 卡组耗尽：弃牌堆洗回构成新卡组（${n} 张，整局仅一次）`);
      if (st.deck.length) return true;
    }
    // 第二次耗尽：比较剩余生命判定胜负
    const [a, b] = st.players;
    if (a.hp === b.hp) {
      this.drawGame(`卡组再次耗尽，双方将军生命相同（${a.hp}）`);
    } else {
      const w = a.hp > b.hp ? 0 : 1;
      this.log(`🀄 卡组再次耗尽：比较剩余生命（${a.name} ${a.hp} ／ ${b.name} ${b.hp}）→ ${st.players[w].name} 获胜`);
      this.win(w);
    }
    return false;
  },

  /* 阶段二 · 抽牌 */
  drawCard(p) {
    if (p.drawnThisTurn) { this.log("本回合已抽过牌"); return null; }
    if (!this.state.deck.length) {
      this.reshuffleIfNeeded();
      if (!this.state.deck.length) return null; // 二次耗尽 → 已判胜负
    }
    const c = this.state.deck.pop();
    p.hand.push(c);
    p.drawnThisTurn = true;
    this.log(`${p.name} 抽牌 → ${this.cardName(c)}`, p.isAI ? "ai" : "me", c);
    UI.renderAll();
    return c;
  },

  /* 将军双技能数值：专长取卡面值，另一项至少 1 */
  shogunSkills(sho) {
    const num = parseInt((sho.skillv || "").match(/(\d+)/)?.[1] || "1");
    return sho.skill === "自疗" ? { heal: num, press: 1 } : { heal: 1, press: num };
  },

  canPurge(pi, kind) {
    const p = this.state.players[pi];
    if (p.purgeUsed) return false;
    if ((p.emperorDisabled || 0) > 0) return false; // 天皇效果失效期间不可发动御·庇护
    const cost = kind === "samurai" ? p.emperor.ps : p.emperor.pn;
    return p.hp > cost;
  },
  doPurge(pi, t) {
    const p = this.state.players[pi];
    const cost = t.kind === "samurai" ? p.emperor.ps : p.emperor.pn;
    p.hp -= cost;
    this.hpEvent(pi, cost, "御·庇护", p.hp, false);
    p.purgeUsed = true;
    for (const s of ["blade", "armor", "mount"]) if (t.eq[s]) {
      const eq = t.eq[s];
      this.state.discard.push({ type: s, card: eq });
      t.eq[s] = null;
      if (s === "mount") this.mountLeaves(pi, eq); // 八百里分麾下炙：骑具下场联动
    }
    t.extraAtk = 0; t.extraDef = 0; t.purged = true;
    // 坚守累积（写入 baseDef）随增幅归零一并回退
    if (t.guardBonus) { t.baseDef = Math.max(0, t.baseDef - t.guardBonus); t.guardBonus = 0; }
    // 公卿城池加成「装备替死」造成的减半损失亦随增幅归零一并回收
    if (t.halveLoss) {
      t.baseAtk += t.halveLoss.atk;
      t.baseDef += t.halveLoss.def;
      t.hist = t.hist || [];
      t.hist.push({ t: this.state.turnNo, src: "御·庇护", desc: `回收减半损失：攻 +${t.halveLoss.atk}／防 +${t.halveLoss.def}` });
      t.halveLoss = null;
    }
    // 庇护后的形态：攻击值归零，防御值 = 卡面初始攻击值 + 卡面初始防御值（此后受击按攻击值全额减扣防御）
    const cardAtk = t.card.atk, cardDef = t.card.dfs;
    t.baseAtk = 0;
    t.baseDef = cardAtk + cardDef;
    t.hist = t.hist || [];
    t.hist.push({
      t: this.state.turnNo, src: "御·庇护",
      desc: `增幅归零（装备弃置、特效失效）：攻击 0，防御改为卡面 ${cardAtk}+${cardDef}=${cardAtk + cardDef}`,
    });
    this.eHist(pi, "御·庇护", `庇护${KIND_CN[t.kind]}【${t.card.name}】`);
    if (UI.imperialPurge) UI.imperialPurge(pi); // 天皇牌庇护特效
    if (UI.effectBurst) UI.effectBurst(pi);
    this.log(`御·庇护：${p.name} 支付 ${cost} 生命保住【${t.card.name}】（增幅归零）`, p.isAI ? "ai" : "me");
  },

  cardName(c) {
    if (c.type === "samurai" || c.type === "daimyo" || c.type === "noble") return c.card.name;
    return `【${TYPE_CN[c.type]}】${c.card.name}`;
  },

  /* 基础召唤：从手牌召唤任意数量武士 */
  summonSamurai(pi, hi) {
    const p = this.state.players[pi];
    const c = p.hand[hi];
    if (c.type !== "samurai") return false;
    if (p.field.length >= 5) { this.log("战场区已满！"); return false; }
    p.hand.splice(hi, 1);
    const u = this.newUnit(pi, "samurai", c.card);
    p.field.push(u);
    this.onUnitEntered(pi, u);
    p.summonedThisTurn++;
    if (UI.unitEnter) UI.unitEnter(u.uid);
    this.log(`${p.name} 召唤武士【${c.card.name}】`, pi === 0 ? "me" : "ai", c);
    UI.renderAll();
    return true;
  },

  /* 献祭召唤 */
  sacrificeSummon(pi, hi, fi) {
    const p = this.state.players[pi];
    const c = p.hand[hi];
    if (c.type !== "daimyo" && c.type !== "noble") return false;
    const sac = p.field[fi];
    if (sac.kind !== "samurai" && sac.kind !== "noble") { this.log("祭品必须是武士或公卿"); return false; }
    if (sac.summonedTurn === this.state.turnNo && pi === this.state.cur) { this.log("本回合召唤的单位不能献祭！"); return false; }
    // 战场区满员亦可献祭召唤：先移除祭品腾位，再放置新单位
    p.hand.splice(hi, 1);
    p.field.splice(fi, 1);
    sac.alive = false;
    this.state.discard.push({ type: sac.kind, card: sac.card });
    this.castleL4OnUnitGone(sac);
    this.emperorWrathOnUnitGone(sac);
    // 祭品装备随弃（骑具下场触发八百里分麾下炙）
    for (const s of ["blade", "armor", "mount"]) if (sac.eq && sac.eq[s]) {
      const eq = sac.eq[s];
      this.state.discard.push({ type: s, card: eq });
      sac.eq[s] = null;
      if (s === "mount") this.mountLeaves(pi, eq);
    }
    this.clearMountShareFor(pi, sac.uid);
    const u = this.newUnit(pi, c.type, c.card, { noAttackTurn: true }); // 规则 §6.2：本回合不可攻击
    p.field.push(u);
    this.onUnitEntered(pi, u);
    p.graceCnt = 0;
    p.summonedDaimyoOrNoble = true;
    if (UI.unitEnter) UI.unitEnter(u.uid);
    this.log(`${p.name} 献祭【${sac.card.name}】召唤 ${KIND_CN[c.type]}【${c.card.name}】`, p.isAI ? "ai" : "me", c);
    UI.renderAll();
    return true;
  },

  /* 恩典召唤：连续3回合未召公卿/大名 → 特殊召唤 */
  /* 恩典召唤的限制来源：己方事件牌若为「破阵」→ 己方不得恩典召唤；
     己方事件牌若为「暗杀」→ 对方不得恩典召唤。返回阻挡原因（无阻挡则 null）。 */
  graceBlock(pi) {
    const z = this.state.zone;
    if (!z || z.type !== "process") return null;
    if (z.owner === pi && z.card.l4 === "破阵") {
      return `己方事件【${z.card.name}】为破阵，己方不得恩典召唤`;
    }
    if (z.owner === 1 - pi && z.card.l4 === "暗杀") {
      return `对方事件【${z.card.name}】为暗杀，己方不得恩典召唤`;
    }
    return null;
  },

  canGrace(p) {
    if (this.graceBlock(this.state.players.indexOf(p))) return false;
    return p.graceCnt >= 3 && (p.hand.some(c => c.type === "daimyo") || p.hand.some(c => c.type === "noble"));
  },
  graceSummon(pi, hi) {
    const p = this.state.players[pi];
    const c = p.hand[hi];
    if (c.type !== "daimyo" && c.type !== "noble") return false;
    if (p.graceCnt < 3) return false;
    const blocked = this.graceBlock(pi);
    if (blocked) { this.log(blocked); return false; }
    if (p.field.length >= 5) return false;
    p.hand.splice(hi, 1);
    const gu = this.newUnit(pi, c.type, c.card, { noAttackTurn: true }); // 规则 §6.2：本回合不可攻击
    p.field.push(gu);
    this.onUnitEntered(pi, gu);
    p.graceCnt = 0;
    p.summonedDaimyoOrNoble = true;
    if (UI.unitEnter) UI.unitEnter(gu.uid);
    this.log(`✨ 恩典召唤！${p.name} 特殊召唤 ${KIND_CN[c.type]}【${c.card.name}】（无需献祭）`, p.isAI ? "ai" : "me", c);
    UI.renderAll();
    return true;
  },

  /* 特殊召唤·绝境来援：连续 3 个己方回合场上+手牌均无人物牌（武士/公卿/大名）时，
     可从弃牌堆随机召唤一位人物到己方战场（玩家弹窗选择，AI 自动） */
  noUnitSummonInfo(pi) {
    const p = this.state.players[pi];
    if (p.noUnitStreak < 3) return null;
    if (p.field.length >= 5) return { blocked: "战场区已满（5 牌位）" };
    const persons = this.state.discard.filter(d => d.type === "samurai" || d.type === "noble" || d.type === "daimyo");
    if (!persons.length) return { blocked: "弃牌堆无人物牌" };
    return { ok: true, count: persons.length };
  },
  doNoUnitSummon(pi) {
    const st = this.state;
    const p = st.players[pi];
    const info = this.noUnitSummonInfo(pi);
    if (!info || !info.ok) return false;
    const persons = st.discard.filter(d => d.type === "samurai" || d.type === "noble" || d.type === "daimyo");
    const pick = persons[Math.floor(Math.random() * persons.length)];
    const di = st.discard.indexOf(pick);
    st.discard.splice(di, 1);
    const gu = this.newUnit(pi, pick.type, pick.card);
    p.field.push(gu);
    this.onUnitEntered(pi, gu);
    p.noUnitStreak = 0; // 触发后重置计数
    if (UI.unitEnter) UI.unitEnter(gu.uid);
    this.log(`🙌 绝境来援！${p.name} 连续 3 回合无人物牌，从弃牌堆特殊召唤 ${KIND_CN[pick.type]}【${gu.card.name}】`, p.isAI ? "ai" : "me", pick);
    UI.renderAll();
    return true;
  },
  /* 回合开始检查：连续无人物牌计数 + 触发特殊召唤 */
  checkNoUnitSummon(pi) {
    const p = this.state.players[pi];
    const hasPerson = p.field.some(u => u.kind === "samurai" || u.kind === "noble" || u.kind === "daimyo") ||
      p.hand.some(c => c.type === "samurai" || c.type === "noble" || c.type === "daimyo");
    if (hasPerson) { p.noUnitStreak = 0; return; }
    p.noUnitStreak = (p.noUnitStreak || 0) + 1;
    const info = this.noUnitSummonInfo(pi);
    if (!info || !info.ok) {
      if (info && info.blocked) this.log(`⚠ ${p.name} 连续 ${p.noUnitStreak} 回合无人物牌，但${info.blocked}，本次不召唤`);
      return;
    }
    if (pi === 0) {
      // 玩家弹窗选择
      this.state.prompting = true;
      UI.askNoUnitSummon(info, (use) => {
        this.state.prompting = false;
        if (use) this.doNoUnitSummon(0);
        else UI.renderAll(); // 放弃：计数保留（下个己方回合仍可再次选择）
      });
    } else {
      // AI 自动执行
      this.doNoUnitSummon(1);
    }
  },

  /* 天皇·国士无双（通用触发）：己方回合开始，若本回合战场区没有牌且己方生命低于对方，
     从弃牌堆召唤一位武士——该武士所有数值为 0、不能攻击、受一次攻击后下场、不给将军溢出伤害 */
  guoshiInfo(pi) {
    const p = this.state.players[pi];
    const opp = this.state.players[1 - pi];
    if (p.field.length > 0) return null;
    if (p.hp >= opp.hp) return null;
    if (p.field.length >= 5) return null;
    const persons = this.state.discard.filter(d => d.type === "samurai");
    if (!persons.length) return null;
    return { ok: true };
  },
  guoshiSummon(pi) {
    const st = this.state;
    const p = st.players[pi];
    if (!this.guoshiInfo(pi)) return false;
    const persons = st.discard.filter(d => d.type === "samurai");
    const pick = persons[Math.floor(Math.random() * persons.length)];
    const di = st.discard.indexOf(pick);
    st.discard.splice(di, 1);
    const gu = this.newUnit(pi, "samurai", pick.card);
    gu.baseAtk = 0; gu.baseDef = 0; // 所有数值均为 0
    gu.guoshiGuard = true; // 国士无双盾：不可攻击、不给溢出、数值恒 0
    gu.summonedTurn = st.turnNo;
    p.field.push(gu);
    this.onUnitEntered(pi, gu);
    if (UI.unitEnter) UI.unitEnter(gu.uid);
    if (UI.guoshiEffect) UI.guoshiEffect(); // 中央特效：「国士无双」四字从上到下排开
    this.log(`♟ 国士无双：${p.name} 战场区无牌且生命低于对方，从弃牌堆召唤盾武士【${gu.card.name}】（攻 0 防 0，不可攻击，受一次攻击下场，无溢出）`, p.isAI ? "ai" : "me", pick);
    UI.renderAll();
    return true;
  },

  /* 玩家自行决定：将战场区单位下场（移入弃牌堆） */
  discardUnit(pi, uid) {
    const p = this.state.players[pi];
    const u = p.field.find(x => x.uid === uid);
    if (!u) return false;
    this.state.discard.push({ type: u.kind, card: u.card });
    p.field = p.field.filter(x => x.uid !== uid);
    // 装备随弃（骑具下场触发八百里分麾下炙）
    for (const s of ["blade", "armor", "mount"]) if (u.eq && u.eq[s]) {
      const eq = u.eq[s];
      this.state.discard.push({ type: s, card: eq });
      u.eq[s] = null;
      if (s === "mount") this.mountLeaves(pi, eq);
    }
    this.clearMountShareFor(pi, uid); // 该单位不再是骑具共享的受益者
    this.log(`${p.name} 将【${u.card.name}】自愿下场（移入弃牌堆）`);
    UI.renderAll();
    return true;
  },

  /* 玩家自行决定：将手牌放入弃牌堆 */
  discardHand(pi, hi) {
    const p = this.state.players[pi];
    if (hi < 0 || hi >= p.hand.length) return false;
    const c = p.hand.splice(hi, 1)[0];
    this.state.discard.push(c);
    if (UI.flashDiscard) UI.flashDiscard();
    this.log(`${p.name} 弃置手牌 ${this.cardName(c)}`);
    UI.renderAll();
    return true;
  },

  /* 三张换一回收：3 圣迹→大名/公卿/武士；3 城池→公卿/武士；3 事件→武士 */
  canExchange(p) {
    const cnt = t => p.hand.filter(c => c.type === t).length;
    return (cnt("sacred") >= 3 || cnt("castle") >= 3 || cnt("process") >= 3) && this.state.discard.length > 0;
  },
  exchangeCats() {
    const p = this.state.players[0];
    const cnt = t => p.hand.filter(c => c.type === t).length;
    const out = [];
    if (cnt("sacred") >= 3) out.push({ cat: "sacred", label: "圣迹（3 张）→ 回收 大名/公卿/武士", allowed: ["daimyo", "noble", "samurai"] });
    if (cnt("castle") >= 3) out.push({ cat: "castle", label: "城池（3 张）→ 回收 公卿/武士", allowed: ["noble", "samurai"] });
    if (cnt("process") >= 3) out.push({ cat: "process", label: "事件（3 张）→ 回收 武士", allowed: ["samurai"] });
    return out;
  },
  exchange(pi, cat, discIdx) {
    const p = this.state.players[pi];
    const idxs = p.hand.map((c, i) => c.type === cat ? i : -1).filter(i => i >= 0);
    if (idxs.length < 3) { this.log("手牌不足 3 张该类牌"); return false; }
    const meta = this.exchangeCats().find(x => x.cat === cat) ||
      { allowed: cat === "sacred" ? ["daimyo", "noble", "samurai"] : cat === "castle" ? ["noble", "samurai"] : ["samurai"] };
    const dc = this.state.discard[discIdx];
    if (!dc || !meta.allowed.includes(dc.type)) { this.log("弃牌堆无该类可回收的牌"); return false; }
    for (let k = 2; k >= 0; k--) p.hand.splice(idxs[k], 1);
    this.state.discard.splice(discIdx, 1);
    p.hand.push(dc);
    this.log(`${p.name} 以 3 张【${TYPE_CN[cat]}】兑换回收【${dc.card.name}】（${KIND_CN[dc.type] || TYPE_CN[dc.type]}）`);
    UI.renderAll();
    return true;
  },

  /* 创建场上单位。opts.noAttackTurn=true 表示「本回合不可攻击」
     （规则 §6.2：献祭召唤 / 恩典召唤 的大名与公卿当回合不可攻击） */
  newUnit(pi, kind, card, opts = {}) {
    const u = {
      uid: this.uid(), pi, kind, card,
      baseAtk: card.atk, baseDef: card.dfs,
      hp: kind === "daimyo" ? 20 : null, // 大名命值（替死10+本命10；己方王城在区时 +10）
      eq: { blade: null, armor: null, mount: null },
      fx: card.fx || "", extraAtk: 0, extraDef: 0,
      summonedTurn: this.state.turnNo,
      noAttackTurn: opts.noAttackTurn ? this.state.turnNo : null,
      alive: true, hist: [{ t: this.state.turnNo, src: "登场", desc: "召唤上场" }],
    };
    if (kind === "daimyo") u.hp = this.daimyoHpCap(u);
    return u;
  },

  /* 装备成长概率：卡面 grow + 事件第一层「装备共鸣」（己方 +10%／对方 +5%）
     + 城池第三层「概率倾斜」（大城只作用于骑具、装具，故仅装具成长受影响）；上限 100% */
  growChance(u, slot) {
    const eq = u.eq && u.eq[slot];
    if (!eq) return 0;
    let v = eq.grow || 0;
    const z = this.state.zone;
    if (z && z.type === "process") v += z.owner === u.pi ? 10 : 5;
    if (z && z.type === "castle" && z.card.tier === "大城" && slot === "armor") v += z.owner === u.pi ? 5 : -5;
    return Math.max(0, Math.min(100, v));
  },
  /* 装备成长：掷骰命中则该装备加成 +1（永久累积、无上限） */
  growEquip(u, slot) {
    const eq = u.eq && u.eq[slot];
    if (!eq) return false;
    const chance = this.growChance(u, slot);
    if (Math.random() * 100 > chance) return false;
    if (slot === "blade") eq.atk = (eq.atk || 0) + 1;
    else eq.dfs = (eq.dfs || 0) + 1;
    u.hist = u.hist || [];
    u.hist.push({ t: this.state.turnNo, src: "装备成长", desc: `${TYPE_CN[slot]}【${eq.name}】加成 +1（${chance}%）` });
    this.log(`📈 装备成长：【${eq.name}】加成 +1（掷骰 ${chance}%）`);
    return true;
  },

  /* 大名命值上限：替死 10 + 本命 10 = 20；己方王城在区时额外一次「替死」（上限 30） */
  daimyoHpCap(u) {
    const z = this.state.zone;
    if (z && z.type === "castle" && z.owner === u.pi && z.card.tier === "王城") return 30;
    return 20;
  },
  /* 城盟随常置牌变化：命值超出上限的部分回收（王城被顶替 → 上限回落 20） */
  refreshDaimyoHp(pi) {
    const p = this.state.players[pi];
    for (const u of p.field) {
      if (u.kind !== "daimyo") continue;
      const cap = this.daimyoHpCap(u);
      if (u.hp > cap) {
        u.hp = cap;
        u.hist = u.hist || [];
        u.hist.push({ t: this.state.turnNo, src: "城盟", desc: `命值上限回落至 ${cap}` });
        this.log(`🏰 城盟：己方王城已不在区，大名【${u.card.name}】命值回落至 ${cap}`);
      }
    }
  },

  /* 阶段三 · 使用事件/城池 */
  playZone(pi, hi) {
    const st = this.state;
    const p = st.players[pi];
    const c = p.hand[hi];
    if (c.type !== "process" && c.type !== "castle") return false;
    if (p.zoneUsed >= this.zoneQuota(pi)) { this.log("本回合已使用过事件/城池牌"); return false; }
    p.hand.splice(hi, 1);
    const old = st.zone;
    if (old) {
      // 旧牌被顶替
      this.zHist(old, "被顶替", `被【${c.card.name}】顶替下场 · 专属权：${this.state.players[old.owner].name}`, old.owner);
      st.discard.push(old);
      if (old.type === "castle") {
        const own = this.state.players[old.owner];
        own.hp = Math.min(own.maxHp || 100, own.hp + 5);
        this.hpEvent(old.owner, -5, "城池被顶替", own.hp);
        this.log(`城池【${old.card.name}】被顶替：${own.name} 将军 +5 → ${own.hp}`);
        this.refreshDaimyoHp(old.owner); // 王城离区 → 己方大名命值上限回落
        this.castleL6OnBroken(old, "被顶替"); // 第六层 · 城破：己方公卿全部下场
      } else if (old.type === "process") {
        this.settleEvent(old); // 事件第五层 · 清算（X/Y）
      }
      this.log(`【${old.card.name}】被顶替下场（进入弃牌堆）`);
    }
    st.zone = { type: c.type, card: c.card, owner: pi, hist: [{ t: st.turnNo, src: "放置", desc: `${p.name} 放置 · 专属权：${p.name}`, owner: pi }] };
    // 常置牌易主 → 城盟（大名命值上限）随之为新常置牌重新判定
    this.refreshDaimyoHp(pi);
    this.refreshDaimyoHp(1 - pi);
    if (c.type === "castle") {
      this.zHist(st.zone, "第一层·城威", `己方攻防 +${c.card.ao}／敌方 +${c.card.ap}；增幅一 ${c.card.amp1}、增幅二 ${c.card.amp2}（常置光环）`, pi);
      this.zHist(st.zone, "第二层·装备共鸣", c.card.tier === "大城" ? "己方兵刃 +50%／敌方兵刃 −30%"
        : c.card.tier === "王城" ? "兵刃/装具可同时作用两位；己方骑具亦同时作用两位，躲避成功令敌方武士攻击 +1"
        : "兵刃/装具可同时作用两位（骑具不共享）", pi);
      this.zHist(st.zone, "第三层·概率倾斜", c.card.tier === "王城" ? "己方概率 +10%／敌方 +5%" : "己方 +5%／敌方 −5%", pi);
    } else {
      this.zHist(st.zone, "第一层·攻防洪流", `己方攻防 +${c.card.a1o}／敌方 +${c.card.a1p}`, pi);
      this.zHist(st.zone, "第四层·" + c.card.l4, "待命（每次发动扣 " + c.card.cost + " 生命）", pi);
    }
    p.zoneUsed++;
    if (UI.flashZone) UI.flashZone();
    if (c.type === "castle") {
      const opp = st.players[1 - pi];
      opp.hp -= 5;
      this.hpEvent(1 - pi, 5, "城池【" + c.card.name + "】", opp.hp);
      this.log(`${p.name} 放置城池【${c.card.name}】（${c.card.tier}）：对方将军 −5 → ${opp.hp}`, p.isAI ? "ai" : "me", c);
      if (opp.hp <= 0) { this.win(1 - pi); return true; }
      // 王城城盟：己方在区大名命值上限 +10（额外一次替死）——对已在场与后登场的大名一致生效
      if (c.card.tier === "王城") {
        for (const u of p.field) {
          if (u.kind !== "daimyo") continue;
          const cap = this.daimyoHpCap(u);
          if (u.hp < cap) {
            u.hp = cap;
            u.hist = u.hist || [];
            u.hist.push({ t: st.turnNo, src: "王城城盟", desc: "额外一次替死，命值上限 +10" });
            this.log(`🏰 王城城盟：大名【${u.card.name}】命值 ${cap}（额外替死）`);
          }
        }
      }
    } else {
      this.log(`${p.name} 放置事件【${c.card.name}】（第一层 己攻防+${c.card.a1o}/敌+${c.card.a1p}）`, p.isAI ? "ai" : "me", c);
      // 大名第四层 · 天命：事件入场即结算（双方天命大名各自为己方将军 +10）
      this.checkTianming(0);
      this.checkTianming(1);
    }
    UI.renderAll();
    return true;
  },

  /* 天皇使用记录 */
  eHist(pi, src, desc) {
    const p = this.state.players[pi];
    p.emperorHist = p.emperorHist || [];
    p.emperorHist.push({ t: this.state.turnNo, src, desc });
    if (p.emperorHist.length > 40) p.emperorHist.shift();
  },

  /* 常置牌使用记录 */
  zHist(z, src, desc, owner) {
    if (!z) return;
    z.hist = z.hist || [];
    z.hist.push({ t: this.state.turnNo, src, desc, owner: owner !== undefined ? owner : z.owner });
    if (z.hist.length > 30) z.hist.shift();
  },
  /* 每回合都会发生的常置效果（天佑、城池增幅）：同源记录只保留最新一条，避免刷掉其它历史 */
  zHistKeyed(z, src, desc, owner) {
    if (!z) return;
    z.hist = z.hist || [];
    const i = z.hist.findIndex(h => h.src === src);
    const rec = { t: this.state.turnNo, src, desc, owner: owner !== undefined ? owner : z.owner };
    if (i >= 0) z.hist[i] = rec;
    else z.hist.push(rec);
  },

  /* 大名第四层 · 天命：事件在区时，己方将军一次性 +10（每名天命大名只结算一次） */
  checkTianming(pi) {
    const st = this.state;
    const z = st.zone;
    if (!z || z.type !== "process") return;
    const p = st.players[pi];
    for (const u of p.field) {
      if (u.kind !== "daimyo" || !u.card.l4 || !u.card.l4.includes("天命")) continue;
      if (u._tianmingUsed) continue;
      u._tianmingUsed = true;
      p.hp = Math.min(p.maxHp || 100, p.hp + 10);
      this.hpEvent(pi, -10, "天命", p.hp);
      this.log(`⚡ 大名【${u.card.name}】天命：事件在时，${p.name} 将军 +10 → ${p.hp}`);
    }
  },

  /* 事件第五层 · 清算（X / Y 印记）：事件被顶替下场时结算双方伤害 */
  settleEvent(ev) {
    const st = this.state;
    const ownerP = st.players[ev.owner];
    const opp = st.players[1 - ev.owner];
    const KM = { 武士: "samurai", 公卿: "noble", 大名: "daimyo" };
    const X = KM[ev.card.x] || ev.card.x, Y = KM[ev.card.y] || ev.card.y;
    const nX = ownerP.field.filter(u => u.kind === X).length;
    const nY = opp.field.filter(u => u.kind === Y).length;
    const dodgeRoll = (target, dmg, who) => {
      if (Math.random() * 100 <= this.effDodge(st.players.indexOf(target))) {
        this.log(`事件【${ev.card.name}】清算：${who} 将军躲避成功（${this.effDodge(st.players.indexOf(target))}%）`);
        return;
      }
      target.hp -= dmg;
      this.hpEvent(st.players.indexOf(target), dmg, "事件清算·" + (who === ownerP.name ? X : Y), target.hp);
      this.zHist(ev, "第五层·清算", `施展对象：${who} 将军 −${dmg}（${who === ownerP.name ? X : Y} 单位 ${who === ownerP.name ? nX : nY} 张）`, ev.owner);
      this.log(`💥 事件【${ev.card.name}】第五层清算：${who} 方 ${who === ownerP.name ? X : Y} 单位 ${who === ownerP.name ? nX : nY} 张 → ${who} 将军 −${dmg} → ${target.hp}`);
      if (target.hp <= 0) this.win(1 - st.players.indexOf(target)); // 被伤害方阵亡 → 其对手获胜
    };
    if (nX > 0) dodgeRoll(opp, nX, ownerP.name);
    if (nY > 0) dodgeRoll(ownerP, nY, opp.name);
  },

  /* 圣-10 丰玉姬化龙：己方大名直击对方将军（无法失效/阻挡），回合结束大名下场 */
  ryujinStrike(pi) {
    const st = this.state;
    const p = st.players[pi], opp = st.players[1 - pi];
    const pending = p._ryujinPending;
    const all = p.field.filter(x => x.kind === "daimyo");
    if (!all.length) { this.log("🐉 丰玉姬化龙：己方无大名，无法直击"); return; }
    const strike = (u) => {
      if (!u) { this.log("🐉 丰玉姬化龙：己方无大名，无法直击"); return; }
      const dmg = this.unitStats(u).atk;
      if (Math.random() * 100 <= this.effDodge(1 - pi)) {
        this.log(`🐉 丰玉姬化龙：【${u.card.name}】（攻${dmg}）直击对方将军，对方躲避成功！`);
      } else {
        opp.hp -= dmg;
        this.hpEvent(1 - pi, dmg, "丰玉姬化龙", opp.hp);
        this.log(`🐉 丰玉姬化龙：【${u.card.name}】（攻${dmg}）直击对方将军 −${dmg} → ${opp.hp}`);
        if (opp.hp <= 0) { this.win(pi); return; }
      }
      // 规则 §3.12：回合结束时该大名下场（此刻仅标记）
      u._ryujinLeave = true;
      this.log(`🐉 丰玉姬化龙：己方【${u.card.name}】直击后将在回合结束时下场`);
      UI.renderAll();
    };
    // 待命触发时大名已锁定；当场使用时由玩家点选一位大名
    if (pending) { strike(all.find(x => x.uid === pending) || all[0]); return; }
    if (all.length === 1) { strike(all[0]); return; }
    this.askPick(pi, {
      title: "🐉 丰玉姬化龙 · 指定大名",
      body: `请选择一位己方大名直接攻击对方将军（攻击值点伤害，无法被阻挡/无效/躲避），回合结束时该大名下场。`,
      cands: all,
      onPick: (uid) => strike(p.field.find(x => x.uid === uid)),
    });
  },

  /* 王座更迭：双方从剩余将军牌池随机换将军（生命不变，原将军永久移出牌池） */
  swapShoguns() {
    for (let pi = 0; pi < 2; pi++) this.swapShogun(pi);
  },
  /* 单方更换将军（随机剩余池，生命不变，原将军永久移出牌池） */
  swapShogun(pi) {
    const st = this.state;
    const q = st.players[pi];
    const taken = () => new Set(st.players.map(x => x.shogun.name));
    const discarded = () => new Set(st.discard.filter(d => d.type === "shogun").map(d => d.card.name));
    const t = taken(); const dd = discarded();
    const pool = CARDS.shoguns.filter(s => !t.has(s.name) && !dd.has(s.name));
    if (!pool.length) { this.log(`♻ ${q.name} 将军换位：牌池已无可抽将军`); return false; }
    const old = q.shogun;
    st.discard.push({ type: "shogun", card: old });
    q.shogun = pool[Math.floor(Math.random() * pool.length)];
    this.log(`♻ ${q.name} 将军【${old.name}】下场，随机抽选【${q.shogun.name}】（生命 ${q.hp} 不变）`);
    return true;
  },
  /* 单方更换天皇（随机剩余池，原天皇与宝物一同进弃牌堆、永久移出牌池） */
  swapEmperor(pi) {
    const st = this.state;
    const q = st.players[pi];
    const taken = () => new Set(st.players.map(x => x.emperor.name));
    const discarded = () => new Set(st.discard.filter(d => d.type === "emperor").map(d => d.card.name));
    const t = taken(); const dd = discarded();
    const pool = CARDS.emperors.filter(e => !t.has(e.name) && !dd.has(e.name));
    if (pool.length) {
      const old = q.emperor;
      st.discard.push({ type: "emperor", card: old });
      // 规则 3.11：更换天皇时，原天皇身上的宝物一并置入弃牌堆（触发宝物第五层下场）
      if (q.treasure.length) {
        for (const tr of q.treasure) st.discard.push({ type: "treasure", card: tr.card });
        q.treasure = [];
        this.treasureDownEffect(pi, "天皇换位");
      }
      q.emperor = pool[Math.floor(Math.random() * pool.length)];
      this.eHist(pi, "天皇换位", `原【${old.name}】下场，抽选【${q.emperor.name}】`);
      this.log(`👑 ${q.name} 天皇换位：随机抽取【${q.emperor.name}】`);
      return true;
    }
    this.log(`👑 ${q.name} 天皇换位：牌池已无可抽天皇`);
    return false;
  },

  /* 圣-09 八咫乌引路：双方各选「更换天皇牌 / 更换将军牌 / 放弃」（使用者先选，再对方） */
  yatagarasuFlow(pi) {
    const st = this.state;
    const step = (i) => {
      if (i >= 2) { UI.renderAll(); return; }
      const qpi = i === 0 ? pi : 1 - pi;
      const q = st.players[qpi], opp = st.players[1 - qpi];
      if (q.isAI) {
        // AI：逆境换将军，顺境放弃（不做额外收益判断，保持确定性）
        this.applyYatagarasu(qpi, q.hp < opp.hp ? "shogun" : null);
        step(i + 1);
        return;
      }
      st.prompting = true;
      UI.askYatagarasu(q, (pick) => {
        st.prompting = false;
        this.applyYatagarasu(qpi, pick);
        step(i + 1);
      });
    };
    step(0);
  },
  applyYatagarasu(pi, pick) {
    const q = this.state.players[pi];
    if (pick === "emperor") {
      if (this.swapEmperor(pi)) this.eHist(pi, "八咫乌引路", "更换天皇牌");
    } else if (pick === "shogun") {
      if (this.swapShogun(pi)) this.eHist(pi, "八咫乌引路", "更换将军牌");
    } else {
      this.log(`🕊 八咫乌引路：${q.name} 放弃更换`);
    }
    UI.renderAll();
  },

  /* 御·骑具之灵：天皇拥有「骑具之灵」轨道时，大名亦可装备骑具（破格） */
  canMountOnDaimyo(pi) {
    return this.emperorTracks(this.state.players[pi]).some(tr => tr.includes("骑具之灵"));
  },
  /* 御·兵刃之锐：天皇拥有「兵刃之锐」轨道时，公卿亦可装备兵刃（破格） */
  canBladeOnNoble(pi) {
    return this.emperorTracks(this.state.players[pi]).some(tr => tr.includes("兵刃之锐"));
  },
  /* 御·装具之固：天皇拥有「装具之固」轨道时，武士亦可装备装具（破格） */
  canArmorOnSamurai(pi) {
    return this.emperorTracks(this.state.players[pi]).some(tr => tr.includes("装具之固"));
  },

  /* 装备 */
  equip(pi, hi, targetUid) {
    const p = this.state.players[pi];
    const c = p.hand[hi];
    const u = p.field.find(x => x.uid === targetUid);
    if (!u) { this.log("装备目标不存在，请重新选择"); return false; }
    if (c.type === "blade" && (u.kind !== "daimyo" && u.kind !== "samurai")) {
      if (u.kind === "noble" && this.canBladeOnNoble(pi)) {
        // 御·兵刃之锐：天皇拥有该轨道 → 公卿可装备兵刃
      } else {
        this.log("兵刃只能装备大名/武士（天皇拥有御·兵刃之锐时，公卿亦可）");
        return false;
      }
    }
    if (c.type === "armor" && (u.kind !== "daimyo" && u.kind !== "noble")) {
      if (u.kind === "samurai" && this.canArmorOnSamurai(pi)) {
        // 御·装具之固：天皇拥有该轨道 → 武士可装备装具
      } else {
        this.log("装具只能装备大名/公卿（天皇拥有御·装具之固时，武士亦可）");
        return false;
      }
    }
    if (c.type === "mount" && (u.kind !== "noble" && u.kind !== "samurai")) {
      if (u.kind === "daimyo" && this.canMountOnDaimyo(pi)) {
        // 御·骑具之灵：天皇拥有该轨道 → 大名可装备骑具
      } else {
        this.log("骑具只能装备公卿/武士（天皇拥有御·骑具之灵时，大名亦可）");
        return false;
      }
    }
    const slot = c.type;
    if (u.eq[slot]) { this.log("该单位已有同类装备"); return false; }
    p.hand.splice(hi, 1);
    u.eq[slot] = c.card;
    u.hist = u.hist || [];
    const effDesc = c.type === "blade" ? `攻击 +${c.card.atk}` : c.type === "armor" ? `防御 +${c.card.dfs}` : `躲避 +${c.card.dodge}%`;
    u.hist.push({ t: this.state.turnNo, src: "装备", desc: `${TYPE_CN[c.type]}【${c.card.name}】：${effDesc}` });
    if (c.type === "armor") this.armorSynergy(pi, u); // 装具配套（装具本身）
    else if (u.eq.armor) this.armorSynergy(pi, u); // 已有装具：补结算配套（后装兵刃/骑具）
    if (c.type === "mount") this.diluSoul(pi, u); // 的卢之魂（骑具本身）
    if (UI.flashUnit) UI.flashUnit(pi, u.uid);
    this.log(`${p.name} 为【${u.card.name}】装备${TYPE_CN[c.type]}【${c.card.name}】`, p.isAI ? "ai" : "me", c);
    // 该单位自己有了骑具 → 不再借用他人骑具；新骑具在王城在区时择定共享受益者
    this.clearMountShareFor(pi, u.uid);
    u.shareTo = null;
    if (c.type === "mount") this.mountShareOnEquip(pi, u);
    UI.renderAll();
    return true;
  },

  /* 兵刃 · 断刃重铸（主动）：支付将军当前生命的 1/10，令一件已装备的兵刃转移到其他可装备目标身上 */
  reforgeInfo(pi) {
    const st = this.state;
    const p = st.players[pi];
    if (p.reforgeUsed) return { blocked: "本回合已使用过断刃重铸" };
    const holders = p.field.filter(u => u.eq && u.eq.blade);
    if (!holders.length) return { blocked: "己方场上无已装备的兵刃" };
    const cost = Math.max(1, Math.floor(p.hp / 10));
    if (p.hp <= cost) return { blocked: "将军生命不足支付代价" };
    // 可接收目标：允许装备兵刃且该槽位为空的己方单位
    const canBlade = (u) => u.kind === "daimyo" || u.kind === "samurai" || (u.kind === "noble" && this.canBladeOnNoble(pi));
    const targets = p.field.filter(u => canBlade(u) && !u.eq.blade);
    return { ok: true, holders, targets, cost };
  },
  useReforge(pi, fromUid, toUid) {
    const st = this.state;
    const p = st.players[pi];
    const info = this.reforgeInfo(pi);
    if (!info || !info.ok) { this.log("断刃重铸当前不可用"); return false; }
    const from = p.field.find(u => u.uid === fromUid);
    const to = p.field.find(u => u.uid === toUid);
    if (!from || !from.eq.blade) { this.log("断刃重铸：来源单位没有兵刃"); return false; }
    if (!to || to.eq.blade) { this.log("断刃重铸：目标不可装备或已有兵刃"); return false; }
    const canBlade = to.kind === "daimyo" || to.kind === "samurai" || (to.kind === "noble" && this.canBladeOnNoble(pi));
    if (!canBlade) { this.log("断刃重铸：目标不能装备兵刃"); return false; }

    p.hp -= info.cost;
    this.hpEvent(pi, info.cost, "断刃重铸", p.hp, false);
    p.reforgeUsed = true;

    const blade = from.eq.blade;
    from.eq.blade = null;
    to.eq.blade = blade;
    from.hist = from.hist || [];
    from.hist.push({ t: st.turnNo, src: "断刃重铸", desc: `兵刃【${blade.name}】转出` });
    to.hist = to.hist || [];
    to.hist.push({ t: st.turnNo, src: "断刃重铸", desc: `兵刃【${blade.name}】转入：攻击 +${blade.atk}` });
    // 兵刃易主 → 兵刃共享与「独刃威」等实时条件重新判定
    this.clearMountShareFor(pi);
    this.eHist(pi, "断刃重铸", `兵刃【${blade.name}】由【${from.card.name}】转至【${to.card.name}】，将军 −${info.cost}`);
    this.log(`🗡 断刃重铸：${p.name} 支付 ${info.cost} 生命，兵刃【${blade.name}】从【${from.card.name}】转至【${to.card.name}】`, p.isAI ? "ai" : "me");
    if (UI.flashUnit) UI.flashUnit(pi, to.uid);
    UI.renderAll();
    return true;
  },

  /* 城池第五层 · 募兵（每三回合一次；从手牌或弃牌堆召唤，不减半） */
  recruitInfo(pi) {
    const st = this.state;
    const p = st.players[pi];
    const z = st.zone;
    if (!z || z.type !== "castle" || z.owner !== pi) return null;
    if (z.card.l5 === "无") return null;
    const tier = z.card.tier;
    const cost = tier === "王城" ? 10 : 5;
    // 冷却：3 个己方回合
    if ((p.recruitTurnsLeft || 0) > 0) return { tier, cost, cooldown: p.recruitTurnsLeft };
    // 条件：己方无大名且无公卿
    const hasD = p.field.some(u => u.kind === "daimyo");
    const hasN = p.field.some(u => u.kind === "noble");
    if (hasD || hasN) return { tier, cost, blocked: "需己方无大名且无公卿" };
    if (p.field.length >= 5) return { tier, cost, blocked: "战场区已满" };
    if (p.hp <= cost) return { tier, cost, blocked: "将军生命不足" };
    return { tier, cost, ok: true };
  },

  recruitOptions(pi) {
    const info = this.recruitInfo(pi);
    if (!info || !info.ok) return [];
    const allowed = info.tier === "王城" ? ["daimyo", "noble", "samurai"] : ["noble", "samurai"];
    const opts = [];
    const p = this.state.players[pi];
    p.hand.forEach((c, i) => { if (allowed.includes(c.type)) opts.push({ src: "hand", idx: i, kind: c.type, card: c.card }); });
    this.state.discard.forEach((c, i) => { if (allowed.includes(c.type)) opts.push({ src: "discard", idx: i, kind: c.type, card: c.card }); });
    return opts;
  },

  doRecruit(pi, opt) {
    const st = this.state;
    const p = st.players[pi];
    const info = this.recruitInfo(pi);
    if (!info || !info.ok) { this.log("募兵当前不可用"); return false; }
    if (p.field.length >= 5) { this.log("战场区已满"); return false; }
    let card = null;
    if (opt.src === "hand") { card = p.hand.splice(opt.idx, 1)[0]; }
    else { card = st.discard.splice(opt.idx, 1)[0]; }
    p.hp -= info.cost;
    this.zHist(st.zone, "募兵", `${p.name} 募兵召唤${KIND_CN[opt.kind]}【${card.card.name}】`);
    p.recruitTurnsLeft = 3; // 冷却 3 个己方回合
    const u = this.newUnit(pi, opt.kind, card.card);
    p.field.push(u);
    this.onUnitEntered(pi, u);
    if (UI.unitEnter) UI.unitEnter(u.uid);
    if (UI.effectBurst) UI.effectBurst(pi);
    this.log(`募兵（${info.tier}）：${p.name} 从${opt.src === "hand" ? "手牌" : "弃牌堆"}召唤 ${KIND_CN[opt.kind]}【${card.card.name}】（当回合即可攻击），将军 −${info.cost} → ${p.hp}`);
    UI.renderAll();
    return true;
  },

  /* 宝物：可装备于己方或敌方天皇；每位天皇最多 2 张；满 2 张回合末换天皇 */
  playTreasure(pi, hi, targetEmperorPi) {
    const st = this.state;
    const p = st.players[pi];
    const c = p.hand[hi];
    if (c.type !== "treasure") return false;
    const emp = st.players[targetEmperorPi]; // 装备对象天皇的持有者（效果以其为视角）
    if (emp.treasure.length >= 2) { this.log("该天皇已装备 2 张宝物（上限）"); return false; }
    p.hand.splice(hi, 1);
    const entry = { card: c.card, tgt: { samurai: null, noble: null, daimyo: null } };
    emp.treasure.push(entry);
    // 登场结算顺序按规则书 3.11：先第四层（威压/苦肉），后第五层（上场 +1）
    this.runSeq([
      (next) => this.askTreasureTarget(targetEmperorPi, entry, "samurai", next),
      (next) => this.askTreasureTarget(targetEmperorPi, entry, "noble", next),
      (next) => this.askTreasureTarget(targetEmperorPi, entry, "daimyo", next),
      (next) => { if (this.treasureL4(targetEmperorPi, c.card, pi)) return; next(); }, // 威压击杀 → 结束
      (next) => this.askTreasureBuff(targetEmperorPi, c.card, "上场", next),
      (next) => { this.finishPlayTreasure(pi, targetEmperorPi, c.card); next(); },
    ]);
    return true;
  },

  /* 宝物一~三层：指定一位对应类型的单位（玩家点选；无候选则跳过） */
  askTreasureTarget(empPi, entry, kind, next) {
    const st = this.state;
    const emp = st.players[empPi];
    const card = entry.card;
    const cands = emp.field.filter(u => u.kind === kind);
    if (!cands.length) { next(); return; }
    const v = kind === "samurai" ? card.s1 : kind === "noble" ? card.n1 : card.d1;
    const desc = kind === "daimyo" ? `攻击与防御 +${v}` : `${kind === "samurai" ? "防御" : "攻击"} +${v}`;
    this.askPick(empPi, {
      title: `💎 宝物 · 指定${KIND_CN[kind]}`,
      body: `【${card.name}】第一~三层：请指定一位${empPi === 0 ? "己方" : "对方"}${KIND_CN[kind]}，${desc}（常置；目标离场后可重新指定）。`,
      cands,
      onPick: (uid) => {
        entry.tgt[kind] = uid;
        const u = emp.field.find(x => x.uid === uid);
        if (u) {
          u.hist = u.hist || [];
          u.hist.push({ t: st.turnNo, src: "宝物·" + KIND_CN[kind], desc: `【${card.name}】：${desc}` });
        }
        next();
      },
    });
  },

  /* 重新指定宝物第一~三层的目标（目标离场后玩家可点击天皇宝物徽标改指） */
  designateTreasureTarget(empPi, ti, kind, uid) {
    const st = this.state;
    const emp = st.players[empPi];
    const tr = emp.treasure[ti];
    if (!tr || !KIND_CN[kind]) return false;
    const u = emp.field.find(x => x.uid === uid && x.kind === kind);
    if (!u) return false;
    tr.tgt[kind] = uid;
    const v = kind === "samurai" ? tr.card.s1 : kind === "noble" ? tr.card.n1 : tr.card.d1;
    const desc = kind === "daimyo" ? `攻击与防御 +${v}` : `${kind === "samurai" ? "防御" : "攻击"} +${v}`;
    u.hist = u.hist || [];
    u.hist.push({ t: st.turnNo, src: "宝物·改指", desc: `【${tr.card.name}】：${desc}` });
    this.eHist(empPi, "宝物改指", `【${tr.card.name}】${KIND_CN[kind]}目标改为【${u.card.name}】`);
    this.log(`💎 宝物【${tr.card.name}】：${KIND_CN[kind]}目标改指【${u.card.name}】`, empPi === 0 ? "me" : "ai", { type: "treasure", card: tr.card });
    UI.renderAll();
    return true;
  },

  /* 宝物第四层 · 登场必发（威压/苦肉，视角=天皇持有者；整局每张限 3 次）。返回 true 表示已分胜负 */
  treasureL4(empPi, card, userPi) {
    const st = this.state;
    const emp = st.players[empPi];
    const opp = st.players[1 - empPi];
    const l4Used = st.l4Used[card.id] || 0;
    if (l4Used >= 3) {
      this.log(`宝物【${card.name}】第四层已发动 3 次（本局限 3 次），本次登场不再结算`);
      return false;
    }
    if (card.l4 === "苦肉" && emp.hp < opp.hp) {
      st.l4Used[card.id] = l4Used + 1;
      const dmg = Math.floor((opp.hp - emp.hp) / 2);
      this.eHist(empPi, "宝物施展·第四层苦肉", `施展对象：${emp.name} 将军（差值 ${dmg} 伤害判定）`);
      if (Math.random() * 100 > this.effDodge(empPi)) {
        emp.hp -= dmg;
        this.hpEvent(empPi, dmg, "宝物苦肉", emp.hp);
        this.log(`宝物【${card.name}】苦肉：${emp.name} 将军 −${dmg} → ${emp.hp}`);
        if (emp.hp <= 0) { this.win(1 - empPi); return true; }
      } else this.log(`宝物【${card.name}】苦肉：${emp.name} 将军躲避成功`);
    } else if (card.l4 === "威压" && emp.hp > opp.hp) {
      st.l4Used[card.id] = l4Used + 1;
      const dmg = Math.floor((emp.hp - opp.hp) / 2);
      this.eHist(empPi, "宝物施展·第四层威压", `施展对象：${opp.name} 将军（差值 ${dmg} 伤害判定）`);
      if (Math.random() * 100 > this.effDodge(1 - empPi)) {
        opp.hp -= dmg;
        this.hpEvent(1 - empPi, dmg, "宝物威压", opp.hp);
        this.log(`宝物【${card.name}】威压：对方将军 −${dmg} → ${opp.hp}`);
        if (opp.hp <= 0) { this.win(empPi); return true; }
      } else this.log(`宝物【${card.name}】威压：对方躲避成功`);
    } else if (card.l4) {
      this.log(`宝物【${card.name}】第四层【${card.l4}】：条件未满足（${card.l4 === "威压" ? "己方将军未高于对方" : "己方将军未低于对方"}），本次不发动`);
    }
    void userPi;
    return false;
  },

  /* 宝物第五层：上场 → 一位单位攻击 +1；下场 → 一位单位防御 +1（均由玩家点选） */
  askTreasureBuff(empPi, card, when, next) {
    const st = this.state;
    const emp = st.players[empPi];
    const cands = emp.field.slice();
    if (!cands.length) { if (next) next(); return; }
    const isUp = when === "上场";
    this.askPick(empPi, {
      title: `💎 宝物第五层 · ${when}`,
      body: `【${card.name}】${when}：请选择一位${empPi === 0 ? "己方" : "对方"}战场区单位，<b>${isUp ? "攻击" : "防御"} +1</b>（永久）。`,
      cands,
      onPick: (uid) => {
        const t = emp.field.find(x => x.uid === uid) || emp.field[0];
        if (t) {
          if (isUp) {
            t.extraAtk = (t.extraAtk || 0) + 1;
            t.hist = t.hist || [];
            t.hist.push({ t: st.turnNo, src: "宝物·上场", desc: `【${card.name}】：攻击 +1` });
          } else {
            t.extraDef = (t.extraDef || 0) + 1;
            t.hist = t.hist || [];
            t.hist.push({ t: st.turnNo, src: "宝物·下场", desc: `【${card.name}】：防御 +1` });
          }
          this.log(`💎 宝物【${card.name}】第五层·${when}：${isUp ? "己方" : "对方"}【${t.card.name}】${isUp ? "攻击" : "防御"} +1`);
        }
        if (next) next();
      },
    });
  },

  /* 宝物装备完成的收尾记录（第一~五层结算后调用） */
  finishPlayTreasure(pi, targetEmperorPi, card) {
    const st = this.state;
    const p = st.players[pi];
    const emp = st.players[targetEmperorPi];
    const tgtName = (kind) => { const u = emp.field.find(x => x.uid === emp.treasure.find(t => t.card === card)?.tgt?.[kind]); return u ? u.card.name : null; };
    const parts = [];
    const kinds = [["samurai", `武士 防御 +${card.s1}`], ["noble", `公卿 攻击 +${card.n1}`], ["daimyo", `大名 攻防 +${card.d1}`]];
    for (const [kind, desc] of kinds) {
      const n = tgtName(kind);
      if (n) parts.push(`【${n}】${desc}`);
    }
    if (parts.length) this.eHist(targetEmperorPi, "宝物施展·一~三层", `【${card.name}】→ ${parts.join("；")}`);
    this.eHist(targetEmperorPi, "装备宝物", `【${card.name}】装备于${targetEmperorPi === pi ? "己方" : "对方"}天皇`);
    if (UI.flashEmperor) UI.flashEmperor(targetEmperorPi);
    if (UI.effectBurst) UI.effectBurst(targetEmperorPi);
    this.log(`${p.name} 将宝物【${card.name}】装备于${targetEmperorPi === pi ? "己方" : "对方"}天皇（${emp.treasure.length}/2）`);
    if (emp.treasure.length >= 2) this.log(`⚠ ${emp.name} 天皇已满 2 张宝物——本回合结束时将更换天皇！`);
  },

  /* 宝物第五层 · 下场：己方一位单位防御 +1（玩家点选，AI 取首位） */
  treasureDownEffect(pi, reason) {
    const q = this.state.players[pi];
    const cands = q.field.slice();
    if (!cands.length) return;
    this.askPick(pi, {
      title: "💎 宝物第五层 · 下场",
      body: `宝物${reason}：请选择己方战场区一位单位，<b>防御 +1</b>（永久）。`,
      cands,
      onPick: (uid) => {
        const down = q.field.find(x => x.uid === uid) || q.field[0];
        if (!down) return;
        down.extraDef = (down.extraDef || 0) + 1;
        down.hist = down.hist || [];
        down.hist.push({ t: this.state.turnNo, src: "宝物下场", desc: reason + "弃宝物，防御 +1" });
        this.log(`💎 宝物第五层·下场（${reason}）：己方【${down.card.name}】防御 +1`);
      },
    });
  },

  /* 玩家主动弃置己方天皇宝物：进入弃牌堆，触发第五层下场 */
  discardTreasure(pi, ti) {
    const st = this.state;
    const q = st.players[pi];
    const tr = q.treasure[ti];
    if (!tr) { this.log("宝物不存在"); return false; }
    q.treasure.splice(ti, 1);
    st.discard.push({ type: "treasure", card: tr.card });
    this.eHist(pi, "弃置宝物", `【${tr.card.name}】弃入弃牌堆`);
    this.log(`♻ ${q.name} 弃置宝物【${tr.card.name}】（进入弃牌堆）`, pi === 0 ? "me" : "ai", { type: "treasure", card: tr.card });
    this.treasureDownEffect(pi, "主动弃置");
    UI.renderAll();
    return true;
  },

  /* 回合末：天皇满 2 张宝物 → 天皇下场、弃宝物、随机抽取新天皇 */
  checkEmperorSwap() {
    const st = this.state;
    const taken = () => new Set(st.players.map(x => x.emperor.name));
    const discarded = () => new Set(st.discard.filter(d => d.type === "emperor").map(d => d.card.name));
    for (const q of st.players) {
      if (q.treasure.length >= 2) {
        const oldEmp = q.emperor;
        for (const tr of q.treasure) st.discard.push({ type: "treasure", card: tr.card });
        q.treasure = [];
        this.eHist(st.players.indexOf(q), "天皇换位", `原【${oldEmp.name}】满 2 宝物被更换`);
        this.treasureDownEffect(st.players.indexOf(q), "天皇换位");
        st.discard.push({ type: "emperor", card: oldEmp });
        const t = taken(); const dd = discarded();
        const pool = CARDS.emperors.filter(e => !t.has(e.name) && !dd.has(e.name));
        if (pool.length) {
          q.emperor = pool[Math.floor(Math.random() * pool.length)];
          this.eHist(st.players.indexOf(q), "即位", `新天皇【${q.emperor.name}】`);
          this.log(`👑 ${q.name} 天皇换位：原【${oldEmp.name}】下场（永久移出牌池），随机抽取新天皇【${q.emperor.name}】`);
        } else {
          this.log(`👑 ${q.name} 天皇换位：牌池已无可抽天皇，保留原天皇`);
        }
      }
    }
    UI.renderAll();
  },

  /* 圣迹/灾厄（使用后按第一层消解处理；仅当第一层实际消解了一次敌方攻击才付禁攻代价）
     返回值：
       true           效果已结算（含被反制 → 消解未生效）
       "pending"      等待玩家抉择（弹窗回调内结算）
       false          非圣迹/灾厄牌
     state._negateResolved：本牌的第一层「消解」是否真正生效。
       消解被对方反制时为 false —— 此时该次敌方攻击既未被消解、也不应被吞掉，
       调用方须继续正常结算这次攻击（规则 §3.12/§3.13 第五层「一切效果作废」）。 */
  useEvent(pi, hi, asNegate) {
    const st = this.state;
    const p = st.players[pi];
    const c = p.hand[hi];
    let canceled = false; // 被对方抵消 → 禁攻代价回滚
    let settled = false;  // 效果是否已在弹窗回调内结算（避免外层重复结算）
    st._negateResolved = false; // 默认：第一层未实际生效
    if (c.type !== "sacred" && c.type !== "calamity") return false;
    asNegate = !!asNegate; // 第一层是否实际生效（消解了一次敌方攻击）
    p.hand.splice(hi, 1);
    this.state.discard.push(c);
    const opp = this.state.players[1 - pi];
    // 天皇第四能力 · 天命：按「谁使用、用了什么牌」结算
    this.emperorDestiny(pi, c.type);
    // 隐藏特效 · 春和景明／偶感风寒（需当前常置牌为己方）
    this.hiddenMood(pi, c.type);
    if (UI.effectBurst) UI.effectBurst(pi);
    if (UI.showEventAnimation) UI.showEventAnimation(c); // 中央全屏动画（3 秒）
    // 第一层：消解对方本回合的一次攻击（仅在响应敌方攻击时生效；主动使用仅触发第二层）
    this.log(`${p.name} 使用${TYPE_CN[c.type]}【${c.card.name}】：${asNegate ? "消解一次进攻" : "主动使用（第二层）"}`, p.isAI ? "ai" : "me", c);
    // 圣迹第二层·神迹：生命条件二选一（A 己方高 / B 己方低）满足才直接生效
    let proceed = true;
    if (c.type === "sacred" && c.card.cond) {
      proceed = c.card.cond === "A" ? p.hp > opp.hp : p.hp < opp.hp;
      if (!proceed) {
        this.log(`圣迹【${c.card.name}】第二层生命条件未满足（${c.card.cond === "A" ? "需己方生命高于对方" : "需己方生命低于对方"}），神迹未生效`);
      }
    }
    // 灾厄抵消：被灾厄影响方手上有圣迹时，可选择用圣迹抵消（两张进弃牌堆，均不生效）
    if (c.type === "calamity") {
      const sIdx = opp.hand.findIndex(x => x.type === "sacred");
      if (sIdx >= 0) {
        const cancel = () => {
          canceled = true;
          st._negateResolved = false; // 灾厄被抵消 → 消解未生效，攻击须照常结算
          const sc = opp.hand.splice(sIdx, 1)[0];
          this.state.discard.push(sc);
          this.log(`🛡 ${opp.name} 使用圣迹【${sc.card.name}】抵消灾厄【${c.card.name}】！两张牌进入弃牌堆，灾厄不生效，禁攻代价回滚`, opp.isAI ? "ai" : "me", sc);
          UI.renderAll();
        };
        if (opp.isAI) {
          if (opp.hp < (opp.maxHp || 100) * 0.6) { cancel(); proceed = false; }
        } else {
          st.prompting = true;
          UI.askCounterCalamity(c, (use) => {
            st.prompting = false;
            if (use) {
              cancel();
            } else {
              settled = true;
              this.simpleEventEffect(pi, c);
              if (asNegate) {
                st._negateResolved = true; // 消解实际生效
                p.noAtkUntil = this.state.turnNo + 2;
                this.log(`⚠ ${p.name} 本回合及下一回合不能攻击（${TYPE_CN[c.type]}第一层代价）`);
              }
            }
            UI.renderAll();
          });
          return "pending";
        }
      }
    }
    // 灾厄抵消圣迹（灾厄第五层·神迹克制）：使用圣迹时，被影响方手上有灾厄可选择抵消
    // 反制一旦生效，被反制的圣迹牌「一切效果」均不能使用
    const applySacred = () => {
      if (proceed) this.simpleEventEffect(pi, c);
      // 第三层·神怒／神佑独立于第二层的生命条件，只要牌未被反制就结算
      if (c.card.l3) this.sacredL3(pi, c.card, opp);
    };
    if (c.type === "sacred") {
      const cIdx = opp.hand.findIndex(x => x.type === "calamity");
      if (cIdx >= 0) {
        const cancel = () => {
          canceled = true;
          st._negateResolved = false; // 圣迹被克制 → 消解未生效，攻击须照常结算
          const cc = opp.hand.splice(cIdx, 1)[0];
          this.state.discard.push(cc);
          this.log(`💀 ${opp.name} 使用灾厄【${cc.card.name}】第五层·神迹克制，抵消圣迹【${c.card.name}】的一切效果！两张牌进入弃牌堆`, opp.isAI ? "ai" : "me", cc);
          UI.renderAll();
        };
        if (opp.isAI) {
          // AI：圣迹具有威胁性时才抵消（直接攻击/夺取/更换/化龙/随机获得等）
          const threat = /直接攻击|夺取|更换|化龙|随机获得|洗回|复活/.test(c.card.fx || "");
          if (threat) { cancel(); proceed = false; }
        } else {
          st.prompting = true;
          UI.askCounterSacred(c, (use) => {
            st.prompting = false;
            if (use) {
              cancel();
            } else {
              applySacred();
              if (asNegate) {
                st._negateResolved = true; // 消解实际生效
                p.noAtkUntil = this.state.turnNo + 2;
                this.log(`⚠ ${p.name} 本回合及下一回合不能攻击（${TYPE_CN[c.type]}第一层代价）`);
              }
            }
            UI.renderAll();
          });
          return "pending";
        }
      }
    }
    if (!canceled && !settled) {
      if (c.type === "sacred") applySacred();
      else this.simpleEventEffect(pi, c);
    }
    if (!canceled && asNegate) {
      st._negateResolved = true; // 消解实际生效
      p.noAtkUntil = this.state.turnNo + 2; // 本回合及下一己方回合不能攻击
      this.log(`⚠ ${p.name} 本回合及下一回合不能攻击（${TYPE_CN[c.type]}第一层代价）`);
    }
    UI.renderAll();
    return true;
  },

  /* 圣迹第三层 · 神怒 / 神佑：以事件/城池区的归属为条件
     神怒：当前常置牌不是我方（对方放置，或区为空）→ 己方将军 −1
     神佑：当前常置牌是我方 → 抽一张牌（不受「本回合已抽牌」限制） */
  sacredL3(pi, c, opp) {
    const st = this.state;
    const p = st.players[pi];
    const z = st.zone;
    const own = !!z && z.owner === pi;
    if (c.l3 === "神怒") {
      if (own) { this.log(`⚖ 圣迹【${c.name}】第三层·神怒：当前常置牌为己方，不触发`); return; }
      p.hp -= 1;
      this.hpEvent(pi, 1, "圣迹·神怒", p.hp);
      this.log(`⚖ 圣迹【${c.name}】第三层·神怒：当前常置牌非己方，己方将军 −1 → ${p.hp}`);
      if (p.hp <= 0) this.win(1 - pi);
    } else if (c.l3 === "神佑") {
      if (!own) { this.log(`⚖ 圣迹【${c.name}】第三层·神佑：当前常置牌非己方，不触发`); return; }
      if (!st.deck.length) { this.log(`⚖ 圣迹【${c.name}】第三层·神佑：卡组已空，无法抽牌`); return; }
      const card = st.deck.pop();
      p.hand.push(card);
      this.log(`⚖ 圣迹【${c.name}】第三层·神佑：当前常置牌为己方，抽一张 ${this.cardName(card)}`, p.isAI ? "ai" : "me", card);
    }
  },

  /* 灾厄牌五层效果：第二层灾殃 → 第三层王座更迭 → 第四层天罚
     第五层「神迹克制」是一次性反制牌（见 useEvent），不在此结算 */
  calamityLayers(pi, c) {
    const st = this.state;
    const p = st.players[pi], opp = st.players[1 - pi];
    const KM = { 武士: "samurai", 公卿: "noble", 大名: "daimyo" };
    // 第二层 · 灾殃：对方拥有 X 类型单位 → 对方将军受其攻击值总和伤害，己方受一半（反噬）
    if (c.card.x) {
      const X = KM[c.card.x] || c.card.x;
      const oppUnits = opp.field.filter(u => u.kind === X);
      if (oppUnits.length) {
        const total = oppUnits.reduce((s, u) => s + this.unitStats(u).atk, 0);
        if (Math.random() * 100 > this.effDodge(1 - pi)) {
          opp.hp -= total;
          this.hpEvent(1 - pi, total, "灾殃·" + X, opp.hp);
          this.log(`💀 灾厄【${c.card.name}】灾殃：对方 ${KIND_CN[X]} ${oppUnits.length} 张攻击总和 ${total} → 对方将军 −${total} → ${opp.hp}`);
          if (opp.hp <= 0) { this.win(pi); return; }
        } else this.log(`💀 灾厄【${c.card.name}】灾殃：对方将军躲避成功`);
        const back = Math.floor(total / 2);
        if (back > 0) {
          if (Math.random() * 100 > this.effDodge(pi)) {
            p.hp -= back;
            this.hpEvent(pi, back, "灾殃反噬", p.hp);
            this.log(`💀 灾殃反噬：己方将军 −${back} → ${p.hp}`);
            if (p.hp <= 0) { this.win(1 - pi); return; }
          } else this.log(`💀 灾殃反噬：己方将军躲避成功（${this.effDodge(pi)}%）`);
        }
      } else this.log(`灾殃：对方场上无 ${KIND_CN[X]} 类型单位，未触发`);
    }
    // 第三层 · 王座更迭（通用）：对方战场区武士/公卿/大名俱全 → 双方更换将军牌（生命不变）
    const oppAll = ["samurai", "noble", "daimyo"].every(k => opp.field.some(u => u.kind === k));
    if (oppAll) {
      this.swapShoguns();
    } else {
      this.log(`王座更迭条件不足：需对方战场区武士/公卿/大名俱全`);
    }
    // 第四层 · 天罚（按卡各异）
    const l4 = c.card.l4 || "";
    if (l4.includes("摧毁城池")) {
      const z = st.zone;
      if (z && z.type === "castle") {
        this.zHist(z, "被摧毁", "灾厄效果");
        this.log(`城池【${z.card.name}】被摧毁！`);
        st.discard.push(z);
        st.zone = null;
        this.castleL6OnBroken(z, "被灾厄摧毁"); // 第六层 · 城破：原持有方公卿全部下场
        this.refreshDaimyoHp(z.owner);
      }
    } else if (l4.includes("摧毁事件")) {
      const z = st.zone;
      if (z && z.type === "process") {
        this.zHist(z, "被摧毁", "灾厄效果");
        this.log(`事件【${z.card.name}】被摧毁！`);
        this.settleEvent(z); // 事件结束 → 第五层清算（X/Y）
        st.discard.push(z);
        st.zone = null;
      }
    } else if (l4.includes("骑具")) {
      let n = 0;
      for (const q of st.players) for (const u of q.field) if (u.eq.mount) {
        const mc = u.eq.mount;
        u.eq.mount = null;
        this.mountLeaves(st.players.indexOf(q), mc); // 八百里分麾下炙：骑具下场联动
        n++;
      }
      this.log(`摧毁双方骑具 ${n} 件`);
    } else if (l4.includes("兵刃") && l4.includes("装具")) {
      let n = 0;
      for (const q of st.players) for (const u of q.field) if (u.eq.blade || u.eq.armor) {
        if (u.eq.blade) { st.discard.push({ type: "blade", card: u.eq.blade }); u.eq.blade = null; }
        if (u.eq.armor) { st.discard.push({ type: "armor", card: u.eq.armor }); u.eq.armor = null; }
        n++;
      }
      this.log(`摧毁双方兵刃与装具 ${n} 件`);
    } else if (l4.includes("减半")) {
      // 臣民叛乱：对方三类型俱全 → 对方生命减半，己方受其损失值一半的直接伤害
      if (oppAll) {
        const loss = Math.floor(opp.hp / 2);
        opp.hp -= loss;
        this.hpEvent(1 - pi, loss, "天罚·臣民叛乱", opp.hp);
        this.log(`【${c.card.name}】臣民叛乱：对方将军生命减半（−${loss}）→ ${opp.hp}`);
        if (opp.hp <= 0) { this.win(pi); return; }
        const back = Math.floor(loss / 2);
        if (back > 0) {
          if (Math.random() * 100 > this.effDodge(pi)) {
            p.hp -= back;
            this.hpEvent(pi, back, "天罚·臣民叛乱", p.hp);
            this.log(`【${c.card.name}】己方将军 −${back}（对方损失值一半）→ ${p.hp}`);
            if (p.hp <= 0) { this.win(1 - pi); return; }
          } else this.log(`【${c.card.name}】己方将军躲避成功（${this.effDodge(pi)}%）`);
        }
      } else this.log(`臣民叛乱条件不足：需对方战场区武士/公卿/大名俱全`);
    } else if (l4.includes("更换天皇牌") && l4.includes("将军牌")) {
      // 永夜笼罩：双方三类型俱全 → 双方更换天皇牌与将军牌（生命不变）
      const both = st.players.every(q => ["samurai", "noble", "daimyo"].every(k => q.field.some(u => u.kind === k)));
      if (both) {
        this.swapShoguns();
        for (const q of st.players) this.swapEmperor(st.players.indexOf(q));
        this.log(`【${c.card.name}】永夜笼罩：双方更换天皇牌与将军牌`);
      } else this.log(`永夜笼罩条件不足：需双方武士/公卿/大名俱全`);
    }
  },

  /* 圣-02 伊邪那岐的祓除：消除对己方将军与天皇的负面影响
     （规则 §3.12：削弱、减半、负面常置效果等立即失效；已结算的伤害不回溯）。
     逐项还原：天命晦暗（武士攻击 −1）／天命诡谲（公卿防御 −1）／
     天命有失（大名命值 −1）／公卿城池加成减半（halveLoss）／天皇失效（神木的报应）。 */
  purgeNegativeEffects(pi, c) {
    const st = this.state;
    const p = st.players[pi];
    const done = [];
    // 天命·晦暗：己方武士攻击 −1
    for (const w of p.field.filter(u => u.kind === "samurai")) {
      if (w.baseAtk < w.card.atk) {
        w.baseAtk = Math.min(w.card.atk, w.baseAtk + 1);
        w.hist = w.hist || [];
        w.hist.push({ t: st.turnNo, src: "祓除", desc: "消除天命晦暗的攻击 −1" });
        done.push(`武士【${w.card.name}】攻击 +1`);
      }
    }
    // 天命·诡谲：己方公卿防御 −1
    for (const n of p.field.filter(u => u.kind === "noble")) {
      if (n.baseDef < n.card.dfs) {
        n.baseDef = Math.min(n.card.dfs, n.baseDef + 1);
        n.hist = n.hist || [];
        n.hist.push({ t: st.turnNo, src: "祓除", desc: "消除天命诡谲的防御 −1" });
        done.push(`公卿【${n.card.name}】防御 +1`);
      }
    }
    // 天命·有失：己方大名命值 −1（命值已耗尽而下场者无法还原）
    for (const d of p.field.filter(u => u.kind === "daimyo")) {
      if (d.hp < this.daimyoHpCap(d)) {
        d.hp += 1;
        d.hist = d.hist || [];
        d.hist.push({ t: st.turnNo, src: "祓除", desc: "消除天命有失的命值 −1" });
        done.push(`大名【${d.card.name}】命值 +1`);
      }
    }
    // 公卿城池加成「装备替死」造成的减半
    for (const u of p.field) {
      if (u.halveLoss) {
        u.baseAtk += u.halveLoss.atk;
        u.baseDef += u.halveLoss.def;
        u.hist = u.hist || [];
        u.hist.push({ t: st.turnNo, src: "祓除", desc: `还原减半：攻 +${u.halveLoss.atk}／防 +${u.halveLoss.def}` });
        done.push(`【${u.card.name}】还原减半`);
        u.halveLoss = null;
      }
    }
    // 天皇失效（神木的报应）
    if ((p.emperorDisabled || 0) > 0) {
      p.emperorDisabled = 0;
      done.push(`天皇【${p.emperor.name}】效果恢复`);
    }
    this.eHist(pi, "祓除·消负", done.length ? done.join("；") : "无负面效果可消除");
    this.log(`🌊 神迹【${c.card.name}】祓除：清除${p.name}的负面影响${done.length ? "（" + done.join("；") + "）" : "（当前无负面效果）"}`);
  },

  /* 圣-04 / 圣-07 共用：献祭一位武士（手牌或战场均可，规则 §3.12），
     从弃牌堆召唤一位指定类型（daimyo / noble）单位。
     祭品走 removeUnit：装备随弃、触发城池兴衰与天皇之怒。 */
  sacredSummonFromDiscard(pi, c, kind) {
    const st = this.state;
    const p = st.players[pi];
    const pool = st.discard.findIndex(d => d.type === kind);
    if (pool < 0) {
      this.log(`神迹【${c.card.name}】条件不足（弃牌堆无${KIND_CN[kind]}）`);
      return false;
    }
    const sacField = p.field.find(u => u.kind === "samurai");
    const sacHand = p.hand.findIndex(h => h.type === "samurai");
    if (!sacField && sacHand < 0) {
      this.log(`神迹【${c.card.name}】条件不足（手牌与战场均无武士）`);
      return false;
    }
    if (sacField) {
      this.removeUnit(sacField); // 祭品离场：装备随弃 + 城池兴衰 + 天皇之怒
    } else {
      const hc = p.hand.splice(sacHand, 1)[0];
      st.discard.push(hc);
      this.log(`⚡ 神迹【${c.card.name}】：献祭手牌武士【${hc.card.name}】`);
    }
    const d = st.discard.splice(pool, 1)[0];
    const u = this.newUnit(pi, kind, d.card, { noAttackTurn: true }); // 规则 §3.12：本回合不可攻击
    p.field.push(u);
    this.onUnitEntered(pi, u);
    this.log(`⚡ 神迹【${c.card.name}】：从弃牌堆复活${KIND_CN[kind]}【${u.card.name}】`);
    if (UI.unitEnter) UI.unitEnter(u.uid);
    return true;
  },

  simpleEventEffect(pi, c) {
    const st = this.state;
    const p = this.state.players[pi];
    if (c.type === "calamity") { this.calamityLayers(pi, c); return; }
    const fx = c.card.fx || c.card.l4 || "";
    if (fx.includes("恢复") || fx.includes("生命值的一半") || fx.includes("已失去生命")) {
      const heal = Math.floor(((p.maxHp || 100) - p.hp) / 2);
      p.hp = Math.min(p.maxHp || 100, p.hp + heal);
      this.log(`${p.name} 将军恢复 ${heal} 点生命 → ${p.hp}`);
    } else if (fx.includes("弃牌堆") && fx.includes("洗回")) {
      // 规则 §3.12：天皇/将军牌不随之回池（化身进入弃牌堆即永久移出牌池）
      const before = this.state.deck.length;
      while (this.state.discard.length) {
        const c = this.state.discard.pop();
        if (c.type === "emperor" || c.type === "shogun") continue;
        this.state.deck.push(c);
      }
      this.log(`弃牌堆全部洗回卡组（新增 ${this.state.deck.length - before} 张；天皇/将军牌不随之回池）`);
    } else if (fx.includes("负面") || fx.includes("负面影响")) {
      // 规则 §3.12：消除所有对己方将军与天皇的负面影响（已结算的伤害不回溯）
      this.purgeNegativeEffects(pi, c);
    } else if (fx.includes("献祭一位武士") && fx.includes("大名")) {
      // 圣-04 大国主神：献祭武士 → 弃牌堆召唤大名
      this.sacredSummonFromDiscard(pi, c, "daimyo");
    } else if (fx.includes("献祭一位武士") && fx.includes("公卿")) {
      // 圣-07 诹访明神：献祭武士 → 弃牌堆召唤公卿
      this.sacredSummonFromDiscard(pi, c, "noble");
    } else if (fx.includes("随机获得一张宝物牌")) {
      // 圣-03 须佐之男：随机宝物效果装备于己方战场区「一位单位」（规则 §3.12）
      if (CARDS.treasure.length && p.field.length) {
        const tr = CARDS.treasure[Math.floor(Math.random() * CARDS.treasure.length)];
        const apply = (target) => {
          if (!target) return;
          const bonus = target.kind === "samurai" ? tr.s1 : target.kind === "noble" ? tr.n1 : tr.d1;
          if (target.kind === "samurai") target.baseDef += bonus;
          else if (target.kind === "noble") target.baseAtk += bonus;
          else { target.baseAtk += bonus; target.baseDef += bonus; }
          target.hist = target.hist || [];
          target.hist.push({ t: st.turnNo, src: "神迹·宝物", desc: `随机宝物【${tr.name}】加成 +${bonus}` });
          this.log(`⚡ 神迹【${c.card.name}】：随机宝物【${tr.name}】装备于【${target.card.name}】（+${bonus}）`);
        };
        this.askPick(pi, {
          title: "⚡ 须佐之男 · 指定装备目标",
          body: `随机获得宝物【${tr.name}】的效果，请指定一位己方战场区单位装备（武士取第一层、公卿取第二层、大名取第三层）。`,
          cands: p.field.slice(),
          onPick: (uid) => apply(p.field.find(x => x.uid === uid)),
        });
      }
    } else if (fx.includes("大名直接攻击对方将军") || (c.card.name || "").includes("丰玉姬")) {
      // 圣-10：己方回合 → 大名直击对方将军；对方回合使用 → 下一己方回合生效
      if (st.cur === pi) {
        this.ryujinStrike(pi);
      } else {
        const d = p.field.find(u => u.kind === "daimyo");
        if (d) {
          p._ryujinPending = d.uid;
          this.log(`🐉 神迹【${c.card.name}】：${p.name} 的下一个己方回合，【${d.card.name}】将直击对方将军！`);
        } else this.log(`🐉 神迹【${c.card.name}】：己方无大名，无法生效`);
      }
    } else if (fx.includes("更换天皇牌或将军牌")) {
      // 圣-09 八咫乌引路：双方各选「更换天皇 / 更换将军 / 放弃」
      this.yatagarasuFlow(pi);
    } else if (fx.includes("更换天皇牌") || fx.includes("更换天皇")) {
      // 圣-06 天孙降临：双方各换天皇
      for (const q of st.players) this.swapEmperor(st.players.indexOf(q));
    } else if (fx.includes("失去效果")) {
      // 圣-08 神木报应：双方天皇 3 回合失去效果
      for (const q of st.players) {
        q.emperorDisabled = 3;
        this.eHist(st.players.indexOf(q), "神木报应", "天皇效果失效 3 回合");
      }
      this.log(`🌲 神迹【${c.card.name}】：双方天皇接下来 3 个回合失去效果`);
    } else {
      this.log(`（${c.card.name}效果未完整实现，见规则书）`);
    }
  },

  /* ---------- 战斗 ---------- */
  canAttack(p) {
    if (p.noAtkUntil >= this.state.turnNo) return false;
    if (p.turnsTaken < 3) return false; // 前两回合不能攻击
    return true;
  },

  // 可攻击的单位（所有单位召唤当回合即可攻击）
  attackers(pi) {
    return this.state.players[pi].field.slice();
  },

  // 对方可被选中的目标（最前层；空场则将军）
  frontLayer(pi) {
    const p = this.state.players[pi];
    const order = ["samurai", "noble", "daimyo"];
    for (const k of order) {
      const layer = p.field.filter(u => u.kind === k);
      if (layer.length) return layer;
    }
    return null; // 空场
  },

  canAttackShogun(pi) { return this.state.players[pi].field.length === 0; },

  /* 春秋义战：对方空场时，己方本回合可直击将军一次，且仅最高阶单位（大名＞公卿＞武士）可发动 */
  duelStrikeEligible(pi) {
    const p = this.state.players[pi];
    const opp = this.state.players[1 - pi];
    if (opp.field.length > 0) return { ok: false, why: "对方仍有单位，不能直接攻击将军" };
    if (p.duelStrikeUsed) return { ok: false, why: "本回合已直击过将军（春秋义战·每回合一次）" };
    // 最高阶：大名 > 公卿 > 武士
    const hasD = p.field.some(u => u.kind === "daimyo" && !u.attackedThisTurn);
    if (hasD) return { ok: true, kind: "daimyo" };
    const hasN = p.field.some(u => u.kind === "noble" && !u.attackedThisTurn);
    if (hasN) return { ok: true, kind: "noble" };
    const hasS = p.field.some(u => u.kind === "samurai" && !u.attackedThisTurn);
    if (hasS) return { ok: true, kind: "samurai" };
    return { ok: false, why: "己方无人可发动直击（均攻击过或无单位）" };
  },

  /* 城池第三层 · 概率倾斜：王城己方 +10% / 敌方 +5%；名城 己方 +5% / 敌方 −5%；大城 己方 +5% / 敌方 −5%（骑具/装具类） */
  probTilt(pi, kind) {
    const z = this.state.zone;
    if (!z || z.type !== "castle") return 0;
    const own = z.owner === pi;
    if (z.card.tier === "王城") return own ? 10 : 5;
    if (z.card.tier === "名城") return own ? 5 : -5;
    if (z.card.tier === "大城") { if (kind === "equip") return own ? 5 : -5; return 0; }
    return 0;
  },
  /* 装备类概率倾斜：仅「大城」作用于骑具/装具（王城/名城作用于装备之外的概率，规则 §11 第三层） */
  equipProbTilt(pi) {
    const z = this.state.zone;
    if (!z || z.type !== "castle" || z.card.tier !== "大城") return 0;
    return z.owner === pi ? 5 : -5;
  },
  /* 有效躲避率（含概率倾斜） */
  effDodge(pi) {
    const p = this.state.players[pi];
    return Math.max(0, Math.min(100, p.shogun.dodge + this.probTilt(pi, "general")));
  },

  /* 攻击结算：攻击方(pi) 单位 attackerUid → 目标 targetUid（对方单位或 'shogun'） */
  attack(pi, attackerUid, target, bypass, skipRank) {
    const st = this.state;
    const p = st.players[pi];
    const opp = st.players[1 - pi];
    if (!this.canAttack(p)) { this.log("本回合不能攻击！"); return false; }
    const u = p.field.find(x => x.uid === attackerUid);
    if (!u) { this.log("单位不存在"); return false; }
    // 本回合不可攻击（规则 §6.2：献祭召唤 / 恩典召唤 的大名与公卿当回合不可攻击）
    if (u.noAttackTurn === st.turnNo) { this.log(`【${u.card.name}】本回合不可攻击（召唤当回合不可出手）`); return false; }
    // 每类型每回合仅一位发动攻击（防御方单位可被对方数张卡攻击直到下场）
    if (p.typeAtk && p.typeAtk[u.kind]) { this.log(`本回合 ${KIND_CN[u.kind]} 已发动过攻击（每类型仅一位）`); return false; }
    // 每个单位本回合只能攻击一次（即使攻击被消解/替死等中断，该单位攻击次数也已耗尽）
    if (u.attackedThisTurn) { this.log(`【${u.card.name}】本回合已攻击过，攻击次数耗尽`); return false; }
    // 国士无双盾武士：不能攻击
    if (u.guoshiGuard) { this.log(`【${u.card.name}】国士无双盾武士不能攻击`); return false; }
    // 庇护体：攻击值为 0，无攻击能力
    if (u.purged) { this.log(`【${u.card.name}】是庇护体（攻击值 0），无法发动攻击`); return false; }
    // 尊位·御破：被攻击方拥有「攻击失效」尊位时，攻击发生时弹出选择（每局一次，耗当前生命 1/10）
    if (!skipRank) {
      const defP = st.players[1 - pi];
      const rankIsAtk = defP.shogun.rank && defP.shogun.rank.includes("攻击失效");
      if (rankIsAtk && !defP.rankUsed && defP.hp > 1) {
        const cost = Math.max(1, Math.floor(defP.hp / 10));
        const doBlock = () => {
          defP.hp -= cost;
          this.hpEvent(1 - pi, cost, "尊位代价", defP.hp, false);
          defP.rankUsed = true;
          // 被令失效的攻击仍计入攻击方该类型本回合的一次攻击（每类型每回合仅一位）
          p.typeAtk[u.kind] = true;
          u.attackedThisTurn = true; // 该单位攻击次数亦耗尽
          this.log(`👑 尊位·御破：${defP.name} 令【${p.name}】本次攻击失效（不产生伤害）！`);
          UI.renderAll();
          return true;
        };
        if (defP.isAI) {
          if (defP.hp > cost * 2 + 10) return doBlock(); // AI 生命宽裕时自动使用
        } else {
          st.prompting = true;
          UI.askRankBlock(u, cost, (use) => {
            st.prompting = false;
            if (use) doBlock();
            else this.attack(pi, attackerUid, target, bypass, true); // 放弃 → 重放结算
          });
          return "pending";
        }
      }
    }
    const s = this.unitStats(u);

    // 破阵：校验通过后才支付代价（避免无效扣血）
    if (bypass) {
      const bi = this.bypassInfo(pi);
      if (!bi || !bi.cost) { this.log("破阵当前不可用"); return false; }
      p.hp -= bi.cost;
      this.hpEvent(pi, bi.cost, "破阵", p.hp, false);
      this.zHist(st.zone, "破阵", `${p.name} 发动越级攻击`);
      p.bypassUsed = true;
      if (UI.floatDamage) UI.floatDamage("shogun:" + pi, bi.cost);
      this.log(`⚡ 破阵发动：${p.name} 将军 −${bi.cost} 生命，本回合可越级攻击`, p.isAI ? "ai" : "me");
    }

    // AI 主动消解（当玩家攻击且攻击将击破目标时）
    if (pi === 0 && target !== "shogun") {
      const ai = st.players[1];
      const negI = ai.hand.findIndex(c => c.type === "sacred" || c.type === "calamity");
      if (negI >= 0) {
        const t = opp.field.find(x => x.uid === target);
        if (t) {
          const ts = this.unitStats(t);
          const lethal = this.willBeKilled(t, ts, s.atk);
          if (lethal) {
            const used = ai.hand[negI];
            this.useEvent(1, negI, true); // 第一层消解生效 → 禁攻代价
            if (st._negateResolved) {
              this.log(`🛡 电脑使用【${TYPE_CN[used.type]}】${used.card.name} 消解了【${u.card.name}】的攻击！`);
              this.afterAttack(p, u, t, false); // 攻击被消解 → 未结算完成，不发战意/成长/我攻
              // 第一层消解抵消后：撤销攻击方该类型禁令，该类型重新获得一次攻击
              delete p.typeAtk[u.kind];
              UI.renderAll();
              return true;
            }
            // 消解被对方反制 → 灾厄「一切效果作废」，该次攻击既未被消解也不应消失：
            // 继续按正常攻击结算（禁攻代价未支付，不设 noAtkUntil）。
            this.log(`🛡 电脑的【${TYPE_CN[used.type]}】${used.card.name} 消解被反制，【${u.card.name}】的攻击照常结算`);
          }
        }
      }
    }

    if (UI.shakeUnit) UI.shakeUnit(u.uid);
    if (target === "shogun") {
      if (!bypass) {
        // 春秋义战：对方空场时，本回合仅最高阶单位可直击一次（判断攻击方 pi）
        const duel = this.duelStrikeEligible(pi);
        if (!duel.ok) { this.log(duel.why); return false; }
        if (duel.kind === "daimyo" && u.kind !== "daimyo") { this.log(`春秋义战：己方有大名，仅大名可直击将军（${KIND_CN[u.kind]}不可）`); return false; }
        if (duel.kind === "noble" && u.kind !== "noble") { this.log(`春秋义战：己方无大名有公卿，仅公卿可直击将军（${KIND_CN[u.kind]}不可）`); return false; }
        if (duel.kind === "samurai" && u.kind !== "samurai") { this.log(`春秋义战：仅武士可直击将军`); return false; }
        p.duelStrikeUsed = true; // 占用本回合唯一一次直击
        if (UI.renderAll) UI.renderAll();
      } else {
        // 破阵越级攻击将军：不受春秋义战限制，但消耗该单位攻击次数
        if (!this.canAttackShogun(1 - pi)) { this.log("对方仍有单位，不能直接攻击将军（可用破阵越级）"); return false; }
      }
      const d = Math.random() * 100;
      // 将军·义战之恩（通用被动，每回合一次）：对方成功激活春秋义战（非破阵直击），己方将军生命 −1
      if (!bypass) {
        const defP2 = st.players[1 - pi];
        if (!defP2.gracePenaltyUsed) {
          defP2.gracePenaltyUsed = true; // 每回合生效一次
          defP2.hp -= 1;
          this.hpEvent(1 - pi, 1, "义战之恩", defP2.hp);
          this.log(`🛡 义战之恩：对方激活春秋义战，${defP2.name} 将军 −1 → HP ${defP2.hp}`, defP2.isAI ? "ai" : "me");
          if (defP2.hp <= 0) { this.win(pi); return true; }
        }
      }
      if (d <= this.effDodge(1 - pi)) { this.log(`【${u.card.name}】直击将军：对方躲避成功（${this.effDodge(1 - pi)}%）`); }
      else {
        opp.hp -= s.atk;
        this.hpEvent(1 - pi, s.atk, "【" + u.card.name + "】直击", opp.hp);
        if (UI.floatDamage) UI.floatDamage("shogun:" + (1 - pi), s.atk);
        this.log(`【${u.card.name}】（攻${s.atk}）直击将军！对方 HP ${opp.hp > 0 ? opp.hp : 0}`);
        if (opp.hp <= 0) { this.win(pi); return true; }
      }
      this.afterAttack(p, u, "shogun");
      return true;
    }

    // 单位目标：默认只能选最前层（破阵越级可攻击任意层）
    if (!bypass) {
      const layer = this.frontLayer(1 - pi);
      if (!layer || !layer.some(x => x.uid === target)) { this.log("只能攻击最前层的单位！（可用破阵越级）"); return false; }
    }
    if (!opp.field.some(x => x.uid === target)) { this.log("目标不存在"); return false; }
    const t = opp.field.find(x => x.uid === target);
    if (UI.defendFlash) UI.defendFlash(t.uid);
    // 事件第三层 · 御守：被攻击方持有事件时 30% 概率攻击无效（攻击单位攻击值 +1）
    const zzGuard = st.zone;
    if (zzGuard && zzGuard.type === "process" && zzGuard.owner === 1 - pi && Math.random() * 100 < 30) {
      u.extraAtk = (u.extraAtk || 0) + 1;
      u.hist = u.hist || [];
      u.hist.push({ t: st.turnNo, src: "御守", desc: "攻击被事件御守清零（30%），攻击 +1" });
      this.zHist(zzGuard, "第三层·战火磨砺·御守", `30% 判定成功：【${u.card.name}】的攻击无效，其攻击 +1`, zzGuard.owner);
      this.log(`🛡 事件【${zzGuard.card.name}】战火磨砺·御守：30% 判定成功，【${u.card.name}】的攻击无效！其攻击 +1`);
      this.afterAttack(p, u, t, false); // 攻击无效 → 未结算完成，不发战意/成长/我攻
      UI.renderAll();
      return true;
    }
    // 骑具躲避
    const td = this.unitDodge(t);
    if (td > 0 && Math.random() * 100 <= td) {
      this.log(`【${t.card.name}】骑具躲避成功（${td}%）！攻击无效`);
      this.mountDodgeReward(1 - pi); // 王城：己方骑具躲避成功 → 敌方武士攻击 +1
      this.growEquip(t, "armor"); // 装具成长：完成防御结算（含躲避成功）
      this.afterAttack(p, u, t, false); // 攻击被躲避 → 未结算完成，不发战意/成长/我攻
      return true;
    }
    const ts = this.unitStats(t);
    // 必定命中：被庇护单位按攻击值全额扣防御；武士/公卿先按减免值算受伤数值；大名按「护盾」结算
    const dmg = t.purged ? s.atk
      : t.kind === "daimyo" ? s.atk
        : this.hitDamage(s.atk, ts, t.kind);
    if (t.kind === "daimyo") {
      // 器魂之灭：大名命值低于 5 且装备兵刃 → 兵刃自动下场，为大名回复 5 点命值（受击结算前判定）
      if (t.hp < 5 && t.eq.blade) {
        const bc = t.eq.blade;
        st.discard.push({ type: "blade", card: bc });
        t.eq.blade = null;
        t.hp = Math.min(this.daimyoHpCap(t), t.hp + 5);
        t.hist = t.hist || [];
        t.hist.push({ t: st.turnNo, src: "器魂之灭", desc: `兵刃【${bc.name}】自动下场，大名命值 +5 → ${t.hp}` });
        this.log(`🗡 器魂之灭：兵刃【${bc.name}】自动下场，大名【${t.card.name}】命值 +5 → ${t.hp}`);
        if (UI.flashUnit) UI.flashUnit(1 - pi, t.uid);
      }
      const ts2 = this.unitStats(t); // 器魂之灭可能已弃置装备，重算
      const before = t.hp;
      const r = this.resolveDaimyoHit(t, ts2, s.atk);
      if (!r.penetrated) {
        t.hist = t.hist || [];
        t.hist.push({ t: st.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 削减防御（防 ${ts2.def}→${r.defAfter}），命值不变` });
        this.log(`【${u.card.name}】（攻${s.atk}）命中大名【${t.card.name}】：防御 ${ts2.def}→${r.defAfter}，命值 ${t.hp}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, s.atk);
        this.growEquip(t, "armor"); // 装具成长：完成防御结算
      } else if (t.hp > 0) {
        t.hist = t.hist || [];
        t.hist.push({ t: st.turnNo, src: "穿透", desc: `被【${u.card.name}】攻${s.atk} 穿透防御（防${ts2.def}），命值 ${before}→${t.hp}，防御回满` });
        this.log(`💥【${u.card.name}】（攻${s.atk}）穿透大名【${t.card.name}】防御：命值 ${before}→${t.hp}，防御回满`);
        if (UI.floatDamage) UI.floatDamage(t.uid, r.overflow);
      } else {
        const overflow = -t.hp; // 命值扣成负数 → 该差额溢出给将军
        const diePath = () => {
          let ov = overflow;
          // 装具·名器：大名装备装具时，被击破有 30% 几率令将军免受此次（溢出）伤害
          if (t.eq.armor && ov > 0 && Math.random() * 100 < 30) {
            const ac = t.eq.armor;
            t.hist = t.hist || [];
            t.hist.push({ t: this.state.turnNo, src: "名器", desc: `装具【${ac.name}】名器发动：将军免受溢出伤害 ${ov}` });
            this.log(`✨ 名器【${ac.name}】：30% 判定成功，将军免受此次溢出伤害 ${ov} 点！`);
            ov = 0;
          }
          t.alive = false; t.defeated = true;
          t.hist = t.hist || [];
          t.hist.push({ t: this.state.turnNo, src: "击破", desc: `被【${u.card.name}】攻${s.atk} 穿透并击破（命值 ${before}→0，溢出 ${ov}）` });
          this.log(`【${u.card.name}】（攻${s.atk}）击破大名【${t.card.name}】（命值 ${before}→0）！`);
          this.overflowToShogun(1 - pi, ov);
          this.removeUnit(t);
        };
        const cs = this.castleSacrificeFlow(1 - pi, t, diePath); // 公卿城池加成替死（弹窗/自动）
        if (cs === "pending") return true;
        if (cs === true) { this.afterAttack(p, u, t); UI.renderAll(); return true; }
        diePath();
      }
    } else if (t.kind === "samurai") {
      const remain = ts.def - dmg;
      if (remain <= 0) {
        const diePath = () => {
          const overflow = t.guoshiGuard ? 0 : Math.max(0, dmg - ts.def); // 国士无双盾：不给将军溢出伤害
          t.hist = t.hist || [];
          t.hist.push({ t: this.state.turnNo, src: "击破", desc: `被【${u.card.name}】攻${s.atk} 击破（${t.purged ? "庇护体·全额" : `攻${ts.atk} 减伤后`}伤${dmg}，防${ts.def}，溢出 ${overflow}）` });
          this.log(`【${u.card.name}】（攻${s.atk}${t.purged ? "，庇护体全额" : `，被攻${ts.atk}减至`} ${dmg}）击破武士【${t.card.name}】（防${ts.def}）！`);
          this.overflowToShogun(1 - pi, overflow);
          this.removeUnit(t);
        };
        const cs = this.castleSacrificeFlow(1 - pi, t, diePath); // 公卿城池加成替死（弹窗/自动）
        if (cs === "pending") return true;
        if (cs === true) { this.afterAttack(p, u, t); UI.renderAll(); return true; }
        const dilu = this.diluSacrifice(t, diePath); // 的卢之魂替死（弹窗/自动；放弃则继续击破）
        if (dilu === "pending") return true;
        if (dilu === true) { this.afterAttack(p, u, t); UI.renderAll(); return true; }
        if (this.canPurge(1 - pi, "samurai")) {
          const cost = st.players[1 - pi].emperor.ps;
          this.askPurge(t, cost, (use) => {
            if (use) this.doPurge(1 - pi, t); else diePath();
            this.afterAttack(p, u, t);
            UI.renderAll();
          });
          return true;
        }
        diePath();
      } else if (t.purged) {
        // 御·庇护形态：防御值直接减扣受到的攻击数值
        t.purgeLoss = (t.purgeLoss || 0) + dmg;
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 命中（庇护体·全额），防 ${ts.def}→${remain}` });
        this.log(`【${u.card.name}】（攻${s.atk}）命中庇护武士【${t.card.name}】防 ${ts.def}→${remain}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, dmg);
      } else {
        const auraDef = ts.def - ts.rawDef;
        t.baseDef = remain - auraDef - (t.extraDef || 0);
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 命中（攻${ts.atk} 减伤 ${dmg}），防 ${ts.def}→${remain}` });
        this.log(`【${u.card.name}】（攻${s.atk}，被攻${ts.atk}减至 ${dmg}）命中武士【${t.card.name}】防 ${ts.def}→${remain}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, dmg);
        // 坚守：被攻击未击破 → 防+1（增幅归零后三层特效失效）
        if (!t.purged && t.fx.includes("坚守")) {
          t.baseDef += 1;
          t.guardBonus = (t.guardBonus || 0) + 1; // 记录坚守累积，供增幅归零时回退
          t.hist.push({ t: this.state.turnNo, src: "坚守", desc: "被攻击未击破，防御 +1" });
          this.log(`【${t.card.name}】坚守 +1 防御`);
        }
        this.growEquip(t, "armor"); // 装具成长：完成防御结算
      }
    } else if (t.kind === "noble") {
      // 御·庇护形态：攻击值恒为 0，改以防御值承伤（防御归零即下场）
      const remain = t.purged ? ts.def - dmg : ts.atk - dmg;
      if (remain <= 0) {
        const diePath = () => {
          const overflow = t.purged ? Math.max(0, dmg - ts.def) : Math.max(0, dmg - ts.atk);
          t.hist = t.hist || [];
          t.hist.push({ t: this.state.turnNo, src: "击破", desc: t.purged
            ? `被【${u.card.name}】攻${s.atk} 击破（庇护体·全额伤${dmg}，防${ts.def}，溢出 ${overflow}）`
            : `被【${u.card.name}】攻${s.atk} 击破（防${ts.def} 减伤后伤${dmg}，攻${ts.atk}，溢出 ${overflow}）` });
          this.log(t.purged
            ? `【${u.card.name}】（攻${s.atk}，庇护体全额 ${dmg}）击破庇护公卿【${t.card.name}】（防${ts.def}）！`
            : `【${u.card.name}】（攻${s.atk}，被防${ts.def}减至 ${dmg}）击破公卿【${t.card.name}】（攻${ts.atk}）！`);
          this.overflowToShogun(1 - pi, overflow);
          this.removeUnit(t);
        };
        const cs = this.castleSacrificeFlow(1 - pi, t, diePath); // 公卿城池加成替死（弹窗/自动）
        if (cs === "pending") return true;
        if (cs === true) { this.afterAttack(p, u, t); UI.renderAll(); return true; }
        const dilu = this.diluSacrifice(t, diePath); // 的卢之魂替死（弹窗/自动；放弃则继续击破）
        if (dilu === "pending") return true;
        if (dilu === true) { this.afterAttack(p, u, t); UI.renderAll(); return true; }
        if (this.canPurge(1 - pi, "noble")) {
          const cost = st.players[1 - pi].emperor.pn;
          this.askPurge(t, cost, (use) => {
            if (use) this.doPurge(1 - pi, t); else diePath();
            this.afterAttack(p, u, t);
            UI.renderAll();
          });
          return true;
        }
        diePath();
      } else if (t.purged) {
        // 御·庇护形态：防御值直接减扣受到的攻击数值
        t.purgeLoss = (t.purgeLoss || 0) + dmg;
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 命中（庇护体·全额），防 ${ts.def}→${remain}` });
        this.log(`【${u.card.name}】（攻${s.atk}）命中庇护公卿【${t.card.name}】防 ${ts.def}→${remain}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, dmg);
      } else {
        const auraAtk = ts.atk - ts.rawAtk;
        t.baseAtk = remain - auraAtk - (t.extraAtk || 0);
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 命中（防${ts.def} 减伤 ${dmg}），攻 ${ts.atk}→${remain}` });
        this.log(`【${u.card.name}】（攻${s.atk}，被防${ts.def}减至 ${dmg}）命中公卿【${t.card.name}】攻 ${ts.atk}→${remain}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, dmg);
        this.growEquip(t, "armor"); // 装具成长：完成防御结算
      }
    }
    this.afterAttack(p, u, t);
    UI.renderAll();
    return true;
  },

  /* 事件「暗杀」：条件符合即可用（右上角按钮手动发动） */
  assassinInfo(pi) {
    const st = this.state;
    const p = st.players[pi];
    const z = st.zone;
    if (!z || z.type !== "process" || z.owner !== pi || z.card.l4 !== "暗杀") return null;
    if (p.assassinUsed) return { blocked: "本回合已使用过暗杀" };
    const eqSam = p.field.some(u => u.kind === "samurai" && (u.eq.blade || u.eq.armor || u.eq.mount));
    if (!eqSam) return { blocked: "需己方有装备了装备牌的武士" };
    if (p.hp <= z.card.cost) return { blocked: "将军生命不足" };
    return { cost: z.card.cost };
  },
  useAssassin(pi) {
    const st = this.state;
    const p = st.players[pi];
    const info = this.assassinInfo(pi);
    if (!info || !info.cost) { this.log("暗杀当前不可用"); return false; }
    const opp = st.players[1 - pi];
    p.hp -= info.cost;
    this.hpEvent(pi, info.cost, "暗杀代价", p.hp, false);
    p.assassinUsed = true;
    this.zHist(st.zone, "暗杀", `${p.name} 发动暗杀`);
    if (Math.random() * 100 <= this.effDodge(1 - pi)) {
      this.log(`🗡 暗杀：${p.name} 付 ${info.cost} 生命，对方将军躲避成功（${this.effDodge(1 - pi)}%）`);
    } else {
      opp.hp -= 5;
      this.hpEvent(1 - pi, 5, "暗杀", opp.hp);
      this.log(`🗡 暗杀：${p.name} 付 ${info.cost} 生命，对方将军 −5 → ${opp.hp}`);
      if (opp.hp <= 0) { this.win(pi); return true; }
    }
    UI.renderAll();
    return true;
  },

  /* 将军尊位（每局一次，耗当前生命 1/10）：攻击失效 / 事件失效 / 城池易主 */
  rankInfo(pi) {
    const p = this.state.players[pi];
    if (p.rankUsed) return null;
    const st = this.state;
    const cost = Math.max(1, Math.floor(p.hp / 10));
    const options = [];
    options.push({ kind: "atk", label: "令对方攻击失效（被动：对方攻击时自动弹出询问，耗当前生命 1/10）", ok: false });
    if (st.zone && st.zone.type === "process") options.push({ kind: "event", label: "令场上事件牌失效进入弃牌堆", ok: true });
    else options.push({ kind: "event", label: "令事件牌失效（需场上有事件牌）", ok: false });
    if (st.zone && st.zone.type === "castle" && st.zone.owner !== pi) options.push({ kind: "castle", label: "令对方城池归属转为己方", ok: true });
    else options.push({ kind: "castle", label: "城池易主（需对方场上城池）", ok: false });
    return { cost, options };
  },
  useRank(pi, kind) {
    const st = this.state;
    const p = st.players[pi];
    const info = this.rankInfo(pi);
    if (!info) { this.log("尊位本局已使用"); return false; }
    const opt = info.options.find(o => o.kind === kind);
    if (!opt || !opt.ok) { this.log("尊位该选项当前不可用"); return false; }
    const cost = info.cost;
    p.hp -= cost;
    this.hpEvent(pi, cost, "尊位代价", p.hp, false);
    p.rankUsed = true;
    if (p.hp <= 0) { this.win(1 - pi); return true; } // 规则 §12.1：生命归零立即判负
    if (kind === "atk") {
      p.rankBlockAttack = true;
      this.log(`👑 尊位·御破：${p.name} 耗 ${cost} 生命，对方下一次攻击将被令失效！`);
    } else if (kind === "event") {
      const z = st.zone;
      this.zHist(z, "尊位·断流", "令事件牌失效进入弃牌堆");
      st.discard.push(z);
      st.zone = null;
      this.log(`👑 尊位·断流：${p.name} 耗 ${cost} 生命，事件牌【${z.card.name}】失效进入弃牌堆！`);
    } else if (kind === "castle") {
      const prevOwner = st.zone.owner;
      st.zone.owner = pi;
      this.zHist(st.zone, "专属权转移·尊位易帜", `专属权：${st.players[prevOwner].name} → ${p.name}`, pi);
      this.log(`👑 尊位·易帜：${p.name} 耗 ${cost} 生命，城池【${st.zone.card.name}】归属转为己方！`);
      this.castleL6OnOwnerChange(st.zone, prevOwner, pi); // 第六层 · 易主：原主武士移交新主
    }
    UI.renderAll();
    return true;
  },

  /* 事件「破阵」：每回合一次越级攻击 */
  bypassInfo(pi) {
    const st = this.state;
    const p = st.players[pi];
    const z = st.zone;
    if (!z || z.type !== "process" || z.owner !== pi || z.card.l4 !== "破阵") return null;
    if (!p.field.some(u => u.kind === "daimyo")) return { blocked: "需己方有大名在场" };
    if (p.bypassUsed) return { blocked: "本回合已使用过破阵" };
    if (p.hp <= z.card.cost) return { blocked: "将军生命不足" };
    return { cost: z.card.cost };
  },

  /* 御·庇护询问：玩家弹窗、AI 自动 */
  askPurge(t, cost, cb) {
    if (t.pi === 0) {
      UI.askPurge(t, cost, cb);
    } else {
      // AI：生命宽裕时自动庇护
      cb(this.state.players[1].hp > cost + 15);
    }
  },

  /* ---------- 通用玩家抉择（规则书里「选一单位 / 指定一位」的地方） ----------
     askPick(pi, job) 返回 "pending"（已排队，等玩家点选）或 "done"（已按默认值/自动策略结算）。
     job = { title, body, cands: [unit], modes?: [{ key, label }], aiPick?, onPick(uid, mode) }
     - cands 为空 → 什么都不做，返回 "done"
     - AI，或候选只有一项且无多模式 → 直接走 aiPick（缺省取首位 / 首个模式）
     - 否则入队，由 UI.askPickUnit 弹出；队列串行，避免一次攻击的多个触发互相覆盖弹窗 */
  askPick(pi, job) {
    const st = this.state;
    const cands = (job.cands || []).filter(Boolean);
    if (!cands.length) return "done";
    const modes = job.modes || null;
    const p = st.players[pi];
    const needPrompt = p && !p.isAI && (cands.length > 1 || (modes && modes.length > 1));
    if (!needPrompt) {
      const pick = job.aiPick ? job.aiPick(cands, modes) : { uid: cands[0].uid, mode: modes ? modes[0].key : null };
      job.onPick(pick.uid, pick.mode);
      return "done";
    }
    this._choiceQ = this._choiceQ || [];
    this._choiceQ.push({ ...job, cands, modes });
    this.pumpChoice();
    return "pending";
  },

  /* 队列调度：一次只弹一个；玩家选完后继续下一个 */
  pumpChoice() {
    const st = this.state;
    const q = this._choiceQ || (this._choiceQ = []);
    if (this._choiceBusy || !q.length) return;
    if (st.winner != null) { q.length = 0; if (st) st.prompting = false; return; }
    this._choiceBusy = true;
    const job = q[0];
    st.prompting = true;
    UI.askPickUnit(job, (uid, mode) => {
      q.shift();
      this._choiceBusy = false;
      job.onPick(uid, mode);
      if (q.length) this.pumpChoice();
      else if (this.state) this.state.prompting = false;
      UI.renderAll();
    });
  },

  clearChoices() {
    if (this._choiceQ) this._choiceQ.length = 0;
    this._choiceBusy = false;
    if (this.state) this.state.prompting = false;
  },

  /* 串行执行若干步，每步形如 (next) => {...}；末尾统一重绘。
     用于「先扣数值、再弹选择」这类必须按序完成的结算。 */
  runSeq(steps, done) {
    const at = (i) => {
      if (i >= steps.length) { if (done) done(); UI.renderAll(); return; }
      steps[i](() => at(i + 1));
    };
    at(0);
  },

  overflowToShogun(pi, overflow) {
    if (overflow <= 0) return;
    const opp = this.state.players[pi];
    if (Math.random() * 100 <= this.effDodge(pi)) {
      this.log(`溢出 ${overflow} 点：对方将军躲避成功（${this.effDodge(pi)}%）！`);
    } else {
      opp.hp -= overflow;
      this.hpEvent(pi, overflow, "溢出伤害", opp.hp);
      if (UI.floatDamage) UI.floatDamage("shogun:" + pi, overflow);
      this.log(`溢出 ${overflow} 点 → 对方将军 HP ${opp.hp > 0 ? opp.hp : 0}`);
      if (opp.hp <= 0) this.win(1 - pi);
    }
  },

  /* 装具配套（X=1-3，Y=1-3）：按目标已有兵刃/骑具结算 */
  armorSynergy(pi, u) {
    const p = this.state.players[pi];
    const c = u.eq.armor;
    if (!c || !c.synX) return;
    // 防重复：同一单位配套只结算一次（首次满足条件的组合定格）
    u.hist = u.hist || [];
    if (u.hist.some(h => h.src === "装具配套")) return;
    const X = c.synX, Y = c.synY;
    const hasBlade = !!u.eq.blade, hasMount = !!u.eq.mount;
    const note = [];
    if (hasBlade && hasMount) {
      // 双装备：50% 防御+X 生命−X；50% 防御−Y 生命+Y
      if (Math.random() < 0.5) {
        u.baseDef += X;
        p.hp -= X;
        this.hpEvent(pi, X, "装具配套", p.hp);
        note.push(`兵刃+骑具：防御 +${X}，将军生命 −${X}`);
        if (p.hp <= 0) { this.win(1 - pi); return; } // 规则 §12.1：生命归零立即判负
      } else {
        u.baseDef = Math.max(0, u.baseDef - Y);
        p.hp = Math.min(p.maxHp || 100, p.hp + Y);
        this.hpEvent(pi, -Y, "装具配套", p.hp);
        note.push(`兵刃+骑具：防御 −${Y}，将军生命 +${Y}`);
      }
    } else if (hasBlade) {
      u.baseDef += X;
      note.push(`兵刃：防御 +${X}`);
    } else if (hasMount) {
      u.baseDef = Math.max(0, u.baseDef - Y);
      const heal = Math.ceil((p.maxHp || 100) / 10);
      p.hp = Math.min(p.maxHp || 100, p.hp + heal);
      this.hpEvent(pi, -heal, "装具配套", p.hp);
      note.push(`骑具：防御 −${Y}，将军生命 +${heal}（总生命 1/10）`);
    }
    if (note.length) {
      u.hist = u.hist || [];
      u.hist.push({ t: this.state.turnNo, src: "装具配套", desc: note.join("；") });
      this.log(`🛡 装具配套【${c.name}】：${note.join("；")}`);
    }
  },

  /* 的卢之魂 · 效果 2：装备时若己方生命低于对方 → 将军生命 +1/10，该骑具回合结束下场 */
  diluSoul(pi, u) {
    const st = this.state;
    const p = st.players[pi], opp = st.players[1 - pi];
    const m = u.eq.mount;
    if (!m || m.soul !== 2) return;
    if (p.hp >= opp.hp) return; // 条件不满足
    const heal = Math.ceil((p.maxHp || 100) / 10);
    p.hp = Math.min(p.maxHp || 100, p.hp + heal);
    this.hpEvent(pi, -heal, "的卢之魂", p.hp);
    u.hist = u.hist || [];
    u.hist.push({ t: st.turnNo, src: "的卢之魂", desc: `己方生命低于对方：将军生命 +${heal}（1/10），骑具回合结束下场` });
    this.log(`🐎 的卢之魂【${m.name}】：己方生命低于对方，将军生命 +${heal}（总生命 1/10），该骑具回合结束下场`);
    this.state._diluEnd = this.state._diluEnd || [];
    this.state._diluEnd.push(u.uid);
  },

  /* 八百里分麾下炙（骑具下场联动）：骑具被弃置（下场）时按双方将军生命差结算
     己方生命低于对方 → 生命值 +（差值÷2）
     己方生命高于对方 → 舍弃一张手牌；无手牌则生命值 −（差值÷2） */
  /* 骑具牌 · 八百里分麾下炙（通用）：该骑具牌下场时，为己方场上所有武士攻击 +1（永久） */
  mountLeaves(pi, mountCard) {
    const st = this.state;
    const p = st.players[pi];
    const nm = (mountCard && mountCard.name) || "骑具";
    const ws = p.field.filter(u => u.kind === "samurai");
    if (!ws.length) {
      this.log(`🐎 八百里分麾下炙【${nm}】下场：己方场上无武士，效果不结算`, p.isAI ? "ai" : "me");
      UI.renderAll();
      return;
    }
    for (const w of ws) {
      w.baseAtk += 1;
      w.hist = w.hist || [];
      w.hist.push({ t: st.turnNo, src: "八百里分麾下炙", desc: `骑具【${nm}】下场，攻击 +1` });
    }
    this.eHist(pi, "八百里分麾下炙", `骑具【${nm}】下场：己方武士 ${ws.length} 位攻击 +1`);
    this.log(`🐎 八百里分麾下炙【${nm}】下场：己方武士 ${ws.length} 位攻击 +1`, p.isAI ? "ai" : "me");
    UI.renderAll();
  },

  /* 装具·熔炉（主动，每回合一次）：己方生命低于对方时，可将一件装具下场，回复差值的一半 */
  forgeInfo(pi) {
    const p = this.state.players[pi];
    const opp = this.state.players[1 - pi];
    if (p.forgeUsed) return { blocked: "本回合已使用过熔炉" };
    if (p.hp >= opp.hp) return { blocked: "需己方生命低于对方" };
    const armors = [];
    for (const u of p.field) if (u.eq && u.eq.armor) armors.push(u);
    if (!armors.length) return { blocked: "己方场上无装具可下场" };
    const diff = opp.hp - p.hp;
    return { ok: true, armors, diff, heal: Math.floor(diff / 2) };
  },
  useForge(pi, uid) {
    const st = this.state;
    const p = st.players[pi];
    const info = this.forgeInfo(pi);
    if (!info || !info.ok) { this.log("熔炉当前不可用"); return false; }
    const holder = info.armors.find(u => u.uid === uid) || info.armors[0];
    const ac = holder.eq.armor;
    st.discard.push({ type: "armor", card: ac });
    holder.eq.armor = null;
    holder.hist = holder.hist || [];
    holder.hist.push({ t: st.turnNo, src: "熔炉", desc: `装具【${ac.name}】下场，将军回复差值一半 ${info.heal}` });
    p.hp = Math.min(p.maxHp || 100, p.hp + info.heal);
    this.hpEvent(pi, -info.heal, "装具·熔炉", p.hp);
    p.forgeUsed = true;
    this.eHist(pi, "装具·熔炉", `弃【${ac.name}】，回复 ${info.heal}`);
    this.log(`🔥 装具·熔炉：${p.name} 生命低于对方，弃置装具【${ac.name}】，回复差值一半 ${info.heal} → HP ${p.hp}`, p.isAI ? "ai" : "me");
    UI.renderAll();
    return true;
  },

  /* 的卢之魂 · 效果 3：己方生命低于对方时，骑具可为装备它的单位替死一次（玩家弹窗选择，AI 自动） */
  diluSacrifice(t, diePath) {
    const st = this.state;
    const m = t.eq.mount;
    if (!m || m.soul !== 3) return false;
    const p = st.players[t.pi], opp = st.players[1 - t.pi];
    if (p.hp >= opp.hp) return false; // 条件不满足
    const doIt = () => {
      st.discard.push({ type: "mount", card: m });
      t.eq.mount = null;
      t.hist = t.hist || [];
      t.hist.push({ t: st.turnNo, src: "的卢之魂", desc: `骑具【${m.name}】替死一次（己方生命低于对方）` });
      this.log(`🐎 的卢之魂【${m.name}】：己方生命低于对方，骑具替【${t.card.name}】死一次，单位存活`);
      this.mountLeaves(t.pi, m); // 八百里分麾下炙：骑具下场联动
      return true;
    };
    if (t.pi === 0) {
      st.prompting = true;
      UI.askDiluSacrifice(t, m, (use) => {
        st.prompting = false;
        if (use) { doIt(); UI.renderAll(); }
        else if (diePath) { diePath(); UI.renderAll(); }
        else UI.renderAll();
      });
      return "pending";
    }
    return doIt();
  },

  /* 公卿城池加成（castle 六选一）：条件检查（不执行）
     ① 己方王城·替大名：弃置该公卿，大名存活
     ② 己方名城·替公卿：弃置己方一位武士，该公卿存活
     ③ 己方大城·替武士：弃置该武士一件装备（兵刃/骑具），武士存活
     ④ 敌方王城·装备替死：弃置该大名/公卿一件装备，存活但攻防减半
     ⑤ 敌方名城·装备替死：弃置该武士一件装备（兵刃/骑具），存活但数值减半
     ⑥ 敌方大城·将军替死：扣己方将军 10 点生命（不足则不可），该公卿存活 */
  castleSacrificeInfo(defPi, t) {
    const st = this.state;
    const defP = st.players[defPi];
    const z = st.zone;
    if (!z || z.type !== "castle") return null;
    const own = z.owner === defPi;
    const tier = z.card.tier;
    const noble = defP.field.find(x => x.kind === "noble" && x.card.castle);
    if (!noble) return null;
    const c = noble.card.castle;
    const KIND_CN2 = { samurai: "武士", noble: "公卿", daimyo: "大名" };
    if (own && tier === "王城" && c.includes("①") && t.kind === "daimyo") {
      return { ok: true, kind: 1, noble, desc: `弃置公卿【${noble.card.name}】，大名【${t.card.name}】存活` };
    }
    if (own && tier === "名城" && c.includes("②") && t.kind === "noble") {
      const ws = defP.field.filter(x => x.kind === "samurai");
      if (!ws.length) return null;
      const w = ws[0];
      return { ok: true, kind: 2, noble, w, ws, desc: `弃置武士【${w.card.name}】，公卿【${t.card.name}】存活` };
    }
    if (own && tier === "大城" && c.includes("③") && t.kind === "samurai") {
      const slots = ["blade", "mount"].filter(s => t.eq[s]);
      if (!slots.length) return null;
      return { ok: true, kind: 3, noble, slots, desc: `弃置${t.eq.blade ? "兵刃" : "骑具"}，武士【${t.card.name}】存活` };
    }
    if (!own && tier === "王城" && c.includes("④") && (t.kind === "daimyo" || t.kind === "noble")) {
      const slots = ["blade", "armor", "mount"].filter(s => t.eq[s]);
      if (!slots.length) return null;
      return { ok: true, kind: 4, noble, slots, desc: `弃置装备，${KIND_CN2[t.kind]}【${t.card.name}】存活（攻防减半）` };
    }
    if (!own && tier === "名城" && c.includes("⑤") && t.kind === "samurai") {
      const slots = ["blade", "mount"].filter(s => t.eq[s]);
      if (!slots.length) return null;
      return { ok: true, kind: 5, noble, slots, desc: `弃置装备，武士【${t.card.name}】存活（数值减半）` };
    }
    if (!own && tier === "大城" && c.includes("⑥") && t.kind === "noble") {
      if (defP.hp <= 10) return null;
      return { ok: true, kind: 6, noble, desc: `扣将军 10 生命，公卿【${t.card.name}】存活` };
    }
    return null;
  },
  /* 执行公卿城池加成替死（info 由 castleSacrificeInfo 提供）
     choice：kind2 → 被弃置的武士 uid；kind3/4/5 → 被弃置的装备槽；缺省回落到旧优先级 */
  doCastleSacrifice(defPi, t, info, choice) {
    const st = this.state;
    const defP = st.players[defPi];
    const noble = info.noble;
    const sacLog = (desc) => {
      t.hist = t.hist || [];
      t.hist.push({ t: st.turnNo, src: "公卿城池加成", desc });
      this.log(`🏰 公卿【${noble.card.name}】城池加成：${desc}`);
    };
    if (info.kind === 1) {
      // 弃置该公卿替大名受死：走正规离场流程（入弃牌堆、装备随弃、触发城池第四层兴衰）
      this.removeUnit(noble);
      sacLog(info.desc);
      return true;
    }
    if (info.kind === 2) {
      // 弃置己方一位武士替公卿受死：走正规离场流程
      const w = (info.ws || []).find(u => u.uid === choice) || info.w || (info.ws || [])[0];
      if (!w) return false;
      this.removeUnit(w);
      sacLog(`弃置武士【${w.card.name}】，公卿【${t.card.name}】存活`);
      return true;
    }
    if (info.kind === 3) {
      const slot = (info.slots || []).includes(choice) ? choice : (t.eq.blade ? "blade" : "mount");
      st.discard.push({ type: slot, card: t.eq[slot] });
      t.eq[slot] = null;
      t.hist = t.hist || [];
      t.hist.push({ t: st.turnNo, src: "公卿城池加成", desc: `弃置${TYPE_CN[slot]}替死` });
      sacLog(info.desc);
      return true;
    }
    if (info.kind === 4 || info.kind === 5) {
      const slot = (info.slots || []).includes(choice) ? choice : (t.eq.blade ? "blade" : t.eq.armor ? "armor" : "mount");
      st.discard.push({ type: slot, card: t.eq[slot] });
      t.eq[slot] = null;
      // 减半：攻防与累积特效数值一并折半（向上取整、至少 1；三层特效的 +1 依规则书保持不变）
      const beforeAtk = t.baseAtk, beforeDef = t.baseDef;
      t.baseAtk = Math.max(1, Math.ceil(t.baseAtk / 2));
      t.baseDef = Math.max(1, Math.ceil(t.baseDef / 2));
      t.extraAtk = Math.ceil((t.extraAtk || 0) / 2);
      t.extraDef = Math.ceil((t.extraDef || 0) / 2);
      // 记录减半损失：增幅归零（御·庇护）时需一并回收（可多次减半 → 累加）
      const prev = t.halveLoss || { atk: 0, def: 0 };
      t.halveLoss = {
        atk: prev.atk + (beforeAtk - t.baseAtk),
        def: prev.def + (beforeDef - t.baseDef),
      };
      t.hist = t.hist || [];
      t.hist.push({ t: st.turnNo, src: "公卿城池加成", desc: "装备替死存活，攻防减半" });
      sacLog(info.desc);
      return true;
    }
    if (info.kind === 6) {
      defP.hp -= 10;
      this.hpEvent(defPi, 10, "公卿城池加成·将军替死", defP.hp, false);
      sacLog(info.desc);
      return true;
    }
    return false;
  },
  /* 替死流程：防守方是玩家 → 弹窗选择（多个候选可点选要弃置的那一个）；是 AI → 自动判定 */
  castleSacrificeFlow(defPi, t, diePath) {
    const info = this.castleSacrificeInfo(defPi, t);
    if (!info) return false;
    const st = this.state;
    const useIt = (choice) => { this.doCastleSacrifice(defPi, t, info, choice); UI.renderAll(); return true; };
    if (defPi === 0) {
      // 玩家：弹窗选择
      st.prompting = true;
      UI.askCastleSacrifice(info, (use, choice) => {
        st.prompting = false;
        if (use) { this.doCastleSacrifice(defPi, t, info, choice); UI.renderAll(); }
        else { diePath(); UI.renderAll(); }
      });
      return "pending";
    }
    // AI：自动判定——⑥ 扣血较多（hp 充裕才用）；其余损失小（弃公卿/武士/装备）价值划算时用
    if (info.kind === 6) return st.players[1].hp > 30 ? useIt() : false;
    return useIt();
  },

  /* 城池第四层 · 兴衰损益：己方大名/公卿下场 → 对方将军 −a/−b */
  /* 隐藏特效 · 春和景明 / 偶感风寒
     条件：当前事件/城池为己方，且己方使用了圣迹/灾厄牌
     效果：本回合结束前，己方将军生命 +1（春和景明）／−1（偶感风寒），每回合各限一次 */
  hiddenMood(pi, cardType) {
    const st = this.state;
    const p = st.players[pi];
    const z = st.zone;
    if (!z || z.owner !== pi) return; // 常置牌非己方 → 不触发
    if (cardType !== "sacred" && cardType !== "calamity") return;
    const isSpring = cardType === "sacred";
    const name = isSpring ? "春和景明" : "偶感风寒";
    const delta = isSpring ? 1 : -1;
    p.moodUsed = p.moodUsed || {};
    if (p.moodUsed[name]) {
      this.log(`🌸 隐藏特效【${name}】：本回合已触发过，不再重复`);
      return;
    }
    p.moodUsed[name] = true;
    if (isSpring) {
      p.hp = Math.min(p.maxHp || 100, p.hp + 1);
      this.hpEvent(pi, -1, "春和景明", p.hp);
      this.log(`🌸 隐藏特效【春和景明】：当前常置牌为己方且使用圣迹，己方将军 +1 → ${p.hp}`);
    } else {
      p.hp -= 1;
      this.hpEvent(pi, 1, "偶感风寒", p.hp);
      this.log(`🌧 隐藏特效【偶感风寒】：当前常置牌为己方且使用灾厄，己方将军 −1 → ${p.hp}`);
      if (p.hp <= 0) this.win(1 - pi);
    }
    this.eHist(pi, "隐藏特效·" + name, `己方常置牌在区 + 使用${TYPE_CN[cardType]}：将军 ${delta > 0 ? "+" : ""}${delta}`);
  },

  /* 天皇第四能力 · 天命：按「谁使用了哪类牌」结算四个分支
     己方用圣迹 → 天命昭昭：己方将军 +1
     对方用圣迹 → 天命晦暗：己方武士攻击 −1
     己方用灾厄 → 天命诡谲：己方公卿防御 −1
     对方用灾厄 → 天命有失：己方大名命值 −1 */
  emperorDestiny(userPi, cardType) {
    const st = this.state;
    if (cardType !== "sacred" && cardType !== "calamity") return;
    // 对每个玩家各自结算（双方各有天皇，各自按自己的视角判断「己方/对方」）
    for (const pi of [0, 1]) {
      const p = st.players[pi];
      const emp = p.emperor;
      if (!emp || (p.emperorDisabled || 0) > 0) continue;
      const mine = userPi === pi;
      if (cardType === "sacred") {
        if (mine) {
          p.hp = Math.min(p.maxHp || 100, p.hp + 1);
          this.hpEvent(pi, -1, "天命·昭昭", p.hp);
          this.log(`⛩ 天命昭昭【${emp.name}】：己方使用圣迹，己方将军 +1 → ${p.hp}`);
          this.eHist(pi, "天命·昭昭", "己方使用圣迹：将军 +1");
        } else {
          const ws = p.field.filter(u => u.kind === "samurai");
          if (!ws.length) { this.eHist(pi, "天命·晦暗", "对方使用圣迹，但己方无武士"); continue; }
          for (const w of ws) {
            w.baseAtk = Math.max(0, w.baseAtk - 1);
            w.hist = w.hist || [];
            w.hist.push({ t: st.turnNo, src: "天命·晦暗", desc: "对方使用圣迹，攻击 −1" });
          }
          this.log(`⛩ 天命晦暗【${emp.name}】：对方使用圣迹，己方武士 ${ws.length} 位攻击 −1`);
          this.eHist(pi, "天命·晦暗", `对方使用圣迹：己方武士 ${ws.length} 位攻击 −1`);
        }
      } else {
        if (mine) {
          const ns = p.field.filter(u => u.kind === "noble");
          if (!ns.length) { this.eHist(pi, "天命·诡谲", "己方使用灾厄，但己方无公卿"); continue; }
          for (const n of ns) {
            n.baseDef = Math.max(0, n.baseDef - 1);
            n.hist = n.hist || [];
            n.hist.push({ t: st.turnNo, src: "天命·诡谲", desc: "己方使用灾厄，防御 −1" });
          }
          this.log(`⛩ 天命诡谲【${emp.name}】：己方使用灾厄，己方公卿 ${ns.length} 位防御 −1`);
          this.eHist(pi, "天命·诡谲", `己方使用灾厄：己方公卿 ${ns.length} 位防御 −1`);
        } else {
          const ds = p.field.filter(u => u.kind === "daimyo" && u.hp > 0);
          if (!ds.length) { this.eHist(pi, "天命·有失", "对方使用灾厄，但己方无大名"); continue; }
          for (const d of ds.slice()) {
            d.hp -= 1;
            d.hist = d.hist || [];
            d.hist.push({ t: st.turnNo, src: "天命·有失", desc: `对方使用灾厄，命值 −1 → ${d.hp}` });
            // 命值耗尽 → 大名下场（规则 §3.3：两条命共 20 点耗尽即下场）
            if (d.hp <= 0) {
              this.log(`⛩ 天命有失：大名【${d.card.name}】命值耗尽，下场`);
              this.removeUnit(d);
            }
          }
          this.log(`⛩ 天命有失【${emp.name}】：对方使用灾厄，己方大名 ${ds.length} 位命值 −1`);
          this.eHist(pi, "天命·有失", `对方使用灾厄：己方大名 ${ds.length} 位命值 −1`);
        }
      }
    }
  },

  /* 天皇之怒：己方指定类型（X）的单位下场时，对方将军 −Y。
     X/Y 固定印于天皇卡面（wrathX / wrathY），每张天皇牌各不相同。 */
  emperorWrathOnUnitGone(u) {
    const st = this.state;
    if (!u || !u.card) return;
    const emp = st.players[u.pi].emperor;
    if (!emp || !emp.wrathX || !emp.wrathY) return;
    if (KIND_CN[u.kind] !== emp.wrathX) return;
    const opp = st.players[1 - u.pi];
    const n = emp.wrathY;
    opp.hp -= n;
    this.hpEvent(1 - u.pi, n, "天皇之怒", opp.hp);
    this.eHist(u.pi, "天皇之怒", `己方${emp.wrathX}【${u.card.name}】下场，对方将军 −${n}`);
    this.log(`⛩ 天皇之怒【${emp.name}】：己方${emp.wrathX}【${u.card.name}】下场，对方将军 −${n} → ${opp.hp}`);
    if (opp.hp <= 0) this.win(u.pi);
  },

  castleL4OnUnitGone(u) {
    const st = this.state;
    const z = st.zone;
    if (!z || z.type !== "castle" || z.owner !== u.pi) return;
    const nums = (z.card.l4 || "").split("／").map(s => { const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : 0; });
    if (nums.length < 4) return;
    const n = u.kind === "daimyo" ? nums[0] : u.kind === "noble" ? nums[1] : 0;
    if (n <= 0) return;
    const opp = st.players[1 - u.pi];
    opp.hp -= n;
    this.hpEvent(1 - u.pi, n, "兴衰·" + (u.kind === "daimyo" ? "大名" : "公卿") + "下场", opp.hp);
    this.zHist(z, "第四层·兴衰损益", `施展对象：对方将军 −${n}（己方${KIND_CN[u.kind]}【${u.card.name}】下场）`, z.owner);
    this.log(`🏯 城池【${z.card.name}】兴衰损益：己方${KIND_CN[u.kind]}【${u.card.name}】下场，对方将军 −${n} → ${opp.hp}`);
    if (opp.hp <= 0) this.win(u.pi);
  },
  /* 城池第四层 · 兴衰损益：对方公卿/大名上场 → 己方将军 +c/+d */
  /* 单位进入战场区的统一挂钩：城池第四层（兴衰损益）+ 大名第四层·天命 */
  onUnitEntered(pi, u) {
    this.castleL4OnUnitEnter(pi, u);
    this.checkTianming(pi);
  },

  castleL4OnUnitEnter(pi, u) {
    const st = this.state;
    const z = st.zone;
    if (!z || z.type !== "castle" || z.owner !== 1 - pi) return;
    if (u.kind !== "daimyo" && u.kind !== "noble") return;
    const nums = (z.card.l4 || "").split("／").map(s => { const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : 0; });
    if (nums.length < 4) return;
    // 规则 §11 表头顺序：大名下场／公卿下场／敌方公卿上场／敌方大名上场
    const n = u.kind === "daimyo" ? nums[3] : nums[2];
    if (n <= 0) return;
    const me = st.players[z.owner];
    me.hp = Math.min(me.maxHp || 100, me.hp + n);
    this.hpEvent(z.owner, -n, "兴衰·敌" + (u.kind === "daimyo" ? "大名" : "公卿") + "上场", me.hp);
    this.zHist(z, "第四层·兴衰损益", `施展对象：己方将军 +${n}（对方${KIND_CN[u.kind]}【${u.card.name}】上场）`, z.owner);
    this.log(`🏯 城池【${z.card.name}】兴衰损益：对方${KIND_CN[u.kind]}【${u.card.name}】上场，己方将军 +${n} → ${me.hp}`);
  },

  removeUnit(u) {
    const p = this.state.players[u.pi];
    u.alive = false;
    u.defeated = true;
    const i = p.field.indexOf(u);
    if (i >= 0) {
      const card = { type: u.kind === "samurai" ? "samurai" : u.kind === "daimyo" ? "daimyo" : "noble", card: u.card };
      this.state.discard.push(card);
      if (UI.flashDiscard) UI.flashDiscard();
      p.field.splice(i, 1);
      this.castleL4OnUnitGone(u);
      this.emperorWrathOnUnitGone(u);
      // 单位离场：装备随之一同弃置（骑具下场触发八百里分麾下炙）
      for (const s of ["blade", "armor", "mount"]) if (u.eq && u.eq[s]) {
        const eq = u.eq[s];
        this.state.discard.push({ type: s, card: eq });
        u.eq[s] = null;
        if (s === "mount") this.mountLeaves(u.pi, eq);
      }
      this.clearMountShareFor(u.pi, u.uid); // 该单位不再是骑具共享的受益者
    }
    // 宝物指定目标离场 → 清除（下场后可重指）
    for (const q of this.state.players) {
      for (const tr of q.treasure) {
        if (tr.tgt.samurai === u.uid) tr.tgt.samurai = null;
        if (tr.tgt.noble === u.uid) tr.tgt.noble = null;
        if (tr.tgt.daimyo === u.uid) tr.tgt.daimyo = null;
      }
    }
  },

  /* afterAttack：攻击结算后的收尾。
     resolved=false 表示攻击未真正结算完成（如被消解/被拦截），
     此时不发战意、兵刃成长与事件第三层「我攻」——
     规则 §3.4 战意与 §3.7 兵刃成长都以「攻击结算完成」为触发前提。 */
  afterAttack(p, u, target, resolved = true) {
    const st = this.state;
    const pi = st.players.indexOf(p);
    // 先记账：弹窗期间该单位/该类型不得再攻击
    u.attackedThisTurn = true;
    p.typeAtk[u.kind] = true; // 每类型每回合仅一位发动攻击
    if (!resolved) { UI.renderAll(); return; }
    // 兵刃成长：攻击结算完成后掷骰
    this.growEquip(u, "blade");
    // 战意：攻击后攻击+1（增幅归零后三层特效失效）
    if (!u.purged && u.fx.includes("战意")) {
      u.extraAtk = (u.extraAtk || 0) + 1;
      u.hist = u.hist || [];
      u.hist.push({ t: st.turnNo, src: "战意", desc: "攻击后攻击 +1" });
    }
    // 事件第三层 · 敌攻：对方公卿攻击后，事件方选一单位攻击 +1（玩家点选，AI 取首位）
    const zz = st.zone;
    if (zz && zz.type === "process" && zz.owner === 1 - pi && u.kind === "noble") {
      const defPi = 1 - pi;
      const field = st.players[defPi].field.slice();
      if (field.length) {
        this.askPick(defPi, {
          title: "🔥 战火磨砺 · 敌攻",
          body: `对方公卿【${u.card.name}】发动了攻击：请选择己方战场区一位单位，<b>攻击 +1</b>（永久累积）。`,
          cands: field,
          onPick: (uid) => {
            const cand = st.players[defPi].field.find(x => x.uid === uid);
            if (!cand) return;
            cand.extraAtk = (cand.extraAtk || 0) + 1;
            cand.hist = cand.hist || [];
            cand.hist.push({ t: st.turnNo, src: "战火·敌攻", desc: "对方公卿攻击，攻击 +1" });
            this.zHist(zz, "第三层·战火磨砺·敌攻", `施展对象：【${cand.card.name}】攻击 +1（因对方公卿【${u.card.name}】攻击）`, zz.owner);
            this.log(`🔥 事件【${zz.card.name}】战火磨砺·敌攻：对方公卿【${u.card.name}】攻击，己方【${cand.card.name}】攻击 +1`);
          },
        });
      }
    }
    // 事件第三层 · 我攻：己方单位攻击后，对方选一单位攻击值或防御值 +1（二选一，玩家点选）
    if (zz && zz.type === "process" && zz.owner === pi) {
      const defPi = 1 - pi;
      const field = st.players[defPi].field.slice();
      if (field.length) {
        this.askPick(defPi, {
          title: "🔥 战火磨砺 · 我攻",
          body: `对方单位【${u.card.name}】发动了攻击：请选择 <b>攻击 +1</b> 或 <b>防御 +1</b>，再选择己方战场区一位单位（永久累积）。`,
          cands: field,
          modes: [{ key: "atk", label: "⚔ 攻击 +1" }, { key: "def", label: "🛡 防御 +1" }],
          aiPick: (cands) => ({ uid: cands[0].uid, mode: Math.random() < 0.5 ? "atk" : "def" }),
          onPick: (uid, mode) => {
            const cand = st.players[defPi].field.find(x => x.uid === uid);
            if (!cand) return;
            cand.hist = cand.hist || [];
            if (mode === "def") {
              cand.extraDef = (cand.extraDef || 0) + 1;
              cand.hist.push({ t: st.turnNo, src: "战火·我攻", desc: "对方单位攻击，防御 +1" });
              this.zHist(zz, "第三层·战火磨砺·我攻", `施展对象：【${cand.card.name}】防御 +1（因己方【${u.card.name}】攻击）`, zz.owner);
              this.log(`🔥 事件【${zz.card.name}】战火磨砺·我攻：己方【${u.card.name}】攻击，对方【${cand.card.name}】防御 +1`);
            } else {
              cand.extraAtk = (cand.extraAtk || 0) + 1;
              cand.hist.push({ t: st.turnNo, src: "战火·我攻", desc: "对方单位攻击，攻击 +1" });
              this.zHist(zz, "第三层·战火磨砺·我攻", `施展对象：【${cand.card.name}】攻击 +1（因己方【${u.card.name}】攻击）`, zz.owner);
              this.log(`🔥 事件【${zz.card.name}】战火磨砺·我攻：己方【${u.card.name}】攻击，对方【${cand.card.name}】攻击 +1`);
            }
          },
        });
      }
    }
    UI.renderAll();
  },

  /* ---------- 结束回合 / 胜利 ---------- */
  endTurn() {
    const st = this.state;
    const p = st.players[st.cur];
    // 恩典计数：本回合是否召唤过公卿/大名
    if (!p.summonedDaimyoOrNoble) p.graceCnt++;
    else p.graceCnt = 0;
    p.summonedDaimyoOrNoble = false;
    // 手牌上限 8
    while (p.hand.length > 8) {
      const c = p.hand.pop();
      st.discard.push(c);
      this.log(`${p.name} 手牌超限，弃置 ${this.cardName(c)}`);
    }
    // 重置单位标记
    for (const u of p.field) { u.attackedThisTurn = false; }
    // 的卢之魂 · 效果 2：回合结束下场的骑具
    if (st._diluEnd && st._diluEnd.length) {
      for (const uid of st._diluEnd) {
        const u = p.field.find(x => x.uid === uid);
        if (u && u.eq.mount) {
          const m = u.eq.mount;
          st.discard.push({ type: "mount", card: m });
          u.eq.mount = null;
          this.log(`🐎 的卢之魂【${m.name}】回合结束下场`);
          this.mountLeaves(st.players.indexOf(p), m); // 八百里分麾下炙：骑具下场联动
        }
      }
      st._diluEnd = [];
    }
    // 圣-10 丰玉姬化龙：回合结束时该大名下场（规则 §3.12）
    for (const u of p.field.slice()) {
      if (u._ryujinLeave) {
        u._ryujinLeave = false;
        this.log(`🐉 丰玉姬化龙：【${u.card.name}】回合结束，下场`);
        this.removeUnit(u);
      }
    }
    // 天皇满 2 张宝物 → 回合末换天皇
    this.checkEmperorSwap();
    // 将军技能·战后共荣：本回合成功给予对方将军伤害 → 己方大名命值 +1（不超本阶段上限）、公卿攻击 +1
    this.postGlorySettle(st.cur);
    st.turnDamage = {}; // 每回合重置「是否打伤对方将军」记录
    st.cur = 1 - st.cur;
    st.turnNo++;
    UI.renderAll();
    this.beginTurn();
  },

  win(pi) {
    const st = this.state;
    st.winner = pi;
    this.clearChoices();
    this.save();
    this.log(`🏆 ${st.players[pi].name} 获胜！`, pi === 0 ? "me" : "ai");
    UI.showModal("对战结束", `<div style="font-size:22px;text-align:center;color:#ffd700">${st.players[pi].name} 获胜！</div>
      <p style="text-align:center;margin:10px 0">点击下方重新开局</p>`,
      [{ label: "重新开局", cls: "primary", fn: () => { UI.hideModal(); this.setup(); } }]);
  },

  /* 和局（规则 §12.2：卡组第二次耗尽且双方剩余生命相同） */
  drawGame(reason) {
    const st = this.state;
    st.winner = -1; // -1 = 和局
    this.clearChoices();
    this.save();
    this.log(`🀄 和局：${reason}`);
    UI.showModal("对战结束", `<div style="font-size:22px;text-align:center;color:#ffd98a">和 局</div>
      <p style="text-align:center;margin:10px 0">${reason}</p>`,
      [{ label: "重新开局", cls: "primary", fn: () => { UI.hideModal(); this.setup(); } }]);
  },

  /* ---------- AI ---------- */
  aiTurn() {
    const p = this.state.players[1];
    const steps = [];
    const push = (label, fn) => steps.push({ label, fn });
    // 抽牌
    push("抽牌", () => { this.drawCard(p); if (UI.flashHand) UI.flashHand(1, p.hand.length - 1); });
    // 召唤武士（逐个）
    for (let k = 0; k < 5; k++) {
      const i = p.hand.findIndex(c => c.type === "samurai");
      if (i < 0 || p.field.length >= 5) break;
      const card = p.hand[i];
      push("召唤武士", () => {
        const idx = p.hand.indexOf(card);
        if (idx < 0) return;
        const before = p.field.length;
        if (this.summonSamurai(1, idx) && p.field.length > before && UI.flashUnit) {
          UI.flashUnit(1, p.field[p.field.length - 1].uid);
        }
      });
    }
    // 恩典召唤
    if (this.canGrace(p)) {
      const gi = p.hand.findIndex(c => c.type === "daimyo" || c.type === "noble");
      if (gi >= 0 && p.field.length < 5) {
        const card = p.hand[gi];
        push("恩典召唤", () => { const idx = p.hand.indexOf(card); if (idx < 0) return; this.graceSummon(1, idx); });
      }
    }
    // 献祭召唤（优先大名；其次公卿）
    for (const t of ["daimyo", "noble"]) {
      const di = p.hand.findIndex(c => c.type === t);
      if (di >= 0) {
        const sac = p.field.findIndex(u => u.kind === "samurai" && u.summonedTurn < this.state.turnNo);
        if (sac >= 0) {
          const card = p.hand[di];
          push("献祭召唤", () => {
            const idx = p.hand.indexOf(card);
            if (idx < 0) return;
            this.sacrificeSummon(1, idx, sac);
          });
        }
      }
    }
    // 事件/城池放置（含顶替对方）
    {
      const zi = p.hand.findIndex(c => c.type === "castle" || c.type === "process");
      if (zi >= 0 && p.zoneUsed < 1) {
        const z = this.state.zone;
        if (!z || z.owner !== 1) {
          const card = p.hand[zi];
          push("放置常置牌", () => { const idx = p.hand.indexOf(card); if (idx < 0) return; this.playZone(1, idx); if (UI.flashZone) UI.flashZone(); });
        }
      }
    }
    // 募兵
    {
      const ri = this.recruitInfo(1);
      if (ri && ri.ok) {
        const opts = this.recruitOptions(1);
        if (opts.length) {
          const opt = opts[0];
          push("募兵", () => { this.doRecruit(1, opt); });
        }
      }
    }
    // 断刃重铸：AI 在生命宽裕时把兵刃转给攻击更高的武士
    {
      const rf = this.reforgeInfo(1);
      if (rf && rf.ok && rf.targets.length && p.hp > rf.cost * 4) {
        const from = rf.holders.reduce((a, b) => (this.unitStats(a).atk <= this.unitStats(b).atk ? a : b));
        const to = rf.targets.reduce((a, b) => (this.unitStats(a).atk >= this.unitStats(b).atk ? a : b));
        if (this.unitStats(to).atk > this.unitStats(from).atk) {
          push("断刃重铸", () => { this.useReforge(1, from.uid, to.uid); });
        }
      }
    }
    // 装备（逐个）
    for (const slot of ["blade", "mount", "armor"]) {
      const idx = p.hand.findIndex(c => c.type === slot);
      if (idx < 0) continue;
      const card = p.hand[idx];
      const elig = slot === "blade" ? (x => (x.kind === "daimyo" || x.kind === "samurai" || (x.kind === "noble" && this.canBladeOnNoble(1))) && !x.eq.blade)
        : slot === "mount" ? (x => (x.kind === "samurai" || x.kind === "noble" || (x.kind === "daimyo" && this.canMountOnDaimyo(1))) && !x.eq.mount)
        : (x => (x.kind === "daimyo" || x.kind === "noble" || (x.kind === "samurai" && this.canArmorOnSamurai(1))) && !x.eq.armor);
      const target = p.field.find(elig);
      if (target) {
        push("装备", () => {
          const hi = p.hand.indexOf(card);
          if (hi < 0) return;
          if (this.equip(1, hi, target.uid) && UI.flashUnit) UI.flashUnit(1, target.uid);
        });
      }
    }
    // 宝物
    if (!p.treasure.length) {
      const ti = p.hand.findIndex(c => c.type === "treasure");
      if (ti >= 0) {
        const card = p.hand[ti];
        push("装备宝物", () => { const idx = p.hand.indexOf(card); if (idx < 0) return; this.playTreasure(1, idx, 1); });
      }
    }
    // 圣迹/灾厄主动使用
    this.aiUseEventsCollect(steps);
    this.runSteps(steps, 0);
  },

  // AI 主动使用圣迹/灾厄（有利时机）——收集为步进
  aiUseEventsCollect(steps) {
    const p = this.state.players[1];
    const opp = this.state.players[0];
    const z = this.state.zone;
    const hasEq = (slot) => opp.field.some(u => u.eq[slot]);
    for (let i = 0; i < p.hand.length; i++) {
      const c = p.hand[i];
      let use = false;
      if (c.type === "calamity") {
        const fx = c.card.l4 || "";
        use = (fx.includes("摧毁城池") && z && z.type === "castle") ||
          (fx.includes("摧毁事件") && z && z.type === "process") ||
          (fx.includes("骑具") && hasEq("mount")) ||
          (fx.includes("兵刃") && fx.includes("装具") && (hasEq("blade") || hasEq("armor"))) ||
          (fx.includes("减半") && opp.hp < p.hp);
      } else if (c.type === "sacred") {
        const fx = c.card.fx || "";
        use = (fx.includes("弃牌堆") && fx.includes("洗回") && this.state.deck.length < 10) ||
          (fx.includes("恢复") && p.hp < 55);
      }
      if (use) {
        const card = c;
        steps.push({ label: "使用" + TYPE_CN[c.type], fn: () => { const idx = p.hand.indexOf(card); if (idx < 0) return; this.useEvent(1, idx); } });
      }
    }
  },

  // 步进执行：每步之间 3 秒
  runSteps(steps, i) {
    if (this.state.winner != null) { UI.renderAll(); return; }
    // 玩家正在点选目标（事件第三层等）：等选择结算完再继续，避免候选单位中途消失
    if (this.state.prompting) { setTimeout(() => this.runSteps(steps, i), 1200); return; }
    if (i >= steps.length) {
      UI.renderAll();
      this.aiCombat();
      return;
    }
    const s = steps[i];
    this.log(`🤖 电脑：${s.label}…`, "ai");
    try { s.fn(); }
    catch (e) { this.log(`⚠ AI 步骤异常（${s.label}）：${(e && e.message) || e}，已跳过`, "sys"); }
    setTimeout(() => this.runSteps(steps, i + 1), 3000);
  },

  aiCombat() {
    const p = this.state.players[1];
    if (!this.canAttack(p)) { UI.renderAll(); this.endTurn(); return; }
    const att = this.attackers(1).sort((a, b) => this.unitStats(b).atk - this.unitStats(a).atk);
    if (!att.length) { UI.renderAll(); this.endTurn(); return; }
    this.aiAttackSeq(att, 0);
  },

  // AI 逐个攻击；若玩家持有圣迹/灾厄，可弹出选择消解
  aiAttackSeq(att, idx) {
    const st = this.state;
    if (st.winner != null) { UI.renderAll(); return; }
    // 玩家正在点选目标（事件第三层等）：等选择结算完再攻击
    if (st.prompting) { setTimeout(() => this.aiAttackSeq(att, idx), 1200); return; }
    if (idx >= att.length) { UI.renderAll(); this.endTurn(); return; }
    const u = att[idx];
    if (st.players[1].typeAtk[u.kind]) { setTimeout(() => this.aiAttackSeq(att, idx + 1), 3000); return; } // 每类型仅一位
    const layer = this.frontLayer(0);
    // 选目标：优先打「有效生命」最低者（武士=防御值，公卿=攻击值，大名=命值）
    const vitals = (x) => {
      const xs = this.unitStats(x);
      return x.kind === "samurai" ? xs.def : x.kind === "noble" ? xs.atk : x.hp;
    };
    const target = layer ? [...layer].sort((a, b) => vitals(a) - vitals(b))[0].uid : "shogun";
    const defender = st.players[0];
    const neg = defender.hand.map((c, i) => (c.type === "sacred" || c.type === "calamity") ? i : -1).filter(i => i >= 0);
    // 攻击前特效：攻击者抖动、目标高亮
    if (UI.shakeUnit) UI.shakeUnit(u.uid);
    if (target === "shogun") { if (UI.flashShogun) UI.flashShogun(0); }
    else if (UI.flashUnit) UI.flashUnit(0, target);
    this.log(`🤖 电脑：【${u.card.name}】发动攻击（攻 ${this.unitStats(u).atk}）`, "ai");
    // 仅单位攻击可被消解（直击将军不可）
    if (neg.length && target !== "shogun") {
      st.prompting = true; // 等待玩家消解选择：卡死检测跳过
      UI.askNegate(u, neg, (useIdx) => {
        st.prompting = false;
        try {
          if (useIdx !== null) {
            this.useEvent(0, useIdx, true); // 第一层消解生效 → 禁攻代价
            if (st._negateResolved) {
              this.log(`✨【${u.card.name}】的攻击被消解！`);
              u.attackedThisTurn = true; // 该 AI 单位攻击次数已耗尽
              // 第一层消解抵消后：撤销 AI 该类型禁令，该类型重新获得一次攻击
              delete st.players[1].typeAtk[u.kind];
            } else {
              // 消解被对方反制 → 该次攻击既未被消解也不应消失：照常结算
              this.log(`✨ 消解被反制，【${u.card.name}】的攻击照常结算`);
              this.attack(1, u.uid, target);
            }
          } else {
            this.attack(1, u.uid, target);
          }
        } catch (e) { this.log(`⚠ AI 攻击异常：${(e && e.message) || e}`, "sys"); }
        setTimeout(() => this.aiAttackSeq(att, idx + 1), 3000);
      });
      return;
    }
    try { this.attack(1, u.uid, target); }
    catch (e) { this.log(`⚠ AI 攻击异常：${(e && e.message) || e}，已跳过`, "sys"); }
    setTimeout(() => this.aiAttackSeq(att, idx + 1), 3000);
  },

  /* AI 回合入口（异常兜底：AI 步骤抛错不中断整回合） */
  aiGo() {
    try { this.aiTurn(); }
    catch (e) { this.log(`⚠ AI 回合异常：${(e && e.message) || e}，已恢复`, "sys"); UI.renderAll(); }
  },
};
