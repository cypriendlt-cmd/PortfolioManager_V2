/**
 * Client-side Google Drive service.
 * Uses gapi.client.drive to read/write portfolio data directly from browser.
 */

const APP_FOLDER = 'PortfolioManager_V2'
const PORTFOLIO_FILE = 'portfolio.json'

async function getOrCreateAppFolder() {
  const res = await window.gapi.client.drive.files.list({
    q: `name='${APP_FOLDER}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })

  if (res.result.files?.length > 0) {
    return res.result.files[0].id
  }

  const folder = await window.gapi.client.drive.files.create({
    resource: { name: APP_FOLDER, mimeType: 'application/vnd.google-apps.folder' },
    fields: 'id',
  })
  return folder.result.id
}

async function findFile(folderId) {
  const res = await window.gapi.client.drive.files.list({
    q: `name='${PORTFOLIO_FILE}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id)',
    spaces: 'drive',
  })
  return res.result.files?.[0]?.id || null
}

export async function loadPortfolioFromDrive() {
  const folderId = await getOrCreateAppFolder()
  const fileId = await findFile(folderId)

  if (!fileId) return null

  const res = await window.gapi.client.drive.files.get({
    fileId,
    alt: 'media',
  })
  return typeof res.result === 'string' ? JSON.parse(res.result) : res.result
}

export async function savePortfolioToDrive(data) {
  const folderId = await getOrCreateAppFolder()
  const existingId = await findFile(folderId)
  const content = JSON.stringify(data, null, 2)

  if (existingId) {
    // Update: use raw fetch since gapi.client doesn't support media upload well
    const token = window.gapi.client.getToken().access_token
    await fetch(`https://www.googleapis.com/upload/drive/v3/files/${existingId}?uploadType=media`, {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: content,
    })
    return existingId
  }

  // Create: multipart upload
  const token = window.gapi.client.getToken().access_token
  const metadata = { name: PORTFOLIO_FILE, parents: [folderId] }
  const boundary = '-------portfoliomanager'
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${content}\r\n--${boundary}--`

  const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
    },
    body,
  })
  const result = await res.json()
  return result.id
}
