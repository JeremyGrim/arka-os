// src/utils/logger.ts

import chalk from 'chalk'
import { CLIError, ERROR_MESSAGES } from './errors.js'

export const logger = {
  info(message: string): void {
    console.log(chalk.blue('ℹ'), message)
  },

  success(message: string): void {
    console.log(chalk.green('✓'), message)
  },

  warn(message: string): void {
    console.log(chalk.yellow('⚠'), message)
  },

  error(message: string, error?: Error | CLIError): void {
    console.error(chalk.red('✗'), chalk.bold(message))

    if (error instanceof CLIError) {
      if (error.suggestions && error.suggestions.length > 0) {
        console.error(chalk.yellow('\nSuggestions:'))
        error.suggestions.forEach((s) => {
          console.error(chalk.yellow('  •'), s)
        })
      }
      console.error(chalk.dim(`\nError code: ${error.code}`))
    } else if (error) {
      console.error(chalk.dim(error.message))
      if (process.env.DEBUG) {
        console.error(chalk.dim(error.stack))
      }
    }
  },

  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray('[DEBUG]'), message)
    }
  }
}
