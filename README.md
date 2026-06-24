# Lotion

Director Mode для Figma: выделил иконку → описал движение → одобрил
раскадровку из 7 PNG-кадров → получил Lottie с spring-физикой и принципами
Disney. Без подписки и без обязательного OpenAI ключа — встроенный
детерминированный планнер уже даёт разнообразные анимации по prompt'у.

## Структура

```text
figma-plugin/    Figma plugin (Vite + React + esbuild) — то, что импортируется в Figma
apps/backend/    Next.js backend: /api/plan-storyboard, /api/compile-lottie
packages/shared/ DSL, валидаторы, Lottie-компилятор, Disney-физика
```

## Запуск локально

1. Зависимости:

   ```bash
   npm install
   ```

2. Backend (Next.js, порт 3000):

   ```bash
   npm run dev:backend
   ```

3. Сборка плагина (`figma-plugin/dist/`):

   ```bash
   npm run build:plugin
   ```

4. Figma desktop: **Plugins → Development → Import plugin from manifest…** —
   выбрать `figma-plugin/manifest.json`.

5. В плагине открыть вкладку **Backend** и вписать `http://localhost:3000`,
   нажать **Сохранить**. URL хранится в `figma.clientStorage`.

## Использование

1. Выдели один объект/фрейм в Figma.
2. Введи prompt (RU/EN: «подпрыгни», «pulse twice», «rotate slowly»,
   «крышка открывается»).
3. Длительность 1–5 секунд.
4. **Сгенерировать раскадровку** — плагин применит план, экспортирует 7 PNG.
5. **Одобрить → Lottie** — backend соберёт Lottie JSON, **Скачать .json**.
   Файл играется в https://lottiefiles.com/preview.

## OpenAI (опционально)

Без ключа работает детерминированный планнер
(`apps/backend/lib/deterministic-planner.ts`): распознаёт verb'ы
bounce/pulse/shake/rotate/spin/fade/pop/drift/swing/wave/drop/zoom/wobble и
названия частей (lid/eyes/arm/lock/head).

С ключом:

```bash
cp apps/backend/.env.example apps/backend/.env.local
# OPENAI_API_KEY=sk-...
# OPENAI_MODEL=gpt-5      # опционально
npm run dev:backend
```

AI получает deterministic-план как hint и улучшает spring/secondary. При
ошибке возвращается deterministic.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm install` | зависимости всех workspace |
| `npm run dev:backend` | Next.js на http://localhost:3000 |
| `npm run build:plugin` | сборка `figma-plugin/dist/` |
| `npm run typecheck` | tsc по всем пакетам |
| `npm test` | юнит-тесты shared + backend |

## DSL

См. `packages/shared/src/dsl/schema.ts`:

```ts
type StoryboardDSL = {
  durationMs: number;
  fps: 30 | 60;
  loop: true;
  layerOps?: LayerOp[];
  tracks: Track[];
  rationale?: string;
};
```

`Track` — массив `Keyframe { t, tx?, ty?, sx?, sy?, rot?, op?, morphTo?, ease? }`.
`Easing` = `spring | anticipation | overshoot | cubic | linear`. Spring
раскрывается в bezier-keyframes в `packages/shared/src/physics/disney.ts`.
