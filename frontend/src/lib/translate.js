import api from './api'

// Translate one caption phrase with the server's AI endpoint. Throws with a readable message.
export async function translateText(text, targetLanguage) {
  try {
    const { data } = await api.post('/ai/translate', { text, targetLanguage })
    return data.data.translation
  } catch (error) {
    throw new Error(error.response?.data?.message || 'Translation failed')
  }
}
