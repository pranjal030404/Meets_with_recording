import { useState } from 'react'
import { X, Lock, Unlock, Users, Mic, MicOff, Video, VideoOff, Monitor, MessageSquare, Circle, Shield } from 'lucide-react'
import { getSocket } from '../lib/socket'
import { useMeetingStore } from '../store/meetingStore'
import toast from 'react-hot-toast'

export default function MeetingSettingsPanel({ meeting, isHost, isMeetingLocked, onClose }) {
  const { toggleMeetingLock, lowerAllHands } = useMeetingStore()
  const [settings, setSettings] = useState({
    waitingRoom: meeting?.settings?.waitingRoom || false,
    allowScreenShare: meeting?.settings?.allowScreenShare ?? true,
    allowChat: meeting?.settings?.allowChat ?? true,
    allowRecording: meeting?.settings?.allowRecording ?? true,
    muteOnEntry: meeting?.settings?.muteOnEntry || false,
  })

  const updateSetting = (key, value) => {
    const newSettings = { ...settings, [key]: value }
    setSettings(newSettings)

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

  return (
    <div className="w-80 bg-dark-200 border-l border-dark-400 flex flex-col">
      <div className="p-4 border-b border-dark-400 flex items-center justify-between">
        <h2 className="font-semibold flex items-center gap-2">
          <Shield className="w-5 h-5" /> Meeting Settings
        </h2>
        <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {isHost ? (
          <>
            {/* Host Actions */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Quick Actions</h3>
              <button onClick={handleMuteAll}
                className="w-full flex items-center gap-3 p-3 bg-dark-300 hover:bg-dark-400 rounded-lg transition-colors text-left">
                <MicOff className="w-4 h-4 text-red-400" />
                <span className="text-sm">Mute All Participants</span>
              </button>
              <button onClick={handleDisableAllVideo}
                className="w-full flex items-center gap-3 p-3 bg-dark-300 hover:bg-dark-400 rounded-lg transition-colors text-left">
                <VideoOff className="w-4 h-4 text-red-400" />
                <span className="text-sm">Turn Off All Cameras</span>
              </button>
              <button onClick={lowerAllHands}
                className="w-full flex items-center gap-3 p-3 bg-dark-300 hover:bg-dark-400 rounded-lg transition-colors text-left">
                <span className="text-sm">✋ Lower All Hands</span>
              </button>
              <button onClick={toggleMeetingLock}
                className="w-full flex items-center gap-3 p-3 bg-dark-300 hover:bg-dark-400 rounded-lg transition-colors text-left">
                {isMeetingLocked
                  ? <><Unlock className="w-4 h-4 text-green-400" /><span className="text-sm">Unlock Meeting</span></>
                  : <><Lock className="w-4 h-4 text-yellow-400" /><span className="text-sm">Lock Meeting</span></>
                }
              </button>
            </div>

            {/* Toggleable settings */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-400 uppercase">Participant Permissions</h3>
              <SettingToggle label="Waiting Room" description="New participants must be admitted"
                icon={<Users className="w-4 h-4" />}
                enabled={settings.waitingRoom} onToggle={() => updateSetting('waitingRoom', !settings.waitingRoom)} />
              <SettingToggle label="Allow Screen Share" description="Participants can share their screen"
                icon={<Monitor className="w-4 h-4" />}
                enabled={settings.allowScreenShare} onToggle={() => updateSetting('allowScreenShare', !settings.allowScreenShare)} />
              <SettingToggle label="Allow Chat" description="Participants can send messages"
                icon={<MessageSquare className="w-4 h-4" />}
                enabled={settings.allowChat} onToggle={() => updateSetting('allowChat', !settings.allowChat)} />
              <SettingToggle label="Allow Recording" description="Participants can record"
                icon={<Circle className="w-4 h-4" />}
                enabled={settings.allowRecording} onToggle={() => updateSetting('allowRecording', !settings.allowRecording)} />
              <SettingToggle label="Mute on Entry" description="New participants join muted"
                icon={<MicOff className="w-4 h-4" />}
                enabled={settings.muteOnEntry} onToggle={() => updateSetting('muteOnEntry', !settings.muteOnEntry)} />
            </div>
          </>
        ) : (
          <div className="text-center text-gray-400 py-8">
            <Shield className="w-10 h-10 mx-auto mb-2 opacity-50" />
            <p className="text-sm">Only the host can manage meeting settings</p>
          </div>
        )}
      </div>
    </div>
  )
}

function SettingToggle({ label, description, icon, enabled, onToggle }) {
  return (
    <div className="flex items-center justify-between p-3 bg-dark-300 rounded-lg">
      <div className="flex items-center gap-3">
        <div className="text-gray-400">{icon}</div>
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
      </div>
      <button onClick={onToggle}
        className={`relative w-10 h-5 rounded-full transition-colors ${enabled ? 'bg-primary-600' : 'bg-dark-500'}`}>
        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
      </button>
    </div>
  )
}
