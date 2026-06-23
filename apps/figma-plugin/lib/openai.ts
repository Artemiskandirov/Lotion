export const openAIConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  model: process.env.OPENAI_MODEL || "configure-openai-model"
};

export function isOpenAIConfigured(): boolean {
  return Boolean(openAIConfig.apiKey && process.env.OPENAI_MODEL);
}
