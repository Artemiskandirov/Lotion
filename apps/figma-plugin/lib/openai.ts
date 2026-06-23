export const openAIConfig = {
  apiKey: process.env.OPENAI_API_KEY,
  model: "gpt-5.5"
};

export function isOpenAIConfigured(): boolean {
  return Boolean(openAIConfig.apiKey);
}
