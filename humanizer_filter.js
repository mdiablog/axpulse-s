/**
 * humanizer_filter.js
 * Módulo de depuración y humanización de textos y guiones para la Suite AX
 * Basado en C:\.agent\tools\humanizer\ (Wikipedia AI Cleanup + Protocolo Rossmann)
 * Elimina clichés de IA, frases vacías, construcciones robóticas y asegura autoridad clínica.
 */

const AI_SLOP_PATTERNS = [
  // Clichés inflados y de relleno
  /\b(en el vertiginoso mundo|en un mundo cada vez más|en el panorama actual)\b/gi,
  /\b(no es solo (un|una|el|la).+?, sino (un|una|el|la))\b/gi,
  /\b(es un testimonio de|sirve como recordatorio de)\b/gi,
  /\b(un tapiz de|un faro de|una odisea de)\b/gi,
  /\b(juega un papel (crucial|pivotal|fundamental|clave))\b/gi,
  /\b(revolucionar|transformador|disruptivo|paradigma)\b/gi,
  /\b(profundicemos en|sin más preámbulos|en conclusión|en resumen|a fin de cuentas)\b/gi,
  /\b(como modelo de lenguaje|como ia|es importante recordar que)\b/gi,
  /\b(desentrañar|sumergirse en|un viaje hacia)\b/gi,
  /\b(esperamos que este (artículo|video|post) te haya)\b/gi
];

/**
 * Analiza un texto y devuelve si contiene patrones de IA y el texto saneado
 * @param {string} text 
 * @returns {{ cleanText: string, hasSlop: boolean, detectedPatterns: string[] }}
 */
function humanizeClinicalText(text) {
  if (!text || typeof text !== 'string') {
    return { cleanText: text || '', hasSlop: false, detectedPatterns: [] };
  }

  const detected = [];
  let cleaned = text;

  for (const pattern of AI_SLOP_PATTERNS) {
    if (pattern.test(cleaned)) {
      const match = cleaned.match(pattern);
      if (match) {
        detected.push(...match);
      }
      cleaned = cleaned.replace(pattern, '').replace(/\s{2,}/g, ' ').trim();
    }
  }

  // Garantizar que la puntuación y mayúsculas no queden rotas tras la remoción
  cleaned = cleaned.replace(/,\s*,/g, ',').replace(/\.\s*\./g, '.');

  return {
    cleanText: cleaned,
    hasSlop: detected.length > 0,
    detectedPatterns: [...new Set(detected)]
  };
}

/**
 * Validador estricto para guiones de video (Remotion, Bang Motion, Whiteboard)
 * @param {string} scriptText 
 */
function validateScriptForVoiceover(scriptText) {
  const result = humanizeClinicalText(scriptText);
  if (result.hasSlop) {
    console.warn(`[Humanizer Warning] Detectados clichés de IA en el guion:`, result.detectedPatterns);
  }
  return result.cleanText;
}

module.exports = {
  humanizeClinicalText,
  validateScriptForVoiceover,
  AI_SLOP_PATTERNS
};
