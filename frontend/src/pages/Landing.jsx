import useBilling from '../lib/useBilling'
import LegalLinks from '../components/LegalLinks'
import { Link } from 'react-router-dom'
import {
  Video,
  Calendar,
  Users,
  MessageSquare,
  MonitorPlay,
  Brush,
  Subtitles,
  ShieldCheck,
  Mic,
  Hand,
  Disc,
  Check,
  ArrowRight,
} from 'lucide-react'
import { useAuthStore } from '../store/authStore'
import branding, { copyrightHolder } from '../config/branding'
import './landing.css'
import BrandMark from '../components/BrandMark'

const ICON = { size: 20, strokeWidth: 1.5 }

const FEATURES = [
  { icon: Video, title: 'HD video meetings', description: 'Video and audio routed through an SFU media server, so larger rooms stay smooth.' },
  { icon: Disc, title: 'Recording and transcripts', description: 'Record any session and get an automatic transcript, downloadable as JSON, TXT, SRT or VTT.' },
  { icon: Users, title: 'Team workspaces', description: 'Create teams with channels, roles and invite codes, and keep every department in one place.' },
  { icon: MessageSquare, title: 'In-meeting chat', description: 'Real-time chat with typing indicators and unread badges, so no message gets missed mid-call.' },
  { icon: MonitorPlay, title: 'Screen sharing', description: 'Share your screen or a single window for demos, reviews and teaching.' },
  { icon: Brush, title: 'Shared whiteboard', description: 'Sketch ideas together in real time on a whiteboard built into every meeting.' },
  { icon: Subtitles, title: 'Live captions and Q&A', description: 'Real-time captions and hand-raising keep everyone included, from classrooms to all-hands.' },
  { icon: Calendar, title: 'Scheduling and reminders', description: 'Plan meetings on a built-in calendar, with reminders sent before they start.' },
  { icon: ShieldCheck, title: 'Host controls', description: 'Waiting room, meeting lock, spotlight, force-mute and role-based access for hosts.' },
]

const STEPS = [
  { title: 'Create or schedule', text: 'Start an instant meeting, or schedule one on the calendar with reminders for your team.' },
  { title: 'Check your devices', text: 'Preview your camera and mic on the pre-join screen, pick your devices, then join.' },
  { title: 'Meet and collaborate', text: 'Chat, share your screen, react, raise a hand and record. Everything stays in your history.' },
]

const TILES = [
  { name: 'You', tone: '#1f2229', fig: '#333844', speaking: true },
  { name: 'Aisha', tone: '#1d2224', fig: '#303a3d' },
  { name: 'Marcus', tone: '#211f27', fig: '#383543' },
  { name: 'Sam', tone: '#222224', fig: '#393a3f' },
]

const TRANSCRIPT = [
  { time: '00:01:12', speaker: 'Aisha', text: 'Morning everyone. Quick agenda: sprint demo, then blockers.' },
  { time: '00:01:26', speaker: 'You', text: 'Sounds good. Sharing my screen now.' },
  { time: '00:02:03', speaker: 'Marcus', text: 'Can you zoom into the timeline view?' },
]

export default function Landing() {
  const { isAuthenticated } = useAuthStore()
  const primaryTo = isAuthenticated ? '/app' : '/signup'
  const billing = useBilling()

  return (
    <div className="lp">
      {/* ---------- Navbar ---------- */}
      <header className="lp-nav">
        <nav className="lp-wrap lp-nav-in">
          <Link to="/" className="lp-brand">
            <BrandMark size="sm" />
            {branding.appName}
          </Link>

          <div className="lp-links">
            <a href="#features" className="lp-link">Features</a>
            <a href="#how" className="lp-link">How it works</a>
            <a href="#highlights" className="lp-link">Highlights</a>
            {billing && <Link to="/pricing" className="lp-link">Pricing</Link>}
          </div>

          <div className="lp-nav-actions">
            {!isAuthenticated && <Link to="/login" className="lp-link">Sign in</Link>}
            <Link to={primaryTo} className="lp-btn lp-btn-primary">
              {isAuthenticated ? 'Open app' : 'Get started'}
            </Link>
          </div>
        </nav>
      </header>

      {/* ---------- Hero ---------- */}
      <section className="lp-hero">
        <div className="lp-wrap">
          <div className="lp-hero-grid">
            <div>
              <h1 className="lp-h1 lp-in">Meetings you can record, transcribe and search later</h1>
              <p className="lp-lede lp-in lp-in-2">
                Video calls, screen sharing, chat and team workspaces in your browser. Every recording gets a transcript you can download as JSON, TXT, SRT or VTT.
              </p>
              <div className="lp-actions lp-in lp-in-2">
                <Link to={primaryTo} className="lp-btn lp-btn-primary lp-btn-lg">
                  {isAuthenticated ? 'Start a meeting' : 'Create account'}
                  <ArrowRight size={18} strokeWidth={1.5} />
                </Link>
                <a href="#features" className="lp-btn lp-btn-secondary lp-btn-lg">See features</a>
              </div>
              <p className="lp-meta lp-in lp-in-2">Runs in the browser, no download</p>
            </div>

            <div id="highlights" className="lp-window lp-in lp-in-2">
              <div className="lp-window-bar">
                <span className="lp-rec"><i className="lp-tally" />Recording · Weekly standup</span>
                <span className="lp-time">00:12:48</span>
              </div>
              <div className="lp-window-body">
                <div className="lp-tiles">
                  {TILES.map((t) => (
                    <div
                      key={t.name}
                      className={`lp-tile ${t.speaking ? 'lp-tile-speaking' : ''}`}
                      style={{ '--tone': t.tone, '--fig': t.fig }}
                    >
                      <span className="lp-chip">{t.name}</span>
                    </div>
                  ))}
                </div>
                <aside className="lp-side">
                  <span className="lp-side-title">Live transcript</span>
                  {TRANSCRIPT.map((l) => (
                    <p key={l.time} className="lp-cue">
                      <time>{l.time}</time>
                      <b>{l.speaker}</b> {l.text}
                    </p>
                  ))}
                </aside>
              </div>
              <p className="lp-caption"><b>Marcus</b> Can you zoom into the timeline view?</p>
              <div className="lp-dock">
                <span><Mic size={14} strokeWidth={1.5} />Mic</span>
                <span><MonitorPlay size={14} strokeWidth={1.5} />Share</span>
                <span><MessageSquare size={14} strokeWidth={1.5} />Chat</span>
                <span><Hand size={14} strokeWidth={1.5} />Raise hand</span>
                <span><Subtitles size={14} strokeWidth={1.5} />Captions</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Facts ---------- */}
      <section className="lp-wrap">
        <div className="lp-facts">
          {[
            { value: 'HD', label: 'Video and audio' },
            { value: '4', label: 'Transcript formats' },
            { value: '1 click', label: 'To start recording' },
          ].map((f) => (
            <div key={f.label} className="lp-fact">
              <p className="lp-fact-v">{f.value}</p>
              <p className="lp-fact-l">{f.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- Features ---------- */}
      <section id="features" className="lp-section">
        <div className="lp-wrap">
          <h2 className="lp-h2">Everything a meeting needs, in one app</h2>
          <p className="lp-sub">From quick standups to full lectures, {branding.appName} covers the call, the record and the follow-up.</p>

          <div className="lp-features">
            {FEATURES.map(({ icon: Icon, title, description }) => (
              <div key={title} className="lp-feature">
                <Icon {...ICON} />
                <h3>{title}</h3>
                <p>{description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- How it works ---------- */}
      <section id="how" className="lp-section" style={{ paddingTop: 0 }}>
        <div className="lp-wrap">
          <h2 className="lp-h2">Start in under a minute</h2>
          <p className="lp-sub">No downloads, no plugins. If you have a browser, you're ready.</p>
          <div className="lp-steps">
            {STEPS.map((s, i) => (
              <div key={s.title} className="lp-step">
                <span className="lp-step-n">{String(i + 1).padStart(2, '0')}</span>
                <h3>{s.title}</h3>
                <p>{s.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Recordings highlight ---------- */}
      <section className="lp-wrap" style={{ paddingBottom: 96 }}>
        <div className="lp-panel">
          <div>
            <h2 className="lp-h2" style={{ fontSize: 'clamp(28px, 3vw, 36px)' }}>Record, transcribe and revisit anytime</h2>
            <p className="lp-sub">
              Every recorded meeting lands in your history with an automatic transcript. Download the video or export subtitles in JSON, TXT, SRT or VTT, for lectures, interviews and compliance.
            </p>
            <ul className="lp-list">
              {[
                'One-click recording with participant notification',
                'Automatic transcription after upload',
                'Download recordings and subtitle files',
                'Full searchable meeting history',
              ].map((item) => (
                <li key={item}><Check size={16} strokeWidth={1.5} />{item}</li>
              ))}
            </ul>
            {!isAuthenticated && (
              <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-lg" style={{ marginTop: 32 }}>
                Create account
              </Link>
            )}
          </div>

          <div className="lp-transcript">
            <div className="lp-transcript-head">
              <span>Transcript, SRT</span>
              <span className="lp-ready"><i />Ready</span>
            </div>
            {TRANSCRIPT.map((l) => (
              <div key={l.time} className="lp-line">
                <time>{l.time}</time>
                <div>
                  <b>{l.speaker}</b>
                  <p>{l.text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------- Final CTA ---------- */}
      <section className="lp-final">
        <div className="lp-wrap lp-section">
          <div className="lp-final-in">
            <h2 className="lp-h2">Host your next meeting in the browser</h2>
            <div className="lp-actions" style={{ marginTop: 0 }}>
              {isAuthenticated ? (
                <Link to="/app" className="lp-btn lp-btn-primary lp-btn-lg">
                  Open {branding.appName}
                  <ArrowRight size={18} strokeWidth={1.5} />
                </Link>
              ) : (
                <>
                  <Link to="/signup" className="lp-btn lp-btn-primary lp-btn-lg">
                    Create account
                    <ArrowRight size={18} strokeWidth={1.5} />
                  </Link>
                  <Link to="/login" className="lp-btn lp-btn-secondary lp-btn-lg">Sign in</Link>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ---------- Footer ---------- */}
      <footer className="lp-footer">
        <div className="lp-wrap lp-footer-in">
          <span>{branding.appName} · {branding.tagline}</span>
          <LegalLinks />
          <span>© {new Date().getFullYear()} {copyrightHolder}</span>
        </div>
      </footer>
    </div>
  )
}
