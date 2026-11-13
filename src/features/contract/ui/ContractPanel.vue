<script setup lang="ts">
import { computed } from "vue";
import { contractState, declineOffer } from "../model/state";
import { regionNames } from "@/shared/domain";
import { cards } from "@/shared/cards";

defineProps<{ nodeId: string | null }>();
const emit = defineEmits<{
  sign: [archetypeKey: string];
  claim: [contractId: string, cardKey: string | null];
}>();

const active = computed(() => contractState.active);
const pendingRewards = computed(() =>
  contractState.ledger.filter(
    (l) => l.status === "fulfilled" && !l.rewardPaid && l.reward,
  ),
);

function sign(key: string) {
  emit("sign", key);
}
function claim(contractId: string, cardKey: string | null) {
  emit("claim", contractId, cardKey);
}
</script>

<template>
  <section class="panel contract-panel">
    <div class="section-top">
      <span class="eyebrow">00 / THE PACT</span><span>远征契约</span>
    </div>
    <h2>给每段旅途一个明确目标</h2>
    <p class="muted">
      进入新地区时在此签订契约。预览与放弃都不计数；只有实际提交的行为才会累计进度。
    </p>

    <!-- 待签订的要约 -->
    <div v-if="contractState.offer && !contractState.offer.declined && !active">
      <div class="notice">
        ✦ {{ regionNames[contractState.offer.region] }} ·
        选择一份契约，或放弃签约空手启程
      </div>
      <div class="contract-offers">
        <article
          v-for="a in contractState.offer.archetypes"
          :key="a.key"
          class="contract-card"
        >
          <h3>{{ a.name }}</h3>
          <p>{{ a.brief }}</p>
          <ul>
            <li v-for="g in a.goals" :key="g.metric + g.target">
              ◎ {{ g.label }}
            </li>
            <li v-for="l in a.limits" :key="l.kind + l.amount">
              ⧖ {{ l.label }}
            </li>
            <li v-for="c in a.constraints" :key="c.kind">⚠ {{ c.label }}</li>
          </ul>
          <footer>
            <span>
              报酬 · {{ a.reward.gold }} 金 / 回复 {{ a.reward.heal }} /
              契约卡牌
            </span>
            <button data-action="sign-contract" @click="sign(a.key)">
              签订契约
            </button>
          </footer>
        </article>
      </div>
      <div class="toolbar">
        <button data-action="decline-contract" @click="declineOffer">
          暂不签约（不产生任何进度）
        </button>
      </div>
    </div>

    <!-- 履行中的契约 -->
    <div v-else-if="active" class="contract-active" :data-contract="active.id">
      <div class="contract-head">
        <h3>{{ active.name }} · 履行中</h3>
        <span class="badge">{{ regionNames[active.region] }}</span>
      </div>
      <p class="muted">{{ active.brief }}</p>
      <div class="contract-progress">
        <div v-for="g in active.goals" :key="g.metric + g.target">
          <b>{{ g.label }}</b>
          <div class="progress">
            <i
              :style="{
                width:
                  Math.min(100, (active.metrics[g.metric] / g.target) * 100) +
                  '%',
              }"
            ></i>
          </div>
          <span>{{ Math.min(active.metrics[g.metric], g.target) }} / {{ g.target }}</span>
        </div>
      </div>
      <ul class="contract-limits">
        <li v-for="l in active.limits" :key="l.kind + l.amount">
          ⧖ {{ l.label }}（已进行 {{ active.metrics.battles }} 场战斗<span
            v-if="l.kind === 'damageTaken'"
            >，累计受伤 {{ active.metrics.damageTaken }} / {{ l.amount }}</span
          >）
        </li>
        <li v-for="c in active.constraints" :key="c.kind">⚠ {{ c.label }}</li>
      </ul>
    </div>

    <!-- 待领取的契约报酬 -->
    <div v-if="pendingRewards.length" class="contract-rewards">
      <h3>待领取的契约报酬</h3>
      <article
        v-for="entry in pendingRewards"
        :key="entry.id"
        class="contract-card claimable"
      >
        <h3>{{ entry.name }} · 已履约</h3>
        <p>{{ entry.reason }}</p>
        <p class="muted">
          {{ entry.reward!.gold }} 金币 · 回复 {{ entry.reward!.heal }} 生命
        </p>
        <div class="reward-options compact">
          <button
            v-for="key in entry.reward!.cardPool"
            :key="key"
            :data-contract-card="key"
            @click="claim(entry.id, key)"
          >
            <b>{{ cards[key]?.name }}</b><small>{{ cards[key]?.text }}</small>
          </button>
        </div>
        <div class="toolbar">
          <button @click="claim(entry.id, null)">仅领取金币与回复</button>
        </div>
      </article>
    </div>

    <!-- 历史台账 -->
    <div v-if="contractState.ledger.length" class="contract-ledger">
      <h3>契约台账</h3>
      <p
        v-for="entry in contractState.ledger.slice().reverse()"
        :key="entry.id"
        class="ledger-row"
        :class="entry.status"
      >
        <b>{{ entry.name }}</b>
        <span>{{
          entry.status === "fulfilled"
            ? "已履约"
            : entry.status === "breached"
              ? "已违约"
              : "已失效"
        }}</span>
        <small>{{ entry.reason }}</small>
        <em v-if="entry.status === 'fulfilled'">{{
          entry.rewardPaid ? "报酬已发放" : "报酬待领取"
        }}</em>
      </p>
    </div>

    <div
      v-if="
        (!contractState.offer || contractState.offer.declined) &&
        !active &&
        !contractState.ledger.length
      "
      class="empty-mini"
    >
      本地区未签订契约。抵达下一地区时会出现新的契约选择。
    </div>
  </section>
</template>
