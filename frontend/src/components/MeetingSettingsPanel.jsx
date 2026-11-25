import { X, Lock, Unlock, Users, MicOff, VideoOff, Circle, Shield, Check, Hand } from 'lucide-react'
import { getSocket } from '../lib/socket'
import { useMeetingStore } from '../store/meetingStore'
import toast from 'react-hot-toast'

const DEFAULTS = {
  hostManagement: false,
  allowScreenShare: true,
  allowReactions: true,
  allowMic: true,
  allowVideo: true,
  allowChat: true,
  allowAddOns: true,
  allowRecording: true,
  waitingRoom: false,
  muteOnEntry: false,
  hostMustJoinFirst: false,
  accessType: 'trusted',
  allowLinkRequests: true,
  webinar: false,
}

export default function MeetingSettingsPanel({ meeting, isHost, isCoHost, canManage, isMeetingLocked, onClose }) {
  const manage = canManage !== undefined ? canManage : (isHost || isCoHost)
  const { toggleMeetingLock, lowerAllHands } = useMeetingStore()
  // Settings live on the meeting so changes from other hosts show up here too
  const settings = { ...DEFAULTS, ...(meeting?.settings || {}) }

  const updateSetting = (key, value) => {
    useMeetingStore.setState(state => state.currentMeeting
      ? { currentMeeting: { ...state.currentMeeting, settings: { ...state.currentMeeting.settings, [key]: value } } }
      : {})
    const socket = getSocket()
    if (socket && meeting) {
      socket.emit('host:update-settings', { roomId: meeting.roomId, settings: { [key]: value } })
    }
  }

  const handleMuteAll = () => {
    const socket = getSocket()
    if (socket && meeting) {
      socket.emit('host:mute-all', { roomId: meeting.roomId })
      toast.success('All participants have been muted')
    }
  }

  const handleDisableAllVideo = () => {
    const socket = getSocket()
    if (socket && meeting) {
      socket.emit('host:disable-all-video', { roomId: meeting.roomId })
      toast.success('All cameras have been turned off')
    }
  }

  const contributorToggle = (key, label, description) => (
    <ToggleRow label={label} description={description} indent
      enabled={settings[key]} disabled={!settings.hostManagement}
      onToggle={() => updateSetting(key, !settings[key])} />
  )

  return (
    <div className="side-panel bg-dark-200 border-l border-white/[0.06]">
      <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2.5">
          <span className="w-8 h-8 rounded-lg bg-primary-500/15 text-primary-400 flex items-center justify-center"><Shield className="w-4 h-4" /></span> Host controls
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {manage ? (
          <>
            <p className="px-4 pt-4 pb-1 text-xs leading-relaxed text-gray-400">
              Use these host settings to keep control of your meeting. Only hosts have access to these controls.
            </p>

            <Section title="Quick actions">
              <ActionButton onClick={handleMuteAll} icon={<MicOff className="w-4 h-4 text-red-400" />}>Mute all participants</ActionButton>
              <ActionButton onClick={handleDisableAllVideo} icon={<VideoOff className="w-4 h-4 text-red-400" />}>Turn off all cameras</ActionButton>
              <ActionButton onClick={lowerAllHands} icon={<Hand className="w-4 h-4" />}>Lower all hands</ActionButton>
              <ActionButton onClick={toggleMeetingLock}
                icon={isMeetingLocked ? <Unlock className="w-4 h-4 text-green-400" /> : <Lock className="w-4 h-4 text-yellow-400" />}>
                {isMeetingLocked ? 'Unlock meeting' : 'Lock meeting'}
              </ActionButton>
            </Section>

            <Section title="Webinar mode">
              <ToggleRow label="Webinar mode"
                description="Only hosts and co-hosts present. Attendees are view-only and receive just the presenters (much lower server load for large meetings)."
                enabled={settings.webinar} onToggle={() => updateSetting('webinar', !settings.webinar)} />
            </Section>

            <Section title="Meeting moderation">
              <ToggleRow label="Host management"
                description="Lets you restrict what contributors can enable."
                enabled={settings.hostManagement}
                onToggle={() => updateSetting('hostManagement', !settings.hostManagement)} />
              <p className="px-4 pt-2 text-xs font-semibold text-gray-400">Let contributors</p>
              {contributorToggle('allowScreenShare', 'Share their screen')}
              {contributorToggle('allowReactions', 'Send reactions')}
              {contributorToggle('allowMic', 'Turn on their microphone',
                'Turning this off might remove people using an outdated app. They can rejoin when it\'s turned on again.')}
              {contributorToggle('allowVideo', 'Turn on their video',
                'Turning this off might remove people using an outdated app. They can rejoin when it\'s turned on again.')}
              <ToggleRow label="Mute on entry" description="New participants join muted"
                enabled={settings.muteOnEntry} onToggle={() => updateSetting('muteOnEntry', !settings.muteOnEntry)} />
              <ToggleRow label="Allow recording" description="Participants can record"
                icon={<Circle className="w-4 h-4" />}
                enabled={settings.allowRecording} onToggle={() => updateSetting('allowRecording', !settings.allowRecording)} />
            </Section>

            <Section title="Chat moderation">
              <ToggleRow label="Let participants send messages"
                description="When on, everyone in the call can send messages"
                enabled={settings.allowChat} onToggle={() => updateSetting('allowChat', !settings.allowChat)} />
            </Section>

            <Section title="Meeting access">
              <p className="px-4 pt-3 text-xs text-gray-400">These settings apply to future instances of this meeting.</p>
              <ToggleRow label="Waiting room" description="New participants must be admitted"
                icon={<Users className="w-4 h-4" />}
                enabled={settings.waitingRoom} onToggle={() => updateSetting('waitingRoom', !settings.waitingRoom)} />
              <ToggleRow label="Host must join before anyone else"
                enabled={settings.hostMustJoinFirst}
                onToggle={() => updateSetting('hostMustJoinFirst', !settings.hostMustJoinFirst)} />
              <div className="px-4 pt-2 pb-3">
                <p className="text-sm font-medium mb-2">Meeting access type</p>
                <RadioRow checked={settings.accessType === 'open'} onSelect={() => updateSetting('accessType', 'open')}
                  label="Open" description="No one has to ask to join. Anyone with the link can join." />
                <RadioRow checked={settings.accessType === 'trusted'} onSelect={() => updateSetting('accessType', 'trusted')}
                  label="Trusted" description="People can join without asking if they're invited. Others need the option below.">
                  <label className="flex items-start gap-2 mt-2 ml-1 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-0.5 accent-primary-500"
                      checked={settings.allowLinkRequests}
                      onChange={e => updateSetting('allowLinkRequests', e.target.checked)} />
                    <span>Anyone with the meeting link can ask to join</span>
                  </label>
                </RadioRow>
              </div>
            </Section>

            <Section title="Meeting activities">
              <ToggleRow label="Let contributors share add-on activities"
                description="When off, only activities started by a host (whiteboard, notes) can be shared with others"
                enabled={settings.allowAddOns} onToggle={() => updateSetting('allowAddOns', !settings.allowAddOns)} />
            </Section>
          </>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Only the host or a co-host can manage meeting settings</p>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div className="mx-3 my-3 rounded-2xl bg-dark-300/50 border border-white/[0.05] pb-2">
      <h3 className="px-4 pt-3.5 pb-1 text-[11px] font-semibold text-primary-300/80">{title}</h3>
      {children}
    </div>
  )
}

function ActionButton({ onClick, icon, children }) {
  return (
    <button onClick={onClick}
      className="w-[calc(100%-2rem)] mx-4 my-1 flex items-center gap-3 p-2.5 bg-dark-400/50 hover:bg-dark-400 border border-white/[0.04] rounded-xl transition-colors text-left">
      {icon}<span className="text-sm">{children}</span>
    </button>
  )
}

function ToggleRow({ label, description, icon, enabled, onToggle, disabled, indent }) {
  return (
    <div className={`flex items-center justify-between gap-3 py-3 pr-4 ${indent ? 'pl-7' : 'pl-4'} ${disabled ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-3 min-w-0">
        {icon && <div className="text-gray-400 mt-0.5">{icon}</div>}
        <div>
          <p className="text-sm font-medium">{label}</p>
          {description && <p className="text-xs text-gray-500 mt-0.5">{description}</p>}
        </div>
      </div>
      <button onClick={onToggle} disabled={disabled} role="switch" aria-checked={enabled} aria-label={label}
        className={`relative shrink-0 w-11 h-6 rounded-full transition-colors disabled:cursor-not-allowed ${enabled ? 'bg-primary-600' : 'bg-dark-500'}`}>
        <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow flex items-center justify-center transition-transform ${enabled ? 'translate-x-[22px]' : 'translate-x-0.5'}`}>
          {enabled && <Check className="w-3 h-3 text-primary-600" />}
        </div>
      </button>
    </div>
  )
}

function RadioRow({ checked, onSelect, label, description, children }) {
  return (
    <div className="py-1.5">
      <label className="flex items-start gap-3 cursor-pointer">
        <input type="radio" className="mt-1 accent-primary-500" checked={checked} onChange={onSelect} />
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </label>
      {checked && children}
    </div>
  )
}
