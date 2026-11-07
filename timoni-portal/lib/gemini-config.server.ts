// Somente no servidor. Nunca devolver o valor em respostas de configuração.
export function getGeminiServerKey(env: Record<string, string | undefined> = process.env) {
  return env.GEMINI_API_KEY?.trim() || env.GOOGLE_AI_STUDIO_API_KEY?.trim() || null;
}

export function redactGeminiMessage(message: string) {
  let result = message;
  for (const key of [process.env.GEMINI_API_KEY?.trim(), process.env.GOOGLE_AI_STUDIO_API_KEY?.trim()]) {
    if (key) result = result.split(key).join("[credencial protegida]");
  }
  return result;
}
