export const VOICE_KEY = "ember.voice.v1";
const VOICE = {
  greeting: {
    en: ["I'm here. Let's take one task at a time.", "Welcome back. I'll keep track of the agents.", "Ready when you are. I'll watch for updates."],
    pt: ["Estou aqui. Vamos cuidar de uma tarefa por vez.", "Bem-vindo de volta. Vou acompanhar os agentes.", "Tudo pronto por aqui. Vou ficar de olho nas novidades."]
  },
  headpat: {
    en: ["A little company helps. I'm glad to be here.", "Thanks for checking in. Back to our little corner.", "I'm here with you. One step at a time."],
    pt: ["Um pouco de companhia faz bem. Gosto de estar aqui.", "Obrigada pelo carinho. De volta ao nosso cantinho.", "Estou aqui com você. Um passo de cada vez."]
  },
  coffee: {
    en: ["Coffee acquired. A small break sounds good.", "Thank you. Remember to save a sip for yourself.", "A warm cup and a little breathing room. Lovely."],
    pt: ["Café recebido. Uma pequena pausa parece boa.", "Obrigada. Lembre de guardar um gole para você.", "Uma xícara quente e um respiro. Que bom."]
  },
  celebration: {
    en: ["Ready for a look when you are.", "A good moment to review the result.", "The result is waiting for your review."],
    pt: ["Pronto para conferir quando você quiser.", "Um bom momento para revisar o resultado.", "O resultado está esperando sua revisão."]
  },
  encouragement: {
    en: ["Pick the next small step. You don't need the whole answer yet.", "A short pause can help you see the next move.", "One task at a time. I'll keep watch here."],
    pt: ["Escolha o próximo passo pequeno. A resposta inteira pode esperar.", "Uma pausa curta pode ajudar a enxergar o próximo passo.", "Uma tarefa por vez. Vou ficar de olho por aqui."]
  }
};

export function restoreVoice(saved) {
  const counters = {};
  for (const key of Object.keys(VOICE)) counters[key] = Number.isSafeInteger(saved?.[key]) && saved[key] >= 0 ? saved[key] % VOICE[key].en.length : 0;
  return counters;
}

export function nextVoice(counters, category, language) {
  const lines = VOICE[category]?.[language === "pt" ? "pt" : "en"];
  if (!lines) return "";
  const index = counters[category] || 0;
  counters[category] = (index + 1) % lines.length;
  return lines[index];
}
