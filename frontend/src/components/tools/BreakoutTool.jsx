import { useState, useEffect, useCallback, useMemo } from 'react'
import { DoorOpen, LogOut } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../../lib/api'
import { getSocket } from '../../lib/socket'
import { goToRoom } from '../../lib/breakout'
import { PrimaryButton, DangerButton, selectClass } from './ui'

const MAX_ROOMS = 10

const participantId = (p) => p.user?.id || p.user?._id
const participantName = (p) => p.user?.name || 'Participant'

export default function BreakoutTool({ meetingId, parentRoomId, inBreakout, canManage, participants, user }) {
  const [rooms, setRooms] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [roomCount, setRoomCount] = useState(2)
  const [assignment, setAssignment] = useState({}) // userId -> room index

  const others = useMemo(() => participants.filter(p => participantId(p) && participantId(p) !== user?.id), [participants, user?.id])

  const names = useMemo(() => {
    const map = new Map(others.map(p => [participantId(p), participantName(p)]))
    if (user?.id) map.set(user.id, user.name)
    return map
  }, [others, user])

  const load = useCallback(async () => {
    try {
      const { data } = await api.get(`/breakout/meeting/${meetingId}`)
      setRooms(data.data.breakoutRooms)
    } catch {
      toast.error('Failed to load breakout rooms')
    } finally {
      setLoading(false)
    }
  }, [meetingId])

  useEffect(() => {
    load()
    const socket = getSocket()
    socket?.on('breakout:changed', load)
    return () => socket?.off('breakout:changed', load)
  }, [load])

  const autoAssign = useCallback(() => {
    setAssignment(Object.fromEntries(others.map((p, i) => [participantId(p), i % roomCount])))
  }, [others, roomCount])

  // Spread people evenly whenever the room count or the roster changes
  useEffect(() => { autoAssign() }, [autoAssign])

  const openRooms = async () => {
    setBusy(true)
    try {
      const groups = Array.from({ length: roomCount }, (_, i) => ({
        name: `Room ${i + 1}`,
        participantIds: others.map(participantId).filter(id => assignment[id] === i)
      }))
      await api.post('/breakout', { meetingId, rooms: groups })
      toast.success('Breakout rooms are open')
      await load()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not open breakout rooms')
    } finally {
      setBusy(false)
    }
  }

  const closeAll = async () => {
    setBusy(true)
    try {
      await api.post('/breakout/close-all', { meetingId })
      toast.success('Breakout rooms closed')
      await load()
    } catch (error) {
      toast.error(error.response?.data?.message || 'Could not close breakout rooms')
    } finally {
      setBusy(false)
    }
  }

  const enter = async (room) => {
    // Assigned people get their join time recorded; hosts can also visit unassigned rooms
    if (room.assignedToMe) { try { await api.post(`/breakout/${room.id}/join`) } catch {} }
    goToRoom(room.joinRoomId)
  }

  return (
    <div className="p-4 space-y-5 overflow-y-auto">
      {inBreakout && (
        <PrimaryButton onClick={() => goToRoom(parentRoomId)} className="flex items-center justify-center gap-2">
          <LogOut className="w-4 h-4" /> Return to main room
        </PrimaryButton>
      )}

      {loading ? (
        <p className="text-sm text-gray-500 text-center">Loading…</p>
      ) : rooms.length > 0 ? (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">Open rooms</p>
          {rooms.map(room => {
            const members = (room.assignedParticipants || []).map(p => names.get(p.userId) || 'Participant')
            return (
              <div key={room.id} className="rounded-2xl bg-dark-300/70 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {room.name}{room.assignedToMe ? ' · your room' : ''}
                    </p>
                    <p className="text-xs text-gray-500">{members.length} assigned</p>
                  </div>
                  <button onClick={() => enter(room)}
                    className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary-500/20 text-primary-300 hover:bg-primary-500/30 text-xs font-semibold transition-colors">
                    <DoorOpen className="w-3.5 h-3.5" /> Join
                  </button>
                </div>
                {members.length > 0 && <p className="mt-2 text-xs text-gray-400">{members.join(', ')}</p>}
              </div>
            )
          })}
          {canManage && <DangerButton onClick={closeAll} disabled={busy}>Close all rooms</DangerButton>}
        </div>
      ) : (
        !canManage && <p className="text-sm text-gray-400 text-center">No breakout rooms are open. If the host opens them, you'll be told which room is yours.</p>
      )}

      {canManage && !inBreakout && (
        <div className="space-y-3">
          <p className="text-xs text-gray-500">{rooms.length > 0 ? 'Replace with new rooms' : 'Create rooms'}</p>
          <label className="block">
            <span className="text-sm text-gray-300">Number of rooms</span>
            <select value={roomCount} onChange={e => setRoomCount(Number(e.target.value))} className={`${selectClass} mt-1.5`}>
              {Array.from({ length: MAX_ROOMS }, (_, i) => i + 1).map(n => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>

          {others.length === 0 ? (
            <p className="text-xs text-gray-500">Nobody else is in the meeting yet. Rooms will be created empty.</p>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-gray-300">Assign people</span>
                <button onClick={autoAssign} className="text-xs text-primary-400 hover:text-primary-300">Re-split evenly</button>
              </div>
              {others.map(p => (
                <div key={participantId(p)} className="flex items-center justify-between gap-2">
                  <span className="text-sm truncate">{participantName(p)}</span>
                  <select value={assignment[participantId(p)] ?? 0}
                    onChange={e => setAssignment(prev => ({ ...prev, [participantId(p)]: Number(e.target.value) }))}
                    className="shrink-0 bg-dark-300 border border-white/[0.08] rounded-lg px-2 py-1 text-sm outline-none">
                    {Array.from({ length: roomCount }, (_, i) => <option key={i} value={i}>Room {i + 1}</option>)}
                  </select>
                </div>
              ))}
            </div>
          )}

          <PrimaryButton onClick={openRooms} disabled={busy}>Open breakout rooms</PrimaryButton>
        </div>
      )}
    </div>
  )
}
