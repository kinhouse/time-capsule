import { describe, it, expect } from 'vitest'
import {
  computePresetDate,
  parseCustomDate,
  padDate,
  formatRelative,
  buildDateStrings,
  buildGCalUrl,
  isIosSafari,
  buildDefaultDescription,
} from './lib.js'

const DAY = 86_400_000

// Fixed reference point so tests are deterministic
const BASE = new Date(2026, 5, 20, 12, 0, 0) // June 20, 2026 at noon

// ── computePresetDate ───────────────────────────────────────────────────────

describe('computePresetDate', () => {
  it('adds 5 years', () => {
    const r = computePresetDate(5, new Date(2026, 5, 20))
    expect(r.getFullYear()).toBe(2031)
    expect(r.getMonth()).toBe(5)
    expect(r.getDate()).toBe(20)
  })

  it('adds 60 years', () => {
    const r = computePresetDate(60, new Date(2026, 5, 20))
    expect(r.getFullYear()).toBe(2086)
    expect(r.getMonth()).toBe(5)
    expect(r.getDate()).toBe(20)
  })

  it('preserves month and day for every preset step', () => {
    for (const y of [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60]) {
      const r = computePresetDate(y, new Date(2026, 5, 20))
      expect(r.getMonth()).toBe(5)
      expect(r.getDate()).toBe(20)
    }
  })

  it('does not mutate the input date', () => {
    const now = new Date(2026, 5, 20)
    const orig = now.getTime()
    computePresetDate(10, now)
    expect(now.getTime()).toBe(orig)
  })

  it('overflows Feb 29 → Mar 1 when target year is not a leap year', () => {
    // 2024 (leap) + 5 = 2029 (not leap)
    const r = computePresetDate(5, new Date(2024, 1, 29))
    expect(r.getFullYear()).toBe(2029)
    expect(r.getMonth()).toBe(2)  // March
    expect(r.getDate()).toBe(1)
  })

  it('keeps Feb 29 when target year is also a leap year', () => {
    // 2024 (leap) + 4 = 2028 (leap)
    const r = computePresetDate(4, new Date(2024, 1, 29))
    expect(r.getFullYear()).toBe(2028)
    expect(r.getMonth()).toBe(1)  // February
    expect(r.getDate()).toBe(29)
  })

  it('handles dates in December without month overflow', () => {
    const r = computePresetDate(10, new Date(2026, 11, 31))
    expect(r.getFullYear()).toBe(2036)
    expect(r.getMonth()).toBe(11)
    expect(r.getDate()).toBe(31)
  })
})

// ── parseCustomDate ─────────────────────────────────────────────────────────

describe('parseCustomDate', () => {
  it('parses year, month, and day correctly', () => {
    const d = parseCustomDate('2046-06-20')
    expect(d.getFullYear()).toBe(2046)
    expect(d.getMonth()).toBe(5)   // June = index 5
    expect(d.getDate()).toBe(20)
  })

  it('interprets as local time (not UTC) — avoids off-by-one on UTC-negative offsets', () => {
    const d = parseCustomDate('2046-01-01')
    expect(d.getFullYear()).toBe(2046)
    expect(d.getMonth()).toBe(0)
    expect(d.getDate()).toBe(1)    // would be Dec 31 if parsed as UTC in UTC-X zones
  })

  it('handles single-digit month (zero-padded in string)', () => {
    const d = parseCustomDate('2046-03-05')
    expect(d.getMonth()).toBe(2)   // March
    expect(d.getDate()).toBe(5)
  })

  it('handles December 31', () => {
    const d = parseCustomDate('2086-12-31')
    expect(d.getMonth()).toBe(11)
    expect(d.getDate()).toBe(31)
  })

  it('handles year 2100', () => {
    const d = parseCustomDate('2100-12-31')
    expect(d.getFullYear()).toBe(2100)
    expect(d.getMonth()).toBe(11)
    expect(d.getDate()).toBe(31)
  })

  it('handles Feb 29 in a leap year', () => {
    const d = parseCustomDate('2048-02-29')   // 2048 is a leap year
    expect(d.getFullYear()).toBe(2048)
    expect(d.getMonth()).toBe(1)
    expect(d.getDate()).toBe(29)
  })
})

// ── padDate ─────────────────────────────────────────────────────────────────

describe('padDate', () => {
  it('pads single-digit month', () => {
    expect(padDate(new Date(2046, 0, 15))).toBe('20460115')   // January
  })

  it('pads single-digit day', () => {
    expect(padDate(new Date(2046, 5, 5))).toBe('20460605')
  })

  it('pads both month and day', () => {
    expect(padDate(new Date(2046, 0, 1))).toBe('20460101')    // Jan 1
  })

  it('handles double-digit month and day without extra padding', () => {
    expect(padDate(new Date(2046, 11, 31))).toBe('20461231')  // Dec 31
  })

  it('handles far-future year 2086', () => {
    expect(padDate(new Date(2086, 5, 20))).toBe('20860620')
  })

  it('handles year 2100', () => {
    expect(padDate(new Date(2100, 0, 1))).toBe('21000101')
  })

  it('handles year 2000', () => {
    expect(padDate(new Date(2000, 0, 1))).toBe('20000101')
  })
})

// ── formatRelative ──────────────────────────────────────────────────────────

describe('formatRelative', () => {
  it('returns past message for a date in the past', () => {
    expect(formatRelative(new Date(BASE.getTime() - DAY), BASE))
      .toBe('That date has already passed')
  })

  it('returns past message for the exact same instant', () => {
    expect(formatRelative(new Date(BASE), BASE))
      .toBe('That date has already passed')
  })

  it('returns past message when less than one full day ahead', () => {
    // 6 hours later = 0 full days by floor
    expect(formatRelative(new Date(BASE.getTime() + 6 * 3_600_000), BASE))
      .toBe('That date has already passed')
  })

  it('shows "1 day" for exactly 24 hours ahead', () => {
    expect(formatRelative(new Date(BASE.getTime() + DAY), BASE)).toBe('1 day')
  })

  it('uses plural "days" for 2 days', () => {
    expect(formatRelative(new Date(BASE.getTime() + 2 * DAY), BASE)).toBe('2 days')
  })

  it('shows raw day count before the first full month (30 days)', () => {
    // 30 days: months = floor(30/30.44) = 0
    expect(formatRelative(new Date(BASE.getTime() + 30 * DAY), BASE)).toBe('30 days')
  })

  it('shows "1 month" at the 31-day boundary', () => {
    // 31 days: months = floor(31/30.44) = 1; leftover days = floor(31 - 30.44) = 0
    expect(formatRelative(new Date(BASE.getTime() + 31 * DAY), BASE)).toBe('1 month')
  })

  it('uses plural "months" for 2 months', () => {
    // 62 days: months = floor(62/30.44) = 2
    expect(formatRelative(new Date(BASE.getTime() + 62 * DAY), BASE))
      .toMatch(/^2 months/)
  })

  it('shows "1 year" (not "1 years") at the 366-day boundary', () => {
    // 366 days: years = floor(366/365.25) = 1
    const result = formatRelative(new Date(BASE.getTime() + 366 * DAY), BASE)
    expect(result).toMatch(/^1 year/)
    expect(result).not.toContain('1 years')
  })

  it('uses plural "years" for 2 years', () => {
    const result = formatRelative(new Date(BASE.getTime() + 2 * 366 * DAY), BASE)
    expect(result).toMatch(/^2 years/)
    expect(result).not.toContain('2 year,')
  })

  it('omits months component when 0', () => {
    // 366 days → "1 year, 1 day" (months = 0)
    expect(formatRelative(new Date(BASE.getTime() + 366 * DAY), BASE))
      .not.toContain('month')
  })

  it('omits years component when 0', () => {
    expect(formatRelative(new Date(BASE.getTime() + 31 * DAY), BASE))
      .not.toContain('year')
  })

  it('omits days when divisible months consume all leftover days', () => {
    // "1 month" = 31 days → days = 0, so days are not shown
    expect(formatRelative(new Date(BASE.getTime() + 31 * DAY), BASE))
      .not.toContain('day')
  })

  it('rounds to nearest year when >= 1 year away', () => {
    // 400 days: round(400/365.25) = 1 → "1 year"
    const result = formatRelative(new Date(BASE.getTime() + 400 * DAY), BASE)
    expect(result).toBe('1 year')
  })

  it('rounds up to next year when close enough', () => {
    // ~19 years 11 months 30 days: round to 20 years
    const days = Math.round(19.95 * 365.25)
    const result = formatRelative(new Date(BASE.getTime() + days * DAY), BASE)
    expect(result).toBe('20 years')
  })

  it('does not show months or days for multi-year durations', () => {
    const result = formatRelative(new Date(BASE.getTime() + 400 * DAY), BASE)
    expect(result).not.toContain('month')
    expect(result).not.toContain('day')
  })

  it('handles 60 years', () => {
    const d = new Date(BASE.getTime() + Math.round(60 * 365.25) * DAY)
    expect(formatRelative(d, BASE)).toMatch(/^60 years/)
  })

  it('always returns a non-empty string for any future date', () => {
    for (const n of [1, 2, 30, 31, 100, 365, 366, 730, 10000]) {
      const result = formatRelative(new Date(BASE.getTime() + n * DAY), BASE)
      expect(result.length).toBeGreaterThan(0)
      expect(result).not.toBe('That date has already passed')
    }
  })

  it('never produces "0 days" for a date at least 1 full day ahead', () => {
    for (const n of [1, 31, 62, 366]) {
      expect(formatRelative(new Date(BASE.getTime() + n * DAY), BASE))
        .not.toBe('0 days')
    }
  })

  it('uses "1 month" singular (not "1 months")', () => {
    const result = formatRelative(new Date(BASE.getTime() + 31 * DAY), BASE)
    expect(result).toContain('1 month')
    expect(result).not.toContain('1 months')
  })

  it('uses "1 day" singular (not "1 days")', () => {
    expect(formatRelative(new Date(BASE.getTime() + DAY), BASE)).toBe('1 day')
  })
})

// ── buildDateStrings ────────────────────────────────────────────────────────

describe('buildDateStrings', () => {
  const june20 = new Date(2046, 5, 20)   // June 20, 2046

  describe('all-day events', () => {
    it('produces YYYYMMDD start and end = start + 1 day', () => {
      const { startStr, endStr } = buildDateStrings(june20, { allDay: true })
      expect(startStr).toBe('20460620')
      expect(endStr).toBe('20460621')
    })

    it('rolls Dec 31 end to Jan 1 of next year', () => {
      const { startStr, endStr } = buildDateStrings(new Date(2046, 11, 31), { allDay: true })
      expect(startStr).toBe('20461231')
      expect(endStr).toBe('20470101')
    })

    it('rolls Jan 31 end to Feb 1', () => {
      const { endStr } = buildDateStrings(new Date(2046, 0, 31), { allDay: true })
      expect(endStr).toBe('20460201')
    })

    it('rolls Feb 28 end to Mar 1 in non-leap year', () => {
      const { endStr } = buildDateStrings(new Date(2046, 1, 28), { allDay: true })
      expect(endStr).toBe('20460301')
    })

    it('rolls Feb 29 end to Mar 1 in leap year', () => {
      // 2048 is a leap year
      const { startStr, endStr } = buildDateStrings(new Date(2048, 1, 29), { allDay: true })
      expect(startStr).toBe('20480229')
      expect(endStr).toBe('20480301')
    })

    it('does not mutate the input date', () => {
      const d = new Date(2046, 5, 20)
      const orig = d.getTime()
      buildDateStrings(d, { allDay: true })
      expect(d.getTime()).toBe(orig)
    })
  })

  describe('timed events', () => {
    it('produces YYYYMMDDTHHMMSS format', () => {
      const { startStr, endStr } = buildDateStrings(june20, {
        allDay: false, startTime: '10:00', endTime: '11:30',
      })
      expect(startStr).toBe('20460620T100000')
      expect(endStr).toBe('20460620T113000')
    })

    it('handles midnight start (00:00)', () => {
      const { startStr } = buildDateStrings(june20, {
        allDay: false, startTime: '00:00', endTime: '01:00',
      })
      expect(startStr).toBe('20460620T000000')
    })

    it('handles end-of-day time (23:59)', () => {
      const { startStr } = buildDateStrings(june20, {
        allDay: false, startTime: '23:59', endTime: '23:59',
      })
      expect(startStr).toBe('20460620T235900')
    })

    it('pads single-digit hour correctly', () => {
      const { startStr } = buildDateStrings(june20, {
        allDay: false, startTime: '09:05', endTime: '10:00',
      })
      expect(startStr).toBe('20460620T090500')
    })

    it('output contains no date-separator characters', () => {
      const { startStr, endStr } = buildDateStrings(june20, {
        allDay: false, startTime: '10:00', endTime: '11:00',
      })
      expect(startStr).not.toMatch(/[-:]/)
      expect(endStr).not.toMatch(/[-:]/)
    })

    it('separates date and time with a single T', () => {
      const { startStr } = buildDateStrings(june20, {
        allDay: false, startTime: '10:00', endTime: '11:00',
      })
      expect(startStr.split('T').length).toBe(2)
    })
  })
})

// ── buildGCalUrl ────────────────────────────────────────────────────────────

describe('buildGCalUrl', () => {
  const defaults = {
    title: 'Future Reunion',
    startStr: '20460620',
    endStr: '20460621',
    description: '',
    location: '',
  }

  it('returns a URL starting with the Google Calendar render endpoint', () => {
    expect(buildGCalUrl(defaults))
      .toMatch(/^https:\/\/calendar\.google\.com\/calendar\/render\?/)
  })

  it('includes action=TEMPLATE', () => {
    expect(buildGCalUrl(defaults)).toContain('action=TEMPLATE')
  })

  it('includes the title in the text param', () => {
    const url = buildGCalUrl({ ...defaults, title: 'MyEvent' })
    expect(url).toContain('MyEvent')
  })

  it('encodes the dates param with / as %2F', () => {
    expect(buildGCalUrl(defaults)).toContain('dates=20460620%2F20460621')
  })

  it('encodes timed dates correctly', () => {
    const url = buildGCalUrl({
      ...defaults,
      startStr: '20460620T100000',
      endStr: '20460620T110000',
    })
    expect(url).toContain('20460620T100000')
    expect(url).toContain('20460620T110000')
  })

  it('omits "details" param when description is empty string', () => {
    expect(buildGCalUrl({ ...defaults, description: '' })).not.toContain('details=')
  })

  it('includes "details" param when description is provided', () => {
    const url = buildGCalUrl({ ...defaults, description: 'Bring a time capsule' })
    expect(url).toContain('details=')
    expect(url).toContain('Bring')
  })

  it('omits "location" param when location is empty string', () => {
    expect(buildGCalUrl({ ...defaults, location: '' })).not.toContain('location=')
  })

  it('includes "location" param when location is provided', () => {
    const url = buildGCalUrl({ ...defaults, location: 'Mars Colony Alpha' })
    expect(url).toContain('location=')
  })

  it('encodes spaces in title as + (URLSearchParams convention)', () => {
    const url = buildGCalUrl({ ...defaults, title: 'Class Reunion' })
    expect(url).toContain('Class+Reunion')
  })

  it('encodes & in title so the URL stays parseable', () => {
    const url = buildGCalUrl({ ...defaults, title: 'A & B' })
    expect(url).not.toContain(' & ')
    expect(() => new URL(url)).not.toThrow()
  })

  it('handles apostrophes in title', () => {
    const url = buildGCalUrl({ ...defaults, title: "It's the future!" })
    expect(() => new URL(url)).not.toThrow()
  })

  it('handles angle brackets and quotes in title', () => {
    const url = buildGCalUrl({ ...defaults, title: '<Future> "Event"' })
    expect(() => new URL(url)).not.toThrow()
  })

  it('produces a valid URL for all fields populated', () => {
    const url = buildGCalUrl({
      title: 'Reunion <2046> "special" & more',
      startStr: '20460620T100000',
      endStr: '20460620T110000',
      description: 'Line 1\nLine 2',
      location: 'https://meet.example.com/abc?x=1&y=2',
    })
    expect(() => new URL(url)).not.toThrow()
  })

  it('includes all five params when description and location are set', () => {
    const url = buildGCalUrl({
      ...defaults, description: 'desc', location: 'loc',
    })
    expect(url).toContain('action=')
    expect(url).toContain('text=')
    expect(url).toContain('dates=')
    expect(url).toContain('details=')
    expect(url).toContain('location=')
  })

  it('handles very long title without throwing', () => {
    const url = buildGCalUrl({ ...defaults, title: 'x'.repeat(500) })
    expect(() => new URL(url)).not.toThrow()
  })

  it('handles unicode characters in title', () => {
    const url = buildGCalUrl({ ...defaults, title: '🚀 Future Meetup 2086 日本語' })
    expect(() => new URL(url)).not.toThrow()
    expect(url).toContain('text=')
  })
})

// ── isIosSafari ─────────────────────────────────────────────────────────────

const IOS_SAFARI_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IPAD_SAFARI_UA = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
const IOS_CHROME_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/118.0.0.0 Mobile/15E148 Safari/604.1'
const IOS_FIREFOX_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/118.0 Mobile/15E148 Safari/604.1'
const ANDROID_CHROME_UA = 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/116.0.0.0 Mobile Safari/537.36'
const DESKTOP_SAFARI_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15'

describe('isIosSafari', () => {
  it('returns true for iPhone Safari', () => {
    expect(isIosSafari(IOS_SAFARI_UA)).toBe(true)
  })

  it('returns true for iPad Safari', () => {
    expect(isIosSafari(IPAD_SAFARI_UA)).toBe(true)
  })

  it('returns false for Chrome on iOS (CriOS)', () => {
    expect(isIosSafari(IOS_CHROME_UA)).toBe(false)
  })

  it('returns false for Firefox on iOS (FxiOS)', () => {
    expect(isIosSafari(IOS_FIREFOX_UA)).toBe(false)
  })

  it('returns false for Android Chrome', () => {
    expect(isIosSafari(ANDROID_CHROME_UA)).toBe(false)
  })

  it('returns false for desktop Safari', () => {
    expect(isIosSafari(DESKTOP_SAFARI_UA)).toBe(false)
  })
})

// ── buildDefaultDescription ──────────────────────────────────────────────────

describe('buildDefaultDescription', () => {
  it('starts with an ellipsis followed by two newlines', () => {
    const result = buildDefaultDescription('https://example.com/', new Date(2026, 5, 20))
    expect(result).toMatch(/^…\n\n/)
  })

  it('ends with a traceability line containing the URL and date', () => {
    const result = buildDefaultDescription('https://example.com/', new Date(2026, 5, 20))
    expect(result).toContain('Created by https://example.com/ on June 20, 2026')
  })

  it('uses the provided URL verbatim', () => {
    const result = buildDefaultDescription('https://kinhouse.github.io/Future/', new Date(2026, 5, 20))
    expect(result).toContain('https://kinhouse.github.io/Future/')
  })
})
