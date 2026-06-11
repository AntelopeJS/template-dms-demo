<script setup lang="ts">
const { t } = useI18n();

const sections = [
  {
    icon: "i-ph-puzzle-piece",
    iconBg: "bg-primary/10",
    iconText: "text-primary",
    key: "components",
    items: ["form", "chart", "dashboard", "tableview", "layout", "custom"],
  },
  {
    icon: "i-ph-app-window",
    iconBg: "bg-success/10",
    iconText: "text-success",
    key: "demoApp",
    items: ["users", "projects", "tasks"],
  },
  {
    icon: "i-ph-cube",
    iconBg: "bg-info/10",
    iconText: "text-info",
    key: "modules",
    items: ["api", "database", "automation", "saas", "ai", "lang", "cicd"],
  },
] as const;

const stack = [
  { icon: "i-ph-lightning", key: "antelope" },
  { icon: "i-ph-atom", key: "nuxt" },
  { icon: "i-ph-database", key: "mongodb" },
  { icon: "i-ph-file-ts", key: "typescript" },
] as const;
</script>

<template>
  <div class="mx-auto flex max-w-4xl flex-col gap-8 py-4">
    <!-- Hero -->
    <div class="flex flex-col items-center gap-4 py-8 text-center">
      <div
        class="flex size-16 items-center justify-center rounded-2xl bg-primary/10"
      >
        <UIcon name="i-ph-rocket-launch" class="size-9 text-primary" />
      </div>
      <h1 class="text-3xl font-bold tracking-tight sm:text-4xl">
        {{ t("demo.readme.hero.title") }}
      </h1>
      <p class="text-muted max-w-2xl text-lg">
        {{ t("demo.readme.hero.subtitle") }}
      </p>
      <div class="flex flex-wrap items-center justify-center gap-2">
        <UBadge
          v-for="entry in stack"
          :key="entry.key"
          color="neutral"
          variant="soft"
          size="lg"
        >
          <UIcon :name="entry.icon" class="size-4" />
          {{ t(`demo.readme.stack.${entry.key}`) }}
        </UBadge>
      </div>
    </div>

    <!-- Sections -->
    <div class="grid gap-4 sm:grid-cols-3">
      <UCard v-for="section in sections" :key="section.key">
        <div class="flex flex-col gap-3">
          <div class="flex items-center gap-3">
            <div
              class="flex size-10 shrink-0 items-center justify-center rounded-lg"
              :class="section.iconBg"
            >
              <UIcon :name="section.icon" class="size-6" :class="section.iconText" />
            </div>
            <p class="font-semibold">
              {{ t(`demo.readme.sections.${section.key}.title`) }}
            </p>
          </div>
          <p class="text-muted text-sm">
            {{ t(`demo.readme.sections.${section.key}.description`) }}
          </p>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="item in section.items"
              :key="item"
              class="text-muted flex items-start gap-2 text-sm"
            >
              <UIcon
                name="i-ph-check-circle"
                class="mt-0.5 size-4 shrink-0"
                :class="section.iconText"
              />
              <span>{{
                t(`demo.readme.sections.${section.key}.items.${item}`)
              }}</span>
            </li>
          </ul>
        </div>
      </UCard>
    </div>

    <!-- How it works -->
    <UCard>
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3">
          <UIcon name="i-ph-code" class="size-6 text-primary" />
          <p class="font-semibold">{{ t("demo.readme.how.title") }}</p>
        </div>
        <p class="text-muted text-sm">
          {{ t("demo.readme.how.description") }}
        </p>
        <div class="grid gap-2 sm:grid-cols-3">
          <div
            v-for="step in ['pages', 'data', 'frontend']"
            :key="step"
            class="rounded-lg border border-default p-3"
          >
            <p class="text-sm font-medium">
              {{ t(`demo.readme.how.steps.${step}.title`) }}
            </p>
            <p class="text-muted mt-1 text-xs">
              {{ t(`demo.readme.how.steps.${step}.description`) }}
            </p>
          </div>
        </div>
      </div>
    </UCard>
  </div>
</template>
