// src/utils/validator.ts

import fs from 'fs-extra'
import path from 'path'
import { CLIError, CLIErrorCode } from './errors.js'

export async function validateFile(filePath: string): Promise<void> {
  const absolutePath = path.resolve(filePath)

  // Check exists
  if (!await fs.pathExists(absolutePath)) {
    throw new CLIError(
      CLIErrorCode.FILE_NOT_FOUND,
      `File not found: ${filePath}`,
      ['Check file path', 'Use absolute or relative path']
    )
  }

  // Check size
  const stats = await fs.stat(absolutePath)
  const maxSize = 10 * 1024 * 1024 // 10MB

  if (stats.size > maxSize) {
    throw new CLIError(
      CLIErrorCode.FILE_TOO_LARGE,
      `File too large: ${(stats.size / 1024 / 1024).toFixed(1)} MB`,
      ['Compress the file', 'Split into smaller files']
    )
  }
}

export async function validatePath(dirPath: string): Promise<void> {
  try {
    await fs.ensureDir(dirPath)
  } catch (error) {
    throw new CLIError(
      CLIErrorCode.INVALID_PARAMS,
      `Invalid path: ${dirPath}`,
      ['Check directory permissions', 'Verify path syntax']
    )
  }
}
