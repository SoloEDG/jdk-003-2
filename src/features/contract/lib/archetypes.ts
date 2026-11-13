import type {
  ContractArchetype,
  ContractMetrics,
  Region,
} from "@/shared/domain";
import { shuffle, hash } from "@/shared/random";

export const CONTRACT_ARCHETYPES: ContractArchetype[] = [
  {
    key: "venom-pact",
    name: "孢冠毒誓",
    brief: "不移除任何攻击牌，并在三场战斗内以中毒击败两名敌人。",
    region: "forest",
    goals: [
      { metric: "poisonKills", target: 2, label: "以中毒击败 2 名敌人" },
    ],
    limits: [{ kind: "battles", amount: 3, label: "三场战斗内完成" }],
    constraints: [
      { kind: "noAttackRemoved", label: "契约期间不得移除攻击牌" },
    ],
    reward: { gold: 55, heal: 8, cardPool: ["venom", "focus", "shelter"] },
    exclusiveCards: ["venom", "focus"],
  },
  {
    key: "flawless-iron",
    name: "无伤铁律",
    brief: "在两场战斗内取得一场无伤胜利，且不得移除攻击牌。",
    region: "forge",
    goals: [
      { metric: "flawlessWins", target: 1, label: "取得 1 场无伤胜利" },
    ],
    limits: [{ kind: "battles", amount: 2, label: "两场战斗内完成" }],
    constraints: [
      { kind: "noAttackRemoved", label: "契约期间不得移除攻击牌" },
    ],
    reward: { gold: 60, heal: 6, cardPool: ["guard", "burst", "fury"] },
    exclusiveCards: ["fury", "burst"],
  },
  {
    key: "ember-offensive",
    name: "余烬攻势",
    brief: "在三场战斗内打出 12 张攻击牌，并赢下其中两场。",
    region: "forge",
    goals: [
      { metric: "attacksPlayed", target: 12, label: "打出 12 张攻击牌" },
      { metric: "wins", target: 2, label: "赢下 2 场战斗" },
    ],
    limits: [{ kind: "battles", amount: 3, label: "三场战斗内完成" }],
    constraints: [],
    reward: { gold: 50, heal: 4, cardPool: ["strike", "fury", "burst"] },
    exclusiveCards: ["fury", "burst"],
  },
  {
    key: "iron-discipline",
    name: "铁血纪律",
    brief: "在两场战斗内打出 8 张攻击牌，且不移除任何攻击牌。",
    region: "forge",
    goals: [
      { metric: "attacksPlayed", target: 8, label: "打出 8 张攻击牌" },
    ],
    limits: [{ kind: "battles", amount: 2, label: "两场战斗内完成" }],
    constraints: [
      { kind: "noAttackRemoved", label: "契约期间不得移除攻击牌" },
    ],
    reward: { gold: 46, heal: 5, cardPool: ["strike", "guard", "fury"] },
    exclusiveCards: ["fury", "guard"],
  },
  {
    key: "abyss-scholar",
    name: "深渊账房",
    brief: "在三场战斗内完成两次交易，并获得两张新牌。",
    region: "abyss",
    goals: [
      { metric: "purchases", target: 2, label: "完成 2 次交易" },
      { metric: "cardsGained", target: 2, label: "获得 2 张新牌" },
    ],
    limits: [{ kind: "battles", amount: 3, label: "三场战斗内完成" }],
    constraints: [],
    reward: { gold: 45, heal: 5, cardPool: ["focus", "venom", "fury"] },
    exclusiveCards: ["focus", "fury"],
  },
  {
    key: "echo-hunter",
    name: "回声猎手",
    brief: "在三场战斗内赢下三场，且累计受到的伤害不超过 12 点。",
    region: "abyss",
    goals: [{ metric: "wins", target: 3, label: "赢下 3 场战斗" }],
    limits: [
      { kind: "battles", amount: 3, label: "三场战斗内完成" },
      { kind: "damageTaken", amount: 12, label: "累计受伤不超过 12 点" },
    ],
    constraints: [],
    reward: { gold: 70, heal: 10, cardPool: ["burst", "fury", "focus"] },
    exclusiveCards: ["burst", "fury"],
  },
  {
    key: "silent-ledger",
    name: "寂静账簿",
    brief: "在三场战斗内完成三次交易，并赢下一场战斗。",
    region: "abyss",
    goals: [
      { metric: "purchases", target: 3, label: "完成 3 次交易" },
      { metric: "wins", target: 1, label: "赢下 1 场战斗" },
    ],
    limits: [{ kind: "battles", amount: 3, label: "三场战斗内完成" }],
    constraints: [],
    reward: { gold: 40, heal: 4, cardPool: ["focus", "guard", "venom"] },
    exclusiveCards: ["focus", "venom"],
  },
  {
    key: "march-of-spores",
    name: "孢子行军",
    brief: "在三场战斗内以中毒击败一名敌人，并获得三张新牌。",
    region: "forest",
    goals: [
      { metric: "poisonKills", target: 1, label: "以中毒击败 1 名敌人" },
      { metric: "cardsGained", target: 3, label: "获得 3 张新牌" },
    ],
    limits: [{ kind: "battles", amount: 3, label: "三场战斗内完成" }],
    constraints: [],
    reward: { gold: 48, heal: 6, cardPool: ["venom", "shelter", "guard"] },
    exclusiveCards: ["venom", "shelter"],
  },
  {
    key: "warden-vow",
    name: "守望者誓",
    brief: "在三场战斗内赢下两场，全程不移除任何攻击牌。",
    region: "forest",
    goals: [{ metric: "wins", target: 2, label: "赢下 2 场战斗" }],
    limits: [{ kind: "battles", amount: 3, label: "三场战斗内完成" }],
    constraints: [
      { kind: "noAttackRemoved", label: "契约期间不得移除攻击牌" },
    ],
    reward: { gold: 52, heal: 7, cardPool: ["guard", "venom", "shelter"] },
    exclusiveCards: ["venom", "guard"],
  },
];

export function emptyMetrics(): ContractMetrics {
  return {
    wins: 0,
    flawlessWins: 0,
    poisonKills: 0,
    attacksPlayed: 0,
    cardsGained: 0,
    purchases: 0,
    battles: 0,
    damageTaken: 0,
  };
}

/** 每个地区生成一份三选一的契约要约，结果由地区与层数决定，可重复且可保存。 */
export function offerForRegion(
  region: Region,
  depth: number,
  seedKey: string,
): ContractArchetype[] {
  const pool = CONTRACT_ARCHETYPES.filter((a) => a.region === region);
  return shuffle(pool, hash(`${seedKey}:${region}:${depth}`)).slice(0, 3);
}
