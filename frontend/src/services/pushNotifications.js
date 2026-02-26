/**
 * Browser Notification API helpers.
 * Uses ServiceWorker registration.showNotification() for persistent notifications.
 */

export function isNotificationSupported() {
  return 'Notification' in window
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  try {
    const result = await Notification.requestPermission()
    // Some browsers return undefined for already-granted; read directly
    return result || Notification.permission
  } catch {
    return Notification.permission
  }
}

export async function showNotification(title, options = {}) {
  if (Notification.permission !== 'granted') {
    console.warn('[Notifications] Permission not granted:', Notification.permission)
    return false
  }

  // Try ServiceWorker first (required for mobile/PWA)
  if ('serviceWorker' in navigator) {
    try {
      const reg = await Promise.race([
        navigator.serviceWorker.ready,
        new Promise((_, reject) => setTimeout(() => reject(new Error('SW timeout')), 2000)),
      ])
      await reg.showNotification(title, {
        icon: './icons/icon-192x192.png',
        badge: './icons/icon-192x192.png',
        ...options,
      })
      return true
    } catch (e) {
      console.warn('[Notifications] SW showNotification failed, using fallback:', e.message)
    }
  }

  // Fallback: basic Notification constructor (works on desktop)
  try {
    new Notification(title, {
      icon: './icons/icon-192x192.png',
      ...options,
    })
    return true
  } catch (e) {
    console.error('[Notifications] Fallback Notification also failed:', e)
    return false
  }
}

export async function testNotification() {
  const perm = await requestPermission()
  if (perm !== 'granted') {
    console.warn('[Notifications] Permission denied after request:', perm)
    return false
  }
  return showNotification('PortfolioManager - Test', {
    body: 'Les notifications fonctionnent correctement !',
    tag: 'test-notification',
  })
}

export async function checkAndNotifyDueReminders(reminders) {
  if (Notification.permission !== 'granted') return
  const today = new Date().toISOString().slice(0, 10)
  const due = (reminders || []).filter(
    n => n.active && n.nextReminder && n.nextReminder <= today && n.lastReminded?.slice(0, 10) !== today
  )
  for (const n of due) {
    await showNotification(`Rappel DCA : ${n.assetName}`, {
      body: `Investissement mensuel de ${n.monthlyAmount} € prévu aujourd'hui.`,
      tag: `dca-reminder-${n.id}`,
      data: { type: 'dca-reminder', id: n.id },
    })
  }
  return due
}
