// Copyright © 2025 Navarrotech

// Core
import chalk from 'chalk'

// Misc
import { REPORTING_DISCORD_WEBHOOK } from './constants'
import { NODE_ENV } from './env'

export function logAttributes(attributes: Record<string, any>): void {
  // The key would be blueBright, the value would be green.
  // Format: "key: value"
  Object.entries(attributes).forEach(([ key, value ]) => {
    console.log(`  > ${chalk.white(key)}: ${chalk.blueBright(value)}`)
  })
}

export function logSuccess(...messages: any[]): void {
  console.log(
    ...messages.map((message) => {
      if (typeof message === 'string') {
        return chalk.green(message)
      }
      return message
    })
  )
}

export function logDebug(...messages: any[]): void {
  if (NODE_ENV !== 'development') {
    return
  }
  console.debug(
    ...messages.map((message) => {
      if (typeof message === 'string') {
        return chalk.gray(message)
      }
      return message
    })
  )
}

export function log(...messages: any[]): void {
  console.log(
    ...messages.map((message) => {
      if (typeof message === 'string') {
        return chalk.blueBright(message)
      }
      return message
    })
  )
}

export function logWarn(...messages: any[]): void {
  console.warn(
    ...messages.map((message) => {
      if (typeof message === 'string') {
        return chalk.yellow(message)
      }
      return message
    })
  )
}

export async function logError(...messages: any[]): Promise<void> {
  console.error(
    ...messages.map((message) => {
      if (typeof message === 'string') {
        return chalk.red(message)
      }
      return message
    })
  )

  await logToDiscord(...messages)
}

export async function logToDiscord(...messages: any[]) {
  await fetch(REPORTING_DISCORD_WEBHOOK, {
    method: 'POST',
    headers: {
      'Content-Type': 'Application/JSON'
    },
    body: JSON.stringify({
      content: messages
        .map((message) => {
          if (typeof message === 'string') {
            return message
          }
          if (message instanceof Error) {
            return message?.stack
              ? `\`\`\`${message.stack}\`\`\``
              : (message.name + ': ' + message.message
              )
          }
          if (typeof message === 'object') {
            return `\`\`\`${JSON.stringify(message, null, 2)}\`\`\``
          }
          return message
        })
        .join('\n')
    })
  })
}
