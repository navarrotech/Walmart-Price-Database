// Copyright © 2025 Navarrotech

// Core
import { logError } from './logging'

// Should anything go wrong at all, report it to an HTTP endpoint

process.on(
  'uncaughtException',
  async function onUncaughtException(error) {
    logError('Uncaught exception:', error)
  }
)
