import { ClientResponseError } from 'pocketbase'

export type FieldErrors = Record<string, string>

export function extractFieldErrors(error: unknown): FieldErrors {
  if (!(error instanceof ClientResponseError)) return {}
  const data = error.response?.data
  if (!data || typeof data !== 'object') return {}
  const errors: FieldErrors = {}
  for (const [field, detail] of Object.entries(data)) {
    if (
      detail &&
      typeof detail === 'object' &&
      'message' in detail &&
      typeof (detail as { message: unknown }).message === 'string'
    ) {
      errors[field] = (detail as { message: string }).message
    }
  }
  return errors
}

export function getErrorMessage(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'Ocorreu um erro inesperado.'
  }

  const msgs = Object.values(extractFieldErrors(error))
  if (msgs.length > 0) {
    return msgs.join(' ')
  }

  // PocketBase default error messages translation
  const rawMsg = error.message || ''
  if (error.status === 400) {
    if (rawMsg.toLowerCase().includes('failed to authenticate')) {
      return 'E-mail ou senha incorretos. Verifique suas credenciais.'
    }
    if (rawMsg.toLowerCase().includes('something went wrong')) {
      return 'E-mail ou senha inválidos. Por favor, tente novamente.'
    }
  }

  if (error.status === 0) {
    return 'Não foi possível conectar ao servidor. Verifique sua conexão.'
  }

  return rawMsg || 'Ocorreu um erro inesperado ao processar sua solicitação.'
}
