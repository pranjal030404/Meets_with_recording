import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Users, Video } from 'lucide-react';
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
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Calendar</h1>
          <p className="text-gray-600 mt-2">Schedule and manage meetings</p>
        </div>
        <button
          onClick={() => setShowScheduleModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-5 h-5" />
          Schedule Meeting
        </button>
      </div>

      {/* Calendar Navigation */}
      <div className="bg-white rounded-lg shadow-md p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-bold text-gray-900">{monthName}</h2>
          <div className="flex items-center gap-2">
            <button
              onClick={prevMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <button
              onClick={() => setCurrentDate(new Date())}
              className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition"
            >
              Today
            </button>
            <button
              onClick={nextMonth}
              className="p-2 hover:bg-gray-100 rounded-lg transition"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div className="grid grid-cols-7 gap-2">
          {/* Day headers */}
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
            <div key={day} className="text-center font-semibold text-gray-600 py-2">
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
                className={`min-h-24 p-2 border rounded-lg ${
                  day
                    ? isPast
                      ? 'bg-gray-50 cursor-not-allowed'
                      : 'bg-white hover:bg-blue-50 cursor-pointer transition'
                    : 'bg-gray-50'
                } ${isToday ? 'border-blue-500 border-2' : 'border-gray-200'}`}
              >
                {day && (
                  <>
                    <div className={`text-sm font-medium mb-1 ${
                      isToday ? 'text-blue-600' : isPast ? 'text-gray-400' : 'text-gray-900'
                    }`}>
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
                          className="text-xs bg-blue-100 text-blue-800 px-2 py-1 rounded truncate hover:bg-blue-200"
                          title={meeting.title}
                        >
                          <div className="flex items-center gap-1">
                            <Video className="w-3 h-3" />
                            <span className="truncate">{meeting.title}</span>
                          </div>
                          <div className="text-blue-600">
                            {new Date(meeting.scheduledAt).toLocaleTimeString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit'
                            })}
                          </div>
                        </div>
                      ))}
                      {dayMeetings.length > 2 && (
                        <div className="text-xs text-gray-500 px-2">
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

      {/* Schedule Meeting Modal */}
      {showScheduleModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-2xl font-bold mb-4">Schedule Meeting</h2>
            <form onSubmit={handleScheduleMeeting}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Title *</label>
                  <input
                    type="text"
                    value={newMeeting.title}
                    onChange={(e) => setNewMeeting({ ...newMeeting, title: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                    placeholder="Team Standup"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Description</label>
                  <textarea
                    value={newMeeting.description}
                    onChange={(e) => setNewMeeting({ ...newMeeting, description: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    rows="3"
                    placeholder="Optional meeting description"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={newMeeting.scheduledAt}
                    onChange={(e) => setNewMeeting({ ...newMeeting, scheduledAt: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    required
                    min={new Date().toISOString().slice(0, 16)}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Team (Optional)</label>
                  <select
                    value={newMeeting.teamId}
                    onChange={(e) => setNewMeeting({ ...newMeeting, teamId: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">None (Personal Meeting)</option>
                    {teams.map(team => (
                      <option key={team._id} value={team._id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Reminders</label>
                  <div className="space-y-2">
                    {newMeeting.reminders.map((reminder, index) => (
                      <div key={index} className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-gray-500" />
                        <span className="text-sm text-gray-700">
                          {reminder.time} {reminder.unit} before
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex gap-3 mt-6">
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
                  className="flex-1 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
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
