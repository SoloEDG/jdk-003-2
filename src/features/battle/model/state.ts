import { reactive, readonly } from "vue";
import type {
  Actor,
  BattleResult,
  CardInstance,
  JourneyContext,
} from "@/shared/domain";
import { cards } from "@/shared/cards";
import { uid } from "@/shared/random";
import { spawnEnemy, enemyIntent, type Enemy } from "../lib/enemies";
import { makePiles, drawCards, discardHand, type Piles } from "../lib/piles";
import {
  resolveEffect,
  poisonTick,
  damage,
  type EffectEvent,
} from "../lib/effects";
interface BattleState {
  id: string;
  context: JourneyContext | null;
  hero: Actor;
  enemy: Enemy | null;
  piles: Piles;
  energy: number;
  turn: number;
  phase: "idle" | "playing" | "won" | "lost";
  queue: EffectEvent[];
  log: string[];
  result: BattleResult | null;
  /** 契约统计：本场实际打出的攻击牌数。 */
  attacksPlayed: number;
  /** 契约统计：本场累计承受的伤害（荆棘与敌方攻击都计入）。 */
  damageTaken: number;
  /** 契约统计：敌人是否因中毒伤害倒下。 */
  poisonKill: boolean;
}
const emptyHero = (): Actor => ({
  hp: 72,
  maxHp: 72,
  block: 0,
  strength: 0,
  poison: 0,
  thorns: 0,
});
const state = reactive<BattleState>({
  id: "",
  context: null,
  hero: emptyHero(),
  enemy: null,
  piles: makePiles([], ""),
  energy: 3,
  turn: 1,
  phase: "idle",
  queue: [],
  log: [],
  result: null,
  attacksPlayed: 0,
  damageTaken: 0,
  poisonKill: false,
});
export const battleState = readonly(state);
export function beginBattle(
  context: JourneyContext,
  deck: CardInstance[],
  hp: number,
  maxHp: number,
) {
  state.id = uid("battle");
  state.context = context;
  state.hero = { ...emptyHero(), hp, maxHp };
  state.enemy = spawnEnemy(context);
  state.piles = makePiles(deck, context.nodeId);
  state.energy = 3;
  state.turn = 1;
  state.phase = "playing";
  state.queue = [];
  state.result = null;
  state.attacksPlayed = 0;
  state.damageTaken = 0;
  state.poisonKill = false;
  state.log = ["战斗开始。状态和牌堆仅属于本场遭遇。"];
  drawCards(state.piles, 5, 1);
}
function finish(poisonFelled = false) {
  if (!state.enemy || !state.context) return;
  if (state.hero.hp <= 0 || state.enemy.hp <= 0) {
    if (state.enemy.hp <= 0 && poisonFelled) state.poisonKill = true;
    state.phase = state.hero.hp <= 0 ? "lost" : "won";
    state.result = {
      id: state.id,
      nodeId: state.context.nodeId,
      won: state.phase === "won",
      hp: state.hero.hp,
      gold: state.enemy.reward,
      context: JSON.parse(JSON.stringify(state.context)),
    };
    state.queue = [];
  }
}
function drain() {
  while (state.queue.length && state.phase === "playing") {
    const event = state.queue.shift()!;
    if (event.effect.type === "draw") {
      drawCards(state.piles, event.effect.amount, state.turn);
      state.log.unshift(`抽取 ${event.effect.amount} 张牌`);
    } else if (event.effect.type === "energy") {
      state.energy += event.effect.amount;
    } else if (state.enemy) {
      const hpBefore = state.hero.hp;
      state.log.unshift(resolveEffect(event, state.hero, state.enemy));
      const lost = hpBefore - state.hero.hp;
      if (lost > 0) state.damageTaken += lost;
    }
    finish();
  }
  state.log = state.log.slice(0, 18);
}
export function playCard(id: string) {
  if (state.phase !== "playing") return false;
  const card = state.piles.hand.find((c) => c.id === id);
  if (!card) return false;
  const spec = cards[card.key]!;
  if (state.energy < spec.cost) return false;
  state.energy -= spec.cost;
  state.piles.hand = state.piles.hand.filter((c) => c.id !== id);
  (spec.kind === "power" ? state.piles.exhaust : state.piles.discard).push(
    card,
  );
  if (spec.kind === "attack") state.attacksPlayed += 1;
  state.queue.push(
    ...spec.effects.map((e) => ({
      effect: {
        ...e,
        amount: e.amount + (card.upgraded && e.type !== "energy" ? 2 : 0),
      },
      source: "hero" as const,
      label: spec.name,
    })),
  );
  drain();
  return true;
}
export function endTurn() {
  if (state.phase !== "playing" || !state.enemy) return;
  const hpBeforePoison = state.enemy.hp;
  const poison = poisonTick(state.enemy);
  if (poison) state.log.unshift(`敌人中毒失去 ${poison} 生命`);
  const poisonFelled = poison > 0 && state.enemy.hp <= 0 && hpBeforePoison > 0;
  finish(poisonFelled);
  if (state.phase !== "playing") return;
  const hpBefore = state.hero.hp;
  const amount = enemyIntent(state.enemy, state.turn);
  damage(state.hero, amount);
  state.log.unshift(`敌人攻击 ${amount}`);
  const lost = hpBefore - state.hero.hp;
  if (lost > 0) state.damageTaken += lost;
  poisonTick(state.hero);
  finish();
  if (state.phase !== "playing") return;
  discardHand(state.piles);
  state.turn++;
  state.energy = 3;
  state.hero.block = 0;
  state.enemy.block = state.turn % 3 === 0 ? 5 : 0;
  drawCards(state.piles, 5, state.turn);
}
/** 提供给契约层的本场统计快照。 */
export function battleContractStats() {
  return {
    battleId: state.id,
    attacksPlayed: state.attacksPlayed,
    damageTaken: state.damageTaken,
    poisonKill: state.poisonKill,
  };
}
export function currentIntent() {
  return state.enemy ? enemyIntent(state.enemy, state.turn) : 0;
}
export function exportBattle() {
  return JSON.parse(JSON.stringify(state)) as BattleState;
}
export function restoreBattle(d: BattleState) {
  Object.assign(state, {
    ...d,
    attacksPlayed: d.attacksPlayed ?? 0,
    damageTaken: d.damageTaken ?? 0,
    poisonKill: d.poisonKill ?? false,
  });
}
export function resetBattle() {
  state.phase = "idle";
  state.context = null;
  state.enemy = null;
  state.result = null;
  state.piles = makePiles([], "");
  state.log = [];
  state.attacksPlayed = 0;
  state.damageTaken = 0;
  state.poisonKill = false;
}
