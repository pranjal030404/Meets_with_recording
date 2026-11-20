import api from './api'

// Translate one caption phrase with the server's AI endpoint. Throws an Error with a readable message and a `code`.
export async function translateText(text, targetLanguage) {
  try {
    const { data } = await api.post('/ai/translate', { text, targetLanguage })
    return data.data.translation
  } catch (error) {
    const err = new Error(error.response?.data?.message || 'Translation failed')
    err.code = error.response?.data?.code || 'TRANSLATION_FAILED'
    throw err
  }
}

export async function translationStatus() {
  try {
    const { data } = await api.get('/ai/translate/status')
    return data.data
  } catch {
    return { available: false, hint: 'Could not reach the server' }
  }
}
