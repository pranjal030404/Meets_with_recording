import { X, Check, XCircle } from 'lucide-react'

export default function WaitingRoom({ waitingUsers = [], onAdmit, onDeny, onClose }) {
  if (waitingUsers.length === 0) return null

  return (
    <div className="absolute top-4 right-4 bg-dark-200 border border-dark-400 rounded-xl shadow-2xl p-4 w-80 z-30 animate-slide-down">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-semibold text-sm">Waiting Room ({waitingUsers.length})</h3>
        {onClose && (
          <button onClick={onClose} className="p-1 hover:bg-dark-400 rounded">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>
      <div className="space-y-2 max-h-48 overflow-y-auto">
        {waitingUsers.map(({ user, socketId }) => (
          <div key={socketId} className="flex items-center justify-between bg-dark-300 rounded-lg p-2">
            <div className="flex items-center gap-2">
              <img src={user.avatar} alt={user.name} className="w-8 h-8 rounded-full" />
              <span className="text-sm font-medium">{user.name}</span>
            </div>
            <div className="flex gap-1">
              <button onClick={() => onAdmit(socketId)}
                className="p-1.5 bg-green-600 hover:bg-green-700 rounded-lg transition-colors" title="Admit">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => onDeny(socketId)}
                className="p-1.5 bg-red-600 hover:bg-red-700 rounded-lg transition-colors" title="Deny">
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        ))}
      </div>
      <button onClick={() => waitingUsers.forEach(u => onAdmit(u.socketId))}
        className="mt-2 w-full btn btn-primary text-sm py-1.5">
        Admit All
      </button>
    </div>
  )
}
