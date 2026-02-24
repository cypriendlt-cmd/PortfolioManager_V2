/**
 * Google Drive service for persisting user portfolio data.
 * Each user gets a dedicated app folder on their Google Drive.
 * Portfolio is stored as a single JSON file: portfolio.json
 */

const { google } = require('googleapis');
const config = require('../config');

/**
 * Create an authenticated Google Drive client for a specific user.
 *
 * @param {string} accessToken - User's Google OAuth access token
 * @param {string} [refreshToken] - User's Google OAuth refresh token
 * @returns {import('googleapis').drive_v3.Drive} Authenticated Drive client
 */
function getDriveClient(accessToken, refreshToken) {
  const oauth2Client = new google.auth.OAuth2(
    config.google.clientId,
    config.google.clientSecret,
    config.google.callbackUrl
  );

  oauth2Client.setCredentials({
    access_token: accessToken,
    refresh_token: refreshToken,
  });

  return google.drive({ version: 'v3', auth: oauth2Client });
}

/**
 * Get or create the app folder on Google Drive.
 * Returns the folder ID.
 *
 * @param {import('googleapis').drive_v3.Drive} drive - Authenticated Drive client
 * @returns {Promise<string>} App folder ID
 */
async function getOrCreateAppFolder(drive) {
  const folderName = config.googleDrive.appFolderName;

  // Search for existing folder
  const response = await drive.files.list({
    q: `name='${folderName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  // Create the folder if it doesn't exist
  const folder = await drive.files.create({
    requestBody: {
      name: folderName,
      mimeType: 'application/vnd.google-apps.folder',
    },
    fields: 'id',
  });

  return folder.data.id;
}

/**
 * Find a file by name in a specific folder.
 *
 * @param {import('googleapis').drive_v3.Drive} drive
 * @param {string} folderId - Parent folder ID
 * @param {string} fileName - File name to search for
 * @returns {Promise<string|null>} File ID or null if not found
 */
async function findFileInFolder(drive, folderId, fileName) {
  const response = await drive.files.list({
    q: `name='${fileName}' and '${folderId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    spaces: 'drive',
  });

  if (response.data.files && response.data.files.length > 0) {
    return response.data.files[0].id;
  }

  return null;
}

/**
 * Load the user's portfolio from Google Drive.
 * Returns null if no portfolio file exists yet.
 *
 * @param {string} accessToken - User's Google OAuth access token
 * @param {string} [refreshToken] - User's Google OAuth refresh token
 * @returns {Promise<Object|null>} Portfolio data or null
 */
async function loadPortfolio(accessToken, refreshToken) {
  const drive = getDriveClient(accessToken, refreshToken);

  const folderId = await getOrCreateAppFolder(drive);
  const fileId = await findFileInFolder(drive, folderId, config.googleDrive.portfolioFileName);

  if (!fileId) {
    return null;
  }

  const response = await drive.files.get({
    fileId,
    alt: 'media',
  });

  return response.data;
}

/**
 * Save the user's portfolio to Google Drive.
 * Creates or updates the portfolio.json file.
 *
 * @param {string} accessToken - User's Google OAuth access token
 * @param {string} refreshToken - User's Google OAuth refresh token
 * @param {Object} portfolioData - Portfolio data to save
 * @returns {Promise<string>} File ID of saved file
 */
async function savePortfolio(accessToken, refreshToken, portfolioData) {
  const drive = getDriveClient(accessToken, refreshToken);
  const fileName = config.googleDrive.portfolioFileName;

  const folderId = await getOrCreateAppFolder(drive);
  const existingFileId = await findFileInFolder(drive, folderId, fileName);

  const content = JSON.stringify(portfolioData, null, 2);
  const media = {
    mimeType: 'application/json',
    body: content,
  };

  if (existingFileId) {
    // Update existing file
    const response = await drive.files.update({
      fileId: existingFileId,
      media,
      fields: 'id',
    });
    return response.data.id;
  }

  // Create new file
  const response = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
    },
    media,
    fields: 'id',
  });

  return response.data.id;
}

/**
 * Create an empty default portfolio structure for new users.
 *
 * @param {string} email - User's email address
 * @returns {Object} Default empty portfolio
 */
function createDefaultPortfolio(email) {
  return {
    user: {
      email,
      preferences: {
        theme: 'ocean',
        darkMode: false,
        currency: 'EUR',
        language: 'fr',
      },
    },
    crypto: [],
    pea: [],
    livrets: [],
    fundraising: [],
    objectives: [],
    lastUpdated: new Date().toISOString(),
  };
}

module.exports = {
  loadPortfolio,
  savePortfolio,
  createDefaultPortfolio,
};
