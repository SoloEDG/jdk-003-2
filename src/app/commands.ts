import {
  enterRoute,
  resolveRoute,
  resetRoute,
  routeState,
} from "@/features/route";
import {
  battleState,
  beginBattle,
  playCard,
  endTurn,
  resetBattle,
  battleContractStats,
} from "@/features/battle";
import {
  deckState,
  deckCards,
  addCard,
  earnGold,
  spendGold,
  setHp,
  heal,
  upgradeCard,
  removeCard,
  openCamp,
  useCamp,
  resetDeck,
} from "@/features/deck";
import { openReward, claimReward, resetReward } from "@/features/reward";
import {
  openShop,
  withdrawExclusive,
  preparePurchase,
  completePurchase,
  closeShop,
  resetShop,
} from "@/features/shop";
import {
  contractState,
  ensureOffer,
  signContract,
  recordEvent,
  recordBattleResult,
  vetoAttackRemoval,
  rolloverRegion,
  claimContractReward,
  resetContract,
  exportContract,
  restoreContract,
} from "@/features/contract";
import { cards } from "@/shared/cards";
import { uid } from "@/shared/random";
import {
  session,
  switchTab,
  setContext,
  notify,
  finishRun,
  resetSession,
} from "./session";
import { save, clearSave } from "./persistence";

function persist() {
  if (!save()) notify("本地保存失败，请保留当前页面。");
}

/** 契约状态变更后同步商店：违约 / 失效会立即撤下未购买的专属库存。 */
function syncExclusiveStock() {
  if (!contractState.active) withdrawExclusive();
}

/** 每个实际提交的行为都有全局唯一事件 id，保存恢复后也不会与历史事件碰撞。 */
function eventId(prefix: string) {
  return uid(prefix);
}

export function navigate(id: string) {
  if (session.ended) return;
  const c = enterRoute(id);
  if (!c) return;
  setContext(c);
  // 跨区时：未完成契约先判失败，再生成新地区的契约要约。
  rolloverRegion(c, routeState.visited.length);
  ensureOffer(routeState.visited.length);
  if (c.kind === "shop") {
    openShop(c, contractState.active ? [...contractState.active.exclusiveCards] : []);
    switchTab("shop");
  } else if (c.kind === "camp") {
    openCamp();
    switchTab("deck");
  } else {
    beginBattle(c, deckCards(), deckState.hero.hp, deckState.hero.maxHp);
    switchTab("battle");
  }
  notify(
    `进入 ${c.nodeId} · 威胁 ${c.influence.heat} / 好感 ${c.influence.favor}`,
  );
  persist();
}

export function signPact(archetypeKey: string) {
  if (!session.context) return;
  if (signContract(archetypeKey, session.context)) {
    notify("契约已签订，进度将随你的实际行动累计。");
    persist();
  }
}

export function claimPact(contractId: string, cardKey: string | null) {
  const reward = claimContractReward(contractId);
  if (!reward) {
    notify("这份契约报酬已经领取过，无法重复发放。");
    return;
  }
  if (cardKey && reward.cardPool.includes(cardKey)) addCard(cardKey);
  earnGold(reward.gold);
  heal(reward.heal);
  notify(`契约报酬已结算：${reward.gold} 金币${cardKey ? "与一张契约卡牌" : ""}。`);
  persist();
}

export function play(id: string) {
  if (playCard(id)) {
    // 只有真正打出的攻击牌才计数；能量不足 / 阶段错误的出牌在战斗层被拒绝。
    const stats = battleContractStats();
    if (session.context) {
      recordEvent({
        id: `attack:${stats.battleId}:${stats.attacksPlayed}`,
        kind: "attackPlay",
        amount: 1,
        context: session.context,
      });
      syncExclusiveStock();
    }
  }
  persist();
}

export function turn() {
  endTurn();
  persist();
}

export function settle() {
  const r = battleState.result;
  if (!r) return;
  if (!r.won) {
    // 失败也要进入契约结算：判定违约并冻结原因。
    if (session.context) {
      const stats = battleContractStats();
      recordBattleResult({
        id: r.id,
        won: false,
        hp: r.hp,
        damageTaken: stats.damageTaken,
        poisonKills: stats.poisonKill ? 1 : 0,
        flawless: false,
        context: r.context,
      });
      syncExclusiveStock();
    }
    setHp(r.hp);
    finishRun();
    notify("这次旅途已经结束。重新启程可保留你的经验。");
    persist();
    return;
  }
  if (session.context) {
    const stats = battleContractStats();
    recordBattleResult({
      id: r.id,
      won: true,
      hp: r.hp,
      damageTaken: stats.damageTaken,
      poisonKills: stats.poisonKill ? 1 : 0,
      flawless: stats.damageTaken === 0,
      context: r.context,
    });
    syncExclusiveStock();
  }
  if (openReward(JSON.parse(JSON.stringify(r)))) {
    setHp(r.hp);
    switchTab("reward");
    notify("胜利！选择一张牌或跳过卡牌，金币都会结算。");
  }
  persist();
}

export function claim(skip: boolean) {
  const grant = claimReward(skip);
  if (!grant) return;
  if (grant.card) {
    addCard(grant.card);
    // 实际收入牌组的新牌才计入契约；跳过卡牌不计数。
    if (session.context) {
      recordEvent({
        id: eventId("card"),
        kind: "cardGained",
        amount: 1,
        context: session.context,
      });
      syncExclusiveStock();
    }
  }
  earnGold(grant.gold);
  heal(grant.heal);
  resolveRoute();
  if (session.context?.kind === "boss") {
    finishRun();
    notify("裂隙已被封存。你把余烬带回了黎明。");
  } else notify("奖励已结算，新的路线开放。");
  switchTab("route");
  persist();
}

export function buy(id: string) {
  const p = preparePurchase(id);
  if (!p || !spendGold(p.price)) {
    notify("无法购买：库存或金币不足。");
    return;
  }
  if (!completePurchase(p)) {
    earnGold(p.price);
    return;
  }
  addCard(p.card);
  // 交易与新牌分别累计；已购买的卡牌即使之后违约也归玩家所有。
  if (session.context) {
    recordEvent({
      id: eventId("purchase"),
      kind: "purchases",
      amount: 1,
      context: session.context,
    });
    recordEvent({
      id: eventId("card"),
      kind: "cardGained",
      amount: 1,
      context: session.context,
    });
    syncExclusiveStock();
  }
  notify("交易完成，卡牌已收入牌组。");
  persist();
}

export function leaveShop() {
  closeShop();
  resolveRoute();
  switchTab("route");
  persist();
}

export function camp(action: "rest" | "upgrade") {
  if (
    !session.context ||
    session.context.kind !== "camp" ||
    !useCamp(action, session.context.influence.heat)
  )
    return;
  resolveRoute();
  notify("篝火逐渐熄灭，你准备好继续上路。");
  persist();
}

export function upgrade(id: string) {
  if (battleState.phase === "playing") return;
  notify(upgradeCard(id) ? "卡牌强化完成。" : "无法强化：金币不足或已经强化。");
  persist();
}

export function remove(id: string) {
  // 契约约束优先于战斗锁：有效契约禁止移除攻击牌，触发即违约并冻结原因。
  if (session.context) {
    const target = deckState.cards.find((c) => c.id === id);
    if (target && cards[target.key]?.kind === "attack") {
      const reason = vetoAttackRemoval(session.context);
      if (reason) {
        syncExclusiveStock();
        notify(`契约违约：${reason} 未购买的专属货物已撤下。`);
        persist();
        return;
      }
    }
  }
  if (battleState.phase === "playing") return;
  notify(
    removeCard(id)
      ? "已移除卡牌。"
      : "无法移除：至少保留五张牌，且需要足够金币。",
  );
  persist();
}

export { contractState, exportContract, restoreContract };

export function restart() {
  resetRoute();
  resetBattle();
  resetDeck();
  resetReward();
  resetShop();
  resetContract();
  resetSession();
  clearSave();
  persist();
}
