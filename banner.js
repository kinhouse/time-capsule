import { isIosSafari } from './lib.js'

const DISMISSED_KEY = 'aths-dismissed'

export function initInstallBanner({ ua, standalone, storage, banner, dismissBtn }) {
  if (!banner) return
  if (!isIosSafari(ua) || standalone || storage.getItem(DISMISSED_KEY)) return

  banner.hidden = false

  dismissBtn?.addEventListener('click', () => {
    banner.hidden = true
    storage.setItem(DISMISSED_KEY, '1')
  })
}
