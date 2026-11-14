// `label` is what we ask the translator for; `speech` is the BCP-47 tag for the browser recogniser.
export const LANGUAGES = [
  { label: 'English', speech: 'en-US' },
  { label: 'Hindi', speech: 'hi-IN' },
  { label: 'Spanish', speech: 'es-ES' },
  { label: 'French', speech: 'fr-FR' },
  { label: 'German', speech: 'de-DE' },
  { label: 'Portuguese', speech: 'pt-BR' },
  { label: 'Italian', speech: 'it-IT' },
  { label: 'Japanese', speech: 'ja-JP' },
  { label: 'Korean', speech: 'ko-KR' },
  { label: 'Chinese (Simplified)', speech: 'zh-CN' },
  { label: 'Arabic', speech: 'ar-SA' },
  { label: 'Russian', speech: 'ru-RU' },
  { label: 'Bengali', speech: 'bn-IN' },
  { label: 'Tamil', speech: 'ta-IN' },
  { label: 'Telugu', speech: 'te-IN' },
  { label: 'Marathi', speech: 'mr-IN' },
]

export const defaultSpeechLanguage = () => {
  const preferred = typeof navigator !== 'undefined' ? navigator.language : 'en-US'
  return LANGUAGES.find(l => l.speech.toLowerCase() === preferred.toLowerCase())?.speech
    || LANGUAGES.find(l => l.speech.startsWith(preferred.split('-')[0]))?.speech
    || 'en-US'
}
