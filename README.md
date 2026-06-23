# Lotion

Lotion — Figma-плагин и backend для честной проверки: можно ли выбранный asset хорошо анимировать в Lottie.

Идея продукта: не обещать магию одной кнопкой, а сначала объяснять дизайнеру, что получится, что не получится и какие слои нужно подготовить.

## Как это работает

```text
Figma plugin
  -> выбранный объект и структура слоёв
  -> Vercel / Next.js API
  -> feasibility check
  -> выбор motion-сценария
  -> motion plan
  -> Lottie JSON
```

Figma-плагин отвечает только за интерфейс и доступ к выделенным слоям. Backend отвечает за анализ, секреты, AI-логику, генерацию плана и Lottie.

## Структура

```text
apps/
  figma-plugin/      # Vercel / Next backend и preview
figma-plugin/        # настоящий Figma plugin
packages/
  shared/            # общие типы, feasibility, motion recipes, Lottie compiler
```

## MVP

Первая версия фокусируется на UI/game asset-ах:

- монета;
- звезда;
- замок;
- подарок;
- сундук;
- бейдж;
- кнопка;
- галочка;
- предупреждение;
- progress bar.

## API

`POST /api/analyze-asset` — анализ структуры выделенного объекта.

`POST /api/feasibility-check` — score, уровень риска, ограничения, рекомендации и действия.

`POST /api/suggest-motions` — подходящие motion-сценарии.

`POST /api/generate-plan` — структурированный motion plan.

`POST /api/generate-lottie` — motion plan + Lottie JSON.

`POST /api/validate-lottie` — базовая проверка Lottie JSON.

## Локально

```bash
npm install
npm run dev
```

Сборка Figma-плагина:

```bash
npm run build:plugin
```

Для загрузки в Figma используй:

```text
figma-plugin/manifest.json
```

## Анализ слоёв Figma

Плагин анализирует только выделенный объект, а не весь документ. Он отправляет на backend:

- дерево выделенного node;
- имена слоёв;
- типы node;
- размеры и позицию из `absoluteBoundingBox`;
- visible state;
- краткое описание fill/stroke;
- SVG через `exportAsync({ format: "SVG_STRING" })`;
- пользовательский контекст.

Имена слоёв важны: `lid`, `body`, `lock`, `eyes`, `star`, `highlight` помогают понять, какие части можно безопасно двигать.

## OpenAI

Плагин не вызывает OpenAI напрямую. Ключ хранится только на backend.

В Vercel нужна одна переменная:

```text
OPENAI_API_KEY=your_openai_api_key
```

Модель по умолчанию зафиксирована в backend-коде:

```text
gpt-5.5
```
