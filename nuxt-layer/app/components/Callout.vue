<script setup lang="ts">
interface Props {
  componentId?: string;
  title?: string;
  message?: string;
  icon?: string;
  color?: "primary" | "success" | "info" | "warning" | "error";
}

const props = withDefaults(defineProps<Props>(), {
  title: "Custom component",
  message: "",
  icon: "i-ph-sparkle",
  color: "primary",
});

// Auto-imported from the dms-core layer; resolves "$key" values to i18n.
const { processI18n } = useTranslation();

const colorClasses: Record<NonNullable<Props["color"]>, string> = {
  primary: "border-primary/30 bg-primary/5 text-primary",
  success: "border-success/30 bg-success/5 text-success",
  info: "border-info/30 bg-info/5 text-info",
  warning: "border-warning/30 bg-warning/5 text-warning",
  error: "border-error/30 bg-error/5 text-error",
};
</script>

<template>
  <div
    class="flex items-start gap-3 rounded-lg border p-4"
    :class="colorClasses[props.color]"
  >
    <UIcon :name="props.icon" class="mt-0.5 size-6 shrink-0" />
    <div class="min-w-0">
      <p class="font-semibold">{{ processI18n(props.title) }}</p>
      <p v-if="props.message" class="text-sm opacity-80">
        {{ processI18n(props.message) }}
      </p>
      <slot />
    </div>
  </div>
</template>
