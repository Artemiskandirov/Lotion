import { detectParts, getLayerStats, inferAssetType } from "./asset-analysis";
import { motionRecipes } from "../motion-recipes/recipes";
import type { AssetRequest } from "../types/asset";
import type { FeasibilityLevel, FeasibilityReport, ScoreRow } from "../types/motion";

function includesIntent(request: AssetRequest, pattern: RegExp): boolean {
  const text = Object.values(request.intent).filter(Boolean).join(" ").toLowerCase();
  return pattern.test(text);
}

function scoreToLevel(score: number, characterRisk: boolean): FeasibilityLevel {
  if (characterRisk && score < 55) return "red";
  if (score >= 75) return "green";
  if (score >= 55) return "yellow";
  if (score >= 35) return "orange";
  return "red";
}

function unique(items: string[]): string[] {
  return [...new Set(items)];
}

function assetTypeLabel(assetType: string): string {
  const labels: Record<string, string> = {
    chest: "сундук",
    coin: "монета",
    star: "звезда",
    lock: "замок",
    gift: "подарок",
    badge: "бейдж",
    button: "кнопка",
    checkmark: "галочка",
    warning: "предупреждение",
    progress: "прогресс",
    character: "персонаж",
    ui_asset: "UI-asset"
  };

  return labels[assetType] ?? assetType;
}

export function runFeasibilityCheck(request: AssetRequest): FeasibilityReport {
  const stats = getLayerStats(request.asset.layers);
  const detectedParts = detectParts(request);
  const assetType = inferAssetType(request.intent, request.asset.name);
  const detectedPartCount = Object.keys(detectedParts).length;

  const singleComplexPath = stats.totalLayers <= 2 && stats.vectors + stats.shapes >= 1;
  const tooComplex = stats.totalLayers > 90 || stats.maxDepth > 8;
  const characterRisk =
    assetType === "character" ||
    includesIntent(request, /(eat|sleep|run|walk|yawn|pose|mimic|есть|спать|бег|зев|мимик)/);

  let score = 48;
  score += Math.min(22, detectedPartCount * 5);
  score += Math.min(14, stats.groups * 2);
  score += stats.totalLayers >= 3 ? 8 : 0;
  score += stats.text === 0 && stats.images === 0 ? 8 : -8;
  score += singleComplexPath ? -28 : 0;
  score += tooComplex ? -14 : 0;
  score += characterRisk ? -28 : 0;
  score += includesIntent(request, /(reward|collect|unlock|success|error|attention|награ|получ|успех|ошиб|разблок)/)
    ? 8
    : 0;
  score = Math.max(10, Math.min(96, Math.round(score)));

  const level = scoreToLevel(score, characterRisk);
  const recommendedFormat =
    level === "red" && characterRisk ? "sprite-sheet" : level === "red" ? "rive" : "lottie";

  const canAnimate = unique([
    stats.totalLayers > 0 ? "анимация всего объекта целиком" : "простая placeholder-анимация",
    detectedParts.lid ? "открытие крышки" : "",
    detectedParts.lock ? "щёлчок замка или разблокировка" : "",
    detectedParts.eyes ? "моргание" : "",
    detectedParts.star || detectedParts.highlight ? "искры, блики и сияние" : "",
    assetType === "progress" ? "заполнение прогресса" : ""
  ].filter(Boolean));

  const cannotAnimate = unique([
    singleComplexPath ? "движение отдельных частей без разделения общего vector path" : "",
    characterRisk ? "естественные смены поз, еду, зевание или сложную актёрскую анимацию в Lottie" : "",
    !detectedParts.lid && /(chest|gift)/.test(assetType) ? "открытие отдельной крышки, если крышка не вынесена в слой" : "",
    stats.images > 0 ? "точный vector morphing растровых изображений" : ""
  ].filter(Boolean));

  const fixes = unique([
    singleComplexPath ? "Раздели SVG на понятные части: body, lid, lock, eyes, highlights." : "",
    detectedPartCount === 0 ? "Переименуй важные слои, чтобы планировщик мог безопасно выбрать цели анимации." : "",
    tooComplex ? "Упрости вложенные группы и объедини декоративные детали, которые не должны двигаться." : "",
    characterRisk ? "Для полноценной персонажной анимации лучше Rive или sprite sheet; Lottie оставить для idle, blink, breathing." : ""
  ].filter(Boolean));

  const recommendedScenarios = suggestScenarioIds(request, assetType).slice(0, 3);
  const title =
    level === "green"
      ? `${score}/100 - хорошо подходит`
      : level === "yellow"
        ? `${score}/100 - можно, но с ограничениями`
        : level === "orange"
          ? `${score}/100 - сначала подготовить`
          : `${score}/100 - лучше не Lottie`;

  const scorecard: ScoreRow[] = [
    {
      label: "Разделение слоёв",
      value: detectedPartCount >= 3 ? "Хорошо" : singleComplexPath ? "Плохо" : "Ограниченно",
      status: detectedPartCount >= 3 ? "good" : singleComplexPath ? "poor" : "limited"
    },
    {
      label: "Совместимость с Lottie",
      value: recommendedFormat === "lottie" ? "Хорошо" : "Рискованно",
      status: recommendedFormat === "lottie" ? "good" : "needs-work"
    },
    {
      label: "Анимация частей",
      value: detectedPartCount > 0 ? "Доступна" : "Только весь объект",
      status: detectedPartCount > 0 ? "good" : "limited"
    },
    {
      label: "Риск артефактов",
      value: singleComplexPath || tooComplex ? "Высокий" : "Низкий",
      status: singleComplexPath || tooComplex ? "needs-work" : "good"
    },
    {
      label: "Сложность",
      value: tooComplex || characterRisk ? "Высокая" : stats.totalLayers > 20 ? "Средняя" : "Низкая",
      status: tooComplex || characterRisk ? "needs-work" : "good"
    }
  ];

  return {
    score,
    level,
    title,
    summary: buildSummary(level, assetType, detectedPartCount, singleComplexPath, characterRisk),
    assetType,
    recommendedFormat,
    detectedParts,
    canAnimate,
    cannotAnimate,
    recommendedScenarios,
    fixes,
    scorecard,
    actions: buildActions(level, fixes.length > 0)
  };
}

export function suggestScenarioIds(request: AssetRequest, assetType?: string): string[] {
  const type = assetType ?? inferAssetType(request.intent, request.asset.name);
  const text = Object.values(request.intent).filter(Boolean).join(" ").toLowerCase();
  const scored = motionRecipes.map((recipe) => {
    let score = recipe.assetTypes.includes(type) ? 4 : recipe.assetTypes.includes("ui_asset") ? 1 : 0;
    score += recipe.intents.filter((intent) => text.includes(intent)).length * 3;
    return { recipe, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .filter((item) => item.score > 0)
    .map((item) => item.recipe.id);
}

function buildSummary(
  level: FeasibilityLevel,
  assetType: string,
  detectedPartCount: number,
  singleComplexPath: boolean,
  characterRisk: boolean
): string {
  if (level === "green") {
    return `Похоже на ${assetTypeLabel(assetType)}: структура достаточно разделена для хорошей Lottie-анимации.`;
  }
  if (level === "yellow") {
    return "Для Lottie подойдёт, но безопаснее двигать только те части, которые явно разделены по слоям.";
  }
  if (characterRisk) {
    return "Запрос похож на персонажную анимацию со сменой поз. Для этого обычно лучше Rive или sprite sheet.";
  }
  if (singleComplexPath || detectedPartCount === 0) {
    return "Asset почти целиком собран в один vector path, поэтому для качественной анимации частей сначала нужны подготовленные слои.";
  }
  return "Asset нужно немного подготовить для качественного Lottie, но простая анимация всего объекта уже возможна.";
}

function buildActions(level: FeasibilityLevel, hasFixes: boolean): string[] {
  if (level === "green") return ["Сгенерировать", "Показать части", "Сделать 3 варианта"];
  if (level === "yellow") return ["Безопасная версия", "Показать части", "Сделать 3 варианта"];
  if (level === "orange") {
    return hasFixes
      ? ["Подготовить слои", "Что поправить", "Анимировать целиком"]
      : ["Попробовать разделить", "Анимировать целиком"];
  }
  return ["Лучше sprite", "Простой Lottie", "Что поправить"];
}
