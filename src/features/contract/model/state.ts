import { reactive, readonly } from "vue";
import type {
  ActiveContract,
  ContractLedgerEntry,
  ContractMetrics,
  ContractOffer,
  JourneyContext,
  Region,
} from "@/shared/domain";
import { uid } from "@/shared/random";
import { emptyMetrics, offerForRegion } from "../lib/archetypes";

interface ContractState {
  offer: ContractOffer | null;
  active: ActiveContract | null;
  ledger: ContractLedgerEntry[];
  /** 已经发放过完成报酬的契约 id，防止保存恢复 / 重复领奖再次发放。 */
  paidIds: string[];
  /** 已经生成过要约的地区，保证每个地区只出一份契约要约。 */
  offeredRegions: Region[];
  /** 最近一次结算说明，奖励页据此解释“本次结算为何算数”。 */
  lastResolution: {
    contractId: string;
    battleId: string | null;
    name: string;
    status: "fulfilled" | "breached" | "expired";
    reason: string;
    deltas: string[];
    reward: { gold: number; heal: number; cardPool: string[] } | null;
  } | null;
}

const state = reactive<ContractState>({
  offer: null,
  active: null,
  ledger: [],
  paidIds: [],
  offeredRegions: [],
  lastResolution: null,
});

export const contractState = readonly(state);

export function regionDepth(visitedCount: number): {
  region: Region;
  depth: number;
} {
  const index = Math.min(Math.floor(visitedCount / 3), 2);
  const regions: Region[] = ["forest", "forge", "abyss"];
  return { region: regions[index]!, depth: visitedCount };
}

/** 进入新地区时生成契约要约；每个地区只生成一份，放弃后不会反复刷新。 */
export function ensureOffer(visitedCount: number) {
  const { region, depth } = regionDepth(visitedCount);
  if (state.offeredRegions.includes(region)) return;
  if (state.active && state.active.region === region) return;
  state.offer = {
    id: uid("offer"),
    region,
    archetypes: offerForRegion(region, depth, uid("seed")),
    declined: false,
  };
  state.offeredRegions.push(region);
}

export function declineOffer() {
  if (state.offer) state.offer.declined = true;
}

export function signContract(archetypeKey: string, context: JourneyContext) {
  if (!state.offer || state.offer.declined || state.active) return false;
  const archetype = state.offer.archetypes.find(
    (a) => a.key === archetypeKey,
  );
  if (!archetype) return false;
  state.active = {
    id: uid("contract"),
    archetypeKey: archetype.key,
    region: archetype.region,
    name: archetype.name,
    brief: archetype.brief,
    goals: JSON.parse(JSON.stringify(archetype.goals)),
    limits: JSON.parse(JSON.stringify(archetype.limits)),
    constraints: JSON.parse(JSON.stringify(archetype.constraints)),
    reward: JSON.parse(JSON.stringify(archetype.reward)),
    exclusiveCards: [...archetype.exclusiveCards],
    status: "active",
    metrics: emptyMetrics(),
    seenEvents: [],
    reason: "",
    rewardPaid: false,
    signedAtNode: context.nodeId,
    nodeId: context.nodeId,
  };
  state.offer.declined = true;
  return true;
}

function goalsMet(contract: ActiveContract) {
  return contract.goals.every(
    (g) => contract.metrics[g.metric] >= g.target,
  );
}

function breachReason(contract: ActiveContract): string {
  for (const limit of contract.limits) {
    if (limit.kind === "battles" && contract.metrics.battles > limit.amount)
      return `战斗场次达到 ${contract.metrics.battles} 场，超过“${limit.label}”的上限。`;
    if (
      limit.kind === "damageTaken" &&
      contract.metrics.damageTaken > limit.amount
    )
      return `累计受伤 ${contract.metrics.damageTaken} 点，超过“${limit.label}”的上限。`;
  }
  return "";
}

function closeContract(
  contract: ActiveContract,
  status: "fulfilled" | "breached" | "expired",
  reason: string,
  deltas: string[],
  contextNodeId: string,
  battleId: string | null,
) {
  contract.status = status;
  contract.reason = reason;
  const reward =
    status === "fulfilled" && !contract.rewardPaid
      ? { ...contract.reward, cardPool: [...contract.reward.cardPool] }
      : null;
  state.lastResolution = {
    contractId: contract.id,
    battleId,
    name: contract.name,
    status,
    reason,
    deltas: [...deltas],
    reward,
  };
  state.ledger.push({
    id: contract.id,
    archetypeKey: contract.archetypeKey,
    region: contract.region,
    name: contract.name,
    brief: contract.brief,
    status,
    reason,
    rewardPaid: false,
    reward,
    signedAtNode: contract.signedAtNode,
    closedAtNode: contextNodeId,
  });
  state.active = null;
  return reward;
}

/**
 * 以实际提交的行为累计进度。eventId 用于去重：同一场战斗 / 同一次交易
 * 即使保存恢复后重复提交，也不会重复累计。
 */
export function recordEvent(
  event: {
    id: string;
    kind: keyof ContractMetrics | "attackPlay" | "cardGained";
    amount?: number;
    context: JourneyContext;
    note?: string;
  },
): { gold: number; heal: number; cardPool: string[] } | null {
  const contract = state.active;
  if (!contract || contract.status !== "active") return null;
  if (contract.seenEvents.includes(event.id)) return null;
  const amount = event.amount ?? 1;
  const deltas: string[] = [];

  if (event.kind === "attackPlay") {
    contract.metrics.attacksPlayed += amount;
    contract.seenEvents.push(event.id);
    deltas.push(`打出攻击牌，攻击牌计数 +${amount}`);
  } else if (event.kind === "cardGained") {
    contract.metrics.cardsGained += amount;
    contract.seenEvents.push(event.id);
    deltas.push(`获得新牌，新牌计数 +${amount}`);
  } else if (event.kind === "purchases") {
    contract.metrics.purchases += amount;
    contract.seenEvents.push(event.id);
    deltas.push(`完成交易，交易计数 +${amount}`);
  } else {
    contract.seenEvents.push(event.id);
  }

  if (goalsMet(contract)) {
    return closeContract(
      contract,
      "fulfilled",
      `所有目标已达成：${contract.goals
        .map((g) => g.label)
        .join("；")}。`,
      deltas,
      event.context.nodeId,
      null,
    );
  }
  state.lastResolution = null;
  return null;
}

/** 一场战斗结束时统一结算：胜利、无伤、中毒击杀、场次、受伤上限。 */
export function recordBattleResult(
  result: {
    id: string;
    won: boolean;
    hp: number;
    damageTaken: number;
    poisonKills: number;
    flawless: boolean;
    context: JourneyContext;
  },
): { gold: number; heal: number; cardPool: string[] } | null {
  const contract = state.active;
  if (!contract || contract.status !== "active") return null;
  const eventId = `battle:${result.id}`;
  if (contract.seenEvents.includes(eventId)) return null;
  contract.seenEvents.push(eventId);

  const deltas: string[] = [];
  contract.metrics.battles += 1;
  deltas.push(`本场为第 ${contract.metrics.battles} 场战斗`);
  contract.metrics.damageTaken += result.damageTaken;
  if (result.damageTaken > 0)
    deltas.push(`受到 ${result.damageTaken} 点伤害，累计 ${contract.metrics.damageTaken} 点`);
  if (result.won) {
    contract.metrics.wins += 1;
    deltas.push(`战斗胜利，胜场 +1（共 ${contract.metrics.wins} 场）`);
    if (result.flawless) {
      contract.metrics.flawlessWins += 1;
      deltas.push("全程未受伤害，无伤胜场 +1");
    }
    if (result.poisonKills > 0) {
      contract.metrics.poisonKills += result.poisonKills;
      deltas.push(`敌人因中毒倒下，中毒击杀 +${result.poisonKills}`);
    }
  } else {
    deltas.push("战斗失败，旅途终止。");
  }

  const reason = breachReason(contract);
  if (reason)
    return closeContract(
      contract,
      "breached",
      reason,
      deltas,
      result.context.nodeId,
      result.id,
    );
  if (!result.won)
    return closeContract(
      contract,
      "breached",
      "战斗失败，契约无法继续履行。",
      deltas,
      result.context.nodeId,
      result.id,
    );
  if (goalsMet(contract)) {
    return closeContract(
      contract,
      "fulfilled",
      `所有目标已达成：${contract.goals.map((g) => g.label).join("；")}。`,
      deltas,
      result.context.nodeId,
      result.id,
    );
  }
  state.lastResolution = null;
  return null;
}

/** 尝试移除攻击牌：有效契约会阻止该行为并记录违约。 */
export function vetoAttackRemoval(context: JourneyContext): string | null {
  const contract = state.active;
  if (!contract || contract.status !== "active") return null;
  const blocked = contract.constraints.some(
    (c) => c.kind === "noAttackRemoved",
  );
  if (!blocked) return null;
  closeContract(
    contract,
    "breached",
    "你移除了一张攻击牌，违反“契约期间不得移除攻击牌”的约定。",
    ["尝试移除攻击牌，约束被触发"],
    context.nodeId,
    null,
  );
  return contract.reason;
}

/** 跨区时未完成的契约先判失败，再生成新地区的契约要约。 */
export function rolloverRegion(context: JourneyContext, visitedCount: number) {
  if (state.active && state.active.region !== context.region) {
    closeContract(
      state.active,
      "expired",
      `你离开了 ${state.active.region} 地区，契约未能在期限内完成。`,
      ["跨区时契约仍未完成"],
      context.nodeId,
      null,
    );
  }
  ensureOffer(visitedCount);
}

export function hasActiveContract() {
  return !!state.active && state.active.status === "active";
}

export function exclusiveStockCards(): string[] {
  return state.active && state.active.status === "active"
    ? [...state.active.exclusiveCards]
    : [];
}

/** 领取完成报酬：只发一次，重复调用返回 null。 */
export function claimContractReward(contractId: string) {
  const entry = state.ledger.find((l) => l.id === contractId);
  if (!entry || entry.status !== "fulfilled" || entry.rewardPaid) return null;
  if (state.paidIds.includes(contractId) || !entry.reward) return null;
  entry.rewardPaid = true;
  state.paidIds.push(contractId);
  return { ...entry.reward, cardPool: [...entry.reward.cardPool] };
}

export function contractMetricLines(contract: ActiveContract): string[] {
  return contract.goals.map((g) => {
    const now = Math.min(contract.metrics[g.metric], g.target);
    return `${g.label}：${now} / ${g.target}`;
  });
}

export function exportContract() {
  return JSON.parse(JSON.stringify(state)) as ContractState;
}

export function restoreContract(d: Partial<ContractState>) {
  Object.assign(state, {
    offer: d.offer ?? null,
    active: d.active ?? null,
    ledger: Array.isArray(d.ledger) ? d.ledger : [],
    paidIds: Array.isArray(d.paidIds) ? d.paidIds : [],
    offeredRegions: Array.isArray(d.offeredRegions) ? d.offeredRegions : [],
    lastResolution: d.lastResolution ?? null,
  });
}

export function resetContract() {
  state.offer = null;
  state.active = null;
  state.ledger = [];
  state.paidIds = [];
  state.offeredRegions = [];
  state.lastResolution = null;
}
