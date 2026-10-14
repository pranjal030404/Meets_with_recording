/**
 * White-label branding configuration.
 *
 * Every value can be overridden per deployment via Vite env vars
 * (frontend/.env or build-time environment) — no code changes needed.
 *
 *   VITE_APP_NAME       Product name shown everywhere (default: MeetClone)
 *   VITE_APP_TAGLINE    Short tagline under the logo / in footers
 *   VITE_APP_LOGO_URL   URL or /path to a logo image (falls back to built-in icon)
 *   VITE_APP_ICON_URL   Favicon / small icon override
 *   VITE_APP_DESCRIPTION Meta description & landing hero copy
 *   VITE_APP_COMPANY    Company name used in copyright lines
 *   VITE_APP_SUPPORT_EMAIL  Support/contact email shown on auth pages
 */

const raw = import.meta.env

export const branding = {
  appName: raw.VITE_APP_NAME || 'MeetClone',
  tagline: raw.VITE_APP_TAGLINE || 'Professional Video Meetings',
  description:
    raw.VITE_APP_DESCRIPTION ||
    'Professional video meetings with recording, transcripts, chat and team workspaces.',
  logoUrl: raw.VITE_APP_LOGO_URL || '',
  iconUrl: raw.VITE_APP_ICON_URL || '',
  companyName: raw.VITE_APP_COMPANY || '',
  supportEmail: raw.VITE_APP_SUPPORT_EMAIL || '',
}

/** Full page title, e.g. "MeetClone — Professional Video Meetings" */
export const pageTitle = `${branding.appName} — ${branding.tagline}`

/** Copyright holder, e.g. "© 2026 Acme Inc" (falls back to app name) */
export const copyrightHolder = branding.companyName || branding.appName

export default branding
