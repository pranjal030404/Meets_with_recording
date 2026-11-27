/**
 * Details for the privacy notice and terms pages. Until an operator name and a contact address are both set, the
 * pages stay hidden: publish them only after the text has been checked for where you operate.
 */
export const legalDetails = (env = process.env) => (env.LEGAL_NAME && env.LEGAL_CONTACT
  ? { name: env.LEGAL_NAME, contact: env.LEGAL_CONTACT, law: env.LEGAL_LAW || null, retention: env.LEGAL_RETENTION || null, updated: env.LEGAL_UPDATED || null }
  : null);
