import { Navigate, Link } from 'react-router-dom'
import useLegal from '../lib/useLegal'
import branding from '../config/branding'

// What these pages say must stay true to what the software does. They are a starting text, not legal advice.
const privacy = ({ name, contact, retention }) => [
  ['Who runs this service', `${name} runs this installation of ${branding.appName}. Questions and requests about your data: ${contact}.`],
  ['What is stored', 'Your name, email address, password (only as a one-way hash), photo and the profile details you fill in. Meetings: titles, times, who was invited or attended, chat, polls, questions and notes, and recordings, transcripts and summaries when someone records. Teams, messages, tasks and the files you upload. Security records of actions taken, with time, network address and browser.'],
  ['Why', 'To provide meetings and teamwork, to keep accounts secure and to investigate misuse.'],
  ['Who sees it', 'The people you share with: participants of your meetings, members of your teams and conversations. Administrators of this installation can manage accounts. Email is delivered through the operator\'s mail provider. If transcription or summaries are set up to use an outside service, audio or text is sent to it.'],
  ['Cookies and storage', 'Only what is needed to work: a sign-in cookie, a cookie that recognises a device you have signed in from (so that other people guessing passwords cannot lock you out), a cookie for opening your files, and your settings kept in the browser. There is no advertising or analytics tracking.'],
  ['How long', retention || 'Data is kept while your account exists. Backups made before a deletion keep it until they are replaced. Billing and security records may be kept longer where needed.'],
  ['Your choices', `In your profile you can download your data and delete your account. Deletion removes your profile, files, the text of your messages and the recordings of meetings you hosted. It keeps billing records, security records without your name, what other people wrote, and recordings or transcripts of meetings someone else hosted. Ask ${contact} about those, to correct something, or to object.`],
]

const terms = ({ name, contact, law }) => [
  ['The agreement', `By using this service you agree to these terms with ${name}, which runs it.`],
  ['Your account', 'Give accurate details, keep your password private and tell us if somebody else has used your account. You are responsible for what is done with it.'],
  ['Acceptable use', 'Do not break the law, harass others, share material you have no right to share, upload harmful software, or try to get round the security of the service or reach other people\'s data.'],
  ['Recording', 'Before recording a meeting, tell the people in it and get any consent the law where they are requires. You are responsible for how you use recordings and transcripts.'],
  ['Your content', 'What you upload or write stays yours. You allow the service to store, process and show it to the people you share it with, only to run the service.'],
  ['Availability', 'The service is provided as it is, without a promise that it will always be available or free of faults. Keep your own copies of anything important.'],
  ['Ending', 'You can delete your account at any time. Accounts that break these terms may be suspended or removed.'],
  ['Liability', `To the extent the law allows, ${name} is not liable for indirect loss, lost data or lost business arising from use of the service. Nothing here limits liability that cannot be limited by law.`],
  ['Law and contact', `${law ? `These terms are governed by the law of ${law}. ` : ''}Questions: ${contact}.`],
]

const PAGES = { privacy: ['Privacy notice', privacy], terms: ['Terms of service', terms] }

export default function Legal({ page }) {
  const legal = useLegal()
  if (legal === null) return null
  if (!legal) return <Navigate to="/" replace />
  const [title, sections] = PAGES[page]
  return (
    <main className="max-w-2xl mx-auto px-5 py-10 text-gray-300 leading-relaxed">
      <Link to="/" className="text-sm text-primary-300 hover:underline">{branding.appName}</Link>
      <h1 className="text-2xl font-semibold text-white mt-4 mb-1">{title}</h1>
      {legal.updated && <p className="text-xs text-gray-500">Last updated {legal.updated}</p>}
      {sections(legal).map(([heading, text]) => (
        <section key={heading} className="mt-6">
          <h2 className="text-base font-semibold text-white mb-1">{heading}</h2>
          <p className="text-sm">{text}</p>
        </section>
      ))}
    </main>
  )
}
