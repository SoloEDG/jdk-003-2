import { exportRoute, restoreRoute } from "@/features/route";
import { exportBattle, restoreBattle } from "@/features/battle";
import { exportDeck, restoreDeck } from "@/features/deck";
import { exportReward, restoreReward } from "@/features/reward";
import { exportShop, restoreShop } from "@/features/shop";
import { exportContract, restoreContract } from "@/features/contract";
import { exportSession, restoreSession } from "./session";
const KEY = "ember-path-v1";
function snapshot() {
  return {
    version: 1,
    route: exportRoute(),
    battle: exportBattle(),
    deck: exportDeck(),
    reward: exportReward(),
    shop: exportShop(),
    contract: exportContract(),
    session: exportSession(),
  };
}
export function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(snapshot()));
    return true;
  } catch {
    return false;
  }
}
export function load() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return false;
  try {
    const d = JSON.parse(raw);
    if (
      d.version !== 1 ||
      !Array.isArray(d.deck?.cards) ||
      !Array.isArray(d.route?.visited) ||
      !d.battle?.piles ||
      !Array.isArray(d.reward?.history) ||
      !Array.isArray(d.shop?.stock) ||
      !d.session
    )
      return false;
    const old = snapshot();
    try {
      restoreRoute(d.route);
      restoreBattle(d.battle);
      restoreDeck(d.deck);
      restoreReward(d.reward);
      restoreShop(d.shop);
      // 旧版本存档没有契约块时使用空契约，不影响原有进度。
      restoreContract(
        d.contract ?? {
          offer: null,
          active: null,
          ledger: [],
          paidIds: [],
          lastResolution: null,
        },
      );
      restoreSession(d.session);
    } catch {
      restoreRoute(old.route);
      restoreBattle(old.battle);
      restoreDeck(old.deck);
      restoreReward(old.reward);
      restoreShop(old.shop);
      restoreContract(old.contract);
      restoreSession(old.session);
      return false;
    }
    return true;
  } catch {
    return false;
  }
}
export function clearSave() {
  localStorage.removeItem(KEY);
}
