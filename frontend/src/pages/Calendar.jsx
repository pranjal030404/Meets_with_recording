import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, Plus, Clock, Users, Video, Sparkles, CheckSquare } from 'lucide-react';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';
import ScheduleMeetingModal from '../components/ScheduleMeetingModal';
import AppShell from '../components/AppShell';

const Calendar = () => {
  const navigate = useNavigate();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [view, setView] = useState('month'); // month, week, day
  const [meetings, setMeetings] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
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
      const { data } = await api.get('/meetings?status=scheduled&limit=2000');
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

  const handleDateClick = (date) => {
    setSelectedDate(date);
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
          <button onClick={() => { setSelectedDate(null); setShowScheduleModal(true); }} className="btn btn-primary">
            <Plus className="w-5 h-5" />
            Schedule meeting
          </button>
        </div>

        {/* Calendar Navigation */}
        <div className="bg-dark-200/70 rounded-2xl p-3 sm:p-6 border border-white/[0.06]">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-6">
            <h2 className="whitespace-nowrap font-display text-lg font-semibold sm:text-2xl">{monthName}</h2>
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                onClick={prevMonth}
                aria-label="Previous month"
                className="p-2.5 hover:bg-dark-400/80 rounded-xl transition-colors text-gray-300 hover:text-white border border-transparent hover:border-white/[0.06]"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-2 sm:px-4 py-2 text-sm font-semibold text-gray-300 hover:bg-primary-500/15 hover:text-white rounded-xl transition-colors border border-transparent hover:border-primary-500/25"
              >
                Today
              </button>
              <button
                onClick={nextMonth}
                aria-label="Next month"
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
                              navigate(`/join/${meeting.roomId}`); // details first, then join
                            }}
                            className="text-xs bg-primary-600/25 border border-primary-500/25 text-primary-200 px-1 xl:px-2 py-1 rounded-lg truncate hover:from-primary-600/50 hover:border-primary-400/50 transition-colors"
                            title={meeting.title}
                          >
                            <div className="flex items-center gap-1">
                              <Video className="hidden xl:block w-3 h-3 shrink-0" />
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
                            className={`text-xs border px-1 xl:px-2 py-1 rounded-lg truncate flex items-center gap-1 transition-colors ${taskChip(task)}`}
                            title={`Task: ${task.title}`}
                          >
                            <CheckSquare className="hidden xl:block w-3 h-3 shrink-0" />
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

          {/* Phones only have room for dots in the grid, so the month's items are listed here */}
          <ul className="sm:hidden mt-4 space-y-2">
            {days.filter(Boolean).flatMap(day => [
              ...getMeetingsForDate(day).map(m => ({ key: `m${m._id}`, day, title: m.title, Icon: Video, to: `/join/${m.roomId}`, time: new Date(m.scheduledAt) })),
              ...getTasksForDate(day).map(t => ({ key: `t${t.id}`, day, title: t.title, Icon: CheckSquare, to: '/tasks' }))
            ]).map(({ key, day, title, Icon, to, time }) => (
              <li key={key}>
                <button onClick={() => navigate(to)} className="w-full flex items-center gap-3 rounded-xl bg-dark-300/60 border border-white/[0.06] px-3 py-2.5 text-left">
                  <Icon className="w-4 h-4 text-primary-300" />
                  <span className="min-w-0 flex-1 truncate text-sm text-gray-200">{title}</span>
                  <span className="timecode shrink-0">
                    {day.toLocaleDateString([], { day: 'numeric', month: 'short' })}
                    {time && `, ${time.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>

      {showScheduleModal && (
        <ScheduleMeetingModal day={selectedDate} onScheduled={fetchMeetings} onClose={() => setShowScheduleModal(false)} />
      )}
      </div>
    </AppShell>
  );
};

export default Calendar;
