// Copyright © 2025 Navarrotech

export type ResponseShape<Data = Record<string, any>> = {
  code: number
  message: string
  data?: Data
}
