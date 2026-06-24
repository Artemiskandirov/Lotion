# Lotion

Director Mode для Figma: выделил иконку → описал движение словами → одобрил
раскадровку из 7 PNG-кадров → получил Lottie с spring-физикой и принципами
Disney. Без подписки и без обязательного OpenAI ключа: встроенный
детерминированный планнер уже даёт разнообразные анимации по prompt'у; AI
добавляется опционально и улучшает качество.

## Структура

```text
figma-plugin/      Figma plugin (Vite + React + esbuild)
apps/figma-plugin/ Next.js backend: /api/plan-storyboard, /api/compile-lottie
packages/shared/   DSL, валидаторы, Lottie-компилятор, Disney-физика
packages/mcp-physics/ MCP-сервер с физикой (для Claude-сессий, не нужен для работы плагина)
```

## Запуск локально

1. Установить зависимости (workspace):

   ```bash
   npm install
   ```

2. Поднять backend (Next.js, порт 3000):

   ```bash
   npm run dev:backend
   ```

3. Собрать плагин (`figma-plugin/dist/`):

   ```bash
   npm run build:plugin
   ```

4. В Figma desktop: **Plugins → Development → Import plugin from manifest…** —
   выбрать `figma-plugin/manifest.json`.

5. В плагине открыть вкладку **Backend** и вписать `http://localhost:3000`,
   нажать **Сохранить**. URL хранится в `figma.clientStorage`, переключать
   между prod и dev можно в любой момент.

## Использование

1. Выдели один объект/фрейм в Figma.
2. Введи prompt (RU или EN: «подпрыгни», «pulse twice», «rotate slowly»,
   «крышка открывается», «pop and shake»).
3. Поставь длительность 1–5 секунд.
4. Нажми **Сгенерировать раскадровку** — плагин применит план к слоям,
   экспортирует 7 PNG-кадров, покажет loop-превью.
5. **Одобрить → Lottie** — backend соберёт Lottie JSON, в плагине появится
   кнопка **Скачать .json**. Файл играется в `https://lottiefiles.com/preview`.

## OpenAI (опционально)

Без ключа плагин использует встроенный детерминированный планнер
(`apps/figma-plugin/lib/deterministic-planner.ts`), который разбирает prompt по
ключевым словам (bounce, pulse, shake, rotate, fade, pop, drift, swing, wave,
drop, zoom, wobble) и собирает разные DSL под каждый запрос.

С ключом:

```bash
cp apps/figma-plugin/.env.example apps/figma-plugin/.env.local
# заполнить OPENAI_API_KEY=
# опционально OPENAI_MODEL=gpt-5
npm run dev:backend
```

AI получает детерминированный план как hint и улучшает его (точнее
stiffness/damping, secondary motion, morph). При любой ошибке backend молча
возвращает детерминированный результат.

## Скрипты

| Команда | Что делает |
|---|---|
| `npm install` | ставит зависимости всех workspace |
| `npm run dev:backend` | Next.js на `http://localhost:3000` |
| `npm run build:plugin` | сборка `figma-plugin/dist/{code.js,index.html}` |
| `npm run typecheck` | tsc по всем пакетам |
| `npm test -w packages/shared` | юнит-тесты физики и компилятора |
| `npm test -w apps/figma-plugin` | тесты детерминированного планнера |

## DSL

См. `packages/shared/src/dsl/schema.ts`. Кратко:

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
`Easing` — `spring | anticipation | overshoot | cubic | linear`. Spring
разворачивается в bezier-keyframes детерминированной формулой в
`packages/shared/src/physics/disney.ts`.
