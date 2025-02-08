// Copyright © 2025 Navarrotech

// Typescript
import type { Request, Response } from 'express'
import type { ResponseShape } from './types'

// Loggers
import { logDebug, logError, logWarn } from './logging'

// Errors
import { ValidationError } from 'yup'
import {
  PrismaClientKnownRequestError,
  PrismaClientUnknownRequestError,
  PrismaClientRustPanicError,
  PrismaClientInitializationError,
  PrismaClientValidationError
} from '@prisma/client/runtime/library'

export function handleErrorResponse(_: Request, response: Response, error: unknown) {
  // Has the response already been sent?
  if (response.headersSent) {
    logWarn('Response already sent:', error)
    return
  }

  if (error instanceof ValidationError) {
    response.status(400).send({
      code: 400,
      message: 'Bad request: Invalid data received in body payload',
      data: error.errors,
    } as ResponseShape)
    return
  }
  else if (
    error instanceof PrismaClientKnownRequestError
    || error instanceof PrismaClientUnknownRequestError
    || error instanceof PrismaClientRustPanicError
    || error instanceof PrismaClientInitializationError
    || error instanceof PrismaClientValidationError
  ) {
    response.status(400).send({
      code: 400,
      message: error.message,
    } as ResponseShape)
    logError('Error in report:', error.message)
    logDebug(error)
  }
  else if (error instanceof Error) {
    response.status(500).send({
      code: 500,
      message: error.message,
    } as ResponseShape)
    logError('Error in report:', error.message)
    logDebug(error.stack)
  }
  else {
    response.status(500).send({
      code: 500,
      message: 'Internal server error',
    } as ResponseShape)
    logError('Error in report:', error)
  }
}
