/**
 * Browser Notification API helpers.
 * Uses ServiceWorker registration.showNotification() for persistent notifications.
 */

export function isNotificationSupported() {
  return 'Notification' in window && 'serviceWorker' in navigator
}

export function getNotificationPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.permission // 'default' | 'granted' | 'denied'
}

export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported'
  return Notification.requestPermission()
}

export async function showNotification(title, options = {}) {
  if (Notification.permission !== 'granted') return false
  try {
    const reg = await navigator.serviceWorker.ready
    await reg.showNotification(title, {
      icon: '/icons/icon-192x192.png',
      badge: '/icons/icon-192x192.png',
      ...options,
    })
    return true
  } catch {
    // Fallback to basic Notification if SW not available
    try {
      new Notification(title, options)
      return true
    } catch {
      return false
    }
  }
}

export async function testNotification() {
  const perm = await requestPermission()
  if (perm !== 'granted') return false
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
