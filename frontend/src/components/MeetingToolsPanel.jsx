import { useState } from 'react'
import {
  X, Languages, Timer, Circle, FileAudio, Radio, Grid2x2, BarChart3, HelpCircle,
  Puzzle, Brush, StickyNote, Download, ArrowLeft
} from 'lucide-react'
import { ToolRow, BackHeader, PrimaryButton } from './tools/ui'
import TimerTool from './tools/TimerTool'
import TranslationTool from './tools/TranslationTool'
import TranscribeTool from './tools/TranscribeTool'
import LiveStreamTool from './tools/LiveStreamTool'
import BreakoutTool from './tools/BreakoutTool'

/**
 * Google Meet-style "Meeting tools" side panel: a Tools tab (translation, timer, record,
 * transcribe, live streaming, breakout rooms, polls, Q&A) and an Add-ons tab.
 * Tools the user isn't allowed to use are listed under "Unavailable", as in Meet.
 */
export default function MeetingToolsPanel({
  roomId, parentRoomId, inBreakout, meeting, user, participants, canManage,
  tools, isRecording, captionsEnabled,
  onToggleRecording, onToggleCaptions, onOpenActivities, onOpenWhiteboard, onOpenNotes,
  onDownloadAttendance, onClose
}) {
  const [tab, setTab] = useState('tools') // 'tools' | 'addons'
  const [view, setView] = useState('home') // 'home' | tool id
  const [showMarketplace, setShowMarketplace] = useState(false)

  const recordingAllowed = meeting?.settings?.allowRecording !== false

  const available = [
    { id: 'translation', icon: <Languages className="w-5 h-5" />, title: 'Speech translation',
      description: tools.translateTo ? `Translating to ${tools.translateTo}` : 'Translate captions into your language' },
    { id: 'timer', icon: <Timer className="w-5 h-5" />, title: 'Timer', description: 'Show a countdown timer' },
  ]
  const unavailable = []

  const record = { id: 'record', icon: <Circle className={`w-5 h-5 ${isRecording ? 'fill-red-500 text-red-500 animate-pulse' : ''}`} />,
    title: isRecording ? 'Stop recording' : 'Record', description: 'Capture the meeting' }
  const transcribe = { id: 'transcribe', icon: <FileAudio className="w-5 h-5" />, title: 'Transcribe',
    description: tools.transcribe.enabled ? 'On · capturing the conversation' : 'Capture the conversation' }
  const live = { id: 'stream', icon: <Radio className="w-5 h-5" />, title: 'Live streaming',
    description: tools.stream ? 'Live now' : 'Stream to view-only users' }
  const breakout = { id: 'breakout', icon: <Grid2x2 className="w-5 h-5" />, title: 'Breakout rooms',
    description: canManage ? 'Break into smaller groups' : 'Join your assigned room' }

  ;(recordingAllowed ? available : unavailable).push(record)
  available.push(transcribe)
  ;(canManage ? available : unavailable).push(live)
  available.push(breakout)
  available.push(
    { id: 'polls', icon: <BarChart3 className="w-5 h-5" />, title: 'Polls', description: 'Send polls to the audience' },
    { id: 'qa', icon: <HelpCircle className="w-5 h-5" />, title: 'Q&A', description: 'Collect questions from the audience' },
  )

  const open = (id) => {
    if (id === 'record') return onToggleRecording()
    if (id === 'polls' || id === 'qa') { onOpenActivities(id); return onClose() }
    setView(id)
  }

  const titles = {
    translation: 'Speech translation', timer: 'Timer', transcribe: 'Transcribe',
    stream: 'Live streaming', breakout: 'Breakout rooms'
  }

  const renderTool = () => {
    switch (view) {
      case 'translation':
        return <TranslationTool tools={tools} captionsEnabled={captionsEnabled} onToggleCaptions={onToggleCaptions} />
      case 'timer':
        return <TimerTool tools={tools} canManage={canManage} />
      case 'transcribe':
        return <TranscribeTool tools={tools} canManage={canManage} title={meeting?.title} />
      case 'stream':
        return <LiveStreamTool tools={tools} roomId={parentRoomId} canManage={canManage} />
      case 'breakout':
        return meeting?.id && (
          <BreakoutTool meetingId={meeting.id} parentRoomId={parentRoomId} inBreakout={inBreakout}
            canManage={canManage} participants={participants} user={user} />
        )
      default:
        return null
    }
  }

  const addOns = [
    { icon: <Brush className="w-5 h-5" />, title: 'Whiteboard', description: 'Sketch ideas together', run: onOpenWhiteboard },
    { icon: <StickyNote className="w-5 h-5" />, title: 'Shared notes', description: 'Take notes everyone can edit', run: onOpenNotes },
    ...(canManage ? [{ icon: <Download className="w-5 h-5" />, title: 'Attendance report', description: 'Download who joined and when', run: onDownloadAttendance }] : []),
  ]

  return (
    <div className="side-panel bg-dark-200 border-l border-white/[0.06]">
      <div className="p-4 flex items-center justify-between">
        <h2 className="font-semibold text-lg">Meeting tools</h2>
        <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded transition-colors" aria-label="Close">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex border-b border-dark-400">
        {[['tools', 'Tools'], ['addons', 'Add-ons']].map(([id, label]) => (
          <button key={id} onClick={() => { setTab(id); setView('home'); setShowMarketplace(false) }}
            className={`flex-1 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              tab === id ? 'border-primary-400 text-primary-300' : 'border-transparent text-gray-400 hover:text-white'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {tab === 'tools' && view === 'home' && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {available.map(tool => (
            <ToolRow key={tool.id} icon={tool.icon} title={tool.title} description={tool.description} onClick={() => open(tool.id)} />
          ))}

          {unavailable.length > 0 && (
            <div className="pt-4 space-y-2">
              <h3 className="text-sm font-semibold">Unavailable</h3>
              <p className="text-xs text-gray-400 pb-1">
                Access and management is limited by this meeting's settings or your role.
              </p>
              {unavailable.map(tool => (
                <ToolRow key={tool.id} icon={tool.icon} title={tool.title} description={tool.description} disabled />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === 'tools' && view !== 'home' && (
        <div className="flex-1 min-h-0 flex flex-col overflow-y-auto">
          <BackHeader title={titles[view]} onBack={() => setView('home')} />
          {renderTool()}
        </div>
      )}

      {tab === 'addons' && !showMarketplace && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 gap-3">
          <Puzzle className="w-8 h-8 text-primary-400" />
          <h3 className="font-semibold text-gray-100">Work up ideas together</h3>
          <p className="text-sm text-gray-400">Add-ons extend the meeting with extra tools for the whole group.</p>
          <PrimaryButton onClick={() => setShowMarketplace(true)} className="mt-2">Browse the Marketplace</PrimaryButton>
        </div>
      )}

      {tab === 'addons' && showMarketplace && (
        <div className="flex-1 overflow-y-auto">
          <button onClick={() => setShowMarketplace(false)}
            className="flex items-center gap-1 px-3 py-3 text-sm font-semibold text-gray-200 hover:text-white">
            <ArrowLeft className="w-4 h-4" /> Marketplace
          </button>
          <div className="px-3 pb-3 space-y-2">
            {addOns.map(addOn => (
              <ToolRow key={addOn.title} icon={addOn.icon} title={addOn.title} description={addOn.description}
                onClick={() => { addOn.run(); onClose() }} />
            ))}
            <p className="text-xs text-gray-500 pt-2 px-1">Third-party add-ons aren't available yet.</p>
          </div>
        </div>
      )}
    </div>
  )
}
