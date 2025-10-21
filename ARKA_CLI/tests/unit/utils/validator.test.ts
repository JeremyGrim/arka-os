// tests/unit/utils/validator.test.ts

import { describe, it, expect } from 'vitest'
import { validateFile, validatePath } from '../../../src/utils/validator'
import path from 'path'

describe('Validator utilities', () => {
  describe('validateFile', () => {
    it('should throw error for non-existent file', async () => {
      await expect(validateFile('/nonexistent/file.txt')).rejects.toThrow()
    })

    it('should accept existing file', async () => {
      const packageJson = path.join(process.cwd(), 'package.json')
      await expect(validateFile(packageJson)).resolves.not.toThrow()
    })
  })

  describe('validatePath', () => {
    it('should create directory if it does not exist', async () => {
      const testPath = path.join(process.cwd(), 'test-temp-validator')
      await expect(validatePath(testPath)).resolves.not.toThrow()
    })
  })
})
