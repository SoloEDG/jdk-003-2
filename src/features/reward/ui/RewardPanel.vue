<script setup lang="ts">
import { computed } from "vue";
import { rewardState, chooseReward } from "../model/state";
import { contractState } from "@/features/contract";
import { battleState } from "@/features/battle";
import { cards } from "@/shared/cards";

const emit = defineEmits<{
  claim: [skip: boolean];
  claimPact: [contractId: string, cardKey: string | null];
}>();

const pactResolution = computed(() => {
  const last = contractState.lastResolution;
  const battleId = battleState.result?.id;
  if (!last || last.battleId !== battleId) return null;
  return last;
});
</script>

<template>
  <section class="panel">
    <div class="section-top">
      <span class="eyebrow">03 / THE SPOILS</span><span>三选一</span>
    </div>
    <h2>把胜利带进下一场</h2>
    <p class="muted">
      战斗结束后结算金币，并选择一张新牌。林地额外疗愈，险路改变奖励池。
    </p>

    <!-- 契约结算：解释本次战斗的行为为何算数 / 为何违约 -->
    <div
      v-if="pactResolution"
      class="pact-resolution"
      :class="pactResolution.status"
      :data-contract-id="pactResolution.contractId"
    >
      <h3>
        契约《{{ pactResolution.name }}》·
        {{
          pactResolution.status === "fulfilled"
            ? "已履约"
            : pactResolution.status === "breached"
              ? "已违约"
              : "已失效"
        }}
      </h3>
      <p class="reason">{{ pactResolution.reason }}</p>
      <ul class="deltas">
        <li v-for="(line, i) in pactResolution.deltas" :key="i">
          <span>✦</span>{{ line }}
        </li>
      </ul>
      <p class="muted">
        以上进度均来自本场战斗实际提交的行动；预览与取消操作不计入。
      </p>
      <template v-if="pactResolution.status === 'fulfilled' && pactResolution.reward">
        <div class="notice">
          契约报酬 · {{ pactResolution.reward.gold }} 金币 / 回复
          {{ pactResolution.reward.heal }} 生命，另可选择一张契约卡牌
        </div>
        <div class="reward-options compact">
          <button
            v-for="key in pactResolution.reward.cardPool"
            :key="key"
            :data-pact-card="key"
            @click="emit('claimPact', pactResolution.contractId, key)"
          >
            <b>{{ cards[key]?.name }}</b
            ><small>{{ cards[key]?.text }}</small
            ><em>契约卡</em>
          </button>
        </div>
        <div class="toolbar">
          <button
            data-action="claim-pact-gold"
            @click="emit('claimPact', pactResolution.contractId, null)"
          >
            仅领取契约金币与回复
          </button>
        </div>
      </template>
    </div>

    <div v-if="rewardState.offer && !rewardState.offer.claimed">
      <div class="notice">
        ✦ {{ rewardState.offer.gold }} 金币 · 回复
        {{ rewardState.offer.heal }} 生命
      </div>
      <div class="reward-options">
        <button
          v-for="key in rewardState.offer.cards"
          :key="key"
          :class="{ selected: rewardState.selected === key }"
          @click="chooseReward(key)"
        >
          <b>{{ cards[key]?.name }}</b
          ><small>{{ cards[key]?.text }}</small
          ><em>{{ cards[key]?.rarity }}</em>
        </button>
      </div>
      <div class="toolbar">
        <button
          :disabled="!rewardState.selected"
          data-action="claim"
          @click="emit('claim', false)"
        >
          收下选中牌与战利品</button
        ><button data-action="skip-reward" @click="emit('claim', true)">
          仅收取金币
        </button>
      </div>
    </div>
    <div v-else class="empty-mini">
      {{
        rewardState.offer?.claimed
          ? "战利品已收入行囊。下一段路线已开放。"
          : "战胜敌人，发现下一张关键卡牌。"
      }}
    </div>
  </section>
</template>
