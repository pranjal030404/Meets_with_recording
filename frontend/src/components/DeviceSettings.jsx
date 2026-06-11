import { useState, useEffect } from 'react'
import { X, Mic, Video, Speaker, Sparkles } from 'lucide-react'
import { useMeetingStore } from '../store/meetingStore'

export default function DeviceSettings({ onClose }) {
  const {
    availableDevices, selectedAudioDevice, selectedVideoDevice, selectedAudioOutputDevice,
    videoQuality, audioLevel, isSpeaking,
    enumerateDevices, switchAudioDevice, switchVideoDevice, switchAudioOutput, setVideoQuality
  } = useMeetingStore()

  const [tab, setTab] = useState('audio')

  useEffect(() => {
    enumerateDevices()
  }, [])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-content max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold">Settings</h2>
          <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-dark-300 rounded-lg p-1">
          {[
            { id: 'audio', icon: Mic, label: 'Audio' },
            { id: 'video', icon: Video, label: 'Video' },
          ].map(({ id, icon: Icon, label }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm transition-colors
                ${tab === id ? 'bg-primary-600 text-white' : 'text-gray-400 hover:text-white'}`}>
              <Icon className="w-4 h-4" /> {label}
            </button>
          ))}
        </div>

        {/* Audio Settings */}
        {tab === 'audio' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Microphone</label>
              <select
                value={selectedAudioDevice || ''}
                onChange={(e) => switchAudioDevice(e.target.value)}
                className="input"
              >
                <option value="">Default</option>
                {availableDevices.audioinput.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">Speaker</label>
              <select
                value={selectedAudioOutputDevice || ''}
                onChange={(e) => switchAudioOutput(e.target.value)}
                className="input"
              >
                <option value="">Default</option>
                {availableDevices.audiooutput.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Speaker ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            {audioLevel > 0 && (
              <div>
                <label className="block text-sm text-gray-400 mb-2">Microphone Level</label>
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-2 bg-dark-400 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-100 ${isSpeaking ? 'bg-green-500' : 'bg-primary-500'}`}
                      style={{ width: `${Math.min(audioLevel * 100, 100)}%` }}
                    />
                  </div>
                  <span className={`text-xs font-medium ${isSpeaking ? 'text-green-400' : 'text-gray-400'}`}>
                    {isSpeaking ? 'Speaking' : 'Silent'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Video Settings */}
        {tab === 'video' && (
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-2">Camera</label>
              <select
                value={selectedVideoDevice || ''}
                onChange={(e) => switchVideoDevice(e.target.value)}
                className="input"
              >
                <option value="">Default</option>
                {availableDevices.videoinput.map(device => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                  </option>
                ))}
              </select>
            </div>
            
            {/* Video Quality Selector */}
            <div>
              <label className="block text-sm text-gray-400 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-primary-400" />
                Video Quality
              </label>
              <select
                value={videoQuality}
                onChange={(e) => setVideoQuality(e.target.value)}
                className="input"
              >
                <option value="360p">360p (Standard Definition)</option>
                <option value="720p">720p (HD - Recommended)</option>
                <option value="1080p">1080p (Full HD)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">Higher quality requires more bandwidth</p>
            </div>
          </div>
        )}

        {/* Keyboard Shortcuts */}
        <div className="mt-6 pt-4 border-t border-dark-400">
          <h3 className="text-sm font-semibold mb-3">Keyboard Shortcuts</h3>
          <div className="grid grid-cols-2 gap-2 text-sm text-gray-400">
            <div className="flex justify-between"><span>Toggle mic</span><kbd className="bg-dark-400 px-2 py-0.5 rounded text-xs">Ctrl+D</kbd></div>
            <div className="flex justify-between"><span>Toggle camera</span><kbd className="bg-dark-400 px-2 py-0.5 rounded text-xs">Ctrl+E</kbd></div>
            <div className="flex justify-between"><span>Screen share</span><kbd className="bg-dark-400 px-2 py-0.5 rounded text-xs">Ctrl+Shift+S</kbd></div>
            <div className="flex justify-between"><span>Raise hand</span><kbd className="bg-dark-400 px-2 py-0.5 rounded text-xs">Ctrl+Shift+H</kbd></div>
          </div>
        </div>
      </div>
    </div>
  )
}
