// tests/unit/utils/formatter.test.ts

import { describe, it, expect } from 'vitest'
import { formatSize, formatDate } from '../../../src/utils/formatter'

describe('Formatter utilities', () => {
  describe('formatSize', () => {
    it('should format bytes correctly', () => {
      expect(formatSize(100)).toBe('100 B')
      expect(formatSize(1024)).toBe('1.0 KB')
      expect(formatSize(1048576)).toBe('1.0 MB')
    })
  })

  describe('formatDate', () => {
    it('should format recent dates as relative time', () => {
      const now = new Date()
      const result = formatDate(now)
      expect(result).toBe('just now')
    })

    it('should format older dates correctly', () => {
      const oneHourAgo = new Date(Date.now() - 3600000)
      const result = formatDate(oneHourAgo)
      expect(result).toContain('hour')
    })
  })
})
