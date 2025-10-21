// src/cli.ts

import { Command } from 'commander'
import { initCommand } from './commands/init.js'
import { statusCommand } from './commands/status.js'
import { sessionCreateCommand } from './commands/session/start.js'
import { sessionListCommand } from './commands/session/list.js'
import { sessionEndCommand } from './commands/session/stop.js'
import { sessionLogsCommand } from './commands/session/attach.js'
import { sessionInspectCommand } from './commands/session/inspect.js'
import { fileInjectCommand } from './commands/file/inject.js'
import { fileListCommand } from './commands/file/list.js'
import { metaSearchCommand } from './commands/meta/search.js'
import { contextShowCommand } from './commands/context/show.js'
import { contextPushCommand } from './commands/context/push.js'
import { contextPullCommand } from './commands/context/pull.js'
import { configGetCommand } from './commands/config/get.js'
import { configSetCommand } from './commands/config/set.js'
import { configResetCommand } from './commands/config/reset.js'
import { moduleListCommand } from './commands/module/list.js'
import { moduleEnableCommand } from './commands/module/enable.js'
import { moduleDisableCommand } from './commands/module/disable.js'
import { validateCommand } from './commands/validate.js'
import { reportCommand } from './commands/report.js'
import { recoveryStatusCommand } from './commands/recovery/status.js'
import { recoveryTriggerCommand } from './commands/recovery/trigger.js'
import { diagnosticsCommand } from './commands/diagnostics.js'
import { logsCommand } from './commands/logs.js'
import { sessionNotifyCommand } from './commands/session/notify.js'

export const program = new Command()

program
  .name('arka')
  .description('ARKA CLI - Command line interface for ARKA_LABS ecosystem')
  .version('1.0.0-core')

// Core commands
program.addCommand(initCommand)
program.addCommand(statusCommand)
program.addCommand(validateCommand)
program.addCommand(reportCommand)
program.addCommand(diagnosticsCommand)

// Session commands
const sessionCommand = new Command('session')
  .description('Manage agent sessions')
sessionCommand.addCommand(sessionCreateCommand)
sessionCommand.addCommand(sessionListCommand)
sessionCommand.addCommand(sessionInspectCommand)
sessionCommand.addCommand(sessionEndCommand)
sessionCommand.addCommand(sessionLogsCommand)
sessionCommand.addCommand(sessionNotifyCommand)
program.addCommand(sessionCommand)

// File commands
const fileCommand = new Command('file')
  .description('Manage files in ARKA_META')
fileCommand.addCommand(fileInjectCommand)
fileCommand.addCommand(fileListCommand)
program.addCommand(fileCommand)

// Context commands
const contextCommand = new Command('context')
  .description('Synchronise SOCLE context')
contextCommand.addCommand(contextShowCommand)
contextCommand.addCommand(contextPushCommand)
contextCommand.addCommand(contextPullCommand)
program.addCommand(contextCommand)

// Module commands
const moduleCommand = new Command('module')
  .description('Manage SOCLE modules')
moduleCommand.addCommand(moduleListCommand)
moduleCommand.addCommand(moduleEnableCommand)
moduleCommand.addCommand(moduleDisableCommand)
program.addCommand(moduleCommand)

// Config commands
const configCommand = new Command('config')
  .description('Manage configuration')
configCommand.addCommand(configGetCommand)
configCommand.addCommand(configSetCommand)
configCommand.addCommand(configResetCommand)
program.addCommand(configCommand)

// Recovery commands
const recoveryCommand = new Command('recovery')
  .description('Recovery operations')
recoveryCommand.addCommand(recoveryStatusCommand)
recoveryCommand.addCommand(recoveryTriggerCommand)
program.addCommand(recoveryCommand)

// Meta commands
const metaCommand = new Command('meta')
  .description('Search and manage metadata')
metaCommand.addCommand(metaSearchCommand)
program.addCommand(metaCommand)

// Logs command (system-wide)
program.addCommand(logsCommand)
