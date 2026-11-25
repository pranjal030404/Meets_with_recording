import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Users, Video, Sparkles, CheckSquare } from 'lucide-react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useMeetingStore } from '../store/meetingStore';
import useTeamStore from '../store/teamStore';
import { useAuthStore } from '../store/authStore';
import AppShell from '../components/AppShell';

const Calendar = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createMeeting } = useMeetingStore();
  const { teams, fetchTeams } = useTeamStore();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // month, week, day
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  const [newMeeting, setNewMeeting] = useState({
    title: '',
    description: '',
    scheduledAt: '',
    teamId: '',
    invitees: [],
    reminders: [
      { time: 15, unit: 'minutes' },
      { time: 1, unit: 'hours' }
    ]
  });

  useEffect(() => {
    fetchTeams();
    fetchMeetings();
    api.get('/tasks', { params: { scope: 'mine' } })
      .then(res => setTasks((res.data?.data?.tasks || []).filter(t => t.dueDate)))
      .catch(() => {});
  }, []);

  const isTaskOverdue = (t) => t.status !== 'done' && new Date(t.dueDate) < new Date(new Date().setHours(0, 0, 0, 0));

  // color follows progress: todo = slate, in progress = amber, done = green, overdue = red
  const taskChip = (t) => {
    if (t.status === 'done') return 'bg-emerald-500/10 border-emerald-500/25 text-emerald-200 line-through';
    if (isTaskOverdue(t)) return 'bg-red-500/15 border-red-500/40 text-red-300';
    if (t.status === 'in_progress') return 'bg-amber-500/10 border-amber-500/30 text-amber-200';
    return 'bg-slate-500/15 border-slate-400/30 text-slate-200';
  };
  const taskDot = (t) => t.status === 'done' ? 'bg-emerald-400' : isTaskOverdue(t) ? 'bg-red-400' : t.status === 'in_progress' ? 'bg-amber-400' : 'bg-slate-400';

  const getTasksForDate = (date) => {
    if (!date) return [];
    return tasks.filter(t => new Date(t.dueDate).toDateString() === date.toDateString());
  };

  const fetchMeetings = async () => {
    setLoading(true);
    try {
      // Fetch scheduled meetings
      const response = await fetch('/api/meetings?status=scheduled', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });
      const data = await response.json();
      if (data.success) {
        setMeetings(data.data.meetings);
      }
    } catch (error) {
      console.error('Failed to fetch meetings', error);
    } finally {
      setLoading(false);
    }
  };

  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDayOfWeek = firstDay.getDay();

    const days = [];

    // Add previous month days
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null);
    }

    // Add current month days
    for (let i = 1; i <= daysInMonth; i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const getMeetingsForDate = (date) => {
    if (!date) return [];
    return meetings.filter(meeting => {
      const meetingDate = new Date(meeting.scheduledAt);
      return meetingDate.toDateString() === date.toDateString();
    });
  };

  const handleScheduleMeeting = async (e) => {
    e.preventDefault();
    try {
      const scheduledDateTime = new Date(newMeeting.scheduledAt);

      const meetingData = {
        ...newMeeting,
        scheduledAt: scheduledDateTime.toISOString(),
        isInstant: false
      };

      const result = await createMeeting({ ...meetingData, teamId: meetingData.teamId || undefined });
      if (!result.success) {
        toast.error(result.message || 'Could not schedule the meeting');
        return;
      }
      toast.success('Meeting scheduled');
      setShowScheduleModal(false);
      setNewMeeting({
        title: '',
        description: '',
        scheduledAt: '',
        teamId: '',
        invitees: [],
        reminders: [
          { time: 15, unit: 'minutes' },
          { time: 1, unit: 'hours' }
        ]
      });
      fetchMeetings();
    } catch (error) {
      toast.error('Failed to schedule meeting');
    }
  };

  const handleDateClick = (date) => {
    setSelectedDate(date);
    // Pre-fill datetime for scheduling
    const dateTimeStr = date.toISOString().slice(0, 16);
    setNewMeeting({ ...newMeeting, scheduledAt: dateTimeStr });
    setShowScheduleModal(true);
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1));
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1, 1));
  };

  const days = getDaysInMonth(currentDate);
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <AppShell wide>
      <div>
      <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-8 lg:py-10">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-end gap-6 mb-10">
          <div>
<h1 className="page-title">
              Calendar
            </h1>
            <p className="page-sub">Meetings and task deadlines</p>
          </div>
          <button onClick={() => setShowScheduleModal(true)} className="btn btn-primary">
            <Plus className="w-5 h-5" />
            Schedule meeting
          </button>
        </div>

        {/* Calendar Navigation */}
        <div className="bg-dark-200/70 rounded-2xl p-5 sm:p-6 border border-white/[0.06]">
          <div className="flex items-center justify-between mb-6">
            <h2 className="whitespace-nowrap font-display text-lg font-semibold sm:text-2xl">{monthName}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-2.5 hover:bg-dark-400/80 rounded-xl transition-colors text-gray-300 hover:text-white border border-transparent hover:border-white/[0.06]"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-primary-500/15 hover:text-white rounded-xl transition-colors border border-transparent hover:border-primary-500/25"
              >
                Today
              </button>
              <button
                onClick={nextMonth}
                className="p-2.5 hover:bg-dark-400/80 rounded-xl transition-colors text-gray-300 hover:text-white border border-transparent hover:border-white/[0.06]"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-1 sm:gap-2">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-[10px] sm:text-xs font-semibold text-gray-500 py-1 sm:py-2">
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {days.map((day, index) => {
              const dayMeetings = day ? getMeetingsForDate(day) : [];
              const dayTasks = day ? getTasksForDate(day) : [];
              const isToday = day && day.toDateString() === new Date().toDateString();
              const isPast = day && day < new Date(new Date().setHours(0, 0, 0, 0));

              return (
                <div
                  key={index}
                  onClick={() => day && !isPast && handleDateClick(day)}
                  className={`group min-h-14 sm:min-h-24 min-w-0 p-1 sm:p-2 border rounded-xl transition-colors animate-scale-in ${
                    day
                      ? isPast
                        ? 'bg-dark-300/30 cursor-not-allowed border-white/[0.03]'
                        : 'bg-dark-300/60 hover:bg-dark-400/70 cursor-pointer border-white/[0.05] hover:border-primary-500/40'
                      : 'bg-transparent border-transparent'
                  } ${isToday ? 'border-primary-500/70 ring-2 ring-primary-500/20' : ''}`}
                  style={{ animationDelay: `${Math.min(index * 0.012, 0.3)}s` }}
                >
                  {day && (
                    <>
                      <div className={`text-sm font-semibold mb-1.5 flex items-center justify-center rounded-full transition-colors ${
                        isToday ? 'w-7 h-7 text-ink bg-primary-500' : isPast ? 'text-gray-600' : 'text-gray-200'
                      } ${!isToday ? 'group-hover:text-white' : ''}`}>
                        {day.getDate()}
                      </div>
                      {(dayMeetings.length + dayTasks.length) > 0 && (
                        <div className="sm:hidden flex justify-center gap-0.5 mt-0.5">
                          {dayMeetings.slice(0, 3).map(m => <span key={m._id} className="w-1.5 h-1.5 rounded-full bg-primary-400" />)}
                          {dayTasks.slice(0, 3).map(t => <span key={t.id} className={`w-1.5 h-1.5 rounded-full ${taskDot(t)}`} />)}
                        </div>
                      )}
                      <div className="hidden sm:block space-y-1">
                        {dayMeetings.slice(0, 2).map(meeting => (
                          <div
                            key={meeting._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/meeting/${meeting.roomId}`);
                            }}
                            className="text-xs bg-primary-600/25 border border-primary-500/25 text-primary-200 px-2 py-1 rounded-lg truncate hover:from-primary-600/50 hover:border-primary-400/50 transition-colors"
                            title={meeting.title}
                          >
                            <div className="flex items-center gap-1">
                              <Video className="w-3 h-3 shrink-0" />
                              <span className="truncate">{meeting.title}</span>
                            </div>
                            <div className="text-primary-300/80 text-[10px] font-medium">
                              {new Date(meeting.scheduledAt).toLocaleTimeString('en-US', {
                                hour: 'numeric',
                                minute: '2-digit'
                              })}
                            </div>
                          </div>
                        ))}
                        {dayTasks.slice(0, 2).map(task => (
                          <div
                            key={task.id}
                            onClick={(e) => { e.stopPropagation(); navigate('/tasks'); }}
                            className={`text-xs border px-2 py-1 rounded-lg truncate flex items-center gap-1 transition-colors ${taskChip(task)}`}
                            title={`Task: ${task.title}`}
                          >
                            <CheckSquare className="w-3 h-3 shrink-0" />
                            <span className="truncate">{task.title}</span>
                          </div>
                        ))}
                        {dayMeetings.length > 2 && (
                          <div className="text-xs text-gray-500 px-2 group-hover:text-primary-300 transition-colors">
                            +{dayMeetings.length - 2} more
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="modal-backdrop">
          <div className="modal-content max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-semibold font-display mb-5">Schedule meeting</h2>
            <form onSubmit={handleScheduleMeeting}>
              <div className="space-y-4">
                <div className="group">
                  <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Title *</label>
                  <input
                    type="text"
                    value={newMeeting.title}
                    onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                    className="input"
                    required
                    placeholder="Team Standup"
                  />
                </div>

                <div className="group">
                  <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Description</label>
                  <textarea
                    value={newMeeting.description}
                    onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                    className="input"
                    rows="3"
                    placeholder="Optional meeting description"
                  />
                </div>

                <div className="group">
                  <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={newMeeting.scheduledAt}
                    onChange={(e) => setNewMeeting({ ...newMeeting, scheduledAt: e.target.value })}
                    className="input"
                    required
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>

                <div className="group">
                  <label className="block text-sm font-medium text-gray-300 mb-2 transition-colors group-focus-within:text-primary-300">Team (Optional)</label>
                  <select
                    value={newMeeting.teamId}
                    onChange={(e) => setNewMeeting({ ...newMeeting, teamId: e.target.value })}
                    className="input"
                  >
                    <option value="">None (Personal Meeting)</option>
                    {teams.map(team => (
                      <option key={team._id} value={team._id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-2.5">Reminders</label>
                  <div className="space-y-2">
                    {newMeeting.reminders.map((reminder, index) => (
                      <div key={index} className="flex items-center gap-2.5 text-gray-300 bg-dark-300/60 border border-white/[0.05] rounded-xl px-3.5 py-2.5">
                        <Clock className="w-4 h-4 text-primary-400" />
                        <span className="text-sm">
                          {reminder.time} {reminder.unit} before
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-7">
                <button
                  type="button"
                  onClick={() => {
                    setShowScheduleModal(false);
                    setNewMeeting({
                      title: '',
                      description: '',
                      scheduledAt: '',
                      teamId: '',
                      invitees: [],
                      reminders: [
                        { time: 15, unit: 'minutes' },
                        { time: 1, unit: 'hours' }
                      ]
                    });
                  }}
                  className="btn btn-secondary flex-1"
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary flex-1">
                  <Plus className="w-4 h-4" />
                  Schedule meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      </div>
    </AppShell>
  );
};

export default Calendar;
