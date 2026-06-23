import type { MotionScenario } from "../types/motion";

export const motionRecipes: MotionScenario[] = [
  {
    id: "reward_reveal",
    label: "Reward reveal",
    description: "A short reveal for prizes, chests, gifts, badges, and rare drops.",
    assetTypes: ["chest", "gift", "badge", "star", "ui_asset"],
    intents: ["reward", "level up", "rare", "open", "получ", "награ", "откры"],
    steps: [
      { target: "body", action: "shake_x", start: 0, duration: 280, easing: "ease-in-out" },
      { target: "lock", action: "scale_pop", start: 180, duration: 220, easing: "spring" },
      { target: "lid", action: "rotate_open", start: 300, duration: 520, easing: "ease-out" },
      { target: "highlight", action: "shine_sweep", start: 420, duration: 540, easing: "ease-out" },
      { target: "star", action: "burst_particles", start: 500, duration: 680, easing: "ease-out" }
    ]
  },
  {
    id: "coin_collect",
    label: "Coin collect",
    description: "A currency object pops, spins, and flies toward a balance target.",
    assetTypes: ["coin", "star", "badge"],
    intents: ["collect", "currency", "reward", "монет", "получ"],
    steps: [
      { target: "coin", action: "scale_pop", start: 0, duration: 220, easing: "spring" },
      { target: "coin", action: "shine_sweep", start: 120, duration: 360, easing: "ease-out" },
      { target: "coin", action: "fly_to_target", start: 360, duration: 560, easing: "ease-in-out" },
      { target: "star", action: "burst_particles", start: 80, duration: 520, easing: "ease-out" }
    ]
  },
  {
    id: "unlock_success",
    label: "Unlock success",
    description: "A lock or paywall asset snaps open and confirms access.",
    assetTypes: ["lock", "button", "badge"],
    intents: ["unlock", "access", "paid", "разблок", "замок"],
    steps: [
      { target: "lock", action: "shake_x", start: 0, duration: 240, easing: "ease-in-out" },
      { target: "lock", action: "rotate_open", start: 240, duration: 440, easing: "ease-out" },
      { target: "check", action: "scale_pop", start: 520, duration: 260, easing: "spring" },
      { target: "highlight", action: "shine_sweep", start: 460, duration: 460, easing: "ease-out" }
    ]
  },
  {
    id: "success_pop",
    label: "Success pop",
    description: "A quick positive confirmation for checkmarks, stars, and badges.",
    assetTypes: ["checkmark", "star", "badge", "button", "ui_asset"],
    intents: ["success", "complete", "done", "успех", "готов"],
    steps: [
      { target: "body", action: "scale_pop", start: 0, duration: 260, easing: "spring" },
      { target: "check", action: "draw_stroke", start: 120, duration: 360, easing: "ease-out" },
      { target: "star", action: "burst_particles", start: 180, duration: 520, easing: "ease-out" }
    ]
  },
  {
    id: "error_shake",
    label: "Error shake",
    description: "A restrained warning motion for validation, errors, and blocked actions.",
    assetTypes: ["warning", "button", "ui_asset"],
    intents: ["error", "warning", "blocked", "ошиб", "нельзя"],
    steps: [
      { target: "body", action: "shake_x", start: 0, duration: 420, easing: "ease-in-out" },
      { target: "highlight", action: "pulse", start: 120, duration: 520, easing: "ease-in-out" }
    ]
  },
  {
    id: "attention_float",
    label: "Attention float",
    description: "A soft idle motion for empty states, onboarding, and non-critical prompts.",
    assetTypes: ["ui_asset", "star", "badge", "button"],
    intents: ["attention", "onboarding", "idle", "soft", "мягк"],
    steps: [
      { target: "body", action: "float_y", start: 0, duration: 900, easing: "ease-in-out" },
      { target: "highlight", action: "shine_sweep", start: 260, duration: 620, easing: "ease-out" }
    ]
  },
  {
    id: "progress_fill",
    label: "Progress fill",
    description: "A clean progress or loading motion for bars and meters.",
    assetTypes: ["progress"],
    intents: ["progress", "loading", "complete", "прогресс", "загруз"],
    steps: [
      { target: "body", action: "fade_in", start: 0, duration: 160, easing: "ease-out" },
      { target: "progress", action: "stagger_appear", start: 120, duration: 760, easing: "ease-out" },
      { target: "highlight", action: "shine_sweep", start: 420, duration: 480, easing: "ease-out" }
    ]
  }
];

export function getRecipe(id: string): MotionScenario | undefined {
  return motionRecipes.find((recipe) => recipe.id === id);
}
