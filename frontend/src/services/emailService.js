/**
 * Email service using EmailJS (100% client-side, free tier: 200 emails/month).
 *
 * ============================================================
 *  TUTORIEL DE CONFIGURATION EMAILJS
 * ============================================================
 *
 *  1. Créer un compte gratuit sur https://www.emailjs.com/
 *
 *  2. Ajouter un Email Service :
 *     - Dashboard → Email Services → Add New Service
 *     - Choisir "Gmail" (ou autre provider)
 *     - Connecter votre compte Gmail (iweacytlew3@gmail.com)
 *     - Copier le SERVICE_ID (ex: "service_xxxxxxx")
 *
 *  3. Créer un Email Template :
 *     - Dashboard → Email Templates → Create New Template
 *     - Sujet du template : "{{message_type}} — {{subject}}"
 *     - Corps du template :
 *
 *       Type : {{message_type}}
 *       Sujet : {{subject}}
 *       Date : {{date}}
 *       Email utilisateur : {{user_email}}
 *
 *       Description :
 *       {{description}}
 *
 *     - Destinataire (To Email) : iweacytlew3@gmail.com
 *     - Copier le TEMPLATE_ID (ex: "template_xxxxxxx")
 *
 *  4. Récupérer votre Public Key :
 *     - Dashboard → Account → API Keys
 *     - Copier la Public Key (ex: "xxxxxxxxxxxxxxxxx")
 *
 *  5. Renseigner les 3 constantes ci-dessous :
 *     - EMAILJS_SERVICE_ID
 *     - EMAILJS_TEMPLATE_ID
 *     - EMAILJS_PUBLIC_KEY
 *
 *  6. Tester l'envoi depuis la page Paramètres de l'application.
 *
 * ============================================================
 */

const EMAILJS_SERVICE_ID = 'service_portfoliomgr'
const EMAILJS_TEMPLATE_ID = 'template_8b0lavl'
const EMAILJS_PUBLIC_KEY = 'ibeVRoEC4GclrLDRE'

const EMAILJS_API_URL = 'https://api.emailjs.com/api/v1.0/email/send'

// Rate limiting: max 3 emails per 5 minutes
const RATE_LIMIT_KEY = 'pm_email_rate_limit'
const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000

function checkRateLimit() {
  try {
    const raw = localStorage.getItem(RATE_LIMIT_KEY)
    const timestamps = raw ? JSON.parse(raw) : []
    const now = Date.now()
    const recent = timestamps.filter(t => now - t < RATE_LIMIT_WINDOW_MS)
    if (recent.length >= RATE_LIMIT_MAX) {
      return false
    }
    recent.push(now)
    localStorage.setItem(RATE_LIMIT_KEY, JSON.stringify(recent))
    return true
  } catch {
    return true
  }
}

/**
 * @param {Object} params
 * @param {string} params.type - 'bug' | 'suggestion' | 'question'
 * @param {string} params.subject
 * @param {string} params.description
 * @param {string} [params.userEmail]
 * @param {string} [params.honeypot] - must be empty (spam protection)
 * @returns {Promise<{success: boolean, error?: string}>}
 */
export async function sendBugReport({ type, subject, description, userEmail, honeypot }) {
  // Honeypot check
  if (honeypot) {
    // Silently "succeed" for bots
    return { success: true }
  }

  // Validation
  if (!subject || !subject.trim()) {
    return { success: false, error: 'Le sujet est obligatoire.' }
  }
  if (!description || !description.trim()) {
    return { success: false, error: 'La description est obligatoire.' }
  }
  if (!type) {
    return { success: false, error: 'Veuillez sélectionner un type de message.' }
  }

  // Rate limit
  if (!checkRateLimit()) {
    return { success: false, error: 'Trop de messages envoyés. Veuillez réessayer dans quelques minutes.' }
  }

  // Check EmailJS config
  if (EMAILJS_PUBLIC_KEY === 'YOUR_PUBLIC_KEY') {
    return { success: false, error: 'Service email non configuré. Contactez l\'administrateur.' }
  }

  const typeLabels = { bug: 'Bug', suggestion: 'Suggestion', question: 'Question' }

  const templateParams = {
    message_type: typeLabels[type] || type,
    subject: subject.trim(),
    description: description.trim(),
    user_email: userEmail?.trim() || 'Non renseigné',
    date: new Date().toLocaleString('fr-FR'),
  }

  try {
    const response = await fetch(EMAILJS_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS_SERVICE_ID,
        template_id: EMAILJS_TEMPLATE_ID,
        user_id: EMAILJS_PUBLIC_KEY,
        template_params: templateParams,
      }),
    })

    if (response.ok) {
      return { success: true }
    }

    const text = await response.text()
    console.error('EmailJS error:', text)
    return { success: false, error: 'Erreur lors de l\'envoi. Veuillez réessayer.' }
  } catch (err) {
    console.error('Email send error:', err)
    return { success: false, error: 'Erreur réseau. Vérifiez votre connexion.' }
  }
}
