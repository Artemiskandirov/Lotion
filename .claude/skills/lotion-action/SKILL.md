---
name: lotion-action
description: Scaffold a new Lotion motion action — add the action type, sampler in compile.ts, AI prompt mention, and a sanity test. Use when the user says "add action X to Lotion", "extend Lotion with a new motion type", or names a missing animation primitive (e.g. wobble, drift, swing).
---

# Adding a new motion action to Lotion

When invoked, do the following in order:

## 1. Confirm the action name and behavior
Ask the user (only if not already specified):
- Action id (snake_case, e.g. `wobble`)
- One-sentence behavior description
- Which transform properties it touches (tx, ty, sx, sy, rot, op)
- Default duration window (ms)

## 2. Edit `packages/shared/src/types/motion.ts`
Add the new id to the `MotionAction` union type.

## 3. Edit `packages/shared/src/lottie/compile.ts`
In `sampleAtFrame`, add a new `if (step.action === "<name>") { ... }` branch that mutates `sample` based on `progress` (0..1) and `wave = Math.sin(progress * Math.PI)`. Keep it short — one branch per action.

## 4. Edit `apps/figma-plugin/lib/ai-motion.ts`
Add the id to the `motionActions` array so the AI is allowed to emit it. If it fits a Disney principle, append a one-line hint to the system prompt.

## 5. Edit `apps/figma-plugin/lib/ai-storyboard.ts` only if the action needs a corresponding spring/easing preset — usually unnecessary because storyboard DSL operates on raw transform deltas.

## 6. Edit `figma-plugin/src/ui.tsx`
Add a Russian label in `actionLabels` for display in the legacy single-step UI.

## 7. Add a unit test in `packages/shared/test/disney.test.ts`
Add a `test("<name> samples within bounds", () => { ... })` that compiles a plan containing only this action and asserts the produced Lottie has the expected scale/rotation range.

## 8. Verify
Run:
```bash
npm --workspace @lotion/shared run typecheck
npm --workspace @lotion/shared run test
npm --workspace @lotion/web run typecheck
npm --workspace @lotion/figma-plugin run typecheck
```

All four must pass. Do not commit until they do.

## Notes
- Disney physics primitives (spring, anticipation, overshoot) belong in `packages/shared/src/physics/disney.ts`, not in `compile.ts`. Use this skill only for new high-level actions that combine those primitives.
- If the action requires SVG path morphing, expose it through the `morphTo` field of the storyboard DSL — do not add a special action for it.
- Skip the legacy compiler step (step 3) if the action only makes sense in the storyboard DSL flow.
