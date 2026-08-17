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
    try { localStorage.setItem(this.SAVE_KEY, JSON.stringify(this.state)); } catch (e) {}
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
  /* 刷新恢复：AI 回合由 UI 轮询自动续跑（等待 waitingAI 复位后触发 aiGo） */
  resumeAfterReload() {
    const st = this.state;
    if (!st) return;
    st.waitingAI = false;
    this.log(`↻ 已从存档恢复现场（第 ${st.turnNo} 回合 · ${st.players[st.cur].name} 的回合）`, "sys");
    UI.renderAll();
  },

  /* 将军生命事件记录（供详情页伤害历史）；isDamage=true 时触发事件第三层「受创」 */
  hpEvent(pi, dmg, src, hpAfter, isDamage) {
    const p = this.state.players[pi];
    if (!p) return;
    p.hpHist = p.hpHist || [];
    p.hpHist.push({ t: this.state.turnNo, src, dmg, hp: hpAfter });
    if (p.hpHist.length > 14) p.hpHist.shift();
    if (isDamage !== false && dmg > 0) this.warFireTough(pi);
    // 将军本性：生命降至阈值后，仅一次增幅总生命 1/10
    if (!p.natureUsed && p.shogun.nature && p.maxHp) {
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

  /* 事件第三层 · 战火磨砺「受创」：己方将军受伤后，己方选一单位防御 +1（自动选择） */
  warFireTough(pi) {
    const st = this.state;
    const zz = st.zone;
    if (!zz || zz.type !== "process" || zz.owner !== pi) return;
    const cand = st.players[pi].field.find(x => x.pi === pi);
    if (!cand) return;
    cand.extraDef = (cand.extraDef || 0) + 1;
    cand.hist = cand.hist || [];
    cand.hist.push({ t: st.turnNo, src: "战火·受创", desc: "己方将军受伤，防御 +1" });
    this.zHist(zz, "第三层·战火磨砺·受创", `施展对象：【${cand.card.name}】防御 +1`, zz.owner);
    this.log(`🔥 事件【${zz.card.name}】战火磨砺·受创：${st.players[pi].name} 将军受伤，【${cand.card.name}】防御 +1`);
  },

  log(msg, who = "sys", card = null) {
    this._lastAct = Date.now();
    this.state.log.push({ msg, who, card });
    UI.renderLog();
  },

  /* ---------- 卡牌查找 ---------- */
  findCard(type, name) { return CARDS[type].find(c => c.name === name); },

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
    const hp = hpArr || [50, 50]; // 将军生命：玩家 / 电脑（默认各 50）
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
      noAtkUntil: 0, recruitUsed: false, healCooldown: 0, purgeUsed: false, bypassUsed: false, assassinUsed: false,
      talentCooldown: 3, natureUsed: false, rankUsed: false, rankBlockAttack: false, tempoUsed: false,
    });
    const players = [mk("玩家", false, d.avatars[0].emperor, d.avatars[0].shogun, hp[0]),
                     mk("电脑", true, d.avatars[1].emperor, d.avatars[1].shogun, hp[1])];
    this.state = {
      players, deck, discard: [], zone: null, log: [],
      turnNo: 1, cur: first, winner: null, waitingAI: false, l4Used: {},
    };
    for (const p of players) { for (let i = 0; i < 5; i++) p.hand.push(deck.pop()); }
    this.log("⚔ 开局：共用卡组 " + deck.length + " 张");
    this.log(`玩家：天皇【${players[0].emperor.name}】 将军【${players[0].shogun.name}】`, "me");
    this.log(`电脑：天皇【${players[1].emperor.name}】 将军【${players[1].shogun.name}】`, "ai");
    this.log("先手：" + (first === 0 ? "玩家" : "电脑") + "（第1、2回合不能攻击）");
    UI.renderAll();
    this.beginTurn();
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
    for (const tr of [p.emperor.t1, p.emperor.t2, p.emperor.t3]) {
      if (tr.includes("武士之锋")) samuraiAtk += parseInt(tr.match(/(\d+)/)[1]); // 仅武士攻击 +X
      if (tr.includes("公卿之智")) nobleBoost += parseInt(tr.match(/(\d+)/)[1]); // 公卿特效数值 +X
      if (tr.includes("兵刃之锐")) bladeBoost += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("装具之固")) armorBoost += parseInt(tr.match(/(\d+)/)[1]);
    }
    // 城池（城威持续；增幅一/二为放置时一次性效果，不在此叠加）
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
    // 大名第二层 · 辅佐（励武：己方武士攻击 +N；护卿：己方公卿防御 +N；自动指定场上首个目标）
    for (const u of p.field) {
      if (u.kind === "daimyo" && u.card.l2) {
        const m = u.card.l2.match(/(励武|护卿)\s*·?\s*([^+]*?)\s*\+?(\d+)/);
        if (m && m[1] === "励武") { for (const w of p.field) if (w.kind === "samurai") { atk += parseInt(m[3]); break; } }
        else if (m && m[1] === "护卿") { for (const w of p.field) if (w.kind === "noble" && w.uid !== u.uid) { def += parseInt(m[3]); break; } }
      }
    }
    // 大名第三层 · 城盟（己方城池）：名城/大城 → 该大名攻防各 +1
    if (z && z.type === "castle" && z.owner === pi && (z.card.tier === "名城" || z.card.tier === "大城")) {
      for (const u of p.field) if (u.kind === "daimyo") { atk += 1; def += 1; }
    }
    // 大名第四层 · 事件之势（事件区为事件牌时生效）：文衡公卿防+1 / 武备武士攻+1 / 坚城大名防+1 / 锋芒大名攻+1
    if (z && z.type === "process") {
      for (const u of p.field) {
        if (u.kind !== "daimyo" || !u.card.l4) continue;
        const f = u.card.l4;
        if (f.includes("文衡")) { for (const w of p.field) if (w.kind === "noble") def += 1; }
        else if (f.includes("武备")) { for (const w of p.field) if (w.kind === "samurai") atk += 1; }
        else if (f.includes("坚城")) { for (const w of p.field) if (w.kind === "daimyo") def += 1; }
        else if (f.includes("锋芒")) { for (const w of p.field) if (w.kind === "daimyo") atk += 1; }
      }
    }
    return { atk, def, blade: blade + bladeBoost, armor: armor + armorBoost, mount, samuraiAtk };
  },

  // 单位当前攻防（含光环与装备）
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
      const idx = opp.field.findIndex(u => u.kind === "samurai");
      const u = opp.field.splice(idx, 1)[0];
      u.pi = pi;
      p.field.push(u);
      u.hist = u.hist || [];
      u.hist.push({ t: st.turnNo, src: "事件之速·夺", desc: "控制权转移至己方" });
      this.log(`⚡ 事件之速：当前事件为对方【${z.card.name}】，夺取对方武士【${u.card.name}】控制权！`);
      if (UI.unitEnter) UI.unitEnter(u.uid);
      if (UI.flashUnit) UI.flashUnit(pi, u.uid);
    }
    UI.renderAll();
    return true;
  },

  /* 攻防数值构成明细：返回 { atk, def, rawAtk, rawDef, AP, DP }（AP/DP = [{k,v}]） */
  unitStatParts(u) {
    const st = this.state;
    const p = st.players[u.pi];
    const pi = u.pi;
    const AP = [], DP = [];
    let atk = u.baseAtk, def = u.baseDef;
    AP.push({ k: "基础攻击", v: u.baseAtk });
    DP.push({ k: "基础防御", v: u.baseDef });
    // 将军增幅光环
    if (p.shogun.aura_type === "攻击") { atk += p.shogun.aura_val; AP.push({ k: "将军光环·攻击", v: p.shogun.aura_val }); }
    else { def += p.shogun.aura_val; DP.push({ k: "将军光环·防御", v: p.shogun.aura_val }); }
    // 天皇轨道
    let bladeBoost = 0, armorBoost = 0, nobleBoost = 0, samuraiAtk = 0, mountBoost = 0;
    for (const tr of [p.emperor.t1, p.emperor.t2, p.emperor.t3]) {
      if (tr.includes("武士之锋")) samuraiAtk += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("公卿之智")) nobleBoost += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("兵刃之锐")) bladeBoost += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("装具之固")) armorBoost += parseInt(tr.match(/(\d+)/)[1]);
      if (tr.includes("骑具之灵")) mountBoost += parseInt(tr.match(/(\d+)/)[1]);
    }
    // 城池（城威持续；增幅一/二为放置时一次性，不在此叠加）
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
        else if (f.startsWith("⑤")) mountBoost += bv;
      }
    }
    // 大名 l2 励武/护卿
    for (const u2 of p.field) {
      if (u2.kind !== "daimyo" || !u2.card.l2) continue;
      const m = u2.card.l2.match(/(励武|护卿)\s*·?\s*([^+]*?)\s*\+?(\d+)/);
      if (m && m[1] === "励武" && u.kind === "samurai") { const v = parseInt(m[3]); atk += v; AP.push({ k: `大名【${u2.card.name}】励武`, v }); }
      else if (m && m[1] === "护卿" && u.kind === "noble" && u.uid !== u2.uid) { const v = parseInt(m[3]); def += v; DP.push({ k: `大名【${u2.card.name}】护卿`, v }); }
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
    let bladeBonus = 0, armorBonus = 0;
    if (u.eq.blade) {
      let b = u.eq.blade.atk;
      if (u.kind === "samurai" && u.fx && u.fx.includes("持刃")) b += 1;
      bladeBonus += b;
    }
    if (u.eq.armor) armorBonus += u.eq.armor.dfs;
    const cc = z;
    if (cc && cc.type === "castle") {
      const own = cc.owner === pi;
      const tier = cc.card.tier;
      const team = p.field;
      if (own && (tier === "王城" || tier === "名城")) {
        if (!u.eq.blade && (u.kind === "daimyo" || u.kind === "samurai")) {
          const sharer = team.find(x => x.eq.blade && x.uid !== u.uid);
          if (sharer) bladeBonus += sharer.eq.blade.atk;
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
    atk += bladeBonus; if (bladeBonus !== 0) AP.push({ k: "兵刃" + (u.eq.blade ? "【" + u.eq.blade.name + "】" : "（共享）"), v: bladeBonus });
    def += armorBonus; if (armorBonus !== 0) DP.push({ k: "装具" + (u.eq.armor ? "【" + u.eq.armor.name + "】" : "（共享）"), v: armorBonus });
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
    // 骑术（武士+骑具）
    if (u.kind === "samurai" && u.eq.mount && u.fx && u.fx.includes("骑术")) { def += 1; DP.push({ k: "骑术", v: 1 }); }
    // 宝物目标加成
    for (const tr of p.treasure) {
      if (tr.tgt.samurai === u.uid && u.kind === "samurai") { def += tr.card.s1; DP.push({ k: "宝物【" + tr.card.name + "】武士", v: tr.card.s1 }); }
      if (tr.tgt.noble === u.uid && u.kind === "noble") { atk += tr.card.n1; AP.push({ k: "宝物【" + tr.card.name + "】公卿", v: tr.card.n1 }); }
      if (tr.tgt.daimyo === u.uid && u.kind === "daimyo") { atk += tr.card.d1; def += tr.card.d1; AP.push({ k: "宝物【" + tr.card.name + "】大名", v: tr.card.d1 }); DP.push({ k: "宝物【" + tr.card.name + "】大名", v: tr.card.d1 }); }
    }
    // 事件立场（fx 第三段）
    if (u.kind === "samurai" && z && z.type === "process" && u.fx) {
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
    return { atk, def, rawAtk: u.baseAtk + (u.extraAtk || 0), rawDef: u.baseDef + (u.extraDef || 0), AP, DP };
  },

  unitStats(u) {
    const P = this.unitStatParts(u);
    return { atk: P.atk, def: P.def, rawAtk: P.rawAtk, rawDef: P.rawDef };
  },

  unitStatsOld(u) {
    const p = this.state.players[u.pi];
    let atk = u.baseAtk, def = u.baseDef;
    const a = this.aura(p);
    atk += a.atk; def += a.def;
    // 装备（光环类增幅由 a.blade/a.armor 统一提供，避免重复计算）
    let bladeBonus = 0, armorBonus = 0;
    if (u.eq.blade) {
      let b = u.eq.blade.atk;
      if (u.kind === "samurai" && u.fx && u.fx.includes("持刃")) b += 1;
      bladeBonus += b;
    }
    if (u.eq.armor) armorBonus += u.eq.armor.dfs;
    // 城池装备共鸣强化（第二层）
    const cc = this.state.zone;
    if (cc && cc.type === "castle") {
      const own = cc.owner === u.pi;
      const tier = cc.card.tier;
      const team = this.state.players[u.pi].field;
      if (own && (tier === "王城" || tier === "名城")) {
        // 己方兵刃可同时作用两位（无兵刃的合法单位共享一件兵刃加成）
        if (!u.eq.blade && (u.kind === "daimyo" || u.kind === "samurai")) {
          const sharer = team.find(x => x.eq.blade && x.uid !== u.uid);
          if (sharer) bladeBonus += sharer.eq.blade.atk;
        }
      }
      if (!own && (tier === "王城" || tier === "名城")) {
        // 敌方装具可同时作用两位（敌方单位共享装具加成）
        if (!u.eq.armor && (u.kind === "daimyo" || u.kind === "noble")) {
          const sharer = team.find(x => x.eq.armor && x.uid !== u.uid);
          if (sharer) armorBonus += sharer.eq.armor.dfs;
        }
      }
      if (own && tier === "大城" && u.eq.blade) bladeBonus += Math.ceil(u.eq.blade.atk * 0.5);   // 己方兵刃 +50%
      if (!own && tier === "大城" && u.eq.blade) bladeBonus -= Math.floor(u.eq.blade.atk * 0.3); // 敌方兵刃 −30%
    }
    atk += bladeBonus + ((u.eq.blade && a.blade) || 0); // 装备光环（兵刃之锐/公卿③）仅在有兵刃时生效
    def += armorBonus + ((u.eq.armor && a.armor) || 0); // 装备光环（装具之固/公卿④）仅在有装具时生效
    if (u.kind === "samurai") atk += (a.samuraiAtk || 0); // 天皇·武士之锋（仅武士）
    if (u.kind === "samurai" && u.eq.mount && u.fx && u.fx.includes("骑术")) def += 1;
    // 宝物（装备对象天皇的持有者视角）：第一~三层指定加成
    for (const tr of p.treasure) {
      if (tr.tgt.samurai === u.uid && u.kind === "samurai") def += tr.card.s1;
      if (tr.tgt.noble === u.uid && u.kind === "noble") atk += tr.card.n1;
      if (tr.tgt.daimyo === u.uid && u.kind === "daimyo") { atk += tr.card.d1; def += tr.card.d1; }
    }
    // 第三层 · 事件立场：己方/敌方事件 → 攻/防 +1（fx 形如 "己攻/敌防"）
    const zz = this.state.zone;
    if (u.kind === "samurai" && zz && zz.type === "process" && u.fx) {
      const parts = u.fx.split("·");
      if (parts.length >= 3) {
        const l3 = parts[2];
        const own = zz.owner === u.pi;
        const [mine, theirs] = l3.split("/");
        if (own && mine.startsWith("己攻")) atk += 1;
        if (own && mine.startsWith("己防")) def += 1;
        if (!own && theirs.startsWith("敌攻")) atk += 1;
        if (!own && theirs.startsWith("敌防")) def += 1;
      }
    }
    // 三层特效累积
    atk += u.extraAtk || 0;
    def += u.extraDef || 0;
    // 光环对攻击/防御的贡献（供受创时反推原始值）
    const rawAtk = u.baseAtk + (u.extraAtk || 0);
    const rawDef = u.baseDef + (u.extraDef || 0);
    return { atk, def, rawAtk, rawDef };
  },

  unitDodge(u) {
    let d = 0;
    let mountBoost = 0;
    const em = this.state.players[u.pi].emperor;
    for (const tr of [em.t1, em.t2, em.t3]) if (tr.includes("骑具之灵")) mountBoost += parseInt(tr.match(/(\d+)/)[1]);
    mountBoost += (this.aura(this.state.players[u.pi]).mount || 0); // 公卿 ⑤ 骑具 +X%（仅对已装备骑具的单位生效）
    if (u.eq.mount) d = u.eq.mount.dodge + mountBoost;
    // 的卢之魂 · 效果 1：己方生命低于对方 → 躲避率随机 +5%～10%（动态实时判定）
    if (u.eq.mount && u.eq.mount.soul === 1) {
      const p = this.state.players[u.pi], opp = this.state.players[1 - u.pi];
      if (p.hp < opp.hp) d += 5 + Math.floor(Math.random() * 6); // 5~10 随机整数
    }
    // 骑具躲避仅对装备了骑具的单位生效（不共享、不作用于未装备单位）
    return Math.min(d, 90);
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
    // 天皇·将军之佑
    for (const t of [p.emperor.t1, p.emperor.t2, p.emperor.t3]) {
      if (t.includes("将军之佑")) {
        const v = parseInt(t.match(/(\d+)/)[1]);
        p.hp = Math.min(p.maxHp || 100, p.hp + v);
        this.log(`天皇【${p.emperor.name}】将军之佑 +${v} → ${p.name} HP ${p.hp}`);
      }
    }
    } // 天皇效果（含失效跳过）
    // 城池增幅（将军生命/类型单位/装备）已改为放置时一次性生效（每张城池每局一次）
    const z = st.zone;
    // 事件第二层（天佑将军：每张事件牌每局仅触发一次）
    if (z && z.type === "process") {
      if (z._tianyouUsed) {
        this.log(`事件【${z.card.name}】天佑已在本局使用过，不再生效`);
      } else {
        z._tianyouUsed = true;
        const own = z.owner === st.cur;
        const v = own ? z.card.a2o : z.card.a2p;
        p.hp = Math.min(p.maxHp || 100, p.hp + v);
        this.hpEvent(st.cur, -v, "事件天佑", p.hp);
        this.zHist(z, "第二层·天佑将军", `施展对象：${p.name} 将军 +${v}（每局一次）`, z.owner);
        this.log(`事件【${z.card.name}】天佑：${p.name} 将军 +${v} → ${p.hp}`);
      }
      // 大名第四层 · 天命：事件在时己方将军一次性 +10（每张天命大名一次）
      for (const u of p.field) {
        if (u.kind === "daimyo" && u.card.l4 && u.card.l4.includes("天命") && !u._tianmingUsed) {
          u._tianmingUsed = true;
          p.hp = Math.min(p.maxHp || 100, p.hp + 10);
          this.hpEvent(st.cur, -10, "天命", p.hp);
          this.log(`⚡ 大名【${u.card.name}】天命：事件在时，${p.name} 将军 +10 → ${p.hp}`);
        }
      }
    }
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
    // 将军天赋：每 3 个己方回合，为己方场上一指定类型单位 +1~2 攻或防（每位该类型单位每局仅一次）
    if (p.talentCooldown > 0) p.talentCooldown--;
    if (p.talentCooldown <= 0 && p.shogun.talent) {
      p.talentCooldown = 3;
      const tm = p.shogun.talent.match(/天赋·(大名|公卿|武士)/);
      if (tm) {
        const KM = { 大名: "daimyo", 公卿: "noble", 武士: "samurai" };
        const kind = KM[tm[1]] || "samurai";
        const cands = p.field.filter(u => u.kind === kind && !u._talentUsed);
        if (cands.length) {
          const t2 = cands[Math.floor(Math.random() * cands.length)];
          t2._talentUsed = true; // 每单位每局仅享受一次
          const isAtk = Math.random() < 0.5;
          const v = 1 + Math.floor(Math.random() * 2); // 1~2
          if (isAtk) t2.extraAtk = (t2.extraAtk || 0) + v;
          else t2.extraDef = (t2.extraDef || 0) + v;
          t2.hist = t2.hist || [];
          t2.hist.push({ t: st.turnNo, src: "天赋·" + tm[1], desc: (isAtk ? "攻击" : "防御") + " +" + v + "（每局一次）" });
          this.log(`✨ 将军天赋【${p.shogun.talent}】：${tm[1]}【${t2.card.name}】${isAtk ? "攻击" : "防御"} +${v}（每局一次）`);
        } else {
          this.log(`✨ 将军天赋【${p.shogun.talent}】：己方${tm[1]}均已享受过天赋增幅（每位每局一次），本回合不触发`);
        }
      }
    }
    // 事件·暗杀：改为己方行动阶段手动发动（右上角按钮），不再自动触发
    // 圣迹·丰玉姬化龙待命：对方回合使用时下一己方回合生效
    if (p._ryujinPending) {
      const pu = p.field.find(x => x.uid === p._ryujinPending);
      this.ryujinStrike(st.cur);
      p._ryujinPending = null;
    }
    // 圣迹/灾厄代价检查
    if (p.noAtkUntil >= st.turnNo) this.log(`⚠ ${p.name} 本回合不能攻击（圣迹/灾厄代价）`);
    UI.renderAll();
  },

  /* 阶段二 · 抽牌 */
  drawCard(p) {
    if (p.drawnThisTurn) { this.log("本回合已抽过牌"); return null; }
    if (!this.state.deck.length) { this.log("卡组已空，无法抽牌"); return null; }
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
    const cost = kind === "samurai" ? p.emperor.ps : p.emperor.pn;
    return p.hp > cost;
  },
  doPurge(pi, t) {
    const p = this.state.players[pi];
    const cost = t.kind === "samurai" ? p.emperor.ps : p.emperor.pn;
    p.hp -= cost;
    this.hpEvent(pi, cost, "御·庇护", p.hp, false);
    p.purgeUsed = true;
    for (const s of ["blade", "armor", "mount"]) if (t.eq[s]) { this.state.discard.push({ type: s, card: t.eq[s] }); t.eq[s] = null; }
    t.extraAtk = 0; t.extraDef = 0; t.purged = true;
    t.hist = t.hist || [];
    t.hist.push({ t: this.state.turnNo, src: "御·庇护", desc: "增幅归零（装备弃置、特效失效）" });
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
    this.castleL4OnUnitEnter(pi, u);
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
    this.state.discard.push({ type: sac.kind, card: sac.card });
    this.castleL4OnUnitGone(sac);
    const u = this.newUnit(pi, c.type, c.card);
    p.field.push(u);
    this.castleL4OnUnitEnter(pi, u);
    p.graceCnt = 0;
    p.summonedDaimyoOrNoble = true;
    if (UI.unitEnter) UI.unitEnter(u.uid);
    this.log(`${p.name} 献祭【${sac.card.name}】召唤 ${KIND_CN[c.type]}【${c.card.name}】`, p.isAI ? "ai" : "me", c);
    UI.renderAll();
    return true;
  },

  /* 恩典召唤：连续3回合未召公卿/大名 → 特殊召唤 */
  canGrace(p) { return p.graceCnt >= 3 && (p.hand.some(c => c.type === "daimyo") || p.hand.some(c => c.type === "noble")); },
  graceSummon(pi, hi) {
    const p = this.state.players[pi];
    const c = p.hand[hi];
    if (c.type !== "daimyo" && c.type !== "noble") return false;
    if (p.graceCnt < 3) return false;
    if (p.field.length >= 5) return false;
    p.hand.splice(hi, 1);
    const gu = this.newUnit(pi, c.type, c.card);
    p.field.push(gu);
    this.castleL4OnUnitEnter(pi, gu);
    p.graceCnt = 0;
    p.summonedDaimyoOrNoble = true;
    if (UI.unitEnter) UI.unitEnter(gu.uid);
    this.log(`✨ 恩典召唤！${p.name} 特殊召唤 ${KIND_CN[c.type]}【${c.card.name}】（无需献祭）`, p.isAI ? "ai" : "me", c);
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

  newUnit(pi, kind, card) {
    return {
      uid: this.uid(), pi, kind, card,
      baseAtk: card.atk, baseDef: card.dfs,
      hp: kind === "daimyo" ? 20 : null, // 大名命值（替死10+本命10）
      eq: { blade: null, armor: null, mount: null },
      fx: card.fx || "", extraAtk: 0, extraDef: 0,
      summonedTurn: this.state.turnNo,
      alive: true, hist: [{ t: this.state.turnNo, src: "登场", desc: "召唤上场" }],
    };
  },

  /* 阶段三 · 使用事件/城池 */
  playZone(pi, hi) {
    const st = this.state;
    const p = st.players[pi];
    const c = p.hand[hi];
    if (c.type !== "process" && c.type !== "castle") return false;
    if (p.zoneUsed >= 1) { this.log("本回合已使用过事件/城池牌"); return false; }
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
      } else if (old.type === "process") {
        this.settleEvent(old); // 事件第五层 · 清算（X/Y）
      }
      this.log(`【${old.card.name}】被顶替下场（进入弃牌堆）`);
    }
    st.zone = { type: c.type, card: c.card, owner: pi, hist: [{ t: st.turnNo, src: "放置", desc: `${p.name} 放置 · 专属权：${p.name}`, owner: pi }] };
    if (c.type === "castle") {
      this.zHist(st.zone, "第一层·城威", `己方攻防 +${c.card.ao}／敌方 +${c.card.ap}；增幅一 ${c.card.amp1}、增幅二 ${c.card.amp2}`, pi);
      this.zHist(st.zone, "第二层·装备共鸣", c.card.tier === "大城" ? "己方兵刃 +50%／敌方兵刃 −30%" : "兵刃/装具可同时作用两位", pi);
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
      // 城池两种增幅（每张每局仅一次）：放置时一次性结算
      this.castleAmpOnce(pi, c);
      // 王城城盟：己方大名命值上限 +10（额外一次替死）
      if (c.card.tier === "王城") {
        for (const u of p.field) {
          if (u.kind === "daimyo" && u.hp < 30) {
            u.hp = Math.min(30, u.hp + 10);
            u.hist = u.hist || [];
            u.hist.push({ t: st.turnNo, src: "王城城盟", desc: "额外一次替死，命值 +10" });
            this.log(`🏰 王城城盟：大名【${u.card.name}】命值 +10（额外替死）→ ${u.hp}`);
          }
        }
      }
    } else {
      this.log(`${p.name} 放置事件【${c.card.name}】（第一层 己攻防+${c.card.a1o}/敌+${c.card.a1p}）`, p.isAI ? "ai" : "me", c);
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
      if (target.hp <= 0) this.win(st.players.indexOf(target) === 0 ? 0 : 1);
    };
    if (nX > 0) dodgeRoll(opp, nX, ownerP.name);
    if (nY > 0) dodgeRoll(ownerP, nY, opp.name);
  },

  /* 圣-10 丰玉姬化龙：己方大名直击对方将军（无法失效/阻挡），回合结束大名下场 */
  ryujinStrike(pi) {
    const st = this.state;
    const p = st.players[pi], opp = st.players[1 - pi];
    const u = p.field.find(x => x.kind === "daimyo" && (p._ryujinPending ? x.uid === p._ryujinPending : true));
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
    this.removeUnit(u);
    this.log(`🐉 丰玉姬化龙：己方【${u.card.name}】直击后下场`);
  },

  /* 王座更迭：双方从剩余将军牌池随机换将军（生命不变，原将军永久移出牌池） */
  swapShoguns() {
    const st = this.state;
    for (let pi = 0; pi < 2; pi++) {
      const q = st.players[pi];
      const taken = () => new Set(st.players.map(x => x.shogun.name));
      const discarded = () => new Set(st.discard.filter(d => d.type === "shogun").map(d => d.card.name));
      const t = taken(); const dd = discarded();
      const pool = CARDS.shoguns.filter(s => !t.has(s.name) && !dd.has(s.name));
      if (pool.length) {
        const old = q.shogun;
        st.discard.push({ type: "shogun", card: old });
        q.shogun = pool[Math.floor(Math.random() * pool.length)];
        this.log(`♻ 王座更迭：${q.name} 将军【${old.name}】下场，随机抽选【${q.shogun.name}】（生命 ${q.hp} 不变）`);
      }
    }
  },
  /* 单方更换天皇（随机剩余池，原天皇永久移出牌池） */
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
      q.emperor = pool[Math.floor(Math.random() * pool.length)];
      this.eHist(pi, "天皇换位", `原【${old.name}】下场，抽选【${q.emperor.name}】`);
      this.log(`👑 ${q.name} 天皇换位：随机抽取【${q.emperor.name}】`);
    } else this.log(`👑 ${q.name} 天皇换位：牌池已无可抽天皇`);
  },

  /* 装备 */
  equip(pi, hi, targetUid) {
    const p = this.state.players[pi];
    const c = p.hand[hi];
    const u = p.field.find(x => x.uid === targetUid);
    if (!u) { this.log("装备目标不存在，请重新选择"); return false; }
    if (c.type === "blade" && (u.kind !== "daimyo" && u.kind !== "samurai")) { this.log("兵刃只能装备大名/武士"); return false; }
    if (c.type === "armor" && (u.kind !== "daimyo" && u.kind !== "noble")) { this.log("装具只能装备大名/公卿"); return false; }
    if (c.type === "mount" && (u.kind !== "noble" && u.kind !== "samurai")) { this.log("骑具只能装备公卿/武士"); return false; }
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
    this.castleL4OnUnitEnter(pi, u);
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
    const entry = { card: c.card, tgt: {} };
    // 第一~三层指定目标（自动选择当前场上的对应类型单位，下场后可重指）
    const pick = kind => { const u = emp.field.find(x => x.kind === kind); return u ? u.uid : null; };
    entry.tgt.samurai = pick("samurai");
    entry.tgt.noble = pick("noble");
    entry.tgt.daimyo = pick("daimyo");
    emp.treasure.push(entry);
    // 宝物目标单位攻防记录
    const markTgt = (kind, v, isDef) => {
      const u = emp.field.find(x => x.uid === entry.tgt[kind]);
      if (u) {
        u.hist = u.hist || [];
        u.hist.push({ t: st.turnNo, src: "宝物·" + KIND_CN[kind], desc: `【${c.card.name}】：${isDef ? "防御" : "攻击"} +${v}` });
      }
    };
    if (entry.tgt.samurai) markTgt("samurai", c.card.s1, true);
    if (entry.tgt.noble) markTgt("noble", c.card.n1, false);
    if (entry.tgt.daimyo) { const u = emp.field.find(x => x.uid === entry.tgt.daimyo); if (u) { u.hist = u.hist || []; u.hist.push({ t: st.turnNo, src: "宝物·大名", desc: `【${c.card.name}】：攻击与防御 +${c.card.d1}` }); } }
    // 宝物第一~三层施展对象记录
    {
      const tgtName = (kind) => { const u = emp.field.find(x => x.uid === entry.tgt[kind]); return u ? u.card.name : "（无目标）"; };
      const parts = [];
      if (entry.tgt.samurai) parts.push(`武士【${tgtName("samurai")}】 防御 +${c.card.s1}`);
      if (entry.tgt.noble) parts.push(`公卿【${tgtName("noble")}】 攻击 +${c.card.n1}`);
      if (entry.tgt.daimyo) parts.push(`大名【${tgtName("daimyo")}】 攻防 +${c.card.d1}`);
      if (parts.length) this.eHist(targetEmperorPi, "宝物施展·一~三层", `【${c.card.name}】→ ${parts.join("；")}`);
    }
    // 第五层·上场：emp 一方一位单位攻击 +1
    if (emp.field.length) {
      emp.field[0].extraAtk = (emp.field[0].extraAtk || 0) + 1;
      emp.field[0].hist = emp.field[0].hist || [];
      emp.field[0].hist.push({ t: st.turnNo, src: "宝物·上场", desc: `【${c.card.name}】：攻击 +1` });
    }
    // 第四层·登场必发（威压/苦肉，视角=天皇持有者 emp；整局每张限 3 次）
    const opp = st.players[1 - targetEmperorPi];
    const l4Used = (st.l4Used[c.card.id] || 0);
    if (l4Used >= 3) {
      this.log(`宝物【${c.card.name}】第四层已发动 3 次（本局限 3 次），本次登场不再结算`);
    } else if (c.card.l4 === "苦肉" && emp.hp < opp.hp) {
      st.l4Used[c.card.id] = l4Used + 1;
      const dmg = Math.floor((opp.hp - emp.hp) / 2);
      this.eHist(targetEmperorPi, "宝物施展·第四层苦肉", `施展对象：${emp.name} 将军（差值 ${dmg} 伤害判定）`);
      if (Math.random() * 100 > this.effDodge(1)) { emp.hp -= dmg; this.hpEvent(1, dmg, "宝物苦肉", emp.hp); this.log(`宝物【${c.card.name}】苦肉：${emp.name} 将军 −${dmg} → ${emp.hp}`); }
      else this.log(`宝物【${c.card.name}】苦肉：${emp.name} 将军躲避成功`);
    } else if (c.card.l4 === "威压" && emp.hp > opp.hp) {
      st.l4Used[c.card.id] = l4Used + 1;
      const dmg = Math.floor((emp.hp - opp.hp) / 2);
      this.eHist(targetEmperorPi, "宝物施展·第四层威压", `施展对象：${opp.name} 将军（差值 ${dmg} 伤害判定）`);
      if (Math.random() * 100 > this.effDodge(1 - pi)) {
        opp.hp -= dmg; this.hpEvent(1 - pi, dmg, "宝物威压", opp.hp); this.log(`宝物【${c.card.name}】威压：对方将军 −${dmg} → ${opp.hp}`);
        if (opp.hp <= 0) { this.win(targetEmperorPi); return true; }
      } else this.log(`宝物【${c.card.name}】威压：对方躲避成功`);
    } else if (c.card.l4 && l4Used < 3) {
      this.log(`宝物【${c.card.name}】第四层【${c.card.l4}】：条件未满足（${c.card.l4 === "威压" ? "己方将军未高于对方" : "己方将军未低于对方"}），本次不发动`);
    }
    this.eHist(targetEmperorPi, "装备宝物", `【${c.card.name}】装备于${targetEmperorPi === pi ? "己方" : "对方"}天皇`);
    if (UI.flashEmperor) UI.flashEmperor(targetEmperorPi);
    if (UI.effectBurst) UI.effectBurst(targetEmperorPi);
    this.log(`${p.name} 将宝物【${c.card.name}】装备于${targetEmperorPi === pi ? "己方" : "对方"}天皇（${emp.treasure.length}/2）`);
    if (emp.treasure.length >= 2) this.log(`⚠ ${emp.name} 天皇已满 2 张宝物——本回合结束时将更换天皇！`);
    UI.renderAll();
    return true;
  },

  /* 宝物第五层 · 下场：己方一位单位防御 +1 */
  treasureDownEffect(pi, reason) {
    const q = this.state.players[pi];
    const down = q.field[0];
    if (!down) return;
    down.extraDef = (down.extraDef || 0) + 1;
    down.hist = down.hist || [];
    down.hist.push({ t: this.state.turnNo, src: "宝物下场", desc: reason + "弃宝物，防御 +1" });
    this.log(`💎 宝物第五层·下场（${reason}）：己方【${down.card.name}】防御 +1`);
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

  /* 圣迹/灾厄（使用后按第一层消解处理；仅当第一层实际消解了一次敌方攻击才付禁攻代价） */
  useEvent(pi, hi, asNegate) {
    const st = this.state;
    const p = st.players[pi];
    const c = p.hand[hi];
    let canceled = false; // 被对方抵消 → 禁攻代价回滚
    if (c.type !== "sacred" && c.type !== "calamity") return false;
    asNegate = !!asNegate; // 第一层是否实际生效（消解了一次敌方攻击）
    p.hand.splice(hi, 1);
    this.state.discard.push(c);
    const opp = this.state.players[1 - pi];
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
            if (use) { cancel(); }
            else {
              this.simpleEventEffect(pi, c);
              if (asNegate) {
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
    // 灾厄抵消圣迹：使用圣迹时，被影响方手上有灾厄可选择抵消（两张进弃牌堆，均不生效）
    if (c.type === "sacred" && proceed) {
      const cIdx = opp.hand.findIndex(x => x.type === "calamity");
      if (cIdx >= 0) {
        const cancel = () => {
          canceled = true;
          const cc = opp.hand.splice(cIdx, 1)[0];
          this.state.discard.push(cc);
          this.log(`💀 ${opp.name} 使用灾厄【${cc.card.name}】抵消圣迹【${c.card.name}】！两张牌进入弃牌堆，圣迹不生效，禁攻代价回滚`, opp.isAI ? "ai" : "me", cc);
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
            if (use) { cancel(); }
            else {
              this.simpleEventEffect(pi, c);
              if (asNegate) {
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
    if (proceed) this.simpleEventEffect(pi, c);
    if (!canceled && asNegate) {
      p.noAtkUntil = this.state.turnNo + 2; // 本回合及下一己方回合不能攻击
      this.log(`⚠ ${p.name} 本回合及下一回合不能攻击（${TYPE_CN[c.type]}第一层代价）`);
    }
    UI.renderAll();
    return true;
  },

  simpleEventEffect(pi, c) {
    const st = this.state;
    const p = this.state.players[pi];
    const opp = this.state.players[1 - pi];
    // 灾厄第二层 · 灾殃：对方拥有 X 类型单位 → 对方将军受其攻击值总和伤害，己方受一半（反噬）
    if (c.type === "calamity" && c.card.x) {
      const KM = { 武士: "samurai", 公卿: "noble", 大名: "daimyo" };
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
          p.hp -= back;
          this.hpEvent(pi, back, "灾殃反噬", p.hp);
          this.log(`💀 灾殃反噬：己方将军 −${back} → ${p.hp}`);
        }
      } else this.log(`灾殃：对方场上无 ${KIND_CN[X]} 类型单位，未触发`);
    }
    const fx = c.card.fx || c.card.l4 || "";
    if (fx.includes("恢复") || fx.includes("生命值的一半") || fx.includes("已失去生命")) {
      const heal = Math.floor(((p.maxHp || 100) - p.hp) / 2);
      p.hp = Math.min(p.maxHp || 100, p.hp + heal);
      this.log(`${p.name} 将军恢复 ${heal} 点生命 → ${p.hp}`);
    } else if (fx.includes("弃牌堆") && fx.includes("洗回")) {
      while (this.state.discard.length) this.state.deck.push(this.state.discard.pop());
      this.log(`弃牌堆全部洗回卡组（${this.state.deck.length} 张）`);
    } else if (fx.includes("负面") || fx.includes("负面影响")) {
      this.log(`清除${p.name}将军与天皇的负面影响`);
    } else if (c.type === "calamity" && fx.includes("摧毁城池")) {
      if (this.state.zone && this.state.zone.type === "castle") { this.zHist(this.state.zone, "被摧毁", "灾厄效果"); this.log(`城池【${this.state.zone.card.name}】被摧毁！`); this.state.discard.push(this.state.zone); this.state.zone = null; }
    } else if (c.type === "calamity" && fx.includes("摧毁事件")) {
      if (this.state.zone && this.state.zone.type === "process") { this.zHist(this.state.zone, "被摧毁", "灾厄效果"); this.log(`事件【${this.state.zone.card.name}】被摧毁！`); this.state.discard.push(this.state.zone); this.state.zone = null; }
    } else if (c.type === "calamity" && fx.includes("骑具")) {
      let n = 0;
      for (const q of this.state.players) for (const u of q.field) if (u.eq.mount) { u.eq.mount = null; n++; }
      this.log(`摧毁双方骑具 ${n} 件`);
    } else if (c.type === "calamity" && fx.includes("兵刃") && fx.includes("装具")) {
      let n = 0;
      for (const q of this.state.players) for (const u of q.field) if (u.eq.blade || u.eq.armor) { u.eq.blade = null; u.eq.armor = null; n++; }
      this.log(`摧毁双方兵刃与装具 ${n} 件`);
    } else if (c.type === "calamity" && fx.includes("减半")) {
      opp.hp = Math.floor(opp.hp / 2);
      this.log(`【${c.card.name}】对方将军生命减半 → ${opp.hp}`);
      if (opp.hp <= 0) this.win(pi);
    } else if (fx.includes("献祭一位武士") && fx.includes("大名")) {
      // 圣-04 大国主神：献祭武士 → 弃牌堆召唤大名
      const sacIdx = p.field.findIndex(u => u.kind === "samurai");
      const pool = st.discard.findIndex(d => d.type === "daimyo");
      if (sacIdx >= 0 && pool >= 0) {
        const sac = p.field[sacIdx];
        st.discard.push({ type: "samurai", card: sac.card });
        p.field.splice(sacIdx, 1);
        const d = st.discard.splice(pool, 1)[0];
        const u = this.newUnit(pi, "daimyo", d.card);
        p.field.push(u);
        this.castleL4OnUnitEnter(pi, u);
        this.log(`⚡ 神迹【${c.card.name}】：献祭武士【${sac.card.name}】，从弃牌堆复活大名【${u.card.name}】`);
        if (UI.unitEnter) UI.unitEnter(u.uid);
      } else this.log(`神迹【${c.card.name}】条件不足（需场上有武士且弃牌堆有大名）`);
    } else if (fx.includes("献祭一位武士") && fx.includes("公卿")) {
      // 圣-07 诹访明神：献祭武士 → 弃牌堆召唤公卿
      const sacIdx = p.field.findIndex(u => u.kind === "samurai");
      const pool = st.discard.findIndex(d => d.type === "noble");
      if (sacIdx >= 0 && pool >= 0) {
        const sac = p.field[sacIdx];
        st.discard.push({ type: "samurai", card: sac.card });
        p.field.splice(sacIdx, 1);
        const d = st.discard.splice(pool, 1)[0];
        const u = this.newUnit(pi, "noble", d.card);
        p.field.push(u);
        this.castleL4OnUnitEnter(pi, u);
        this.log(`⚡ 神迹【${c.card.name}】：献祭武士【${sac.card.name}】，从弃牌堆复活公卿【${u.card.name}】`);
        if (UI.unitEnter) UI.unitEnter(u.uid);
      } else this.log(`神迹【${c.card.name}】条件不足（需场上有武士且弃牌堆有公卿）`);
    } else if (fx.includes("随机获得一张宝物牌")) {
      // 圣-03 须佐之男：随机宝物效果装备于战场单位
      if (CARDS.treasure.length) {
        const tr = CARDS.treasure[Math.floor(Math.random() * CARDS.treasure.length)];
        const target = p.field[0];
        if (target) {
          const bonus = target.kind === "samurai" ? tr.s1 : target.kind === "noble" ? tr.n1 : tr.d1;
          if (target.kind === "samurai") target.baseDef += bonus;
          else if (target.kind === "noble") target.baseAtk += bonus;
          else { target.baseAtk += bonus; target.baseDef += bonus; }
          target.hist = target.hist || [];
          target.hist.push({ t: st.turnNo, src: "神迹·宝物", desc: `随机宝物【${tr.name}】加成 +${bonus}` });
          this.log(`⚡ 神迹【${c.card.name}】：随机宝物【${tr.name}】装备于【${target.card.name}】（+${bonus}）`);
        }
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
    } else if (fx.includes("更换天皇牌") && fx.includes("将军牌")) {
      // 灾-05 王座更迭：双方三类型俱全 → 双方换将军牌
      const both = st.players.every(q => ["samurai", "noble", "daimyo"].every(k => q.field.some(u => u.kind === k)));
      if (both) { this.swapShoguns(); }
      else this.log(`王座更迭条件不足：需双方武士/公卿/大名俱全`);
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
    } else if (fx.includes("更换天皇牌或将军牌")) {
      // 圣-09 八咫乌：简化——双方各随机换天皇
      for (const q of st.players) this.swapEmperor(st.players.indexOf(q));
      this.log(`八咫乌引路：双方各自更换天皇牌`);
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
    let bypassUsed = false;
    if (!this.canAttack(p)) { this.log("本回合不能攻击！"); return false; }
    const u = p.field.find(x => x.uid === attackerUid);
    if (!u) { this.log("单位不存在"); return false; }
    // 每类型每回合仅一位发动攻击（防御方单位可被对方数张卡攻击直到下场）
    if (p.typeAtk && p.typeAtk[u.kind]) { this.log(`本回合 ${KIND_CN[u.kind]} 已发动过攻击（每类型仅一位）`); return false; }
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
      bypassUsed = true;
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
          const lethal = t.kind === "daimyo" ? t.hp <= s.atk
            : t.kind === "samurai" ? ts.def <= s.atk : ts.atk <= s.atk;
          if (lethal) {
            const used = ai.hand[negI];
            this.useEvent(1, negI, true); // 第一层消解生效 → 禁攻代价
            this.log(`🛡 电脑使用【${TYPE_CN[used.type]}】${used.card.name} 消解了【${u.card.name}】的攻击！`);
            this.afterAttack(p, u, t);
            // 第一层消解抵消后：撤销攻击方该类型禁令，该类型重新获得一次攻击
            delete p.typeAtk[u.kind];
            UI.renderAll();
            return true;
          }
        }
      }
    }

    if (UI.shakeUnit) UI.shakeUnit(u.uid);
    if (target === "shogun") {
      if (!bypass && !this.canAttackShogun(1 - pi)) { this.log("对方仍有单位，不能直接攻击将军（可用破阵越级）"); return false; }
      const d = Math.random() * 100;
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
      this.afterAttack(p, u, t);
      UI.renderAll();
      return true;
    }
    // 骑具躲避
    const td = this.unitDodge(t);
    if (td > 0 && Math.random() * 100 <= td) {
      this.log(`【${t.card.name}】骑具躲避成功（${td}%）！攻击无效`);
      this.afterAttack(p, u, t);
      return true;
    }
    const ts = this.unitStats(t);
    // 必定命中：攻击值点伤害
    const dmg = s.atk;
    if (t.kind === "daimyo") {
      const remain = t.hp - dmg;
      if (remain <= 0) {
        const diePath = () => {
          const overflow = Math.max(0, dmg - t.hp);
          t.alive = false; t.defeated = true;
          t.hist = t.hist || [];
          t.hist.push({ t: this.state.turnNo, src: "击破", desc: `被【${u.card.name}】攻${s.atk} 击破（命值 ${t.hp}→${remain}，溢出 ${overflow}）` });
          this.log(`【${u.card.name}】（攻${s.atk}）击破大名【${t.card.name}】（命值 ${t.hp}→${remain}）！`);
          this.overflowToShogun(1 - pi, overflow);
          this.removeUnit(t);
        };
        const cs = this.castleSacrificeFlow(1 - pi, t, diePath); // 公卿城池加成替死（弹窗/自动）
        if (cs === "pending") return true;
        if (cs === true) { this.afterAttack(p, u, t); UI.renderAll(); return true; }
        diePath();
      } else {
        t.hp = remain;
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 命中，命值 ${t.hp + dmg}→${t.hp}` });
        this.log(`【${u.card.name}】（攻${s.atk}）命中大名【${t.card.name}】命值 ${t.hp + dmg}→${t.hp}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, dmg);
      }
    } else if (t.kind === "samurai") {
      const remain = ts.def - dmg;
      if (remain <= 0) {
        const diePath = () => {
          const overflow = Math.max(0, dmg - ts.def);
          t.hist = t.hist || [];
          t.hist.push({ t: this.state.turnNo, src: "击破", desc: `被【${u.card.name}】攻${s.atk} 击破（防${ts.def}，溢出 ${overflow}）` });
          this.log(`【${u.card.name}】（攻${s.atk}）击破武士【${t.card.name}】（防${ts.def}）！`);
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
      } else {
        const auraDef = ts.def - ts.rawDef;
        t.baseDef = remain - auraDef - (t.extraDef || 0);
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 命中，防 ${ts.def}→${remain}` });
        this.log(`【${u.card.name}】（攻${s.atk}）命中武士【${t.card.name}】防 ${ts.def}→${remain}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, dmg);
        // 坚守：被攻击未击破 → 防+1
        if (t.fx.includes("坚守")) { t.baseDef += 1; t.hist.push({ t: this.state.turnNo, src: "坚守", desc: "被攻击未击破，防御 +1" }); this.log(`【${t.card.name}】坚守 +1 防御`); }
      }
    } else if (t.kind === "noble") {
      const remain = ts.atk - dmg;
      if (remain <= 0) {
        const diePath = () => {
          const overflow = Math.max(0, dmg - ts.atk);
          t.hist = t.hist || [];
          t.hist.push({ t: this.state.turnNo, src: "击破", desc: `被【${u.card.name}】攻${s.atk} 击破（攻${ts.atk}，溢出 ${overflow}）` });
          this.log(`【${u.card.name}】（攻${s.atk}）击破公卿【${t.card.name}】（攻${ts.atk}）！`);
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
      } else {
        const auraAtk = ts.atk - ts.rawAtk;
        t.baseAtk = remain - auraAtk - (t.extraAtk || 0);
        t.hist = t.hist || [];
        t.hist.push({ t: this.state.turnNo, src: "受击", desc: `被【${u.card.name}】攻${s.atk} 命中，攻 ${ts.atk}→${remain}` });
        this.log(`【${u.card.name}】（攻${s.atk}）命中公卿【${t.card.name}】攻 ${ts.atk}→${remain}`);
        if (UI.floatDamage) UI.floatDamage(t.uid, dmg);
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
      const w = defP.field.find(x => x.kind === "samurai");
      if (!w) return null;
      return { ok: true, kind: 2, noble, w, desc: `弃置武士【${w.card.name}】，公卿【${t.card.name}】存活` };
    }
    if (own && tier === "大城" && c.includes("③") && t.kind === "samurai") {
      if (!t.eq.blade && !t.eq.mount) return null;
      return { ok: true, kind: 3, noble, desc: `弃置${t.eq.blade ? "兵刃" : "骑具"}，武士【${t.card.name}】存活` };
    }
    if (!own && tier === "王城" && c.includes("④") && (t.kind === "daimyo" || t.kind === "noble")) {
      if (!t.eq.blade && !t.eq.armor && !t.eq.mount) return null;
      return { ok: true, kind: 4, noble, desc: `弃置装备，${KIND_CN2[t.kind]}【${t.card.name}】存活（攻防减半）` };
    }
    if (!own && tier === "名城" && c.includes("⑤") && t.kind === "samurai") {
      if (!t.eq.blade && !t.eq.mount) return null;
      return { ok: true, kind: 5, noble, desc: `弃置装备，武士【${t.card.name}】存活（数值减半）` };
    }
    if (!own && tier === "大城" && c.includes("⑥") && t.kind === "noble") {
      if (defP.hp <= 10) return null;
      return { ok: true, kind: 6, noble, desc: `扣将军 10 生命，公卿【${t.card.name}】存活` };
    }
    return null;
  },
  /* 执行公卿城池加成替死（info 由 castleSacrificeInfo 提供） */
  doCastleSacrifice(defPi, t, info) {
    const st = this.state;
    const defP = st.players[defPi];
    const noble = info.noble;
    const sacLog = (desc) => {
      t.hist = t.hist || [];
      t.hist.push({ t: st.turnNo, src: "公卿城池加成", desc });
      this.log(`🏰 公卿【${noble.card.name}】城池加成：${desc}`);
    };
    if (info.kind === 1) {
      const i = defP.field.indexOf(noble);
      if (i >= 0) defP.field.splice(i, 1);
      sacLog(info.desc);
      return true;
    }
    if (info.kind === 2) {
      const i = defP.field.indexOf(info.w);
      if (i >= 0) defP.field.splice(i, 1);
      sacLog(info.desc);
      return true;
    }
    if (info.kind === 3) {
      const slot = t.eq.blade ? "blade" : "mount";
      st.discard.push({ type: slot, card: t.eq[slot] });
      t.eq[slot] = null;
      t.hist = t.hist || [];
      t.hist.push({ t: st.turnNo, src: "公卿城池加成", desc: `弃置${TYPE_CN[slot]}替死` });
      sacLog(info.desc);
      return true;
    }
    if (info.kind === 4 || info.kind === 5) {
      const slot = t.eq.blade ? "blade" : t.eq.armor ? "armor" : "mount";
      st.discard.push({ type: slot, card: t.eq[slot] });
      t.eq[slot] = null;
      t.baseAtk = Math.max(1, Math.ceil(t.baseAtk / 2));
      t.baseDef = Math.max(1, Math.ceil(t.baseDef / 2));
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
  /* 替死流程：防守方是玩家 → 弹窗选择；是 AI → 自动判定（单位价值高或损失小时使用） */
  castleSacrificeFlow(defPi, t, diePath) {
    const info = this.castleSacrificeInfo(defPi, t);
    if (!info) return false;
    const st = this.state;
    const useIt = () => { this.doCastleSacrifice(defPi, t, info); UI.renderAll(); return true; };
    if (defPi === 0) {
      // 玩家：弹窗选择
      st.prompting = true;
      UI.askCastleSacrifice(info, (use) => {
        st.prompting = false;
        if (use) { this.doCastleSacrifice(defPi, t, info); UI.renderAll(); }
        else { diePath(); UI.renderAll(); }
      });
      return "pending";
    }
    // AI：自动判定——⑥ 扣血较多（hp 充裕才用）；其余损失小（弃公卿/武士/装备）价值划算时用
    if (info.kind === 6) return st.players[1].hp > 30 ? useIt() : false;
    return useIt();
  },

  /* 城池两种增幅（每张每局仅一次）：放置时一次性结算 */
  castleAmpOnce(pi, c) {
    const st = this.state;
    const p = st.players[pi];
    const KM = { 大名: "daimyo", 公卿: "noble", 武士: "samurai" };
    const m1 = (c.card.amp1 || "").match(/(将军生命|大名|公卿|武士)\s*\+?(\d+)/);
    if (m1) {
      const N = parseInt(m1[2]);
      if (m1[1] === "将军生命") {
        p.hp = Math.min(p.maxHp || 100, p.hp + N);
        this.hpEvent(pi, -N, "城池增幅", p.hp);
        this.log(`🏯 城池【${c.card.name}】增幅一（每局一次）：将军生命 +${N} → ${p.hp}`);
      } else {
        const kind = KM[m1[1]];
        let n = 0;
        for (const u of p.field) if (u.kind === kind) {
          u.baseAtk += N; u.baseDef += N;
          u.hist = u.hist || [];
          u.hist.push({ t: st.turnNo, src: "城池增幅一", desc: `每局一次：${m1[1]}攻防 +${N}` });
          n++;
        }
        this.log(`🏯 城池【${c.card.name}】增幅一（每局一次）：己方${m1[1]} ${n} 张攻防各 +${N}`);
      }
    }
    const m2 = (c.card.amp2 || "").match(/(兵刃|装具)\s*\+?(\d+)/);
    if (m2) {
      const N = parseInt(m2[2]);
      if (m2[1] === "兵刃") {
        for (const u of p.field) if (u.eq.blade) {
          u.baseAtk += N;
          u.hist = u.hist || [];
          u.hist.push({ t: st.turnNo, src: "城池增幅二", desc: `每局一次：兵刃攻击 +${N}` });
        }
      } else {
        for (const u of p.field) if (u.eq.armor) {
          u.baseDef += N;
          u.hist = u.hist || [];
          u.hist.push({ t: st.turnNo, src: "城池增幅二", desc: `每局一次：装具防御 +${N}` });
        }
      }
      this.log(`🏯 城池【${c.card.name}】增幅二（每局一次）：己方${m2[1]}数值 +${N}`);
    }
  },

  /* 城池第四层 · 兴衰损益：己方大名/公卿下场 → 对方将军 −a/−b */
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
  castleL4OnUnitEnter(pi, u) {
    const st = this.state;
    const z = st.zone;
    if (!z || z.type !== "castle" || z.owner !== 1 - pi) return;
    if (u.kind !== "daimyo" && u.kind !== "noble") return;
    const nums = (z.card.l4 || "").split("／").map(s => { const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : 0; });
    if (nums.length < 4) return;
    const n = u.kind === "daimyo" ? nums[2] : nums[3];
    if (n <= 0) return;
    const me = st.players[z.owner];
    me.hp = Math.min(me.maxHp || 100, me.hp + n);
    this.hpEvent(z.owner, -n, "兴衰·敌" + (u.kind === "daimyo" ? "大名" : "公卿") + "上场", me.hp);
    this.zHist(z, "第四层·兴衰损益", `施展对象：己方将军 +${n}（对方${KIND_CN[u.kind]}【${u.card.name}】上场）`, z.owner);
    this.log(`🏯 城池【${z.card.name}】兴衰损益：对方${KIND_CN[u.kind]}【${u.card.name}】上场，己方将军 +${n} → ${me.hp}`);
  },

  removeUnit(u) {
    const p = this.state.players[u.pi];
    const i = p.field.indexOf(u);
    if (i >= 0) {
      const card = { type: u.kind === "samurai" ? "samurai" : u.kind === "daimyo" ? "daimyo" : "noble", card: u.card };
      this.state.discard.push(card);
      if (UI.flashDiscard) UI.flashDiscard();
      p.field.splice(i, 1);
      this.castleL4OnUnitGone(u);
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

  afterAttack(p, u, target) {
    const st = this.state;
    const pi = st.players.indexOf(p);
    // 战意：攻击后攻击+1
    if (u.fx.includes("战意")) {
      u.extraAtk = (u.extraAtk || 0) + 1;
      u.hist = u.hist || [];
      u.hist.push({ t: st.turnNo, src: "战意", desc: "攻击后攻击 +1" });
    }
    // 事件第三层 · 敌攻：对方公卿攻击后，事件方选一单位攻击 +1
    const zz = st.zone;
    if (zz && zz.type === "process" && zz.owner === 1 - pi && u.kind === "noble") {
      const cand = st.players[1 - pi].field.find(x => x.pi === 1 - pi);
      if (cand) {
        cand.extraAtk = (cand.extraAtk || 0) + 1;
        cand.hist = cand.hist || [];
        cand.hist.push({ t: st.turnNo, src: "战火·敌攻", desc: "对方公卿攻击，攻击 +1" });
        this.zHist(zz, "第三层·战火磨砺·敌攻", `施展对象：【${cand.card.name}】攻击 +1（因对方公卿【${u.card.name}】攻击）`, zz.owner);
        this.log(`🔥 事件【${zz.card.name}】战火磨砺·敌攻：对方公卿【${u.card.name}】攻击，己方【${cand.card.name}】攻击 +1`);
      }
    }
    // 事件第三层 · 我攻：己方单位攻击后，对方选一单位攻击值或防御值 +1（二选一）
    if (zz && zz.type === "process" && zz.owner === pi) {
      const cand = st.players[1 - pi].field.find(x => x.pi === 1 - pi);
      if (cand) {
        if (Math.random() < 0.5) {
          cand.extraAtk = (cand.extraAtk || 0) + 1;
          cand.hist = cand.hist || [];
          cand.hist.push({ t: st.turnNo, src: "战火·我攻", desc: "对方单位攻击，攻击 +1" });
          this.zHist(zz, "第三层·战火磨砺·我攻", `施展对象：【${cand.card.name}】攻击 +1（因己方【${u.card.name}】攻击）`, zz.owner);
          this.log(`🔥 事件【${zz.card.name}】战火磨砺·我攻：己方【${u.card.name}】攻击，对方【${cand.card.name}】攻击 +1`);
        } else {
          cand.extraDef = (cand.extraDef || 0) + 1;
          cand.hist = cand.hist || [];
          cand.hist.push({ t: st.turnNo, src: "战火·我攻", desc: "对方单位攻击，防御 +1" });
          this.zHist(zz, "第三层·战火磨砺·我攻", `施展对象：【${cand.card.name}】防御 +1（因己方【${u.card.name}】攻击）`, zz.owner);
          this.log(`🔥 事件【${zz.card.name}】战火磨砺·我攻：己方【${u.card.name}】攻击，对方【${cand.card.name}】防御 +1`);
        }
      }
    }
    u.attackedThisTurn = true;
    p.typeAtk[u.kind] = true; // 每类型每回合仅一位发动攻击
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
        }
      }
      st._diluEnd = [];
    }
    // 天皇满 2 张宝物 → 回合末换天皇
    this.checkEmperorSwap();
    st.cur = 1 - st.cur;
    st.turnNo++;
    UI.renderAll();
    this.beginTurn();
  },

  win(pi) {
    const st = this.state;
    st.winner = pi;
    this.save();
    this.log(`🏆 ${st.players[pi].name} 获胜！`, pi === 0 ? "me" : "ai");
    UI.showModal("对战结束", `<div style="font-size:22px;text-align:center;color:#ffd700">${st.players[pi].name} 获胜！</div>
      <p style="text-align:center;margin:10px 0">点击下方重新开局</p>`,
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
    // 装备（逐个）
    for (const slot of ["blade", "mount", "armor"]) {
      const idx = p.hand.findIndex(c => c.type === slot);
      if (idx < 0) continue;
      const card = p.hand[idx];
      const elig = slot === "blade" ? (x => (x.kind === "daimyo" || x.kind === "samurai") && !x.eq.blade)
        : slot === "mount" ? (x => (x.kind === "samurai" || x.kind === "noble") && !x.eq.mount)
        : (x => (x.kind === "daimyo" || x.kind === "noble") && !x.eq.armor);
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

  /* AI 主动使用圣迹/灾厄（有利时机） */
  aiUseEvents() {
    const p = this.state.players[1];
    const opp = this.state.players[0];
    const z = this.state.zone;
    const hasEq = (slot) => opp.field.some(u => u.eq[slot]);
    for (let i = 0; i < p.hand.length; i++) {
      const c = p.hand[i];
      if (c.type === "calamity") {
        const fx = c.card.l4 || "";
        if (fx.includes("摧毁城池") && z && z.type === "castle") { this.useEvent(1, i); return; }
        if (fx.includes("摧毁事件") && z && z.type === "process") { this.useEvent(1, i); return; }
        if (fx.includes("骑具") && hasEq("mount")) { this.useEvent(1, i); return; }
        if (fx.includes("兵刃") && fx.includes("装具") && (hasEq("blade") || hasEq("armor"))) { this.useEvent(1, i); return; }
        if (fx.includes("减半") && opp.hp < p.hp) { this.useEvent(1, i); return; }
      } else if (c.type === "sacred") {
        const fx = c.card.fx || "";
        if (fx.includes("弃牌堆") && fx.includes("洗回") && this.state.deck.length < 10) { this.useEvent(1, i); return; }
        if (fx.includes("恢复") && p.hp < 55) { this.useEvent(1, i); return; }
      }
    }
  },

  aiEquip() {
    const p = this.state.players[1];
    const bl = p.hand.findIndex(c => c.type === "blade");
    if (bl >= 0) {
      const u = p.field.find(x => x.kind === "daimyo" || x.kind === "samurai");
      if (u && !u.eq.blade) this.equip(1, bl, u.uid);
    }
    const mo = p.hand.findIndex(c => c.type === "mount");
    if (mo >= 0) {
      const u = p.field.find(x => (x.kind === "samurai" || x.kind === "noble") && !x.eq.mount);
      if (u) this.equip(1, mo, u.uid);
    }
    const ar = p.hand.findIndex(c => c.type === "armor");
    if (ar >= 0) {
      const u = p.field.find(x => (x.kind === "daimyo" || x.kind === "noble") && !x.eq.armor);
      if (u) this.equip(1, ar, u.uid);
    }
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
    if (idx >= att.length) { UI.renderAll(); this.endTurn(); return; }
    const u = att[idx];
    if (st.players[1].typeAtk[u.kind]) { setTimeout(() => this.aiAttackSeq(att, idx + 1), 3000); return; } // 每类型仅一位
    const layer = this.frontLayer(0);
    const target = layer ? [...layer].sort((a, b) => this.unitStats(a).def - this.unitStats(b).def)[0].uid : "shogun";
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
            this.log(`✨【${u.card.name}】的攻击被消解！`);
            // 第一层消解抵消后：撤销 AI 该类型禁令，该类型重新获得一次攻击
            delete st.players[1].typeAtk[u.kind];
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
