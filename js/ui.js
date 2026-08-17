/* ============================================================
   幕府争锋 · 界面渲染与交互
   ============================================================ */
"use strict";

/* ═══ 常置牌专属背景剪影（城池左下 / 事件右下）═══ */
const ZONE_BG = {
  // ---- 城池（10）----
  "京都": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M8 140V70h9v70z M30 140V70h9v70z M0 70h48v10H0z M12 54h8v16h-8z M26 54h8v16h-8z"/><path d="M150 140V88l22-16 22 16v52z M150 88h44v10h-44z M160 66h24v14h-24z M166 48h12v14h-12z M170 30h4v14h-4z"/><circle cx="205" cy="34" r="14"/><rect x="199" y="44" width="12" height="96"/></svg>`,
  "江户": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M0 140V20c30-6 60 0 84 12L84 140z M120 140V40l30 8 8 92z M120 40h38v10h-38z M132 22h14v10h-14z M128 8h22v10h-22z"/><path d="M200 140c0-40 20-70 40-90v90z"/><circle cx="196" cy="10" r="8"/></svg>`,
  "大阪": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M60 140V96l60-8v52z M120 88l60 8v44h-60z M86 96V74l34-6v28z M154 88V74l34 6v22z M100 60h40v16h-40z M108 42h24v14h-24z M112 26h16v12h-16z M116 10h8v12h-8z"/><circle cx="60" cy="26" r="10"/><circle cx="180" cy="26" r="10"/></svg>`,
  "名古屋": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M70 140V80l50-8v68z M120 72l50 8v60h-50z M92 80V58l28-4v26z M150 80v-26l28 4v22z M104 44h32v16h-32z M112 28h16v12h-16z M116 12h8v12h-8z"/><path d="M36 140V110h14v30z M36 98h14v12H36z M196 140V110h14v30z M190 98h14v12h-14z"/></svg>`,
  "奈良": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M30 140V110l30-6 30 6v30z M46 104l34-8 34 8-34 6z M70 92l20-6 20 6-20 8z M82 78l12-4 12 4-12 6z"/><path d="M190 140c-4-30-14-50-34-62 14-2 28-6 40-12v74z M186 70c4-10 12-16 24-18-8 0-14 4-20 10z M196 88c2-6 6-10 12-12-4 2-8 6-10 12z"/></svg>`,
  "镰仓": `<svg viewBox="0 0 240 140" fill="currentColor"><circle cx="120" cy="66" r="40"/><circle cx="120" cy="66" r="30"/><path d="M120 24c2 8 2 12 0 18-2-6-2-10 0-18z"/><path d="M30 140c10-26 30-40 60-42v42z M210 140c-10-26-30-40-60-42v42z M60 140c8-20 22-30 40-32v32z M180 140c-8-20-22-30-40-32v32z"/></svg>`,
  "横滨": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M120 140V20c8 6 12 14 12 24v96z M120 26h10v14h-10z M118 48h16v16h-16z M120 74h8v10h-8z"/><rect x="30" y="86" width="50" height="54"/><rect x="34" y="96" width="14" height="14"/><rect x="54" y="96" width="14" height="14"/><path d="M0 140h240v8H0z"/></svg>`,
  "仙台": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M96 140V86l24-8 24 8v54z M120 74l30 6v60h-30z M102 86V66l18-4v24z M138 86v-24l18 4v20z M114 56h12v12h-12z M118 40h8v10h-8z"/><path d="M40 140V60c16 6 24 18 24 36v44z M30 50c6-12 16-20 30-24-8 2-14 8-18 16z"/></svg>`,
  "神户": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M120 140C96 110 92 84 110 56c10-16 28-30 56-42-14 14-24 30-30 48-6 20-2 44 14 78h-30z M122 40h12v10h-12z M118 60h18v12h-18z M120 82h10v10h-10z"/><path d="M0 140h240v8H0z"/></svg>`,
  "川崎": `<svg viewBox="0 0 240 140" fill="currentColor"><rect x="30" y="70" width="26" height="70"/><rect x="70" y="54" width="22" height="86"/><rect x="106" y="66" width="20" height="74"/><rect x="34" y="58" width="8" height="12"/><rect x="74" y="42" width="7" height="12"/><rect x="110" y="54" width="6" height="12"/><path d="M0 130h240v10H0z M0 120h240v4H0z"/></svg>`,
  // ---- 事件（10）----
  "承久之乱": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M20 140V40h60v100z M30 60h40v12H30z M40 40h20v12H40z"/><path d="M150 140V60h60v80z M160 80h40v10h-40z"/><path d="M150 44l30-20 30 20z M150 44h60v6h-60z"/><circle cx="120" cy="20" r="8"/></svg>`,
  "蒙古袭来（文永·弘安之役）": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M20 96l40-24 20 12 40-28 30 18 24-10v60H20z M40 104h40v10H40z M110 100h50v10h-50z"/><path d="M60 30l6 26 12-24 10 28 8-30 10 22 6-20z M176 20l4 22 10-20 8 24 6-26 8 18 4-16z"/><path d="M0 130h240v10H0z"/></svg>`,
  "建武新政": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M40 140V50h70v90z M52 70h46v12H52z M60 50h24v12H60z"/><circle cx="130" cy="24" r="16"/><circle cx="130" cy="24" r="8"/><path d="M130 4v6 M130 38v6 M108 24h6 M146 24h6"/><path d="M170 140V40h50v100z M180 62h30v10h-30z M186 40h18v12h-18z"/></svg>`,
  "观应之扰乱": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M60 140V40l40 30v70z M60 40l-6-26 26 14z M60 46l-4 22 20-18z"/><path d="M180 140V40l-40 30v70z M180 40l6-26-26 14z M180 46l4 22-20-18z"/><path d="M90 90h60v8H90z"/></svg>`,
  "应仁之乱": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M20 140V80h30v60z M50 140V60h26v80z M76 140V90h28v50z M104 140V70h30v70z M134 140V84h26v56z M160 140V64h30v76z M190 140V88h30v52z"/><path d="M30 60l12-16 12 16z M60 40l14-20 14 20z M110 48l16-22 16 22z M170 42l14-18 14 18z"/><circle cx="60" cy="26" r="6"/><circle cx="120" cy="30" r="6"/><circle cx="180" cy="26" r="6"/></svg>`,
  "本能寺之变": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M90 140V90l30-8 30 8v50z M90 90h60v14H90z M104 70h32v14h-32z M112 52h16v14h-16z"/><path d="M60 100l10-18 10 18z M130 56l12-20 12 20z M180 84l10-16 10 16z M156 100l8-14 8 14z"/><circle cx="196" cy="36" r="8"/><circle cx="210" cy="20" r="5"/></svg>`,
  "长篠之战": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M30 140V100h20v40z M70 140V86h20v54z M110 140V96h20v44z M150 140V84h20v56z M190 140V100h20v40z"/><rect x="10" y="110" width="220" height="8"/><path d="M40 60l8 22 14-20 6 24 6-26 10 18 4-18z M150 46l6 20 12-18 5 22 6-24 8 16 3-16z"/><path d="M10 140h220v6H10z"/></svg>`,
  "关原之战": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M70 140V50l50 34v56z M70 50l-8-28 30 14z M70 58l-4 24 22-20z"/><path d="M170 140V50l-50 34v56z M170 50l8-28-30 14z M170 58l4 24-22-20z"/><rect x="30" y="120" width="180" height="20"/></svg>`,
  "大坂之阵": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M80 140V100l40-6v46z M120 94l40 6v40h-40z M96 100V80l24-4v24z M144 100v-24l24 4v20z M108 66h24v14h-24z M114 50h12v12h-12z"/><circle cx="36" cy="40" r="10"/><path d="M20 70l8-12 8 12z M190 60l10-16 10 16z"/><circle cx="204" cy="28" r="6"/></svg>`,
  "岛原之乱": `<svg viewBox="0 0 240 140" fill="currentColor"><path d="M60 140V86l40-8 40 8v54z M60 86h80v14H60z M84 66h32v14H84z M94 50h12v12h-12z"/><path d="M196 18v70h14V18z M196 18h14v14h-14z M186 14h34v22h-34z"/><path d="M0 130h240v10H0z"/></svg>`,
};

/* ═══ 事件专属画像（10 个事件各不相同，按史实主题设计）═══ */
const EVENT_EL = {
  "承久之乱": `<path d="M30 84 L38 46 L62 46 L70 84 Z" fill="$FG"/><path d="M44 46 L48 28 L52 28 L56 46 Z" fill="$FG"/><path d="M50 28 L54 16 L46 16 Z" fill="$AC"/><line x1="76" y1="14" x2="76" y2="84" stroke="$FG" stroke-width="2.5"/><path d="M76 16 L96 23 L76 32 Z" fill="$AC"/><circle cx="79" cy="24" r="2.4" fill="$FG"/>`,
  "蒙古袭来（文永·弘安之役）": `<path d="M22 62 L44 44 L56 50 L76 38 L88 62 Q54 78 22 62 Z" fill="$FG"/><path d="M28 72 L92 72 L86 67 L32 67 Z" fill="$FG" opacity=".55"/><line x1="44" y1="44" x2="36" y2="24" stroke="$FG" stroke-width="2.2"/><path d="M36 26 L22 20 L38 15 Z" fill="$AC"/><path d="M58 22 l3 11 6-9 4 13 3-15 8 9 2-11" stroke="$AC" stroke-width="1.6" fill="none"/><path d="M16 84 Q30 74 46 84" stroke="$FG" stroke-width="2" fill="none" opacity=".5"/>`,
  "建武新政": `<g fill="$FG"><circle cx="50" cy="34" r="7"/><circle cx="66" cy="42" r="7"/><circle cx="66" cy="58" r="7"/><circle cx="50" cy="66" r="7"/><circle cx="34" cy="58" r="7"/><circle cx="34" cy="42" r="7"/><circle cx="42" cy="35" r="6"/><circle cx="58" cy="35" r="6"/><circle cx="66" cy="50" r="6"/><circle cx="58" cy="65" r="6"/><circle cx="42" cy="65" r="6"/><circle cx="34" cy="50" r="6"/></g><circle cx="50" cy="50" r="6" fill="$AC"/><path d="M28 84 L72 84 L67 77 L33 77 Z" fill="$FG" opacity=".5"/>`,
  "观应之扰乱": `<path d="M26 78 L74 28 L81 34 L33 84 Z" fill="$FG"/><path d="M74 78 L26 28 L33 22 L81 72 Z" fill="$AC"/><circle cx="53" cy="53" r="6" fill="$FG" opacity=".9"/>`,
  "应仁之乱": `<path d="M34 78 L40 50 L60 50 L66 78 Z" fill="$FG"/><path d="M40 50 L50 30 L60 50 Z" fill="$FG" opacity=".8"/><path d="M50 20 C57 34 66 42 66 54 A16 16 0 0 1 34 54 C34 44 43 36 50 20 Z" fill="$AC"/><path d="M64 16 l2 9 6-7 3 12 2-13 8 7 1-9" stroke="$AC" stroke-width="1.6" fill="none"/>`,
  "本能寺之变": `<path d="M36 82 L40 56 L60 56 L64 82 Z" fill="$FG"/><path d="M40 56 L50 40 L60 56 Z" fill="$FG" opacity=".85"/><path d="M48 40 L53 28 L48 18 L43 28 Z" fill="$AC"/><path d="M30 30 l3 10 6-8 4 12 3-14 8 8 2-10" stroke="$AC" stroke-width="1.6" fill="none"/><path d="M56 76 L62 62 L68 76 Z" fill="$AC" opacity=".8"/>`,
  "长篠之战": `<g stroke="$FG" stroke-width="2.6"><line x1="30" y1="32" x2="64" y2="26"/><line x1="34" y1="40" x2="68" y2="34"/><line x1="38" y1="48" x2="72" y2="42"/></g><path d="M30 32 L36 42 M34 40 L40 50 M38 48 L44 58" stroke="$AC" stroke-width="2"/><path d="M16 62 L84 62 L84 68 L16 68 Z" fill="$FG" opacity=".5"/><path d="M16 68 L84 68 L84 74 L16 74 Z" fill="$FG" opacity=".3"/>`,
  "关原之战": `<path d="M30 84 L50 38 L70 84 Z" fill="$FG" opacity=".55"/><line x1="40" y1="20" x2="40" y2="84" stroke="$FG" stroke-width="2.6"/><path d="M40 22 L64 31 L40 42 Z" fill="$AC"/><line x1="60" y1="20" x2="60" y2="84" stroke="$FG" stroke-width="2.6"/><path d="M60 22 L36 31 L60 42 Z" fill="$FG"/><path d="M26 84 L74 84 L69 77 L31 77 Z" fill="$FG" opacity=".4"/>`,
  "大坂之阵": `<path d="M36 84 L42 60 L58 60 L64 84 Z" fill="$FG"/><path d="M42 60 L44 48 L56 48 L58 60 Z" fill="$FG"/><path d="M46 48 L50 34 L54 48 Z" fill="$AC"/><path d="M26 38 l3 10 6-8 4 12 3-14 8 8 2-10" stroke="$AC" stroke-width="1.6" fill="none"/><circle cx="72" cy="28" r="8" fill="$AC" opacity=".7"/>`,
  "岛原之乱": `<line x1="50" y1="16" x2="50" y2="72" stroke="$FG" stroke-width="3.2"/><line x1="32" y1="34" x2="68" y2="34" stroke="$FG" stroke-width="3.2"/><path d="M34 78 L42 62 L58 62 L66 78 Z" fill="$FG" opacity=".5"/><path d="M66 42 Q62 51 68 56 Q75 52 70 43 Z" fill="$AC"/><path d="M46 40 l0 7 M50 37 l0 7 M54 40 l0 7" stroke="$FG" stroke-width="1.6"/>`,
};

function hashStr(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; }
/* 卡名纹章：由哈希坐标定位的小饰，保证同形制卡互不相同 */
function cardMark(name, baseX, baseY) {
  const h = hashStr(name);
  const tx = baseX + (h % 11) * 2, ty = baseY + ((h >> 3) % 9) * 2;
  const m = (h >> 5) % 6;
  const sc = 1 + ((h >> 8) % 3) * 0.25;
  if (m === 0) return `<path transform="scale(${sc})" d="M${tx} ${ty} l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 Z" fill="$AC" opacity=".75"/>`;
  if (m === 1) return `<circle cx="${tx}" cy="${ty}" r="3.4" fill="$AC" opacity=".75"/>`;
  if (m === 2) return `<path d="M${tx} ${ty - 5} L${tx + 7} ${ty + 5} M${tx} ${ty + 5} L${tx + 7} ${ty - 5}" stroke="$AC" stroke-width="1.8" opacity=".75"/>`;
  if (m === 3) return `<path d="M${tx - 4} ${ty} Q${tx} ${ty - 5} ${tx + 4} ${ty}" stroke="$AC" stroke-width="1.8" fill="none" opacity=".75"/>`;
  if (m === 4) return `<circle cx="${tx}" cy="${ty}" r="4" fill="none" stroke="$AC" stroke-width="1.6" opacity=".8"/>`;
  return `<path d="M${tx} ${ty - 5} L${tx} ${ty + 5} M${tx - 5} ${ty} L${tx + 5} ${ty}" stroke="$AC" stroke-width="1.8" opacity=".75"/>`;
}

/* ═══ 装具画像（甲胄形制，按名称选 + 哈希变体）═══ */
function armorElement(c, sd) {
  const n = c.card.name;
  const kind = n.includes("大铠") || n.includes("大袖") || n.includes("威大铠") ? "big"
    : n.includes("腹卷") ? "haramaki"
    : n.includes("胴丸") || n.includes("五枚胴") ? "do"
    : n.includes("兵库") ? "sashiko"
    : n.includes("小具足") ? "small"
    : n.includes("日月") || n.includes("州浜") ? "crest"
    : "gusoku"; // 当世具足/南蛮胴/铁壁
  const crest = sd > 0.5 ? `<path d="M50 16 L54 26 L64 26 L56 32 L59 42 L50 36 L41 42 L44 32 L36 26 L46 26 Z" fill="$AC"/>` : `<circle cx="50" cy="24" r="5" fill="$AC"/>`;
  // 形制专属细节（同名卡互不相同，降低相似度）
  const detail = n.includes("紫绀") ? `<path d="M46 36 L46 78 M50 36 L50 78 M54 36 L54 78" stroke="$AC" stroke-width="1.5" opacity=".8"/>`
    : n.includes("红糸") ? `<path d="M42 44 L58 44 M42 54 L58 54 M42 64 L58 64 M42 74 L58 74" stroke="$AC" stroke-width="1.5" opacity=".8"/>`
    : n.includes("唐绫") ? `<path d="M30 48 L34 56 L38 48 L42 56 L46 48" stroke="$AC" stroke-width="1.5" opacity=".7"/><path d="M54 48 L58 56 L62 48 L66 56 L70 48" stroke="$AC" stroke-width="1.5" opacity=".7"/>`
    : n.includes("黑漆") ? `<g fill="$AC" opacity=".75"><circle cx="46" cy="46" r="1.6"/><circle cx="54" cy="54" r="1.6"/><circle cx="46" cy="62" r="1.6"/><circle cx="54" cy="70" r="1.6"/></g>`
    : n.includes("金小札") ? `<g fill="$AC" opacity=".8"><circle cx="46" cy="50" r="1.8"/><circle cx="54" cy="58" r="1.8"/><circle cx="46" cy="66" r="1.8"/></g>`
    : n.includes("明珍") ? `<path d="M48 42 q2 2 0 4 M52 50 q2 2 0 4 M48 58 q2 2 0 4" stroke="$AC" stroke-width="1.4" fill="none" opacity=".8"/>`
    : n.includes("南蛮") || n.includes("铁壁") ? `<path d="M44 40 L56 40 M43 52 L57 52 M44 64 L56 64 M43 76 L57 76" stroke="$AC" stroke-width="1.6" opacity=".7"/>`
    : n.includes("日月") ? `<circle cx="50" cy="52" r="6" fill="none" stroke="$AC" stroke-width="2"/><circle cx="50" cy="52" r="2.4" fill="$AC"/>`
    : n.includes("州浜") ? `<path d="M42 48 Q48 44 54 48 T66 48" stroke="$AC" stroke-width="1.6" fill="none" opacity=".8"/>`
    : "";
  const body = {
    big: `<path d="M50 30 Q44 30 40 34 L32 78 L68 78 L60 34 Q56 30 50 30 Z" fill="$FG"/><path d="M28 44 L18 74 L28 74 Z" fill="$FG" opacity=".75"/><path d="M72 44 L82 74 L72 74 Z" fill="$FG" opacity=".75"/><path d="M38 78 L62 78 L62 84 L38 84 Z" fill="$FG" opacity=".5"/>`,
    do: `<path d="M42 34 L58 34 L62 80 L38 80 Z" fill="$FG"/><path d="M42 34 L58 34 L54 30 L46 30 Z" fill="$AC"/><path d="M40 80 L60 80 L60 86 L40 86 Z" fill="$FG" opacity=".5"/>`,
    haramaki: `<path d="M44 40 L56 40 L60 78 L40 78 Z" fill="$FG"/><path d="M40 78 L60 78 L62 86 L38 86 Z" fill="$FG" opacity=".6"/>`,
    gusoku: `<path d="M42 34 L58 34 L62 80 L38 80 Z" fill="$FG"/><path d="M34 40 L40 34 L46 40 Z" fill="$FG" opacity=".8"/><path d="M54 40 L60 34 L66 40 Z" fill="$FG" opacity=".8"/><path d="M42 34 L58 34 L54 29 L46 29 Z" fill="$AC"/>`,
    sashiko: `<path d="M42 36 L58 36 L62 80 L38 80 Z" fill="$FG"/><path d="M44 44 L56 44 M42 52 L58 52 M44 60 L56 60 M42 68 L58 68 M44 76 L56 76" stroke="$AC" stroke-width="1.6" opacity=".8"/>`,
    small: `<path d="M44 42 L56 42 L58 78 L42 78 Z" fill="$FG"/>`,
    crest: `<path d="M42 34 L58 34 L62 80 L38 80 Z" fill="$FG"/><path d="M38 80 L62 80 L62 86 L38 86 Z" fill="$AC" opacity=".7"/>`,
  }[kind];
  const h = hashStr(n);
  // 兜前立（3 种，按哈希）——降低同形制相似度
  const maedate = (h % 3 === 0) ? `<path d="M50 22 L57 10 L43 10 Z" fill="$AC"/>`
    : (h % 3 === 1) ? `<path d="M50 22 A 11 11 0 0 1 61 18 L63 25 A 9 9 0 0 0 50 30 Z" fill="$AC"/>`
    : `<circle cx="50" cy="18" r="4.6" fill="$AC"/>`;
  const kabuto = `<path d="M32 34 Q50 12 68 34 L68 40 L32 40 Z" fill="$BG2"/><path d="M32 38 L68 38 L66 34 L34 34 Z" fill="$AC"/>${maedate}`;
  // 形制绳纹（行数与位置按哈希）——覆盖甲身，强化差异
  const hLines = Array.from({ length: 2 + (h % 3) }, (_, i) =>
    `<path d="M${36 + ((h >> (i * 3)) % 5)} ${44 + i * 11} L${62 + ((h >> 5) % 3)} ${44 + i * 11}" stroke="$AC" stroke-width="1.5" opacity=".7"/>`).join("");
  return `<g>${kabuto}${crest}${body}${detail}${hLines}${cardMark(c.card.name, 68, 66)}</g>`;
}

/* ═══ 骑具画像（马匹 4 姿态 × 变体 + 毛色斑纹）═══ */
function mountElement(c, sd) {
  const n = c.card.name;
  const h = hashStr(n);
  const pose = sd < 0.28 ? "gallop" : sd < 0.5 ? "rearing" : sd < 0.78 ? "stand" : "head";
  const v = (h % 2 === 0) ? "A" : "B"; // 同姿态双变体
  const mark = n.includes("三日月") || n.includes("池月") || n.includes("月毛") ? ((h >> 5) % 2 ? `<path d="M56 38 A6 6 0 1 0 62 46 A5 5 0 0 1 56 38 Z" fill="$AC"/>` : `<path d="M58 36 A7 7 0 1 0 66 44 A6 6 0 0 1 58 36 Z" fill="$AC"/>`)
    : n.includes("星") ? `<path d="M60 34 l2.2 4.6 5 0.7 -3.6 3.5 0.8 5 -4.4-2.3 -4.4 2.3 0.8 -5 -3.6 -3.5 5 -0.7 Z" fill="$AC"/>`
    : n.includes("樱") ? `<g fill="$AC"><circle cx="58" cy="40" r="1.8"/><circle cx="63" cy="46" r="1.8"/><circle cx="54" cy="48" r="1.8"/></g>`
    : n.includes("浪") || n.includes("白") ? `<path d="M52 40 Q58 36 64 40 Q58 44 52 40 Z" fill="$AC" opacity=".7"/>`
    : `<path d="M56 38 Q60 34 64 38" stroke="$AC" stroke-width="1.6" fill="none"/>`;
  const hMark = (h % 3 === 0) ? `<g fill="$AC" opacity=".6"><circle cx="44" cy="56" r="1.7"/><circle cx="50" cy="60" r="1.7"/><circle cx="56" cy="56" r="1.7"/></g>`
    : (h % 3 === 1) ? `<path d="M42 58 Q48 54 54 58" stroke="$AC" stroke-width="1.5" fill="none" opacity=".65"/>`
    : `<path d="M46 60 L50 54 L54 60" stroke="$AC" stroke-width="1.5" fill="none" opacity=".65"/>`;
  const gallop = {
    A: `<path d="M26 62 Q20 50 30 42 L42 38 L48 44 Q58 42 64 50 Q74 52 76 62 Q80 70 74 74 L70 82 L62 78 L60 70 Q52 66 42 66 Q34 70 32 78 L24 80 L26 70 Q20 68 26 62 Z" fill="$FG"/>`,
    B: `<path d="M24 64 Q18 52 28 44 L40 40 L46 46 Q56 44 62 52 Q72 54 74 64 Q78 72 72 76 L68 84 L60 80 L58 72 Q50 68 40 68 Q32 72 30 80 L22 82 L24 72 Q18 70 24 64 Z" fill="$FG"/>`,
  }[v];
  const rearing = {
    A: `<path d="M34 66 Q30 54 40 46 L50 40 L56 48 Q64 46 70 54 Q78 56 80 66 L80 78 L72 82 L68 72 Q60 68 50 68 Q42 70 38 80 L30 82 L34 70 Z" fill="$FG"/>`,
    B: `<path d="M32 68 Q28 56 38 48 L48 42 L54 50 Q62 48 68 56 Q76 58 78 68 L78 80 L70 84 L66 74 Q58 70 48 70 Q40 72 36 82 L28 84 L32 72 Q26 70 32 68 Z" fill="$FG"/>`,
  }[v];
  const stand = {
    A: `<path d="M30 56 Q26 44 38 40 L48 36 L54 44 Q62 42 68 50 Q76 52 78 60 L78 76 L70 80 L66 72 Q60 66 50 66 Q42 68 38 76 L32 80 L30 68 Q22 66 30 56 Z" fill="$FG"/>`,
    B: `<path d="M32 58 Q28 46 40 42 L50 38 L56 46 Q64 44 70 52 Q78 54 80 62 L80 78 L72 82 L68 74 Q62 68 52 68 Q44 70 40 78 L34 82 L32 70 Q24 68 32 58 Z" fill="$FG"/>`,
  }[v];
  const head = {
    A: `<path d="M34 64 Q30 44 46 36 L58 30 L64 40 Q72 48 64 60 Q68 72 58 80 Q44 74 34 64 Z" fill="$FG"/><path d="M46 36 L50 20 L60 32 Z" fill="$AC"/><circle cx="52" cy="48" r="2" fill="$BG2"/>`,
    B: `<path d="M32 66 Q28 46 44 38 L56 32 L62 42 Q70 50 62 62 Q66 74 56 82 Q42 76 32 66 Z" fill="$FG"/><path d="M44 38 L48 22 L58 34 Z" fill="$AC"/><circle cx="50" cy="50" r="2" fill="$BG2"/>`,
  }[v];
  const mane = ((h >> 3) % 2 === 0)
    ? `<path d="M40 44 Q44 34 54 38" stroke="$BG2" stroke-width="3" fill="none" stroke-linecap="round"/>`
    : `<path d="M38 46 Q46 36 56 40" stroke="$BG2" stroke-width="3" fill="none" stroke-linecap="round"/>`;
  const tail = ((h >> 4) % 2 === 0)
    ? `<path d="M76 68 Q84 62 82 72 Z" fill="$FG" opacity=".9"/>`
    : `<path d="M78 66 Q86 60 84 70 Z" fill="$FG" opacity=".9"/>`;
  return `<g>${ { gallop, rearing, stand, head }[pose] }${mane}${tail}${mark}${hMark}${cardMark(n, 64, 62)}</g>`;
}

/* ═══ 宝物画像（器具）═══ */
const TREASURE_EL = {
  "天丛云剑": `<path d="M50 18 L56 24 L52 60 L48 60 Z" fill="$FG"/><path d="M54 24 L64 30 L60 60 L52 60 Z" fill="$AC"/><path d="M46 62 L54 62 L58 74 L42 74 Z" fill="$FG" opacity=".8"/><path d="M56 26 L66 20 L64 28 Z" fill="$AC"/>`,
  "天羽羽斩": `<path d="M52 16 L58 22 L54 58 L50 58 Z" fill="$FG"/><path d="M56 22 L66 26 L62 58 L54 58 Z" fill="$AC"/><path d="M48 60 L56 60 L60 74 L44 74 Z" fill="$FG" opacity=".8"/>`,
  "鬼丸国纲": `<path d="M50 20 L56 26 L52 62 L48 62 Z" fill="$FG"/><path d="M46 64 L54 64 L58 78 L42 78 Z" fill="$FG" opacity=".8"/><path d="M52 26 L60 22 L58 30 Z" fill="$AC"/>`,
  "童子切安纲": `<path d="M48 22 L54 28 L50 64 L46 64 Z" fill="$FG"/><path d="M44 66 L52 66 L56 80 L40 80 Z" fill="$FG" opacity=".8"/><path d="M50 28 L58 24 L56 32 Z" fill="$AC"/>`,
  "八咫镜": `<circle cx="50" cy="42" r="20" fill="$FG"/><circle cx="50" cy="42" r="14" fill="none" stroke="$AC" stroke-width="2"/><path d="M38 64 L62 64 L58 72 L42 72 Z" fill="$FG" opacity=".8"/>`,
  "八尺琼勾玉": `<path d="M50 22 Q74 30 70 54 Q67 72 50 78 Q33 72 30 54 Q28 36 50 22 Z" fill="$FG"/><circle cx="50" cy="52" r="9" fill="none" stroke="$AC" stroke-width="2"/><circle cx="50" cy="52" r="3" fill="$AC"/>`,
  "源氏物语绘卷": `<rect x="30" y="26" width="40" height="50" rx="3" fill="$FG"/><rect x="34" y="34" width="32" height="18" fill="$AC" opacity=".85"/><path d="M36 58 q5 5 10 0 M50 58 q5 5 10 0" stroke="$AC" stroke-width="1.6" fill="none" opacity=".8"/><rect x="26" y="24" width="10" height="54" rx="3" fill="$FG" opacity=".6"/>`,
  "神奈川冲浪里": `<path d="M18 74 Q32 48 50 62 Q68 76 84 56" fill="none" stroke="$FG" stroke-width="3"/><path d="M20 84 Q36 62 52 76 Q68 90 84 70" fill="none" stroke="$AC" stroke-width="2.4"/><path d="M58 26 Q62 16 68 26 L66 40 L60 40 Z" fill="$FG" opacity=".7"/>`,
  "五彩藤棚纹大盘": `<circle cx="50" cy="48" r="26" fill="$FG"/><circle cx="50" cy="48" r="20" fill="none" stroke="$AC" stroke-width="2"/><path d="M38 38 q6 -6 12 0 q6 6 0 12 q-6 6 -12 0 q-6 -6 0 -12 Z" fill="$AC" opacity=".8"/><path d="M44 60 L56 60 L54 68 L46 68 Z" fill="$FG" opacity=".7"/>`,
  "五彩花鸟纹深腹碗": `<path d="M28 46 Q28 76 50 76 Q72 76 72 46 Z" fill="$FG"/><path d="M30 50 Q50 58 70 50 L70 46 Q50 54 30 46 Z" fill="$AC" opacity=".8"/><path d="M24 46 L76 46 L76 50 L24 50 Z" fill="$FG" opacity=".8"/>`,
};

/* ═══ 兵刃画像（太刀 5 姿态 + 枪/神剑 + 刃文变体）═══ */
function bladeElement(c, sd) {
  const n = c.card.name;
  const h = hashStr(n);
  if (n.includes("蜻蛉切") || n.includes("日本号")) {
    const tilt2 = (h % 2) ? `<path d="M26 84 L72 22 L78 28 L32 90 Z" fill="$FG"/><path d="M72 22 L80 14 L84 24 L78 28 Z" fill="$AC"/><path d="M30 88 L24 80 L32 82 Z" fill="$AC"/>`
      : `<path d="M20 80 L70 18 L76 24 L26 86 Z" fill="$FG"/><path d="M70 18 L78 10 L82 20 L76 24 Z" fill="$AC"/>`;
    return `<g>${tilt2}${cardMark(n, 40, 60)}</g>`;
  }
  if (n.includes("丰都")) {
    return `<g><path d="M50 12 L57 20 L52 58 L48 58 Z" fill="$FG"/><path d="M56 22 L66 16 L64 26 Z" fill="$AC"/><path d="M46 60 L54 60 L58 76 L42 76 Z" fill="$FG" opacity=".85"/><path d="M48 16 L54 24 L44 28 Z" fill="$AC" opacity=".7"/>${cardMark(n, 62, 60)}</g>`;
  }
  const poses = ["slant", "upright", "draw", "hold", "slantR"];
  const p = poses[h % 5];
  const parts = {
    slant: `<path d="M28 78 L58 52 L64 58 L34 84 Z" fill="$FG"/><path d="M58 52 L66 44 L70 50 L64 58 Z" fill="$AC"/>`,
    upright: `<path d="M46 22 L52 26 L48 74 L44 74 Z" fill="$FG"/><path d="M52 26 L60 20 L58 30 Z" fill="$AC"/><path d="M42 76 L50 76 L54 88 L38 88 Z" fill="$FG" opacity=".8"/>`,
    draw: `<path d="M26 80 L62 52 L68 58 L32 86 Z" fill="$FG"/><path d="M58 54 L64 46 L69 52 L63 58 Z" fill="$AC"/><path d="M32 86 L70 60 L74 66 L36 92 Z" fill="$BG2" opacity=".8"/>`,
    hold: `<path d="M18 50 L62 44 L64 50 L20 56 Z" fill="$FG"/><path d="M62 44 L74 42 L72 50 L64 50 Z" fill="$AC"/>`,
    slantR: `<path d="M72 78 L42 52 L36 58 L66 84 Z" fill="$FG"/><path d="M42 52 L34 44 L30 50 L36 58 Z" fill="$AC"/>`,
  }[p];
  const hamon = (h >> 6) % 2
    ? `<path d="M34 72 Q44 64 52 70 Q60 64 64 68" fill="none" stroke="$AC" stroke-width="1.6" opacity=".8"/>`
    : `<path d="M36 68 Q46 62 54 66 Q62 62 66 66" fill="none" stroke="$AC" stroke-width="1.6" opacity=".8"/>`;
  const tassel = (h >> 4) % 2 ? `<path d="M30 74 Q22 82 26 92" stroke="$AC" stroke-width="2.4" fill="none"/>` : "";
  return `<g>${parts}${hamon}${tassel}${cardMark(n, 62, 60)}</g>`;
}

/* ═══ 圣迹画像（抽象神迹符号）═══ */
const SACRED_EL = {
  "天照大神的重光": `<circle cx="50" cy="46" r="16" fill="$FG"/><g stroke="$AC" stroke-width="3" stroke-linecap="round"><path d="M50 18 V8 M50 84 V74 M18 46 H8 M92 46 H82 M28 24 L21 17 M79 76 L72 69 M72 24 L79 17 M21 76 L28 69"/></g>`,
  "伊邪那岐的祓除": `<path d="M34 30 Q50 44 66 30 Q58 50 50 62 Q42 50 34 30 Z" fill="$FG"/><path d="M42 46 q4 4 8 0 q4 4 8 0" stroke="$AC" stroke-width="2" fill="none"/><path d="M30 70 Q40 62 50 70 Q60 62 70 70" stroke="$FG" stroke-width="2" fill="none" opacity=".6"/>`,
  "须佐之男斩杀八岐大蛇": `<path d="M24 72 L40 40 L48 52 L58 30 L66 46 L74 26" fill="none" stroke="$AC" stroke-width="3.4" stroke-linejoin="round"/><path d="M74 26 L82 20 L78 30 Z" fill="$AC"/><path d="M40 40 L34 28 M48 52 L42 42" stroke="$FG" stroke-width="2"/><path d="M24 84 L34 68 L40 80 L50 64" fill="none" stroke="$FG" stroke-width="2" opacity=".6"/>`,
  "大国主神的死而复生": `<path d="M50 78 Q34 62 50 46 Q66 30 50 18" fill="none" stroke="$FG" stroke-width="3.4"/><path d="M50 14 L56 24 L44 24 Z" fill="$AC"/><path d="M50 78 L50 66 M50 60 L50 52" stroke="$FG" stroke-width="2" opacity=".5"/>`,
  "稻荷神的白鸟与白狐": `<path d="M26 64 Q50 26 74 64" fill="none" stroke="$FG" stroke-width="3"/><path d="M50 44 L42 28 L58 34 Z" fill="$AC"/><path d="M36 72 Q44 66 52 72" stroke="$FG" stroke-width="1.8" fill="none" opacity=".6"/>`,
  "天孙降临": `<path d="M34 84 L40 66 L48 74 L54 52 L62 62 L68 42 L76 54 L80 36" fill="none" stroke="$AC" stroke-width="3" stroke-linejoin="round"/><circle cx="50" cy="22" r="10" fill="$FG"/><path d="M50 22 L50 12 M50 32 L50 30" stroke="$FG" stroke-width="2"/>`,
  "诹访明神助战": `<path d="M56 18 L40 52 L50 52 L38 82 L62 46 L52 46 L64 18 Z" fill="$AC"/><path d="M40 60 L32 74 M58 54 L66 42" stroke="$FG" stroke-width="2"/>`,
  "神木的报应": `<path d="M48 84 L48 34 L52 34 L52 84 Z" fill="$FG"/><path d="M36 44 Q42 28 50 26 Q58 24 62 36 L58 42 Q54 32 50 34 Q44 34 40 44 Z" fill="$FG" opacity=".85"/><path d="M44 30 Q48 20 54 24" stroke="$AC" stroke-width="2" fill="none"/>`,
  "八咫乌引路": `<path d="M30 62 Q50 28 70 62" fill="none" stroke="$FG" stroke-width="3"/><path d="M50 46 L46 30 L56 38 Z" fill="$AC"/><path d="M50 50 L50 62 M44 54 L50 62 L56 54" stroke="$FG" stroke-width="2" fill="none"/>`,
  "丰玉姬化龙": `<path d="M28 66 C40 36 62 72 74 46" fill="none" stroke="$FG" stroke-width="3.6"/><circle cx="76" cy="42" r="5" fill="$AC"/><path d="M24 70 L34 60 L30 54 Z" fill="$AC"/><path d="M42 52 Q48 58 54 52" stroke="$AC" stroke-width="1.6" fill="none"/>`,
};

/* ═══ 灾厄画像（抽象灾害符号）═══ */
const CALAMITY_EL = {
  "天火焚城": `<path d="M50 18 C58 34 68 42 68 54 A18 18 0 0 1 32 54 C32 42 42 34 50 18 Z" fill="$AC"/><path d="M50 40 C55 48 59 53 59 60 A9 9 0 0 1 41 60 C41 53 45 48 50 40 Z" fill="$FG"/>`,
  "海啸摧堤": `<path d="M14 62 Q28 46 42 58 T70 58 T98 62" fill="none" stroke="$FG" stroke-width="3.6"/><path d="M18 78 Q32 64 46 74 T72 74 T94 76" fill="none" stroke="$AC" stroke-width="2.6"/><path d="M14 86 Q28 80 42 84" fill="none" stroke="$FG" stroke-width="1.8" opacity=".5"/>`,
  "飓风来袭": `<path d="M50 14 Q30 40 50 50 Q70 60 50 86 Q66 64 50 50 Q32 40 50 14 Z" fill="none" stroke="$AC" stroke-width="3.2"/><path d="M50 30 Q40 44 50 54 Q58 62 50 72" fill="none" stroke="$FG" stroke-width="2.4"/>`,
  "地震山崩": `<path d="M22 62 L40 44 L52 56 L68 34 L82 50 L92 38" fill="none" stroke="$FG" stroke-width="3.2" stroke-linejoin="round"/><path d="M16 78 Q34 70 50 78 T84 78" stroke="$AC" stroke-width="2" fill="none" opacity=".7"/><path d="M60 62 l6 8 M70 56 l7 9" stroke="$FG" stroke-width="2" opacity=".5"/>`,
  "永夜笼罩": `<circle cx="60" cy="40" r="20" fill="$AC"/><path d="M62 18 A 32 32 0 1 0 62 82 A 27 27 0 0 1 62 18 Z" fill="$FG"/><path d="M30 74 Q44 66 58 74" stroke="$FG" stroke-width="2" fill="none" opacity=".6"/>`,
  "旱灾饥荒": `<circle cx="50" cy="44" r="16" fill="$AC"/><g stroke="$AC" stroke-width="3" stroke-linecap="round"><path d="M50 16 V6 M50 82 V72 M16 44 H6 M94 44 H84 M26 20 L19 13 M81 75 L74 68 M74 20 L81 13 M19 75 L26 68"/></g><path d="M34 86 L40 78 L46 86 L52 76 L58 86 L64 78 L70 86" stroke="$FG" stroke-width="2.4" fill="none"/>`,
  "瘟疫肆虐": `<ellipse cx="50" cy="38" rx="14" ry="17" fill="$FG"/><ellipse cx="50" cy="38" rx="6" ry="7" fill="$AC"/><path d="M36 66 L64 66 L60 84 L40 84 Z" fill="$FG"/><path d="M32 40 Q26 30 34 26" stroke="$AC" stroke-width="2" fill="none"/><path d="M68 40 Q74 30 66 26" stroke="$AC" stroke-width="2" fill="none"/>`,
  "战乱爆发": `<path d="M26 72 L56 34 L64 42 L34 80 Z" fill="$FG"/><path d="M70 74 L42 36 L50 28 L78 66 Z" fill="$AC"/><path d="M50 50 C56 62 66 66 66 74 A12 12 0 0 1 42 74 C42 66 48 60 50 50 Z" fill="$FG"/>`,
  "连雨涝灾": `<path d="M30 40 Q40 26 50 36 Q60 26 70 40 Q78 34 82 44 L82 50 Q82 60 70 60 L30 60 Q18 60 18 50 L18 44 Q18 36 30 40 Z" fill="$FG"/><path d="M34 46 l0 8 M46 42 l0 8 M58 46 l0 8 M70 42 l0 8" stroke="$AC" stroke-width="2.4"/>`,
  "臣民叛乱": `<path d="M34 40 Q50 26 66 40" fill="none" stroke="$FG" stroke-width="3"/><circle cx="34" cy="44" r="5" fill="$AC"/><circle cx="66" cy="44" r="5" fill="$AC"/><path d="M40 54 L60 54 L60 60 L40 60 Z" fill="$FG" opacity=".8"/><path d="M34 70 Q50 58 66 70" fill="none" stroke="$AC" stroke-width="2.6"/>`,
};

/* ═══ 卡牌画像引擎（每卡专属 SVG，按名称/简介关键词 + 哈希差异化）═══ */
const PORTRAIT_EL = {
  sword: `<path d="M30 74 L60 44 L67 51 L37 81 Z" fill="$FG"/><path d="M30 74 L37 81 L31 87 L24 80 Z" fill="$AC"/><circle cx="70" cy="41" r="4" fill="$AC"/>`,
  bow: `<path d="M26 82 A 28 28 0 0 1 74 82" fill="none" stroke="$FG" stroke-width="3.5"/><path d="M26 82 L74 82" stroke="$FG" stroke-width="1.2" opacity=".55"/><line x1="50" y1="76" x2="50" y2="22" stroke="$AC" stroke-width="2.6"/><path d="M50 22 L45 30 L55 30 Z" fill="$AC"/>`,
  castle: `<path d="M30 82 L38 58 L62 58 L70 82 Z" fill="$FG"/><path d="M42 58 L46 42 L54 42 L58 58 Z" fill="$FG"/><path d="M47 42 L50 30 L53 42 Z" fill="$AC"/><rect x="28" y="82" width="44" height="6" fill="$FG" opacity=".45"/>`,
  flame: `<path d="M50 20 C58 38 68 46 68 60 A18 18 0 0 1 32 60 C32 48 42 40 50 20 Z" fill="$FG"/><path d="M50 42 C55 50 59 55 59 62 A9 9 0 0 1 41 62 C41 55 45 50 50 42 Z" fill="$AC"/>`,
  wave: `<path d="M14 56 Q28 44 42 56 T70 56 T98 56" fill="none" stroke="$FG" stroke-width="3.2"/><path d="M14 72 Q28 60 42 72 T70 72 T98 72" fill="none" stroke="$FG" stroke-width="2.6" opacity=".6"/><path d="M20 86 Q34 74 48 86" fill="none" stroke="$AC" stroke-width="2.4"/>`,
  wind: `<path d="M22 46 Q42 30 62 44 Q80 56 68 66" fill="none" stroke="$FG" stroke-width="3.2"/><path d="M28 62 Q44 54 60 64" fill="none" stroke="$AC" stroke-width="2.6"/>`,
  flag: `<line x1="34" y1="20" x2="34" y2="86" stroke="$FG" stroke-width="3"/><path d="M34 24 L66 33 L34 44 Z" fill="$AC"/><line x1="64" y1="20" x2="64" y2="86" stroke="$FG" stroke-width="3"/><path d="M64 24 L96 33 L64 44 Z" fill="$FG" opacity=".65"/>`,
  star: `<path d="M50 16 L58 41 L85 41 L63 57 L71 83 L50 67 L29 83 L37 57 L15 41 L42 41 Z" fill="$FG"/>`,
  moon: `<path d="M62 18 A 32 32 0 1 0 62 82 A 28 28 0 0 1 62 18 Z" fill="$FG"/>`,
  sun: `<circle cx="50" cy="50" r="17" fill="$FG"/><g stroke="$AC" stroke-width="3" stroke-linecap="round"><path d="M50 20 V10 M50 90 V80 M20 50 H10 M90 50 H80 M29 29 L22 22 M78 78 L71 71 M71 29 L78 22 M22 78 L29 71"/></g>`,
  mountain: `<path d="M20 84 L50 26 L80 84 Z" fill="$FG"/><path d="M50 26 L58 38 L46 42 Z" fill="$AC"/><path d="M42 62 L50 52 L58 62 Z" fill="$AC" opacity=".7"/>`,
  tree: `<path d="M50 26 L70 54 L60 54 L76 76 L24 76 L40 54 L30 54 Z" fill="$FG"/><rect x="44" y="76" width="12" height="10" fill="$FG" opacity=".5"/>`,
  bird: `<path d="M28 64 Q50 32 72 64" fill="none" stroke="$FG" stroke-width="3.4"/><path d="M50 48 L42 34 L56 40 Z" fill="$AC"/>`,
  deer: `<path d="M52 42 L46 24 M52 42 L58 26 M46 24 L40 20 M58 26 L64 22" stroke="$FG" stroke-width="2.6"/><path d="M42 54 Q42 40 50 38 Q58 40 58 54 Q58 64 50 64 Q42 64 42 54 Z" fill="$FG"/><circle cx="46" cy="49" r="2.4" fill="$AC"/>`,
  horse: `<path d="M32 68 Q28 40 48 33 L58 29 L63 38 Q70 46 64 58 Q68 72 60 80 Q46 76 32 68 Z" fill="$FG"/><path d="M48 33 L52 20 L60 29 Z" fill="$AC"/>`,
  pagoda: `<rect x="44" y="54" width="12" height="28" fill="$FG"/><path d="M30 54 L70 54 L66 45 L34 45 Z" fill="$FG"/><path d="M34 45 L66 45 L62 36 L38 36 Z" fill="$FG"/><path d="M40 36 L60 36 L56 27 L44 27 Z" fill="$FG"/><path d="M47 27 L56 27 L53 21 L47 21 Z" fill="$AC"/>`,
  orb: `<circle cx="50" cy="44" r="20" fill="$FG" opacity=".92"/><path d="M34 38 Q44 32 50 36 Q58 32 66 38" stroke="$AC" stroke-width="2" fill="none"/><circle cx="43" cy="38" r="4" fill="$AC" opacity=".85"/><path d="M40 70 L50 62 L60 70 Z" fill="$FG" opacity=".55"/>`,
  shield: `<path d="M50 16 L78 25 L78 56 Q78 76 50 86 Q22 76 22 56 L22 25 Z" fill="$FG"/><path d="M50 30 L66 35 L66 55 Q66 68 50 74 Q34 68 34 55 L34 35 Z" fill="$AC" opacity=".8"/>`,
  dragon: `<path d="M26 70 C36 42 66 76 74 50" fill="none" stroke="$FG" stroke-width="4.5"/><circle cx="76" cy="46" r="6" fill="$AC"/><path d="M22 74 L31 65 L27 60 Z" fill="$AC"/>`,
  snake: `<path d="M22 60 Q34 44 46 60 T70 60 T94 60" fill="none" stroke="$FG" stroke-width="3.2"/><circle cx="22" cy="57" r="4.5" fill="$AC"/>`,
  flower: `<g fill="$FG"><circle cx="50" cy="33" r="8"/><circle cx="67" cy="42" r="8"/><circle cx="67" cy="58" r="8"/><circle cx="50" cy="67" r="8"/><circle cx="33" cy="58" r="8"/><circle cx="33" cy="42" r="8"/></g><circle cx="50" cy="50" r="7" fill="$AC"/>`,
  fox: `<path d="M32 60 Q28 38 46 34 L50 24 L54 34 Q72 38 68 60 Q68 76 50 76 Q32 76 32 60 Z" fill="$FG"/><path d="M46 34 L41 24 L52 32 Z" fill="$AC"/><path d="M54 34 L59 24 L48 32 Z" fill="$AC"/>`,
};
const PORTRAIT_PAL = {
  emperors: [["#5a2014", "#2a0e06", "#ffd98a", "#ff9a4a"], ["#4a1c30", "#200a14", "#ffc8a0", "#ff9ad0"]],
  shoguns: [["#6a1a1a", "#2a0a08", "#ff9a6a", "#ffd98a"], ["#5a2a10", "#261008", "#ffb080", "#ffd9a0"]],
  daimyo: [["#3a1a5a", "#140a26", "#d9a0ff", "#ffd9a0"], ["#2a1a4a", "#100a22", "#c890f0", "#a0d9ff"]],
  samurai: [["#12305a", "#081426", "#9ad0ff", "#ffd98a"], ["#10284a", "#061020", "#8ac0f0", "#a0ffc8"]],
  noble: [["#1a4a24", "#081a0c", "#a8e0a8", "#ffd98a"], ["#14401e", "#06180a", "#90d090", "#c8f0a0"]],
  process: [["#3a3a3a", "#141414", "#e8dcc0", "#ffb060"], ["#2e2e2e", "#101010", "#d8ccb0", "#90c8f0"]],
  castle: [["#4a3822", "#1e160c", "#e0c8a0", "#ffd98a"], ["#3a2e1a", "#181206", "#d0b890", "#c8a060"]],
  treasure: [["#12444a", "#061a1e", "#7fd4c0", "#ffd98a"], ["#0e3a40", "#04161a", "#70c8b4", "#a0e0c0"]],
  sacred: [["#5a4a10", "#241c04", "#fff3c0", "#ffd75a"], ["#4a3e0e", "#1e1806", "#ffeeb0", "#ffe08a"]],
  calamity: [["#2a1036", "#0e0414", "#c080e0", "#ff6a5a"], ["#200a2a", "#0a0210", "#b070d0", "#90a0f0"]],
  blade: [["#24344a", "#0c1420", "#d8e0e8", "#ffd98a"], ["#1e2c3e", "#0a1018", "#c8d4e0", "#a0c0e0"]],
  armor: [["#4a2c14", "#1e1006", "#e8c090", "#ffd98a"], ["#3e2410", "#180c04", "#d8b080", "#c89060"]],
  mount: [["#3a2416", "#160e06", "#f0c898", "#ffe0b0"], ["#2e1c10", "#100a04", "#e0b888", "#c8a070"]],
};

const UI = {
  mode: "idle",       // idle | sacrifice | equip | combat
  selectedAttacker: null,
  sacTarget: -1,
  eqHandIdx: -1,
  combatMode: false,
  bypass: false,

  el(id) { return document.getElementById(id); },

  /* ---------- 全量渲染 ---------- */
  renderAll() {
    const st = Game.state;
    if (!st) return;
    this.renderTopbar();
    this.renderPlayerArea("opponent", 1);
    this.renderCenter();
    this.renderPlayerArea("player", 0);
    this.renderFlow();
    this.renderZoneBg();
    Game.save(); // 每次渲染即存档：刷新恢复现场而非重新开局
  },

  /* 常置牌专属背景：城池 → 左下；事件 → 右下（各 1/4 屏，淡显） */
  renderZoneBg() {
    const city = this.el("bgCity"), evt = this.el("bgEvent");
    if (!city || !evt) return;
    const st = Game.state;
    const apply = (host, zoneType, key) => {
      const on = st && st.zone && st.zone.type === zoneType;
      if (!on) { host.classList.remove("show"); host.innerHTML = ""; return; }
      const svg = ZONE_BG[st.zone.card.name];
      host.innerHTML = svg
        ? `<div class="zb-wrap"><div class="zb-svg">${svg}</div><div class="zb-name">${st.zone.card.name}</div></div>`
        : `<div class="zb-wrap"><div class="zb-name">${st.zone.card.name}</div></div>`;
      host.classList.add("show");
    };
    apply(city, "castle", "city");
    apply(evt, "process", "event");
  },

  renderTopbar() {
    const st = Game.state;
    const p = st.players[st.cur];
    const phase = st.winner != null ? "对局结束" : `${p.name} 的回合（第 ${st.turnNo} 回合）`;
    this.el("phaseInfo").textContent = phase;
    const btns = this.el("topButtons");
    btns.innerHTML = "";
    const rb = mk("🔄 新开局", () => UI.confirmRestart());
    rb.style.marginRight = "auto";
    btns.appendChild(rb);
    if (st.winner != null) return;
    const isMyTurn = st.cur === 0 && !p.isAI;
    const isAITurn = st.cur === 1 && p.isAI;
    if (isAITurn) {
      const b = mk("电脑行动中…", null, true);
      btns.appendChild(b);
      return;
    }
    if (isMyTurn) {
      // 抽牌按钮
      const drawBtn = mk(p.drawnThisTurn ? "本回合已抽牌" : "抽牌（1 张）", () => Game.drawCard(p), p.drawnThisTurn);
      btns.appendChild(drawBtn);
      // 恩典召唤
      if (Game.canGrace(p)) {
        const g = mk("✨ 恩典召唤", () => UI.showGraceModal());
        btns.appendChild(g);
      }
      // 城池募兵（第五层 · 每三回合一次）
      const ri = Game.recruitInfo(0);
      if (ri && ri.ok) {
        btns.appendChild(mk(`🏰 募兵（扣${ri.cost}生命·每三回合一次）`, () => {
          const opts = Game.recruitOptions(0);
          const body = document.createElement("div");
          body.innerHTML = `<div style="margin-bottom:8px">从手牌或弃牌堆选择召唤一位（当回合即可攻击，不减半）：</div>`;
          const btns2 = opts.map(o => ({
            label: `${o.src === "hand" ? "手牌" : "弃牌堆"} ${KIND_CN[o.kind]}【${o.card.name}】`,
            fn: () => { Game.doRecruit(0, o); UI.hideModal(); UI.renderAll(); },
          }));
          btns2.push({ label: "取消", fn: () => UI.hideModal() });
          UI.showModal(`募兵（${ri.tier} · 扣 ${ri.cost} 生命）`, body, btns2);
        }));
      } // 条件不允许（无大名且无公卿等）→ 不显示募兵入口
      // 三张换一回收
      if (Game.canExchange(p)) {
        btns.appendChild(mk("♻ 回收兑换（3 张换 1 张）", () => this.showExchange()));
      }
      // 天皇·事件之速（仅当己方天皇拥有「事件之速」轨道时显示；每局一次）
      const hasTempo = [p.emperor.t1, p.emperor.t2, p.emperor.t3].some(tr => tr.includes("事件之速"));
      if (hasTempo) {
        const tpInfo = Game.tempoInfo(0);
        if (tpInfo && tpInfo.ok) {
          btns.appendChild(mk(`⚡ 事件之速（${tpInfo.label}）`, () => {
            Game.useTempo(0);
            UI.renderAll();
          }, false, "primary"));
        } // 条件不允许（区为空/无武士可夺/场满/已使用）→ 隐藏
      }
      // 将军尊位（每局一次）：有可发动选项时显示，否则隐藏
      const rkInfo = Game.rankInfo(0);
      const rkUsable = rkInfo && rkInfo.options.some(o => o.ok);
      if (rkUsable) {
        btns.appendChild(mk(`👑 尊位（耗${rkInfo.cost}生命）`, () => {
          const body = document.createElement("div");
          // 只列出当前可发动的选项
          const btns2 = rkInfo.options.filter(o => o.ok).map(o => ({
            label: o.label,
            cls: "primary",
            fn: () => { Game.useRank(0, o.kind); UI.hideModal(); UI.renderAll(); },
          }));
          btns2.push({ label: "取消", fn: () => UI.hideModal() });
          UI.showModal("👑 尊位 · 将军特权（每局一次，耗当前生命 1/10）", body, btns2);
        }));
      }
      // 帝王之征（逆境特惠，每局各一次）：条件达成时显示按钮，否则隐藏
      const impInfo = Game.imperialInfo(0);
      if (impInfo.length) {
        const usable = impInfo.filter(x => x.ok);
        if (usable.length) {
          const labels = usable.map(x => x.label).join(" ｜ ");
          btns.appendChild(mk(`👑 帝王之征（${usable.length} 项可用）`, () => {
            const body = document.createElement("div");
            body.innerHTML = `<div style="margin-bottom:8px;line-height:1.7">选择一项帝王之征发动（每局各一次）：</div>`;
            const btns2 = usable.map(x => ({
              label: x.label,
              cls: "primary",
              fn: () => { Game.useImperial(0, x.kind); UI.hideModal(); UI.renderAll(); },
            }));
            btns2.push({ label: "取消", fn: () => UI.hideModal() });
            UI.showModal("👑 帝王之征 · 逆境特惠", body, btns2);
          }));
        } // 条件不够 → 隐藏
      }
      // 装具·熔炉（主动，每回合一次）：条件达成时显示按钮，否则隐藏
      const forgeInfo = Game.forgeInfo(0);
      if (forgeInfo && forgeInfo.ok) {
        btns.appendChild(mk(`🔥 熔炉（回复${forgeInfo.heal}，弃一件装具）`, () => {
          const body = document.createElement("div");
          body.innerHTML = `<div style="margin-bottom:8px;line-height:1.7">己方生命低于对方，可将一件装具下场，回复差值的一半（<b>${forgeInfo.heal}</b> 点）。<br>选择要下场的装具：</div>`;
          const btns2 = forgeInfo.armors.map(u => ({
            label: `${KIND_CN[u.kind]}【${u.card.name}】· ${u.eq.armor.name}`,
            cls: "primary",
            fn: () => { Game.useForge(0, u.uid); UI.hideModal(); UI.renderAll(); },
          }));
          btns2.push({ label: "取消", fn: () => UI.hideModal() });
          UI.showModal("🔥 装具·熔炉（每回合一次）", body, btns2);
        }, false, "primary"));
      } // 条件不够 → 隐藏
      // 事件·暗杀（右上角手动发动）：条件允许才显示，否则隐藏
      const aiInfo = Game.assassinInfo(0);
      if (aiInfo && aiInfo.cost) {
        btns.appendChild(mk(`🗡 暗杀（扣${aiInfo.cost}生命·对方将军−5）`, () => {
          Game.useAssassin(0);
          UI.renderAll();
        }, false, "primary"));
      }
      // 战斗
      if (Game.canAttack(p)) {
        const cb = mk(Game.attackers(0).length ? "⚔ 进入战斗" : "⚔ 进入战斗（无单位）", () => {
          this.combatMode = true;
          this.logHint("点击己方单位选择攻击者，再点击对方目标（只能攻击最前层；对方空场可直接点将军）");
          UI.renderAll();
        });
        btns.appendChild(cb);
        const bi = Game.bypassInfo(0);
        if (bi && bi.cost) {
          btns.appendChild(mk(`⚡ 破阵（越级·扣${bi.cost}生命）`, () => {
            this.bypass = true; this.combatMode = true;
            this.logHint("破阵已就绪：点己方单位 → 点对方任意目标或将军直接攻击");
            UI.renderAll();
          }));
        }
      } // 本回合不能攻击 → 不显示战斗按钮
      // 结束回合
      btns.appendChild(mk("结束回合 ▸", () => {
        this.combatMode = false; this.mode = "idle"; this.selectedAttacker = null; this.bypass = false;
        Game.endTurn();
      }, false, "primary"));
    }
  },

  logHint(msg) { Game.log(msg); },

  /* ---------- 视觉特效 ---------- */
  flashEl(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); },
  flashHand(pi, hi) { this.flashEl(document.querySelector(`.hand-card[data-hi="${hi}"][data-pi="${pi}"]`), "hand-flash"); },
  flashUnit(pi, uid) { this.flashEl(document.querySelector(`.unit-card[data-uid="${uid}"]`), "unit-flash"); },
  shakeUnit(uid) { this.flashEl(document.querySelector(`.unit-card[data-uid="${uid}"]`), "unit-shake"); },
  flashZone() { this.flashEl(document.getElementById("zoneSlot"), "zone-flash"); },
  flashEmperor(pi) {
    this.flashEl(document.querySelector(`.avatar-card[data-emperor="1"][data-pi="${pi}"]`), "unit-flash");
  },
  /* 御·庇护发动：天皇牌金色光环特效 */
  imperialPurge(pi) {
    const host = document.querySelector(`.avatar-card[data-emperor="1"][data-pi="${pi}"]`);
    if (!host) return;
    host.classList.remove("emperor-purge");
    void host.offsetWidth;
    host.classList.add("emperor-purge");
    // 天皇头顶浮现庇护印记
    const mark = document.createElement("div");
    mark.className = "purge-mark";
    mark.textContent = "御·庇护";
    host.appendChild(mark);
    setTimeout(() => { if (mark.parentNode) mark.parentNode.removeChild(mark); }, 1800);
  },
  flashShogun(pi) {
    const host = document.querySelector(`.avatar-card[data-shogun="1"][data-pi="${pi}"]`) ||
      document.querySelector(`#${pi === 0 ? "player" : "opponent"} .avatar-card[data-shogun="1"]`);
    this.flashEl(host, "unit-flash");
  },
  flashDiscard() { this.flashEl(document.getElementById("discardPile"), "discard-flash"); },
  unitEnter(uid) { this.flashEl(document.querySelector(`.unit-card[data-uid="${uid}"]`), "unit-enter"); },
  defendFlash(uid) {
    this.flashEl(document.querySelector(`.unit-card[data-uid="${uid}"]`), "unit-shake");
    this.flashEl(document.querySelector(`.unit-card[data-uid="${uid}"]`), "unit-defend");
  },
  effectBurst(pi, color) {
    const area = document.getElementById(pi === 0 ? "player" : "opponent");
    if (!area) return;
    const r = area.getBoundingClientRect();
    const sp = document.createElement("div");
    sp.className = "effect-burst";
    sp.style.left = (r.left + r.width / 2 - 32) + "px";
    sp.style.top = (r.top + r.height / 2 - 32) + "px";
    sp.style.background = "radial-gradient(circle, rgba(255,215,0,.95), rgba(255,90,60,.55) 60%, transparent)";
    if (color) sp.style.background = color;
    document.body.appendChild(sp);
    setTimeout(() => sp.remove(), 800);
  },
  floatDamage(where, amount, color) {
    let host = null;
    if (where.indexOf("shogun:") === 0) {
      const pi = parseInt(where.split(":")[1]);
      host = document.querySelector(`.avatar-card[data-shogun="1"][data-pi="${pi}"]`) ||
             document.querySelector(`#${pi === 0 ? "player" : "opponent"} .avatar-card[data-shogun="1"]`);
    } else {
      host = document.querySelector(`.unit-card[data-uid="${where}"]`);
    }
    if (!host) return;
    const r = host.getBoundingClientRect();
    const sp = document.createElement("div");
    sp.className = "dmg-float";
    sp.textContent = (amount > 0 ? "-" : "") + Math.abs(amount);
    sp.style.color = color || "#ff6b5a";
    sp.style.left = (r.left + r.width / 2 - 14) + "px";
    sp.style.top = r.top + "px";
    document.body.appendChild(sp);
    setTimeout(() => sp.remove(), 1300);
  },

  /* ---------- 玩家区域 ---------- */
  renderPlayerArea(containerId, pi) {
    const st = Game.state;
    const p = st.players[pi];
    const cont = this.el(containerId);
    const isSelf = pi === 0;
    const banner = isSelf ? "你的阵地" : "电脑阵地";
    const hpColor = p.hp <= 25 ? "#ff6b5a" : "#ffd9a8";
    const noAtk = p.noAtkUntil >= st.turnNo;

    let html = `<div class="stage-banner">${banner} ${isSelf ? "· 你的回合" : ""}</div><div class="pa-head">`;

    // 御座（天皇 + 宝物）
    html += `<div class="avatar-card" data-emperor="1" data-pi="${pi}">
      <div class="role">御座 · 天皇</div>
      <div class="nm">${p.emperor.name}</div>
      <div class="info">${[p.emperor.t1, p.emperor.t2, p.emperor.t3].map(t => t.replace("御·", "")).join("<br>")}</div>
      <div class="u-eq">${p.treasure.length ? p.treasure.map(t => `<span class="eq-chip" data-tr-name="${t.card.name}">宝·${t.card.name}</span>`).join("<br>") : ""}</div>
    </div>`;

    // 本阵（将军）
    const shogunAim = this.combatMode && !isSelf && this.selectedAttacker != null && (p.field.length === 0 || this.bypass);
    html += `<div class="avatar-card${shogunAim ? " atk-targetable" : ""}" data-shogun="1" data-pi="${pi}">
      <div class="role">本阵 · 将军${shogunAim ? "（可点击直击）" : ""}</div>
      <div class="nm">${p.shogun.name}</div>
      <div class="info">${p.shogun.skill} ${p.shogun.skillv}<br>躲避 ${p.shogun.dodge}%<br>${p.shogun.talent || ""} ／ ${p.shogun.nature || ""} ／ ${p.shogun.rank || ""}${noAtk ? "<br><b style='color:#ff6b5a'>两回合禁攻</b>" : ""}</div>
      <div class="hp-bar"><div class="fill" style="width:${Math.max(0, Math.min(100, p.hp / (p.maxHp || 100) * 100))}%;background:${hpColor}"></div></div>
      <div class="hp-text">HP ${p.hp} / ${p.maxHp || 100}</div>
    </div>`;

    // 战场区
    html += `<div class="battlefield"><div class="bf-label">战场区（${p.field.length}/5）</div><div class="bf-slots">`;
    for (let i = 0; i < 5; i++) {
      const u = p.field[i];
      if (u) {
        const s = Game.unitStats(u);
        const cls = ["samurai", "noble", "daimyo"][["samurai", "noble", "daimyo"].indexOf(u.kind)];
        let statTxt = `攻${s.atk}/防${s.def}`;
        if (u.kind === "daimyo") statTxt = `攻${s.atk}/防${s.def} · 命${u.hp}`;
        const uDodge = Game.unitDodge(u);
        if (uDodge > 0) statTxt += ` <span class="dodge-tag">躲${uDodge}%</span>`;
        const prevKey = this._prevStats && this._prevStats[u.uid];
        const nowKey = `${s.atk}|${s.def}|${u.hp}`;
        const statChanged = prevKey !== undefined && prevKey !== nowKey;
        if (!this._prevStats) this._prevStats = {};
        this._prevStats[u.uid] = nowKey;
        const eq = [u.eq.blade ? `<span class="eq-chip" data-eq-type="blade" data-eq-name="${u.eq.blade.name}">刃</span>` : "",
               u.eq.armor ? `<span class="eq-chip" data-eq-type="armor" data-eq-name="${u.eq.armor.name}">铠</span>` : "",
               u.eq.mount ? `<span class="eq-chip" data-eq-type="mount" data-eq-name="${u.eq.mount.name}">骑</span>` : ""].filter(Boolean).join("");
        let extra = "";
        if (this.combatMode && u.pi === 0 && !p.typeAtk[u.kind]) extra = " selectable atk-selectable";
        if (this.mode === "sacrifice" && (u.kind === "samurai" || u.kind === "noble") && u.summonedTurn < st.turnNo) extra = " targetable";
        if (this.combatMode && u.pi === 1) {
          const layer = Game.frontLayer(1);
          const isTarget = layer && layer.some(x => x.uid === u.uid);
          extra = isTarget ? " targetable atk-targetable" : " targetable atk-other";
        }
        if (u.pi === 0 && this.mode === "equip") extra = " targetable";
        const lifeBar = u.kind === "daimyo" ? `<div class="hp-bar mini"><div class="fill" style="width:${Math.max(0, u.hp / 20 * 100)}%;background:#d9534f"></div></div>` : "";
        html += `<div class="bf-slot fill"><div class="unit-card ${cls}${extra}" data-uid="${u.uid}" data-pi="${u.pi}">
          <div class="u-portrait">${this.portraitHTML({ type: u.kind === "samurai" ? "samurai" : u.kind === "daimyo" ? "daimyo" : "noble", card: u.card }, 34)}</div>
          <div class="u-kind">${KIND_CN[u.kind]}<span style="float:right;cursor:pointer" data-info-uid="${u.uid}" title="查看详情">ℹ</span>${u.pi === 0 ? `<span style="float:right;cursor:pointer;color:#ff9a8a" data-discard-uid="${u.uid}" title="自愿下场">✕</span>` : ""}</div>
          <div class="u-name">${u.card.name}</div>
          <div class="u-stats${statChanged ? " stat-changed" : ""}">${statTxt}</div>
          ${lifeBar}
          <div class="u-eq">${eq}</div>
        </div></div>`;
      } else {
        html += `<div class="bf-slot"></div>`;
      }
    }
    html += `</div></div></div>`;

    // 手牌
    html += `<div class="hand">`;
    const selfTurn = st.cur === 0 && !p.isAI;
    const aiTurn = st.cur === 1 && p.isAI;
    const canAct = (isSelf && selfTurn) || (!isSelf && aiTurn);
    for (let i = 0; i < p.hand.length; i++) {
      const c = p.hand[i];
      const tn = c.type === "samurai" ? c.card.name : `【${TYPE_CN[c.type]}】${c.card.name}`;
      let sub = "";
      if (c.type === "samurai") sub = `攻${c.card.atk}/防${c.card.dfs}`;
      else if (c.type === "daimyo") sub = `攻${c.card.atk}/防${c.card.dfs}`;
      else if (c.type === "noble") sub = `攻${c.card.atk}/防${c.card.dfs}`;
      else if (c.type === "blade") sub = `+${c.card.atk}攻`;
      else if (c.type === "armor") sub = `+${c.card.dfs}防`;
      else if (c.type === "mount") sub = `${c.card.dodge}%躲`;
      else if (c.type === "castle") sub = `${c.card.tier} 攻防+${c.card.ao}`;
      else if (c.type === "process") sub = `己+${c.card.a1o}/敌+${c.card.a1p}`;
      else if (c.type === "treasure") sub = `武士+${c.card.s1}`;
      const dis = canAct ? "" : " disabled";
      html += `<div class="hand-card type-${c.type}${dis}" data-hi="${i}" data-pi="${pi}">
        <div class="t">${TYPE_CN[c.type] || KIND_CN[c.type] || ""}</div>
        <div class="n">${tn}</div>
        <div class="s">${sub}</div>
      </div>`;
    }
    html += `</div>`;
    cont.innerHTML = html;
    this.bindClicks(cont, isSelf, selfTurn, aiTurn);
  },

  /* ---------- 中央区 ---------- */
  renderCenter() {
    const st = Game.state;
    this.el("deckCount").textContent = st.deck.length;
    this.el("discardCount").textContent = st.discard.length;
    const zs = this.el("zoneSlot");
    if (st.zone) {
      const z = st.zone;
      const owner = st.players[z.owner].name;
      let info = "";
      if (z.type === "castle") info = `${z.card.tier} · 己攻防+${z.card.ao}/敌+${z.card.ap} · 增幅：${z.card.amp1}/${z.card.amp2}`;
      else info = `己攻防+${z.card.a1o}/敌+${z.card.a1p} · 天佑 己+${z.card.a2o}/敌+${z.card.a2p} · ${z.card.l4}`;
      zs.innerHTML = `<div class="z-name" style="cursor:pointer" title="点击查看详情">${TYPE_CN[z.type]} · ${z.card.name} 🔍</div><div class="z-info">${owner} 放置<br>${info}</div>`;
      zs.className = "zone-slot fill zone-active";
      zs.onclick = () => this.showZoneDetail(z);
      return;
    } else {
      zs.innerHTML = `<span style="color:#7a6a4a">（空）</span>`;
      zs.className = "zone-slot";
    }
    this.renderLog();
  },

  /* 战报消息渲染：将【卡名】解析为可点击详情链接 */
  renderLogMsg(l) {
    const frag = document.createElement("span");
    const mkTxt = t => { const n = document.createElement("span"); n.textContent = t; return n; };
    const re = /【([^】]+)】/g;
    let last = 0, m;
    const text = l.msg;
    while ((m = re.exec(text))) {
      frag.appendChild(mkTxt(text.slice(last, m.index)));
      const card = this.findCardByName(m[1]);
      if (card) {
        const s = document.createElement("span");
        s.textContent = "【" + m[1] + "】";
        s.style.cursor = "pointer";
        s.style.color = "#ffd98a";
        s.style.textDecoration = "underline dotted";
        s.title = "查看详情：" + m[1];
        s.addEventListener("click", () => UI.showCardModal(card, [{ label: "关闭", fn: () => UI.hideModal() }]));
        frag.appendChild(s);
      } else {
        const plain = mkTxt("【" + m[1] + "】"); frag.appendChild(plain);
      }
      last = m.index + m[0].length;
    }
    frag.appendChild(mkTxt(text.slice(last)));
    return frag;
  },

  /* 按卡名查找卡（全库，含化身/装备等） */
  findCardByName(name) {
    if (!this._cardByName) {
      this._cardByName = {};
      for (const [type, arr] of Object.entries(CARDS)) {
        for (const c of arr) this._cardByName[c.name] = { type, card: c };
      }
    }
    return this._cardByName[name] || null;
  },

  renderLog() {
    const st = Game.state;
    const list = this.el("logList");
    list.innerHTML = "";
    const recent = st.log.slice(-40);
    for (const l of recent) {
      const d = document.createElement("div");
      d.className = `log-${l.who}`;
      d.appendChild(this.renderLogMsg(l));
      if (l.card) {
        const s = document.createElement("span");
        s.textContent = " 🔍";
        s.style.cursor = "pointer";
        s.style.color = "#ffd98a";
        s.title = "查看卡牌详情";
        s.addEventListener("click", () => UI.showCardModal(l.card, [{ label: "关闭", fn: () => UI.hideModal() }]));
        d.appendChild(s);
      }
      list.appendChild(d);
    }
    list.scrollTop = list.scrollHeight;
  },

  /* ---------- 点击绑定 ---------- */
  bindClicks(cont, isSelf, selfTurn, aiTurn) {
    const st = Game.state;
    if (st.winner != null) return;
    const canAct = (isSelf && selfTurn) || (!isSelf && aiTurn);

    // 装备/宝物 chips 点击查看详情（己方宝物可主动弃置）
    cont.querySelectorAll("[data-eq-type], [data-tr-name]").forEach(el => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const tn = el.dataset.trName;
        const et = el.dataset.eqType;
        let card = null;
        if (tn) card = CARDS.treasure.find(x => x.name === tn);
        else if (et) card = CARDS[et].find(x => x.name === el.dataset.eqName);
        if (!card) return;
        const actions = [{ label: "关闭", fn: () => this.hideModal() }];
        if (tn) {
          const host = el.closest ? el.closest("[data-emperor]") : null;
          const ownerPi = host ? parseInt(host.dataset.pi) : null;
          if (ownerPi === 0) {
            const p0 = Game.state.players[0];
            const ti = p0.treasure.findIndex(t => t.card.name === tn);
            if (ti >= 0) {
              actions.unshift({ label: "♻ 弃置此宝物（进入弃牌堆）", cls: "primary", fn: () => { Game.discardTreasure(0, ti); this.hideModal(); this.renderAll(); } });
            }
          }
        }
        this.showCardModal({ type: tn ? "treasure" : et, card }, actions);
      });
    });

    // 天皇详情查看
    cont.querySelectorAll("[data-emperor]").forEach(el => {
      el.addEventListener("click", () => {
        const upi = parseInt(el.dataset.pi);
        this.showEmperorDetail(upi);
      });
    });

    // 将军（本阵）点击：战斗时直击，平时查看详情
    cont.querySelectorAll("[data-shogun]").forEach(el => {
      el.addEventListener("click", () => {
        const upi = parseInt(el.dataset.pi);
        if (this.combatMode && upi === 1 && this.selectedAttacker != null) {
          const duel = Game.duelStrikeEligible(0); // 攻击方是玩家(pi=0)
          if (this.bypass ? Game.canAttackShogun(1) : (duel && duel.ok)) {
            const r = Game.attack(0, this.selectedAttacker, "shogun", this.bypass);
            if (r === true) {
              this.selectedAttacker = null; this.aimFromUid = null;
              this.hideAimLine();
            } else if (r !== "pending") {
              this.logHint("直击未能执行，可重新选择目标");
            }
            this.renderAll();
          } else {
            this.logHint((duel && duel.why) || "对方场上仍有单位，不能直击将军（可用破阵越级）！");
          }
          return;
        }
        this.showShogunDetail(upi);
      });
    });

    // 单位详情按钮
    cont.querySelectorAll("[data-info-uid]").forEach(el => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const u = st.players[parseInt(el.closest(".unit-card").dataset.pi)].field.find(x => x.uid === parseInt(el.dataset.infoUid));
        if (u) this.showUnitModal(u);
      });
    });

    // 自愿下场按钮
    cont.querySelectorAll("[data-discard-uid]").forEach(el => {
      el.addEventListener("click", (ev) => {
        ev.stopPropagation();
        const uid = parseInt(el.dataset.discardUid);
        const u = st.players[0].field.find(x => x.uid === uid);
        if (!u) return;
        this.showModal("将单位下场？", `确定将【${u.card.name}】移入弃牌堆（装备随弃，腾出战场区牌位）吗？`, [
          { label: "下场", cls: "primary", fn: () => { Game.discardUnit(0, uid); this.hideModal(); this.renderAll(); } },
          { label: "取消", fn: () => this.hideModal() },
        ]);
      });
    });

    // 单位点击
    cont.querySelectorAll(".unit-card").forEach(el => {
      el.addEventListener("click", () => {
        const uid = parseInt(el.dataset.uid);
        const upi = parseInt(el.dataset.pi);
        if (this.combatMode && this.mode !== "equip" && this.mode !== "sacrifice" && upi === 0) {
          // 选攻击者（金色虚线引导随鼠标指向目标）；本类型本回合已攻击的单位不可再选
          const p0 = st.players[0];
          const u0 = p0.field.find(x => x.uid === uid);
          if (!u0) return;
          if (p0.typeAtk && p0.typeAtk[u0.kind]) {
            this.logHint(`【${u0.card.name}】本回合该类型已发动过攻击，不可再选`);
            return;
          }
          if (u0.attackedThisTurn) {
            this.logHint(`【${u0.card.name}】本回合已攻击过，攻击次数耗尽`);
            return;
          }
          // 春秋义战：对方空场时，仅最高阶单位（大名＞公卿＞武士）可发动直击
          if (st.players[1].field.length === 0 && !this.bypass) {
            const duel = Game.duelStrikeEligible(0);
            if (duel && duel.ok && duel.kind !== u0.kind) {
              const order = { daimyo: "大名", noble: "公卿", samurai: "武士" };
              this.logHint(`春秋义战：对方空场，仅${order[duel.kind]}可直击将军，${KIND_CN[u0.kind]}不可`);
              return;
            }
            if (duel && !duel.ok) {
              this.logHint(duel.why);
              return;
            }
          }
          this.selectedAttacker = uid;
          this.aimFromUid = uid;
          this.mode = "combat";
          this.shakeUnit(uid);
          this.logHint(`已选攻击者，金色虚线指向对方目标（最前层单位或将军）`);
          this.renderAll();
          return;
        }
        if (this.combatMode && upi === 1) {
          if (this.selectedAttacker != null) {
            this.flashUnit(1, uid);
            const r = Game.attack(0, this.selectedAttacker, uid, this.bypass);
            if (r === true) { // 攻击成功 → 结束本次选择
              this.selectedAttacker = null; this.aimFromUid = null;
              this.hideAimLine();
            } else if (r === "pending") {
              // 尊位弹窗等待中，保留选择
            } else {
              // 攻击被拒（后层/类型限制等）→ 保留选择，可重选目标
              this.logHint("攻击未能执行，请重新选择目标（金色虚线指引）");
            }
            this.renderAll();
          }
          return;
        }
        if (this.mode === "sacrifice" && upi === 0 && this.sacTarget >= 0) {
          // 选择献祭目标
          const di = this.sacTarget;
          const c = st.players[0].hand[di];
          if (c && (c.type === "daimyo" || c.type === "noble")) {
            const fi = st.players[0].field.findIndex(x => x.uid === uid);
            if (Game.sacrificeSummon(0, di, fi)) {
              this.flashEl(document.querySelector(`.unit-card[data-uid="${uid}"]`), "unit-shake");
              this.mode = "idle"; this.sacTarget = -1;
              this.renderAll();
            }
          }
          return;
        }
        if (this.mode === "equip" && upi === 0 && this.eqHandIdx >= 0) {
          if (Game.equip(0, this.eqHandIdx, uid)) {
            this.flashUnit(0, uid);
            this.mode = "idle"; this.eqHandIdx = -1;
            this.renderAll();
          }
          return;
        }
      });
    });

    // 手牌点击 → 详情 + 操作弹窗
    cont.querySelectorAll(".hand-card").forEach(el => {
      el.addEventListener("click", () => {
        if (!isSelf) return; // 仅己方手牌可操作
        const hi = parseInt(el.dataset.hi);
        const c = st.players[parseInt(el.dataset.pi)].hand[hi];
        if (!canAct) return;
        this.flashHand(parseInt(el.dataset.pi), hi);
        const actions = [];
        if (c.type === "samurai") {
          actions.push({ label: "召唤武士上场", cls: "primary", fn: () => { Game.summonSamurai(0, hi); UI.hideModal(); UI.renderAll(); const nu = st.players[0].field[st.players[0].field.length - 1]; if (nu) UI.flashUnit(0, nu.uid); } });
        } else if (c.type === "daimyo" || c.type === "noble") {
          const p = st.players[0];
          if (Game.canGrace(p)) {
            actions.push({ label: "✨ 恩典召唤（无需献祭）", cls: "primary", fn: () => { Game.graceSummon(0, hi); UI.hideModal(); UI.renderAll(); const nu = st.players[0].field[st.players[0].field.length - 1]; if (nu) UI.flashUnit(0, nu.uid); } });
          }
          actions.push({ label: "献祭召唤（需场上有武士）", fn: () => { UI.hideModal(); UI.startSacrifice(hi); } });
        } else if (c.type === "castle" || c.type === "process") {
          actions.push({ label: st.zone ? "顶替当前常置牌并放置" : "放置于事件/城池区", cls: "primary", fn: () => { Game.playZone(0, hi); UI.flashZone(); UI.hideModal(); UI.renderAll(); } });
        } else if (c.type === "blade" || c.type === "armor" || c.type === "mount") {
          actions.push({ label: "选择目标装备", cls: "primary", fn: () => { UI.hideModal(); UI.startEquip(hi); } });
        } else if (c.type === "treasure") {
          actions.push({ label: "装备于己方天皇（第一~三层加成+登场必发）", cls: "primary", fn: () => { Game.playTreasure(0, hi, 0); UI.flashEmperor(0); UI.hideModal(); UI.renderAll(); } });
          actions.push({ label: "装备于对方天皇（诅咒/赠礼）", fn: () => { Game.playTreasure(0, hi, 1); UI.flashEmperor(1); UI.hideModal(); UI.renderAll(); } });
        } else if (c.type === "sacred" || c.type === "calamity") {
          actions.push({ label: "主动使用（第二层效果；不禁攻）", cls: "primary", fn: () => { Game.useEvent(0, hi); UI.hideModal(); UI.renderAll(); } });
        }
        actions.push({ label: "弃置此牌（放入弃牌堆）", fn: () => { Game.discardHand(0, hi); UI.hideModal(); UI.renderAll(); } });
        actions.push({ label: "关闭", fn: () => UI.hideModal() });
        UI.showCardModal(c, actions);
      });
    });

    // 对方空场时可点将军（直击）
    if (this.combatMode && this.selectedAttacker != null) {
      const oppField = st.players[1].field.length;
      const oppArea = this.el("opponent");
      // 已在 unit-card 处理；将军直击通过顶部按钮
    }
  },

  startSacrifice(hi) {
    const p = Game.state.players[0];
    const c = p.hand[hi];
    const sac = p.field.filter(u => (u.kind === "samurai" || u.kind === "noble") && u.summonedTurn < Game.state.turnNo);
    if (!sac.length) { this.logHint("场上没有可献祭的武士或公卿（本回合召唤的不可献祭）"); return; }
    this.mode = "sacrifice";
    this.sacTarget = hi;
    this.logHint(`献祭召唤【${c.card.name}】：点击场上一位武士或公卿作为祭品`);
    this.renderAll();
  },

  startEquip(hi) {
    this.mode = "equip";
    this.eqHandIdx = hi;
    this.logHint("点击场上一位合法单位进行装备");
    this.renderAll();
  },

  /* ---------- 天皇详情（含使用记录） ---------- */
  showEmperorDetail(pi) {
    const st = Game.state;
    const p = st.players[pi];
    const body = document.createElement("div");
    body.className = "shogun-detail";
    const hist = (p.emperorHist || []).slice().reverse().map(h =>
      `<div class="sd-hist-item">第 ${h.t} 回合 · ${h.src} · ${h.desc}</div>`).join("") || '<div class="sd-hist-empty">尚无记录</div>';
    body.innerHTML = this.cardInfoHTML({ type: "emperors", card: p.emperor }) +
      `<hr style="border-color:#6a5a35"><div class="sd-hist-title" style="margin-top:8px">使用记录</div>
      <div class="sd-hist">${hist}</div>`;
    this.showModal(`御座 · 天皇 ${p.emperor.name}`, body, [{ label: "关闭", fn: () => this.hideModal() }]);
  },

  /* ---------- 城池/事件详情（含使用记录） ---------- */
  showZoneDetail(z) {
    const body = document.createElement("div");
    body.className = "shogun-detail";
    const hist = (z.hist || []).slice().reverse().map(h =>
      `<div class="sd-hist-item">第 ${h.t} 回合 · ${h.src} · ${h.desc}${h.owner !== undefined ? ` <span style="color:#9ad0ff">（专属权：${Game.state.players[h.owner].name}）</span>` : ""}</div>`).join("") || '<div class="sd-hist-empty">尚无记录</div>';
    body.innerHTML = this.cardInfoHTML({ type: z.type, card: z.card }) +
      `<hr style="border-color:#6a5a35"><div class="sd-hist-title" style="margin-top:8px">使用记录</div>
      <div class="sd-hist">${hist}</div>`;
    this.showModal(`常置牌 · ${z.card.name}（${z.owner === 0 ? "玩家" : "电脑"}）`, body, [{ label: "关闭", fn: () => this.hideModal() }]);
  },

  /* ---------- 卡牌详情（逐层逐特效） ---------- */
  /* 层状态标注块：[[层名, 状态, cls(ok|cond|passive|act)], ...] */
  layerBlock(items) {
    if (!items || !items.length) return "";
    const rows = items.map(([name, state, cls]) =>
      `<div class="layer-row"><span class="layer-name">${name}</span><span class="layer-tag ${cls || "ok"}">${state}</span></div>`).join("");
    return `<hr style="border-color:#6a5a35"><div class="sd-hist-title" style="margin-top:8px">层状态 · 每层均可用</div><div class="layer-block">${rows}</div>`;
  },

  fxLine(label, txt) { return `<div style="margin:2px 0"><b style="color:#ffd98a">${label}</b> ${txt}</div>`; },
  /* ---------- 卡牌画像 ---------- */
  hashStr(s) { return hashStr(s); },
  seed01(s) { return (this.hashStr(s) % 10000) / 10000; },

  pickElement(c) {
    const txt = c.card.name + " " + (c.card.intro || "");
    const has = k => txt.includes(k);
    if (has("火") || has("焰")) return "flame";
    if (has("海") || has("水") || has("雨") || has("浪") || has("涝")) return "wave";
    if (has("风") || has("飓")) return "wind";
    if (has("龙")) return "dragon";
    if (has("蛇")) return "snake";
    if (has("鹿")) return "deer";
    if (has("狐")) return "fox";
    if (has("鸟") || has("鸦") || has("鹤") || has("乌") || has("羽")) return "bird";
    if (has("山") || has("岳") || has("岩")) return "mountain";
    if (has("月")) return "moon";
    if (has("日") || has("太阳") || has("天照") || has("光")) return "sun";
    if (has("星")) return "star";
    if (has("马")) return "horse";
    if (has("花") || has("樱") || has("菊") || has("梅")) return "flower";
    if (has("塔")) return "pagoda";
    if (has("城") || has("天守") || has("郭")) return "castle";
    if (has("刀") || has("剑") || has("刃") || has("斩") || has("枪")) return "sword";
    if (has("弓") || has("矢") || has("射")) return "bow";
    if (has("盾") || has("铠") || has("甲") || has("具足") || has("胴") || has("大袖")) return "shield";
    if (has("旗") || has("乱") || has("战") || has("军") || has("阵") || has("叛")) return "flag";
    if (has("神") || has("祓") || has("降临")) return "sun";
    if (has("疫") || has("夜") || has("阴")) return "moon";
    const sd = this.seed01(c.card.name);
    switch (c.type) {
      case "emperors": return sd < 0.5 ? "flower" : "sun";
      case "shoguns": return "flag";
      case "daimyo": return sd < 0.6 ? "castle" : "mountain";
      case "samurai": return sd < 0.5 ? "sword" : "bow";
      case "noble": return sd < 0.5 ? "bird" : "flower";
      case "process": return "flag";
      case "castle": return sd < 0.7 ? "castle" : "pagoda";
      case "treasure": return "orb";
      case "sacred": return sd < 0.5 ? "sun" : "star";
      case "calamity": return sd < 0.5 ? "flame" : "wave";
      case "blade": return "sword";
      case "armor": return "shield";
      case "mount": return "horse";
    }
    return "star";
  },

  /* 人物类（天皇/将军/大名/武士/公卿）：剪影人像（发型盔式按类型+哈希变化） */
  personElement(c, sd) {
    const types = { emperors: ["C", "C", "G"], shoguns: ["E", "E", "B"],
      daimyo: ["B", "E", "G"], samurai: ["A", "A", "B", "G", "H"], noble: ["D", "D", "G"] };
    const list = types[c.type] || ["A"];
    const v = list[Math.floor(sd * list.length) % list.length];
    const hair = {
      A: `<path d="M36 30 Q50 8 64 30 L64 26 Q50 12 36 26 Z" fill="$BG2"/><path d="M33 34 Q34 20 44 16 L46 22 Q38 24 36 32 Z" fill="$BG2"/><path d="M67 34 Q66 20 56 16 L54 22 Q62 24 64 32 Z" fill="$BG2"/>`,
      B: `<path d="M33 30 Q50 8 67 30 L67 36 L33 36 Z" fill="$BG2"/><path d="M33 34 L67 34 L65 30 L35 30 Z" fill="$AC"/><path d="M50 20 L58 8 L42 8 Z" fill="$AC"/>`,
      C: `<path d="M37 26 L63 26 L61 12 L39 12 Z" fill="$BG2"/><path d="M46 12 L46 6 L54 6 L54 12 Z" fill="$AC"/><path d="M39 20 L61 20 L60 16 L40 16 Z" fill="$AC" opacity=".7"/>`,
      D: `<path d="M34 28 Q50 6 66 28 L66 32 Q50 18 34 32 Z" fill="$BG2"/><path d="M38 30 Q50 22 62 30 L60 34 Q50 28 40 34 Z" fill="$BG2" opacity=".8"/>`,
      E: `<path d="M31 30 Q50 6 69 30 L69 36 L31 36 Z" fill="$BG2"/><path d="M31 34 L69 34 L68 30 L32 30 Z" fill="$AC"/><path d="M50 18 L58 6 L42 6 Z" fill="$AC"/><circle cx="50" cy="13" r="2" fill="$FG"/>`,
      G: `<path d="M37 30 Q50 14 63 30 L63 26 Q50 10 37 26 Z" fill="$BG2"/><path d="M50 20 L50 10 Q56 12 56 18 Z" fill="$BG2"/>`,
      H: `<path d="M34 32 Q50 12 66 32 L66 28 Q50 14 34 28 Z" fill="$BG2"/>`,
    }[v];
    const eyeShift = sd > 0.5 ? 1.4 : -1.4;
    const ex = (v === "B" || v === "E") ? 0 : eyeShift;
    return `<g>
      <path d="M44 48 Q44 42 50 42 Q56 42 56 48 L56 56 Q50 61 44 56 Z" fill="$BG2"/>
      <ellipse cx="50" cy="33" rx="12.5" ry="14.5" fill="#f2d5b0"/>
      ${hair}
      <path d="M${44 + ex} 32 q3 2.4 6 0" stroke="#4a3018" stroke-width="1.7" fill="none"/>
      <path d="M${50 + ex} 32 q3 2.4 6 0" stroke="#4a3018" stroke-width="1.7" fill="none"/>
      <path d="M22 90 Q26 62 50 60 Q74 62 78 90 Z" fill="$FG"/>
      <path d="M38 62 L50 76 L62 62 L62 56 Q50 64 38 56 Z" fill="$AC"/>
      <path d="M${28 + (sd > 0.5 ? 4 : 0)} 76 Q38 70 46 76" stroke="$BG2" stroke-width="2" fill="none" opacity=".55"/>
    </g>`;
  },

  portraitArt(c) {
    const pal = PORTRAIT_PAL[c.type] || PORTRAIT_PAL.process;
    const sd = this.seed01(c.card.name + c.card.id);
    const p = pal[Math.floor(sd * pal.length)];
    const person = c.type === "emperors" || c.type === "shoguns" || c.type === "daimyo" ||
      c.type === "samurai" || c.type === "noble";
    let el = person ? this.personElement(c, sd) : null;
    if (!el) {
      const tn = c.type;
      if (tn === "process" && EVENT_EL[c.card.name]) el = EVENT_EL[c.card.name];
      else if (tn === "castle" && ZONE_BG[c.card.name]) {
        el = ZONE_BG[c.card.name]
          .replace(/<svg[^>]*>/, '<g transform="translate(2 20) scale(0.4)" fill="$FG">')
          .replace(/<\/svg>/, '</g>');
      }
      else if (tn === "armor") el = armorElement(c, sd);
      else if (tn === "mount") el = mountElement(c, sd);
      else if (tn === "treasure" && TREASURE_EL[c.card.name]) el = TREASURE_EL[c.card.name];
      else if (tn === "blade") el = bladeElement(c, sd);
      else if (tn === "sacred" && SACRED_EL[c.card.name]) el = SACRED_EL[c.card.name];
      else if (tn === "calamity" && CALAMITY_EL[c.card.name]) el = CALAMITY_EL[c.card.name];
      if (!el) el = PORTRAIT_EL[this.pickElement(c)] || PORTRAIT_EL.star;
    }
    return {
      bg1: p[0], bg2: p[1], fg: p[2], accent: p[3],
      element: el.replace(/\$FG/g, p[2]).replace(/\$AC/g, p[3]).replace(/\$BG2/g, p[1]),
      tilt: person ? 0 : Math.round(sd * 60 - 30),
      dash: sd < 0.45 ? "3 3" : sd < 0.7 ? "1 0" : "0",
      seed: (this.hashStr(c.card.name) % 89999) + 10000,
      deco: sd < 0.33 ? `<path d="M18 16 l4 8 8 4 -8 4 -4 8 -4 -8 -8 -4 8 -4 Z" fill="$AC" opacity=".7"/>`
        : sd < 0.66 ? `<circle cx="82" cy="18" r="3.4" fill="$AC" opacity=".8"/>`
        : `<circle cx="18" cy="82" r="2.6" fill="$AC" opacity=".7"/><circle cx="82" cy="82" r="2.6" fill="$AC" opacity=".7"/>`,
    };
  },

  portraitHTML(c, size) {
    const art = this.portraitArt(c);
    const gid = "pg" + art.seed;
    const deco = art.deco.replace(/\$AC/g, art.accent);
    return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
      <defs><radialGradient id="${gid}" cx="34%" cy="28%" r="85%">
        <stop offset="0%" stop-color="${art.bg1}"/><stop offset="100%" stop-color="${art.bg2}"/>
      </radialGradient></defs>
      <rect width="100" height="100" rx="15" fill="url(#${gid})"/>
      <circle cx="50" cy="50" r="43" fill="none" stroke="${art.fg}" stroke-opacity=".5" stroke-width="2" stroke-dasharray="${art.dash}"/>
      <g transform="rotate(${art.tilt} 50 50)">${art.element}</g>
      ${deco}
    </svg>`;
  },

  cardInfoHTML(c) {
    const t = c.type, cd = c.card;
    const T = TYPE_CN[t] || KIND_CN[t] || "";
    let html = `<div class="cd-head">
      <div class="cd-portrait">${this.portraitHTML(c, 84)}</div>
      <div class="cd-head-main">
        <div class="cd-title"><b style="color:var(--gold)">【${T}】${cd.name}</b>${cd.era ? `<span style="color:#9a8a6a"> · ${cd.era}</span>` : ""}</div>
        ${cd.intro ? `<div class="cd-intro">📜 ${cd.intro}</div>` : ""}
      </div>
    </div><div style="line-height:1.75;font-size:13px">`;

    if (t === "samurai") {
      html += this.fxLine("数值", `攻击 <b>${cd.atk}</b> ／ 防御 <b>${cd.dfs}</b>（合计 ≤7）`);
      html += this.fxLine("耐久", `被命中 −攻击值点伤害（防御归零下场）`);
      const parts = cd.fx.split("·");
      const l1 = parts[0] || "", l2 = parts[1] || "", l3 = parts[2] || "";
      html += this.fxLine("三层特效", "");
      html += `　第一层：${l1 === "战意" ? "每次攻击后攻击值 +1（永久）" : "坚守：每次被攻击未击破后防御值 +1"}<br>`;
      html += `　第二层：${l2 === "持刃" ? "持刃：装备兵刃时攻击额外 +1" : "骑术：装备骑具时防御额外 +1"}<br>`;
      const [mine, theirs] = (l3 || "己攻/敌攻").split("/");
      html += `　第三层·事件立场：己方事件在区时${mine.startsWith("己攻") ? "攻击" : "防御"}+1；敌方事件在区时${theirs.startsWith("敌攻") ? "攻击" : "防御"}+1`;
      html += this.layerBlock([
        ["第一层·" + l1, "⚙ 被动（攻击后/受击未破时触发）", "passive"],
        ["第二层·" + l2, l2 === "持刃" ? "○ 装备兵刃后生效" : "○ 装备骑具后生效", "cond"],
        ["第三层·事件立场", "○ 事件区为己方/敌方事件时生效", "cond"],
      ]);
    } else if (t === "daimyo") {
      html += this.fxLine("数值", `攻击 <b>${cd.atk}</b> ／ 防御 <b>${cd.dfs}</b>（合计 ≤15）`);
      html += this.fxLine("两条命（命值制）", "替死 10 点 + 本命 10 点 = 共 20 点；每次命中耗攻击值点命值；进入本命时攻防按所有特效加减重新计算");
      html += this.fxLine("第一层·动态", "己方武士数量多于对方 → 攻击 +1；己方公卿多于对方 → 防御 +1（实时）");
      html += this.fxLine("第二层·辅佐", cd.l2);
      html += this.fxLine("第三层·城盟", "己方王城 → 额外一次替死（命值+10）；己方名城/大城 → 攻防各 +1");
      html += this.fxLine("第四层·事件之势", cd.l4);
      html += this.layerBlock([
        ["第一层·动态", "⚙ 实时（己方武士/公卿多于对方）", "passive"],
        ["第二层·辅佐", `✔ 常驻光环（${cd.l2}）`, "ok"],
        ["第三层·城盟", "○ 己方城池时生效（王城命值+10／名城/大城攻防+1）", "cond"],
        ["第四层·事件之势", `○ 事件区为事件牌时生效（${cd.l4}）`, "cond"],
      ]);
    } else if (t === "noble") {
      html += this.fxLine("数值", `攻击 <b>${cd.atk}</b> ／ 防御 <b>${cd.dfs}</b>（合计 ≤10）`);
      html += this.fxLine("立场", "被命中 −攻击值点伤害（攻击归零下场）");
      html += this.fxLine("三特效（光环）", `${cd.f1} ／ ${cd.f2} ／ ${cd.f3}`);
      html += this.fxLine("城池加成", cd.castle);
      html += this.layerBlock([
        ["三特效·光环", "✔ 已生效（①攻击 ②防御 ③兵刃 ④装具 ⑤骑具%）", "ok"],
        ["城池加成", "○ 需对应城池在场（替身机制）", "cond"],
      ]);
    } else if (t === "process") {
      html += `<div class="fx-row"><b style="color:#ffd98a">第一层·攻防洪流</b>：</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">● 己方战场区所有单位<b>攻击值与防御值各 +${cd.a1o}</b>；对方战场区所有单位<b>各 +${cd.a1p}</b>。</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">● 装备共鸣：常置期间己方所有兵刃、装具的<b>成长概率 +10%</b>，对方所有兵刃/装具的<b>成长概率 +5%</b>（成长概率上限 100%）；事件被顶替后恢复原值。</div>`;
      html += this.fxLine("第二层·天佑将军", `每张事件牌每局仅触发一次：放置后首个回合开始——事件为己方时己方将军 +${cd.a2o}；为对方时对方将军 +${cd.a2p}（上限为将军总生命）`);
      html += `<div class="fx-row"><b style="color:#ffd98a">第三层·战火磨砺</b>（四个触发效果<b>全部生效</b>，增幅为永久累积）：</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)"><b style="color:#9ad0ff">● 敌攻</b>：每当<b>对方公卿发动一次攻击</b>后，己方从己方战场区选一张单位，攻击值 <b>+1</b>。</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)"><b style="color:#9ad0ff">● 受创</b>：每当<b>己方将军受到一次伤害</b>后，己方从己方战场区选一张单位，防御值 <b>+1</b>。</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)"><b style="color:#9ad0ff">● 我攻</b>：每当<b>己方单位发动一次攻击</b>后，对方从对方战场区选一张单位，攻击值或防御值 <b>+1</b>（对方二选一）。</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)"><b style="color:#9ad0ff">● 御守</b>：己方单位被对方攻击（防御阶段）时掷骰判定，<b>30% 概率</b>使该次攻击<b>无效（清零）</b>；判定成功则对方该攻击单位攻击值 +1（永久）。御守判定与骑具躲避<b>独立结算</b>，任一成功即本次攻击无效。</div>`;
      const l4Detail = cd.l4 === "破阵"
        ? `<div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)"><b style="color:#ff9a6a">● 破阵</b>：常置期间，若<b>己方战场区有大名在场</b>，每回合可指定一单位发动一次<b>越级攻击</b>——无视最前层，可直接攻击对方任意层单位或直击将军。每次发动扣除己方将军 <b>${cd.cost}</b> 点生命；生命不足以支付时不可发动。通过右上角「⚡ 破阵」按钮发动，每回合限一次。</div>`
        : `<div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)"><b style="color:#ff9a6a">● 暗杀</b>：常置期间，若<b>己方战场区有一位装备了装备牌（兵刃／装具／骑具）的武士</b>，可在己方行动阶段发动：对方将军受到 <b>5 点直接伤害</b>（可被对方将军躲避判定）。每次发动扣除己方将军 <b>${cd.cost}</b> 点生命；生命不足或无装备武士时不可发动。通过右上角「🗡 暗杀」按钮发动，每回合限一次。</div>`;
      html += `<div class="fx-row"><b style="color:#ffd98a">第四层·历史走向</b>（${cd.l4}，不可停止除非下场）：</div>${l4Detail}
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">支付顺序：先扣除己方将军生命，再结算效果；支付为「代价」而非「受到伤害」，不触发第三层「受创」。</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)"><b style="color:#ff9a6a">不可停止</b>：条件不满足或无法支付则本次不发动，但效果始终保持待命；唯一停止方式：该事件牌被新的事件牌顶替（下场）。</div>`;
      html += this.fxLine("第五层·清算", `X=${cd.x}／Y=${cd.y}：被顶替下场时，己方每有 1 张 X 给对方将军 1 点伤害，对方每有 1 张 Y 给己方将军 1 点伤害`);
      const zzP = Game.state && Game.state.zone;
      const inZoneP = zzP && zzP.type === "process" && zzP.card.id === cd.id;
      html += this.layerBlock([
        ["第一层·攻防洪流", inZoneP ? "✔ 生效中（己攻防+" + cd.a1o + "／敌+" + cd.a1p + "）" : "○ 未放置（放置后生效）", inZoneP ? "ok" : "cond"],
        ["第二层·天佑将军", inZoneP ? "✔ 生效中（回合开始+生命）" : "○ 未放置", inZoneP ? "ok" : "cond"],
        ["第三层·战火磨砺", inZoneP ? "⚙ 触发类（敌攻/受创/我攻/御守30%）" : "○ 未放置", inZoneP ? "passive" : "cond"],
        ["第四层·" + cd.l4, inZoneP ? "⚙ 待命（发动扣 " + cd.cost + " 生命）" : "○ 未放置", inZoneP ? "passive" : "cond"],
        ["第五层·清算", "⚙ 被顶替下场时结算（X/Y 伤害）", "passive"],
      ]);
    } else if (t === "castle") {
      html += this.fxLine("等级", cd.tier);
      html += this.fxLine("第一层·城威", `己方战场区攻防各 +${cd.ao}／敌方各 +${cd.ap}；上场时敌方将军 −5；增幅一：${cd.amp1}；增幅二：${cd.amp2}`);
      html += this.fxLine("第二层·装备共鸣强化", cd.tier === "王城" ? "己方兵刃、敌方装具可同时作用两位（骑具躲避仅对装备骑具的单位生效）" : cd.tier === "名城" ? "己方兵刃、敌方装具可同时作用两位" : "己方兵刃数值 +50%、敌方兵刃数值 −30%");
      html += this.fxLine("第三层·概率倾斜", cd.tier === "王城" ? "己方概率类效果 <b>+10%</b>、敌方 <b>+5%</b>（装备之外的概率，如将军躲避率）" : cd.tier === "名城" ? "己方 <b>+5%</b>、敌方 <b>−5%</b>（装备之外的概率）" : "己方 <b>+5%</b>、敌方 <b>−5%</b>（<b>只作用于骑具、装具</b>）");
      // 兴衰损益：l4 四值 = 己方大名下场→敌方−a／己方公卿下场→敌方−b／敌方大名上场→己方+c／敌方公卿上场→己方+d
      const l4n = (cd.l4 || "").split("／").map(s => { const m = s.match(/(\d+)/); return m ? parseInt(m[1]) : 0; });
      html += `<div class="fx-row"><b style="color:#ffd98a">第四层·兴衰损益</b>：</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">● 上场时：敌方将军 <b>−5</b>；下场那回合：己方将军 <b>+5</b>。</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">● 己方<b>大名</b>下场 → 敌方将军 −<b>${l4n[0] || "—"}</b>；己方<b>公卿</b>下场 → 敌方将军 −<b>${l4n[1] || "—"}</b>。</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">● 敌方<b>大名</b>上场 → 己方将军 +<b>${l4n[2] || "—"}</b>；敌方<b>公卿</b>上场 → 己方将军 +<b>${l4n[3] || "—"}</b>。</div>`;
      html += this.fxLine("第五层·募兵", cd.l5 === "无" ? "无第五层" :
        cd.l5 === "募兵·王城"
          ? "每三回合一次、扣 10 生命：己方无大名且无公卿时，从手牌或弃牌堆召唤 大名/公卿/武士 中一位（当回合可攻击、不减半）"
          : "每三回合一次、扣 5 生命：己方无大名且无公卿时，从手牌或弃牌堆召唤 公卿/武士 中一位（当回合可攻击、不减半）");
      const zzC = Game.state && Game.state.zone;
      const inZoneC = zzC && zzC.type === "castle" && zzC.card.id === cd.id;
      html += this.layerBlock([
        ["第一层·城威", inZoneC ? "✔ 生效中（己攻防+" + cd.ao + "／敌+" + cd.ap + "）" : "○ 未放置", inZoneC ? "ok" : "cond"],
        ["增幅一/二", inZoneC ? "✔ 生效中（" + cd.amp1 + "／" + cd.amp2 + "）" : "○ 未放置", inZoneC ? "ok" : "cond"],
        ["第二层·装备共鸣", inZoneC ? "✔ 生效中" : "○ 未放置", inZoneC ? "ok" : "cond"],
        ["第三层·概率倾斜", inZoneC ? "✔ 生效中（概率类±%）" : "○ 未放置", inZoneC ? "ok" : "cond"],
        ["第四层·兴衰损益", "⚙ 触发类（上场/下场/单位离场结算）", "passive"],
        ["第五层·募兵", cd.l5 === "无" ? "— 无" : "🖱 主动（每 3 回合一次，顶部按钮）", "act"],
      ]);
    } else if (t === "treasure") {
      html += this.fxLine("第一层", `为一位武士增加防御值 +${cd.s1}（目标下场可重指）`);
      html += this.fxLine("第二层", `为一位公卿增加攻击值 +${cd.n1}（目标下场可重指）`);
      html += this.fxLine("第三层", `为一位大名增加攻击值与防御值 +${cd.d1}（目标下场可重指）`);
      html += this.fxLine("第四层·登场必发", cd.l4 === "威压" ? "威压：若己方将军生命高于对方，对方将军受（差值÷2）直接伤害（登场必发，限 3 次）" : "苦肉：若己方将军生命低于对方，己方将军受（差值÷2）直接伤害（登场必发，限 3 次）");
      html += this.fxLine("第五层·自动", "上场时：己方一位单位攻击 +1；下场时：己方一位单位防御 +1");
      const used = (Game.state && Game.state.l4Used && Game.state.l4Used[cd.id]) || 0;
      html += this.layerBlock([
        ["第一~三层·指定加成", "✔ 常置指定（目标下场可重指）", "ok"],
        ["第四层·" + (cd.l4 || "—"), cd.l4 ? "🖱 登场必发（整局限 3 次，已用 " + used + "/3）" : "—", cd.l4 ? "act" : "cond"],
        ["第五层·自动", "⚙ 上场 +1 攻／下场 +1 防", "passive"],
      ]);
    } else if (t === "blade") {
      html += this.fxLine("装备目标", "仅限己方大名、武士（天皇拥有御·兵刃之锐时，公卿亦可）"); html += this.fxLine("效果", `攻击 +${cd.atk}`);
      if (cd.soul) {
        const soulDesc = {
          1: "己方将军生命值低于对方时，攻击值 +1",
          2: "己方战场区卡牌少于对方时，攻击值 +1",
          3: "己方场上没有公卿时，攻击值 +1",
          4: "场上事件牌/城池非己方时，攻击值 +1",
          5: "己方场上仅一张兵刃牌时，攻击值 +2；不止一张时，攻击值 −1"
        };
        html += this.fxLine("器魂", soulDesc[cd.soul]);
      }
      html += this.fxLine("器魂之灭（通用）", "装备于大名时：大名命值低于 5 的瞬间，兵刃自动下场（弃置），为大名回复 5 点命值");
      html += this.fxLine("成长", `装备单位每次攻击后掷骰，${cd.grow}% 概率攻击加成 +1（永久）`);
    } else if (t === "armor") {
      html += this.fxLine("装备目标", "仅限己方大名、公卿（天皇拥有御·装具之固时，武士亦可）"); html += this.fxLine("效果", `防御 +${cd.dfs}`);
      if (cd.synX) html += this.fxLine("配套", `X=${cd.synX}，Y=${cd.synY}：装备对象若有兵刃 → 防御 +X；若有骑具 → 防御 −Y 且将军生命 +1/10；若兵刃骑具俱在 → 50% 防御+X 生命−X／50% 防御−Y 生命+Y`);
      html += this.fxLine("名器（通用）", "装备于大名时：该大名下场（被击破），30% 几率令将军免受此次（溢出）伤害");
      html += this.fxLine("熔炉（通用）", "己方生命低于对方时，可将一件装具下场，回复差值的一半（右上角按钮，条件达成时出现）");
      html += this.fxLine("成长", `装备单位每次被攻击后掷骰，${cd.grow}% 概率防御加成 +1（永久）`);
    } else if (t === "mount") {
      html += this.fxLine("装备目标", "仅限己方公卿、武士（天皇拥有御·骑具之灵时，大名亦可装备）"); html += this.fxLine("效果", `被攻击时 ${cd.dodge}% 概率躲避本次攻击`);
      if (cd.soul) {
        const diluDesc = {
          1: "己方将军生命低于对方时，躲避率随机 +5%～10%",
          2: "己方将军生命低于对方时，将军生命 +1/10，该骑具回合结束下场",
          3: "己方将军生命低于对方时，可为装备它的单位替死一次"
        };
        html += this.fxLine("的卢之魂", diluDesc[cd.soul]);
      }
      html += this.fxLine("八百里分麾下炙（通用）", "骑具下场时：己方生命低于对方 → 将军生命 +差值一半；高于对方 → 舍弃一张手牌（无手牌则生命 −差值一半）");
    } else if (t === "sacred") {
      html += this.fxLine("第一层·消解", "可在对方攻击结算前响应使用，令该次单位攻击无效化；代价：本回合及下一回合不能攻击（仅实际消解成功时支付）");
      html += this.fxLine("第二层·神迹", cd.fx + (cd.cond ? `（生命条件【${cd.cond === "A" ? "A" : "B"}】：${cd.cond === "A" ? "己方生命高于对方时直接生效" : "己方生命低于对方时直接生效"}）` : ""));
      html += this.layerBlock([
        ["第一层·消解", "🖱 对方攻击时可响应（代价：两回合禁攻）", "act"],
        ["第二层·神迹", "🖱 主动使用（不禁攻）", "act"],
      ]);
    } else if (t === "calamity") {
      html += this.fxLine("第一层·灾厄消解", "可在对方攻击结算前响应使用，令该次单位攻击无效化；代价：出现那回合及下一回合不能攻击（仅实际消解成功时支付）");
      html += this.fxLine("第二层·灾殃", `若对方拥有 X=${cd.x} 类型单位，对方将军受其攻击值总和伤害，己方受一半（反噬）`);
      html += this.fxLine("第三层·王座更迭", "对方武士/公卿/大名俱全时，双方随机更换将军牌（生命不变）");
      html += this.fxLine("第四层·天罚", cd.l4);
      html += this.fxLine("第五层·神迹克制", "对方本回合使用圣迹牌响应时，第三、四层失效");
      html += this.layerBlock([
        ["第一层·消解", "🖱 对方攻击时可响应（代价：两回合禁攻）", "act"],
        ["第二层·灾殃", "🖱 主动使用（X 类型攻击总和伤害＋反噬）", "act"],
        ["第三层·王座更迭", "○ 双方三类型俱全时触发（换将军）", "cond"],
        ["第四层·天罚", `🖱 主动使用（${cd.l4}）`, "act"],
        ["第五层·神迹克制", "○ 对方使用圣迹响应时生效", "cond"],
      ]);
    } else if (t === "emperors") {
      const TRACK_DESC = {
        "将军之佑": "每回合己方回合开始，己方将军生命 +X（不超过上限；己方场上有大名时不生效）",
        "武士之锋": "己方所有武士攻击值 +X（持续光环）",
        "公卿之智": "己方所有公卿特效数值 +X（持续光环）",
        "事件之速": "当前事件为己方时：给予对方总生命 1/10 伤害（每局一次）；当前事件为对方时：夺取对方一名武士（每局一次）",
        "兵刃之锐": "己方兵刃牌附加攻击值 +X（持续光环）",
        "装具之固": "己方装具牌附加防御值 +X（持续光环）",
        "骑具之灵": "己方骑具牌躲避率 +X（上限 90%）",
      };
      const trackLines = [cd.t1, cd.t2, cd.t3].map(tr => {
        const base = tr.replace("御·", "");
        const m = base.match(/^(.*?)\s*\+?(\d+)(%?)$/);
        const name = (m ? m[1] : base).trim();
        const val = m ? m[2] : "";
        const pct = m && m[3] ? "%" : "";
        const desc = (TRACK_DESC[name] || "持续光环").replace(/X/g, val + pct);
        return `<div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">
          <b style="color:#ffd98a">御·${name}${val ? " +" + val + pct : ""}</b> — ${desc}</div>`;
      }).join("");
      html += `<div class="fx-row"><b style="color:#ffd98a">三条增幅轨道</b>（每回合己方回合开始全部自动生效，数值固定于卡面）：</div>${trackLines}`;
      html += this.fxLine("御·庇护", `庇护武士：扣己方将军 ${cd.ps} 生命免于被击破；庇护公卿：扣 ${cd.pn} 生命（每回合限一次，被庇护单位增幅归零；不可庇护大名）`);
    } else if (t === "shoguns") {
      html += this.fxLine("天赋", cd.talent ? "每 3 个己方回合，为己方场上一" + cd.talent.replace("天赋·", "") + " 添加 1~2 攻击值或防御值（数值 +1~2 随机，攻击/防御随机）" : "—");
      html += this.fxLine("本性", cd.nature ? "生命剩余" + cd.nature.replace("本性·", "") + "后，仅一次增幅总生命 1/10" : "—");
      html += this.fxLine("尊位", cd.rank ? cd.rank.replace("尊位·", "") + "（每局一次，耗当前生命 1/10）" : "—");
      html += `<div class="fx-row"><b style="color:#ffd98a">技能（双技能）</b>（每回合己方回合开始同时生效）：</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">💚 <b>自疗</b>：每 3 回合一次，己方回合开始恢复 <b>${Game.shogunSkills(cd).heal}</b> 点生命（不超过上限）${cd.skill === "自疗" ? "【专长】" : "（固定为 1）"}</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">⚔ <b>压制</b>：每回合给予对方将军 <b>${Game.shogunSkills(cd).press}</b> 点直接伤害${cd.skill === "压制" ? "【专长】" : "（固定为 1）"}</div>`;
      html += this.fxLine("躲避率", `${cd.dodge}%（受直接伤害时掷骰判定）`);
      html += this.fxLine("增幅光环", cd.aura);
    }
    html += `</div>`;
    return html;
  },

  showCardModal(c, actions) {
    const btns = [];
    for (const a of actions) btns.push({ label: a.label, cls: a.cls, fn: a.fn });
    this.showModal("卡牌详情", this.cardInfoHTML(c), btns);
  },

  showUnitModal(u) {
    const s = Game.unitStats(u);
    const P = Game.unitStatParts(u);
    let extra = "";
    if (u.kind === "daimyo") extra = `命值 ${u.hp}/20`;
    const eq = [u.eq.blade ? `刃【${u.eq.blade.name}】` : "", u.eq.armor ? `铠【${u.eq.armor.name}】` : "", u.eq.mount ? `骑【${u.eq.mount.name}】` : ""].filter(Boolean).join("，") || "无";
    const card = { type: u.kind === "samurai" ? "samurai" : u.kind === "daimyo" ? "daimyo" : "noble", card: u.card };
    const hist = (u.hist || []).slice().reverse().map(h =>
      `<div class="sd-hist-item">第 ${h.t} 回合 · ${h.src} · ${h.desc}</div>`).join("") || '<div class="sd-hist-empty">尚无变动记录</div>';
    const fmt = v => (v > 0 ? "+" + v : String(v));
    const atkRows = P.AP.map(x => `<div class="sb-row"><span>${x.k}</span><span class="sb-v">${fmt(x.v)}</span></div>`).join("");
    const defRows = P.DP.map(x => `<div class="sb-row"><span>${x.k}</span><span class="sb-v">${fmt(x.v)}</span></div>`).join("");
    const html = this.cardInfoHTML(card) +
      `<hr style="border-color:#6a5a35"><div style="line-height:1.8;font-size:13px">
      当前：攻击 <b>${s.atk}</b> ／ 防御 <b>${s.def}</b> ${extra ? "／ <b>" + extra + "</b>" : ""}<br>
      装备：${eq}<br>
      状态：${u.attackedThisTurn ? "本回合已攻击" : u.summonedTurn >= Game.state.turnNo ? "本回合召唤（可攻击）" : "可行动"}</div>
      <hr style="border-color:#6a5a35"><div class="sd-hist-title" style="margin-top:8px">数值构成（为何是 攻 ${s.atk} / 防 ${s.def}）</div>
      <div class="sb-wrap">
        <div class="sb-col"><div class="sb-title">⚔ 攻击 ${s.atk}</div>${atkRows || '<div class="sb-empty">无额外加成</div>'}</div>
        <div class="sb-col"><div class="sb-title">🛡 防御 ${s.def}</div>${defRows || '<div class="sb-empty">无额外加成</div>'}</div>
      </div>
      <hr style="border-color:#6a5a35"><div class="sd-hist-title" style="margin-top:8px">变动记录</div>
      <div class="sd-hist">${hist}</div>`;
    this.showModal(`单位详情 · ${u.card.name}`, html, [{ label: "关闭", fn: () => this.hideModal() }]);
  },

  /* 回收兑换（3 张换 1 张） */
  showExchange() {
    const cats = Game.exchangeCats();
    const body = `<div style="line-height:1.8;font-size:13px">选择要消耗的 3 张同类手牌，换取弃牌堆一张回收：</div>`;
    const btns = cats.map(cat => ({ label: cat.label, cls: "primary", fn: () => this.showExchangePick(cat) }));
    btns.push({ label: "取消", fn: () => this.hideModal() });
    this.showModal("♻ 回收兑换", body, btns);
  },
  showExchangePick(cat) {
    const disc = Game.state.discard.map((d, i) => ({ d, i })).filter(x => cat.allowed.includes(x.d.type));
    if (!disc.length) { this.logHint("弃牌堆无符合条件可回收的牌"); return; }
    const body = document.createElement("div");
    body.innerHTML = `<div style="margin-bottom:8px">将消耗 3 张【${TYPE_CN[cat.cat]}】。选择要回收的一张弃牌：</div>`;
    const btns = disc.map(x => ({
      label: `${KIND_CN[x.d.type] || TYPE_CN[x.d.type]}【${x.d.card.name}】`,
      fn: () => { Game.exchange(0, cat.cat, x.i); this.hideModal(); this.renderAll(); },
    }));
    btns.push({ label: "取消", fn: () => this.hideModal() });
    this.showModal("选择回收目标", body, btns);
  },

  /* 御·庇护询问 */
  askPurge(t, cost, cb) {
    this.showModal("御·庇护", `天皇愿以 <b>${cost}</b> 点将军生命保住【${t.card.name}】（${KIND_CN[t.kind]}）？<br><span style="color:#ff9a8a">代价：该单位增幅归零（装备弃置、特效失效），本回合限一次。</span>`, [
      { label: `庇护（扣 ${cost} 生命）`, cls: "primary", fn: () => { this.hideModal(); cb(true); } },
      { label: "放弃（承受击破）", fn: () => { this.hideModal(); cb(false); } },
    ]);
  },

  /* 公卿城池加成替死：玩家选择是否发动（条件满足时弹出） */
  askCastleSacrifice(info, cb) {
    this.showModal("🏰 公卿城池加成 · 替死", `【${info.noble.card.name}】的城池加成可替你挡下这次击破！<br><b>${info.desc}</b><br><span style="color:#ff9a8a">城池加成在城池被顶替前实时生效。</span>`, [
      { label: "发动替死", cls: "primary", fn: () => { this.hideModal(); cb(true); } },
      { label: "放弃（承受击破）", fn: () => { this.hideModal(); cb(false); } },
    ]);
  },

  /* 的卢之魂替死：玩家选择是否用骑具替单位挡死 */
  askDiluSacrifice(t, m, cb) {
    this.showModal("🐎 的卢之魂 · 替死", `骑具【<b>${m.name}</b>】愿替【${t.card.name}】（${KIND_CN[t.kind]}）挡下这次击破！<br><span style="color:#ff9a8a">条件：己方将军生命低于对方。发动后骑具弃置，单位存活。</span>`, [
      { label: "发动替死", cls: "primary", fn: () => { this.hideModal(); cb(true); } },
      { label: "放弃（承受击破）", fn: () => { this.hideModal(); cb(false); } },
    ]);
  },

  /* 绝境来援：连续 3 回合无人物牌 → 玩家选择是否从弃牌堆特殊召唤 */
  askNoUnitSummon(info, cb) {
    this.showModal("🙌 绝境来援 · 特殊召唤", `你已连续 <b>3</b> 个己方回合没有人物牌（场上与手牌皆无）！<br>可从<b>弃牌堆</b>随机召唤一位人物（武士／公卿／大名）到己方战场。<br><span style="color:#ff9a8a">弃牌堆现有人物牌 ${info.count} 张。召唤后计数重置。</span>`, [
      { label: "执行特殊召唤", cls: "primary", fn: () => { this.hideModal(); cb(true); } },
      { label: "放弃（本次不召唤）", fn: () => { this.hideModal(); cb(false); } },
    ]);
  },

  /* 圣迹抵消：对方使用圣迹时，询问是否用手上灾厄抵消 */
  askCounterSacred(c, cb) {
    this.showModal("💀 灾厄抵消圣迹", `对方正在使用圣迹【<b>${c.card.name}</b>】（${c.card.fx || ""}）。<br>是否使用手上的一张<b>灾厄牌</b>抵消？<span style="color:#ff9a8a">两张牌都将进入弃牌堆，均不生效。</span>`, [
      { label: "使用灾厄抵消", cls: "primary", fn: () => { this.hideModal(); cb(true); } },
      { label: "放弃（承受圣迹）", fn: () => { this.hideModal(); cb(false); } },
    ]);
  },

  /* 灾厄抵消：对方使用灾厄时，询问是否用手上圣迹抵消 */
  askCounterCalamity(c, cb) {
    this.showModal("🛡 圣迹抵消灾厄", `对方正在使用灾厄【<b>${c.card.name}</b>】（${c.card.l4 || c.card.fx || ""}）。<br>是否使用手上的一张<b>圣迹牌</b>抵消？<span style="color:#ff9a8a">两张牌都将进入弃牌堆，均不生效。</span>`, [
      { label: "使用圣迹抵消", cls: "primary", fn: () => { this.hideModal(); cb(true); } },
      { label: "放弃（承受灾厄）", fn: () => { this.hideModal(); cb(false); } },
    ]);
  },

  /* 尊位·御破：对方攻击时询问是否使用（令本次攻击失效） */
  askRankBlock(u, cost, cb) {
    const s = Game.unitStats(u);
    this.showModal("👑 尊位·御破", `对方【${u.card.name}】正发动攻击（攻 <b>${s.atk}</b>）。<br>是否消耗当前生命 <b>${cost}</b> 点（1/10）令本次攻击<b>失效</b>？<span style="color:#ff9a8a">（尊位每局一次）</span>`, [
      { label: `令其失效（扣 ${cost} 生命）`, cls: "primary", fn: () => { this.hideModal(); cb(true); } },
      { label: "放弃（承受攻击）", fn: () => { this.hideModal(); cb(false); } },
    ]);
  },

  /* 对方攻击时：询问是否用圣迹/灾厄消解 */
  askNegate(u, negIdx, cb) {
    const p = Game.state.players[0];
    const s = Game.unitStats(u);
    const body = document.createElement("div");
    body.innerHTML = `<div style="line-height:1.8;font-size:13px">
      ⚠ 对方【${u.card.name}】（攻 <b>${s.atk}</b>）正对你的战场发起攻击！<br>
      你手中有可<b>消解进攻</b>的牌（第一层效果）：</div>`;
    const btns = [];
    for (const i of negIdx) {
      const c = p.hand[i];
      btns.push({
        label: `使用【${TYPE_CN[c.type]}】${c.card.name} 消解（代价：本回合及下一回合不能攻击）`,
        cls: "primary",
        fn: () => { this.hideModal(); cb(i); },
      });
      btns.push({
        label: `🔍 查看【${c.card.name}】详情`,
        fn: () => this.showCardModal(c, [
          { label: "使用此卡消解", cls: "primary", fn: () => { this.hideModal(); cb(i); } },
          { label: "返回消解选择", fn: () => { this.hideModal(); this.askNegate(u, negIdx, cb); } },
          { label: "取消（承受攻击）", fn: () => { this.hideModal(); cb(null); } },
        ]),
      });
    }
    btns.push({ label: "放弃（承受该次攻击）", fn: () => { this.hideModal(); cb(null); } });
    this.showModal("⚠ 对方攻击 · 是否消解？", body, btns);
  },

  /* ---------- 模态 ---------- */
  showModal(title, bodyHtml, buttons) {
    this.el("modalTitle").textContent = title;
    const b = this.el("modalBody");
    b.innerHTML = typeof bodyHtml === "string" ? bodyHtml : "";
    if (typeof bodyHtml !== "string" && bodyHtml) b.appendChild(bodyHtml);
    const btns = this.el("modalButtons");
    btns.innerHTML = "";
    for (const o of buttons) {
      btns.appendChild(mk(o.label, o.fn, false, "modal-opt" + (o.cls ? " " + o.cls : "")));
    }
    this.el("modal").classList.remove("hidden");
  },
  hideModal() { this.el("modal").classList.add("hidden"); },

  /* ---------- 开局仪式：化身抽选 → 敦盛加载 → 进入游戏 ---------- */
  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  draftCardHTML(type, card) {
    if (type === "emperors") {
      return `<div class="flip-face flip-front">
        <div class="f-kind">天 皇 牌</div>
        <div class="f-name">${card.name}</div>
        <div class="f-era">${card.era}</div>
        <div class="f-line">${card.t1}<br>${card.t2}<br>${card.t3}</div>
        <div class="f-line"><b>庇护</b> 武士${card.ps} / 公卿${card.pn}</div>
      </div>`;
    }
    return `<div class="flip-face flip-front">
      <div class="f-kind">将 军 牌</div>
      <div class="f-name">${card.name}</div>
      <div class="f-era">${card.era}</div>
      <div class="f-line"><b>${card.skill}</b> ${card.skillv}</div>
      <div class="f-line">光环 ${card.aura}</div>
    </div>`;
  },

  buildDraftStage(draft) {
    const stage = this.el("draftStage");
    stage.innerHTML = "";
    this.el("draftOrder").textContent = "先手：" + (draft.first === 0 ? "玩家" : "电脑") + " · 先手先抽化身（不可同卡）";
    const mkSlot = (key, label, type, card) => `
      <div class="draft-slot">
        <div class="draft-label">${label}</div>
        <div class="flip-inner" data-flip="${key}">
          <div class="flip-face flip-back"><div class="kamon">◉</div><div class="kamon-sub">幕 府</div></div>
          ${this.draftCardHTML(type, card)}
        </div>
      </div>`;
    // 左栏 · 玩家阵营
    const left = document.createElement("div");
    left.className = "draft-side-panel side-player";
    left.innerHTML = `
      <div class="draft-side-name">☰ 玩家 · PLAYER</div>
      <div class="draft-cards">
        ${mkSlot("p0-e", "天 皇", "emperors", draft.avatars[0].emperor)}
        ${mkSlot("p0-s", "将 军", "shoguns", draft.avatars[0].shogun)}
      </div>
      <div class="draft-hp"><label class="draft-hp-item"><span>将军生命</span><input id="hpInput0" type="number" min="1" max="200" value="50"></label></div>`;
    // 中栏 · 对阵
    const mid = document.createElement("div");
    mid.className = "draft-mid";
    mid.innerHTML = `
      <div class="draft-vs">⚔</div>
      <div class="draft-mid-line"></div>
      <div class="draft-mid-txt">先手先抽<br>化身不可同卡</div>
      <div class="draft-mid-line"></div>`;
    // 右栏 · 电脑阵营
    const right = document.createElement("div");
    right.className = "draft-side-panel side-ai";
    right.innerHTML = `
      <div class="draft-side-name">☷ 电脑 · AI</div>
      <div class="draft-cards ai">
        ${mkSlot("p1-e", "天 皇", "emperors", draft.avatars[1].emperor)}
        ${mkSlot("p1-s", "将 军", "shoguns", draft.avatars[1].shogun)}
      </div>
      <div class="draft-hp"><label class="draft-hp-item"><span>将军生命</span><input id="hpInput1" type="number" min="1" max="200" value="50"></label></div>`;
    stage.appendChild(left);
    stage.appendChild(mid);
    stage.appendChild(right);
    // 底部 · 跳过
    const skip = document.createElement("div");
    skip.className = "draft-skip";
    skip.appendChild(mk("跳过抽选动画 »", () => {
      UI.el("draftScreen").classList.add("hidden");
      UI.showLoading(draft);
    }, false, "primary"));
    stage.appendChild(skip);
  },

  async startDraft() {
    const draft = Game.draftAvatars();
    this.draftDraft = draft;
    this.el("draftScreen").classList.remove("hidden");
    this.buildDraftStage(draft);
    this.draftSeq = [
      { pi: draft.first, type: "emperors" }, { pi: draft.first, type: "shoguns" },
      { pi: 1 - draft.first, type: "emperors" }, { pi: 1 - draft.first, type: "shoguns" },
    ];
    this.draftIdx = 0;
    this.draftManualKey = null;
    document.querySelectorAll("[data-flip]").forEach(el => {
      el.addEventListener("click", () => {
        if (UI.draftManualKey !== el.dataset.flip) return;
        el.classList.add("flipped");
        el.classList.remove("manual-ready");
        UI.draftManualKey = null;
        UI.draftIdx++;
        setTimeout(() => UI.draftNext(), 800);
      });
    });
    await this.sleep(700);
    this.draftNext();
  },

  draftNext() {
    if (this.draftIdx >= this.draftSeq.length) {
      this.el("draftOrder").textContent = "化身抽选完毕，准备进入…";
      setTimeout(() => this.showLoading(this.draftDraft), 1200);
      return;
    }
    const s = this.draftSeq[this.draftIdx];
    const key = `p${s.pi}-${s.type === "emperors" ? "e" : "s"}`;
    const inner = document.querySelector(`[data-flip="${key}"]`);
    const kind = s.type === "emperors" ? "天皇" : "将军";
    const order = this.draftIdx < 2 ? "先手" : "后手";
    if (s.pi === 0) {
      this.draftManualKey = key;
      this.el("draftOrder").textContent = `${order}抽选 · 请点击你的【${kind}】牌翻开`;
      if (inner) inner.classList.add("manual-ready");
    } else {
      this.el("draftOrder").textContent = `${order}抽选 · 电脑的【${kind}】牌…`;
      if (inner) inner.classList.add("flipped");
      this.draftIdx++;
      setTimeout(() => this.draftNext(), 2400);
    }
  },

  showLoading(draft) {
    this.el("draftScreen").classList.add("hidden");
    const ls = this.el("loadingScreen");
    ls.classList.remove("hidden");
    const verse = [
      "人間五十年、下天のうちを比ぶれば夢幻、思へばこの世は常の住み家にあらず。",
      "草葉に置く白露、水に宿る月よりなほあやし。",
      "きんこくに花を詠じ、榮花は先つて無常の風に誘はるる。",
      "南樓の月を弄ぶ輩も月に先つて有為の雲にかくれり。",
    ];
    const cn = [
      "人生五十年，与天地长久相较，如梦又似幻；一度得生者，岂有不灭者乎？",
      "草叶上的白露，水中之月，犹觉虚幻无常。",
      "曾于金谷园中咏花之人，那繁花早已随无常之风凋零；",
      "南楼之上弄月之客，亦先于明月，隐没于有为的浮云之中。",
    ];
    const vEl = this.el("loadingVerse");
    vEl.innerHTML = "";
    verse.forEach((l, i) => {
      const d = document.createElement("div");
      d.className = "verse-line";
      d.textContent = l;
      d.style.animationDelay = (i * 1.8) + "s";
      vEl.appendChild(d);
    });
    const cnEl = this.el("loadingVerseCn");
    cnEl.innerHTML = "";
    cn.forEach((l, i) => {
      const d = document.createElement("div");
      d.className = "verse-cn-line";
      d.textContent = l;
      d.style.animationDelay = (8.2 + i * 0.7) + "s";
      cnEl.appendChild(d);
    });
    cnEl.classList.remove("hidden");
    const fill = this.el("loadingFill");
    fill.classList.remove("run");
    void fill.offsetWidth;
    fill.classList.add("run");
    setTimeout(() => this.finishLoading(draft), 10400);
  },

  finishLoading(draft) {
    this.el("loadingScreen").classList.add("hidden");
    const hp0 = parseInt(this.el("hpInput0").value, 10);
    const hp1 = parseInt(this.el("hpInput1").value, 10);
    Game.setup(draft, [hp0 > 0 ? hp0 : 50, hp1 > 0 ? hp1 : 50]);
  },

  /* ---------- 圣迹/灾厄使用：中央全屏动画（3 秒） ---------- */
  classifyEventAnim(c) {
    const n = c.card.name;
    if (c.type === "sacred") return { cls: "light", icon: "✨" };
    const table = [
      ["火", "🔥", "fire"], ["旱", "🔥", "fire"], ["海", "🌊", "water"], ["雨", "🌧", "water"],
      ["飓", "🌪", "storm"], ["风", "🌪", "storm"], ["地", "⛰", "quake"], ["山", "⛰", "quake"],
      ["疫", "☠", "dark"], ["夜", "🌑", "dark"], ["神木", "🌲", "dark"],
      ["乱", "⚔", "quake"], ["叛", "⚔", "quake"],
    ];
    for (const [k, icon, cls] of table) if (n.includes(k)) return { cls, icon };
    return { cls: "dark", icon: "💀" };
  },
  showEventAnimation(c) {
    const cls = this.classifyEventAnim(c);
    const overlay = document.createElement("div");
    overlay.className = "event-overlay anim-" + cls.cls;
    const detail = this.cardInfoHTML(c); // 完整卡牌详情内容
    overlay.innerHTML = `
      <div class="eo-icon">${cls.icon}</div>
      <div class="eo-name">${c.card.name}</div>
      <div class="eo-detail">${detail}</div>
      <div class="eo-particles">${'<span></span>'.repeat(10)}</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 4100); // 特效留存 4 秒（含淡出收尾）
  },

  /* 恩典召唤：列表每张卡可一键召唤，亦可进详情直接召唤 */
  showGraceModal() {
    const p = Game.state.players[0];
    const body = document.createElement("div");
    body.innerHTML = `<div style="margin-bottom:6px;color:#d8c9a8;font-size:12.5px">连续 3 回合未召唤大名/公卿后的特殊召唤（无需献祭）。点击「召唤」直接上场，或「详情」查看卡牌与简介后召唤：</div>`;
    let any = false;
    for (let i = 0; i < p.hand.length; i++) {
      const c = p.hand[i];
      if (c.type !== "daimyo" && c.type !== "noble") continue;
      any = true;
      const row = document.createElement("div");
      row.className = "grace-row";
      row.appendChild(mk(`✨ 召唤 ${KIND_CN[c.type]}【${c.card.name}】`, () => {
        Game.graceSummon(0, i); UI.hideModal(); UI.renderAll();
      }, true, "modal-opt grace-summon"));
      row.appendChild(mk("ℹ 详情", () => {
        UI.showCardModal(c, [
          { label: "✨ 恩典召唤（无需献祭）", cls: "primary", fn: () => { Game.graceSummon(0, i); UI.hideModal(); UI.renderAll(); } },
          { label: "← 返回恩典列表", fn: () => { UI.hideModal(); UI.showGraceModal(); } },
          { label: "关闭", fn: () => UI.hideModal() },
        ]);
      }, false, "grace-detail"));
      body.appendChild(row);
    }
    if (!any) body.appendChild(document.createTextNode("手中没有可恩典召唤的大名/公卿。"));
    UI.showModal("✨ 恩典召唤（大名 / 公卿 · 无需献祭）", body, [{ label: "关闭", fn: () => UI.hideModal() }]);
  },

  /* ---------- 全卡牌图鉴（开局浏览全部 190 张） ---------- */
  CODEX_CATS: [
    ["emperors", "天皇", "天"], ["shoguns", "将军", "将"], ["daimyo", "大名", "大"],
    ["samurai", "武士", "武"], ["noble", "公卿", "卿"], ["process", "事件", "进"],
    ["castle", "城池", "城"], ["treasure", "宝物", "宝"], ["sacred", "圣迹", "圣"],
    ["calamity", "灾厄", "灾"], ["blade", "兵刃", "刃"], ["armor", "装具", "具"], ["mount", "骑具", "骑"],
  ],

  showCodex() {
    const scr = this.el("codexScreen");
    scr.classList.remove("hidden");
    const tabs = this.el("codexTabs");
    tabs.innerHTML = "";
    let total = 0;
    this.CODEX_CATS.forEach(([key, label, badge], i) => {
      total += CARDS[key].length;
      const tab = document.createElement("button");
      tab.className = "codex-tab" + (i === 0 ? " active" : "");
      tab.dataset.cat = key;
      tab.innerHTML = `<span class="ct-badge">${badge}</span>${label}<em>${CARDS[key].length}</em>`;
      tab.addEventListener("click", () => {
        tabs.querySelectorAll(".codex-tab").forEach(x => x.classList.remove("active"));
        tab.classList.add("active");
        this.renderCodexCat(key);
      });
      tabs.appendChild(tab);
    });
    this.el("codexCount").textContent = `共 ${total} 张 · 点击卡片查看详情`;
    this.el("codexClose").onclick = () => this.closeCodex();
    this.renderCodexCat("emperors");
  },

  renderCodexCat(key) {
    const grid = this.el("codexGrid");
    grid.innerHTML = "";
    for (const c of CARDS[key]) {
      const card = document.createElement("div");
      card.className = "codex-card";
      card.innerHTML = this.codexMiniHTML(key, c);
      card.addEventListener("click", () => this.showCardModal({ type: key, card: c }, [{ label: "关闭", fn: () => this.hideModal() }]));
      grid.appendChild(card);
    }
  },

  codexMiniHTML(type, c) {
    const badge = { emperors: "天", shoguns: "将", daimyo: "大", samurai: "武", noble: "卿",
      process: "进", castle: "城", treasure: "宝", sacred: "圣", calamity: "灾",
      blade: "刃", armor: "具", mount: "骑" }[type] || "?";
    let num = "";
    if (c.atk !== undefined && c.dfs !== undefined) num = `攻 ${c.atk} ／ 防 ${c.dfs}`;
    else if (c.atk !== undefined) num = `攻击 +${c.atk}`;
    else if (c.dfs !== undefined) num = `防御 +${c.dfs}`;
    else if (c.t1) num = `${c.t1.replace("御·", "")}／${c.t2.replace("御·", "")}`;
    else if (c.skill) num = `${c.skill} · 躲避 ${c.dodge}%`;
    else if (c.a1o !== undefined) num = `己攻防+${c.a1o}／敌+${c.a1p}`;
    else if (c.s1 !== undefined) num = `武士+${c.s1} 公卿+${c.n1} 大名+${c.d1}`;
    else if (c.fx) num = c.fx;
    else if (c.l4) num = c.l4;
    else if (c.dodge) num = `躲避 ${c.dodge}%`;
    return `<div class="cm-head"><span class="cm-badge">${badge}</span><span class="cm-name">${c.name}</span></div>
      <div class="cm-num">${num}</div>`;
  },

  closeCodex() {
    this.el("codexScreen").classList.add("hidden");
  },

  /* ---------- 攻击引导线（金色虚线） ---------- */
  aimLineEl() {
    let el = document.getElementById("aimLine");
    if (!el) {
      el = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      el.id = "aimLine";
      el.className = "aim-line";
      el.innerHTML = '<line id="aimLineSeg" x1="0" y1="0" x2="0" y2="0"/>';
      document.body.appendChild(el);
    }
    return el;
  },
  updateAimLine(e) {
    if (this.selectedAttacker == null || this.aimFromUid == null || !this.combatMode) return;
    const card = document.querySelector(`.unit-card[data-uid="${this.aimFromUid}"]`);
    if (!card) { this.hideAimLine(); return; }
    const r = card.getBoundingClientRect();
    const svg = this.aimLineEl();
    const seg = svg.querySelector("line");
    seg.setAttribute("x1", r.left + r.width / 2);
    seg.setAttribute("y1", r.top + r.height / 2);
    seg.setAttribute("x2", e.clientX);
    seg.setAttribute("y2", e.clientY);
    svg.style.display = "block";
  },
  hideAimLine() {
    this.aimFromUid = null;
    const svg = document.getElementById("aimLine");
    if (svg) svg.style.display = "none";
  },

  /* 国士无双：中央四分之一区域特效，「国士无双」四字从上到下排开 */
  guoshiEffect() {
    const overlay = document.createElement("div");
    overlay.className = "guoshi-overlay";
    // 四字竖排（从上到下）
    overlay.innerHTML = `<div class="guoshi-word">国</div><div class="guoshi-word">士</div><div class="guoshi-word">无</div><div class="guoshi-word">双</div>`;
    document.body.appendChild(overlay);
    setTimeout(() => { if (overlay.parentNode) overlay.parentNode.removeChild(overlay); }, 4100);
  },

  /* ---------- 重新开局 ---------- */
  confirmRestart() {
    this.showModal("重新开局", "结束当前对局，重新开始新的幕府争锋？<br>将重新抽选化身（天皇 / 将军）。", [
      { label: "确认新开局", cls: "primary", fn: () => { this.hideModal(); this.restartGame(); } },
      { label: "取消", fn: () => this.hideModal() },
    ]);
  },

  restartGame() {
    Game.clearSave(); // 清档后走完整开局仪式
    Game.state = null;
    this.mode = "idle"; this.combatMode = false; this.bypass = false;
    this.selectedAttacker = null; this.sacTarget = -1; this.eqHandIdx = -1;
    this._prevStats = {};
    this.el("logList").innerHTML = "";
    this.el("flowList").innerHTML = "";
    this.el("zoneSlot").innerHTML = "";
    this.startDraft();
  },

  /* ---------- 右侧流程提示 ---------- */
  renderFlow() {
    const st = Game.state;
    const list = this.el("flowList");
    if (!list) return;
    list.innerHTML = "";
    const item = (icon, label, active, done) => {
      const d = document.createElement("div");
      d.className = "flow-item" + (active ? " flow-active" : done ? " flow-done" : "");
      d.innerHTML = `<span class="flow-icon">${icon}</span>${label}`;
      list.appendChild(d);
    };
    if (!st || !st.players) { item("◈", "开局仪式进行中…", true); return; }
    if (st.winner != null) { item("🏆", `对局结束 · 胜者：${st.players[st.winner].name}`, true); return; }
    if (st.cur === 1) { item("🤖", "电脑回合行动中…", true); return; }
    const p = st.players[0];
    const inCombat = !!this.combatMode;
    const drawn = !!p.drawnThisTurn;
    const steps = [
      { icon: "🀄", label: "回合开始 · 抽 1 张牌", active: !drawn, done: drawn },
      { icon: "⚔", label: "召唤阶段（武士 / 献祭 / 恩典）", active: drawn && !inCombat, done: false },
      { icon: "🏯", label: "行动阶段（事件 / 城池 / 装备 / 募兵 / 回收）", active: drawn && !inCombat, done: false },
      { icon: "🗡", label: "战斗阶段（每类型仅一位攻击）", active: inCombat, done: false },
      { icon: "🔚", label: "结束回合", active: drawn && !inCombat, done: false },
    ];
    steps.forEach(s => item(s.icon, s.label, s.active, s.done));
    const tips = [];
    if (!drawn) {
      tips.push("点击「抽牌」抽取 1 张，或先点手牌查看");
    } else {
      const sIdx = p.hand.findIndex(c => c.type === "samurai");
      if (sIdx >= 0 && p.field.length < 5) tips.push("可召唤武士（召唤当回合即可攻击，无数量限制）");
      if (Game.canGrace(p)) tips.push("✨ 可恩典召唤大名 / 公卿");
      const ri = Game.recruitInfo(0);
      if (ri && ri.ok) tips.push("🏰 可募兵（扣生命，每 3 回合一次）");
      if (Game.canExchange(p)) tips.push("♻ 可三张换一回收");
      if (!inCombat && Game.canAttack(p) && Game.attackers(0).length) tips.push("🗡 可「进入战斗」发起攻击");
      if (inCombat) tips.push("🗡 点己方单位选攻击者 → 点对方目标；「破阵」可越级");
    }
    if (tips.length) {
      const box = document.createElement("div");
      box.className = "flow-tips";
      box.innerHTML = tips.map(t => `<div class="flow-tip">▸ ${t}</div>`).join("");
      list.appendChild(box);
    }
  },

  /* ---------- 将军详情：动态生命 + 伤害记录 ---------- */
  showShogunDetail(upi) {
    const st = Game.state;
    const p = st.players[upi];
    const sho = p.shogun;
    const body = document.createElement("div");
    body.className = "shogun-detail";
    const mhp = p.maxHp || 100;
    const hpPct = Math.max(0, Math.min(100, p.hp / mhp * 100));
    const hist = (p.hpHist || []).slice().reverse();
    body.innerHTML = `
      <div class="sd-name">${sho.name} <span class="sd-role">本阵 · 将军</span></div>
      <div class="sd-era">${sho.era || ""}</div>
      <div class="sd-hpbar"><div class="fill" style="width:${hpPct}%"></div></div>
      <div class="sd-hpnum">HP ${Math.max(0, p.hp)} / ${p.maxHp || 100}</div>
      <div class="sd-line">技能（双技能，每回合己方回合开始同时生效）：
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">💚 <b>自疗</b>：每 <b>3 回合一次</b>，己方回合开始恢复 <b>${Game.shogunSkills(sho).heal}</b> 点生命（不超过总生命上限）${sho.skill === "自疗" ? "【专长】" : "（固定为 1）"}</div>
        <div style="margin:3px 0;padding-left:8px;border-left:2px solid rgba(201,162,39,.4)">⚔ <b>压制</b>：每回合己方回合开始给予对方将军 <b>${Game.shogunSkills(sho).press}</b> 点直接伤害${sho.skill === "压制" ? "【专长】" : "（固定为 1）"}</div>
      </div>
      <div class="sd-line">光环：${sho.aura}</div>
      <div class="sd-line">躲避：<b>${sho.dodge}%</b>（受直接伤害时掷骰判定）</div>
      <div class="sd-line">天赋：<b>${sho.talent || "—"}</b> — 每 3 个己方回合，为己方场上一${(sho.talent || "武士").replace("天赋·", "")} 添加 +1~2 攻或防（数值 1~2 随机，攻或防随机）</div>
      <div class="sd-line">本性：<b>${sho.nature || "—"}</b> — 生命剩余${(sho.nature || "十分之一").replace("本性·", "")}后，仅一次增幅总生命 1/10</div>
      <div class="sd-line">尊位：<b>${sho.rank || "—"}</b> — ${(sho.rank || "尊位·攻击失效").replace("尊位·", "")}（每局一次，耗当前生命 1/10）</div>
      <div class="sd-hist-title">生命变动记录（伤害 / 恢复）</div>
      <div class="sd-hist">${
        hist.length
          ? hist.map(h => `<div class="sd-hist-item ${h.dmg < 0 ? "sd-heal" : "sd-dmg"}">第 ${h.t} 回合 · ${h.src} · ${h.dmg < 0 ? "+" + (-h.dmg) : "−" + h.dmg} → HP ${Math.max(0, h.hp)}</div>`).join("")
          : '<div class="sd-hist-empty">尚无生命变动记录</div>'
      }</div>`;
    this.showModal("将军详情", body, [{ label: "关闭", fn: () => this.hideModal() }]);
  },

  /* ---------- 启动 ---------- */
  init() {
    this.el("modal").addEventListener("click", e => { if (e.target.id === "modal") this.hideModal(); });
    document.addEventListener("mousemove", (e) => UI.updateAimLine(e));
    document.addEventListener("touchmove", (e) => { if (e.touches && e.touches[0]) UI.updateAimLine(e.touches[0]); }, { passive: true }); // 手机端瞄准线
    document.addEventListener("mouseup", (e) => {
      if (UI.aimFromUid != null && e.target.closest && !e.target.closest(".unit-card, .avatar-card")) UI.hideAimLine();
      // 点空白取消装备/献祭模式（防残留导致指令冲突）
      if ((UI.mode === "equip" || UI.mode === "sacrifice") && e.target.closest && !e.target.closest(".unit-card, .hand-card, .avatar-card")) {
        UI.mode = "idle"; UI.eqHandIdx = -1; UI.sacTarget = -1;
        UI.renderAll();
      }
    });
    document.addEventListener("touchend", (e) => {
      // 手机端：触碰空白取消瞄准/装备/献祭
      const t = e.changedTouches && e.changedTouches[0];
      const el = t && document.elementFromPoint(t.clientX, t.clientY);
      if (UI.aimFromUid != null && el && !el.closest(".unit-card, .avatar-card")) UI.hideAimLine();
      if ((UI.mode === "equip" || UI.mode === "sacrifice") && el && !el.closest(".unit-card, .hand-card, .avatar-card")) {
        UI.mode = "idle"; UI.eqHandIdx = -1; UI.sacTarget = -1;
        UI.renderAll();
      }
    });
    const cb = this.el("codexBtn");
    if (cb) cb.addEventListener("click", () => UI.showCodex());
    // 自动进入 AI 回合
    setInterval(() => {
      const st = Game.state;
      if (!st || st.winner != null) return;
      if (st.cur === 1 && !st.waitingAI) {
        st.waitingAI = true;
        Game.aiGo();
      } else if (st.cur === 1 && st.waitingAI && !st.prompting &&
                 !document.hidden && Game._lastAct && Date.now() - Game._lastAct > 12000) {
        // AI 疑似卡住（12 秒无任何行动日志且不在等待玩家选择）→ 强制恢复，防止行动中断
        Game.log("⚠ AI 行动疑似卡住，自动恢复行动", "sys");
        st.waitingAI = false;
        Game.aiGo();
      }
    }, 600);
  },
};

function mk(label, fn, disabled, cls) {
  const b = document.createElement("button");
  b.textContent = label;
  if (fn) b.addEventListener("click", fn);
  if (disabled) b.disabled = true;
  if (cls) b.className = cls;
  return b;
}

// 启动
window.addEventListener("DOMContentLoaded", () => {
  UI.init();
  if (Game.load()) {
    UI.el("draftScreen").classList.add("hidden");
    UI.el("loadingScreen").classList.add("hidden");
    Game.resumeAfterReload();
  } else {
    UI.startDraft();
  }
});
