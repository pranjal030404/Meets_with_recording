import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Users, Video, Sparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useMeetingStore } from '../store/meetingStore';
import useTeamStore from '../store/teamStore';
import { useAuthStore } from '../store/authStore';

const Calendar = () => {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { createMeeting } = useMeetingStore();
  const { teams, fetchTeams } = useTeamStore();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // month, week, day
  const [meetings, setMeetings] = useState([]);
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
  }, []);

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

      await createMeeting(meetingData);
      toast.success('Meeting scheduled successfully!');
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
    <div className="min-h-screen bg-dark-100 px-4 sm:px-6 py-8 aurora-bg noise">
      {/* Animated background */}
      <div className="blob -top-40 right-1/3 h-96 w-96 bg-primary-600/15 animate-aurora" />
      <div className="blob bottom-0 -left-24 h-80 w-80 bg-accent-600/10 animate-aurora-slow" />

      <div className="relative max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex flex-wrap justify-between items-end gap-6 mb-10 animate-fade-in-up">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-primary-400/25 bg-primary-500/10 px-3.5 py-1.5 text-xs font-semibold text-primary-200 mb-4">
              <Sparkles className="h-3.5 w-3.5" />
              Never miss a meeting
            </div>
            <h1 className="text-3xl sm:text-4xl font-bold font-display tracking-tight">
              Meeting <span className="gradient-text">Calendar</span>
            </h1>
            <p className="text-gray-400 mt-2">Schedule and manage meetings</p>
          </div>
          <button onClick={() => setShowScheduleModal(true)} className="btn btn-primary">
            <Plus className="w-5 h-5" />
            Schedule Meeting
          </button>
        </div>

        {/* Calendar Navigation */}
        <div className="bg-dark-200/70 backdrop-blur-sm rounded-3xl shadow-card p-5 sm:p-6 border border-white/[0.06] animate-fade-in-up stagger-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-2xl font-bold font-display">{monthName}</h2>
            <div className="flex items-center gap-2">
              <button
                onClick={prevMonth}
                className="p-2.5 hover:bg-dark-400/80 rounded-xl transition-all duration-200 text-gray-300 hover:text-white hover:scale-105 border border-transparent hover:border-white/[0.06]"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-primary-500/15 hover:text-white rounded-xl transition-all duration-200 border border-transparent hover:border-primary-500/25"
              >
                Today
              </button>
              <button
                onClick={nextMonth}
                className="p-2.5 hover:bg-dark-400/80 rounded-xl transition-all duration-200 text-gray-300 hover:text-white hover:scale-105 border border-transparent hover:border-white/[0.06]"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Calendar Grid */}
          <div className="grid grid-cols-7 gap-2">
            {/* Day headers */}
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="text-center text-xs font-semibold uppercase tracking-wider text-gray-500 py-2">
                {day}
              </div>
            ))}

            {/* Calendar days */}
            {days.map((day, index) => {
              const dayMeetings = day ? getMeetingsForDate(day) : [];
              const isToday = day && day.toDateString() === new Date().toDateString();
              const isPast = day && day < new Date(new Date().setHours(0, 0, 0, 0));

              return (
                <div
                  key={index}
                  onClick={() => day && !isPast && handleDateClick(day)}
                  className={`group min-h-24 p-2 border rounded-xl transition-all duration-300 animate-scale-in ${
                    day
                      ? isPast
                        ? 'bg-dark-300/30 cursor-not-allowed border-white/[0.03]'
                        : 'bg-dark-300/60 hover:bg-dark-400/70 cursor-pointer border-white/[0.05] hover:border-primary-500/40 hover:-translate-y-0.5 hover:shadow-glow'
                      : 'bg-transparent border-transparent'
                  } ${isToday ? 'border-primary-500/70 ring-2 ring-primary-500/20 shadow-glow' : ''}`}
                  style={{ animationDelay: `${Math.min(index * 0.012, 0.3)}s` }}
                >
                  {day && (
                    <>
                      <div className={`text-sm font-semibold mb-1.5 flex items-center justify-center rounded-full transition-colors ${
                        isToday ? 'w-7 h-7 text-white bg-gradient-to-br from-primary-500 to-primary-700 shadow-md shadow-primary-500/30' : isPast ? 'text-gray-600' : 'text-gray-200'
                      } ${!isToday ? 'group-hover:text-white' : ''}`}>
                        {day.getDate()}
                      </div>
                      <div className="space-y-1">
                        {dayMeetings.slice(0, 2).map(meeting => (
                          <div
                            key={meeting._id}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/meeting/${meeting.roomId}`);
                            }}
                            className="text-xs bg-gradient-to-r from-primary-600/25 to-accent-600/15 border border-primary-500/25 text-primary-200 px-2 py-1 rounded-lg truncate hover:from-primary-600/50 hover:border-primary-400/50 hover:scale-[1.03] transition-all duration-200"
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
            <h2 className="text-2xl font-bold font-display mb-5">Schedule Meeting</h2>
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
                  Schedule Meeting
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Calendar;
