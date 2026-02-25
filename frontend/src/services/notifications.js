const STORAGE_KEY = 'pm_dca_notifications'

function readAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
  } catch {
    return []
  }
}

function writeAll(notifications) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications))
}

export function getNotifications() {
  return readAll()
}

export function addNotification(notification) {
  const all = readAll()
  const entry = {
    id: crypto.randomUUID(),
    assetName: notification.assetName,
    assetType: notification.assetType,
    monthlyAmount: notification.monthlyAmount,
    dayOfMonth: notification.dayOfMonth || 1,
    startDate: notification.startDate,
    endDate: notification.endDate,
    nextReminder: notification.nextReminder,
    lastReminded: null,
    active: true,
    createdAt: new Date().toISOString(),
  }
  all.push(entry)
  writeAll(all)
  return entry
}

export function removeNotification(id) {
  const all = readAll().filter(n => n.id !== id)
  writeAll(all)
}

export function toggleNotification(id) {
  const all = readAll()
  const notif = all.find(n => n.id === id)
  if (notif) notif.active = !notif.active
  writeAll(all)
}

export function getDueNotifications() {
  const today = new Date().toISOString().slice(0, 10)
  return readAll().filter(n => n.active && n.nextReminder && n.nextReminder <= today)
}

export function markNotificationDone(id) {
  const all = readAll()
  const notif = all.find(n => n.id === id)
  if (!notif) return
  const now = new Date()
  notif.lastReminded = now.toISOString()
  // Compute next monthly reminder
  const next = new Date(notif.nextReminder || now)
  next.setMonth(next.getMonth() + 1)
  // Clamp day
  const maxDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()
  next.setDate(Math.min(notif.dayOfMonth, maxDay))
  notif.nextReminder = next.toISOString().slice(0, 10)
  // Deactivate if past end date
  if (notif.endDate && notif.nextReminder > notif.endDate) {
    notif.active = false
  }
  writeAll(all)
}
