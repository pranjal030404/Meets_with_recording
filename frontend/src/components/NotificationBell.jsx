import { useEffect, useState, useRef } from 'react';
import { Bell, Check, Trash2, X, Calendar, Users, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import useNotificationStore from '../store/notificationStore';
import { getSocket } from '../lib/socket';

const NotificationBell = () => {
  const navigate = useNavigate();
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef(null);
  
  const {
    notifications,
    unreadCount,
    fetchNotifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    addNotification,
    incrementUnread
  } = useNotificationStore();

  useEffect(() => {
    fetchNotifications();

    // Listen for new notifications via socket
    const handleNewNotification = (notification) => {
      addNotification(notification);
      // Show browser notification if supported
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(notification.title, {
          body: notification.message,
          icon: '/logo.png'
        });
      }
    };

    const socket = getSocket();
    if (socket) {
      socket.on('notification:new', handleNewNotification);
    }

    return () => {
      if (socket) {
        socket.off('notification:new', handleNewNotification);
      }
    };
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Request notification permission
  useEffect(() => {
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleNotificationClick = async (notification) => {
    // Mark as read
    if (!notification.isRead) {
      await markAsRead(notification._id);
    }

    // Navigate to relevant page
    if (notification.data?.link) {
      navigate(notification.data.link);
      setShowDropdown(false);
    } else if (notification.data?.meetingId) {
      navigate(`/meeting/${notification.data.meetingId.roomId || notification.data.meetingId}`);
      setShowDropdown(false);
    } else if (notification.data?.teamId) {
      navigate(`/teams/${notification.data.teamId}`);
      setShowDropdown(false);
    }
  };

  const getNotificationIcon = (type) => {
    switch (type) {
      case 'meeting_scheduled':
      case 'meeting_reminder':
      case 'meeting_started':
      case 'meeting_cancelled':
        return <Calendar className="w-5 h-5 text-blue-600" />;
      case 'team_invite':
      case 'team_member_added':
        return <Users className="w-5 h-5 text-green-600" />;
      case 'mention':
      case 'chat_message':
        return <MessageSquare className="w-5 h-5 text-purple-600" />;
      default:
        return <Bell className="w-5 h-5 text-gray-600" />;
    }
  };

  const getPriorityColor = (priority) => {
    switch (priority) {
      case 'urgent':
        return 'border-l-4 border-red-500';
      case 'high':
        return 'border-l-4 border-orange-500';
      case 'normal':
        return 'border-l-4 border-blue-500';
      case 'low':
        return 'border-l-4 border-gray-500';
      default:
        return '';
    }
  };

  const formatTime = (date) => {
    const now = new Date();
    const notificationDate = new Date(date);
    const diff = now - notificationDate;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return notificationDate.toLocaleDateString();
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Bell Icon */}
      <button
        onClick={() => setShowDropdown(!showDropdown)}
        className="relative p-2.5 rounded-xl text-gray-400 hover:text-white hover:bg-dark-400/70 border border-transparent hover:border-white/[0.06] transition-all duration-300"
      >
        <Bell className={`w-[18px] h-[18px] transition-transform duration-300 ${showDropdown ? 'rotate-[15deg] scale-110 text-primary-300' : ''}`} />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold leading-none text-white bg-gradient-to-br from-red-500 to-red-600 rounded-full shadow-lg shadow-red-500/30 animate-pop">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown */}
      {showDropdown && (
        <div className="absolute right-0 mt-3 w-[22rem] sm:w-96 glass-strong rounded-2xl shadow-float z-50 max-h-[600px] flex flex-col animate-slide-down overflow-hidden">
          {/* Header */}
          <div className="p-4 border-b border-white/[0.06] flex items-center justify-between">
            <h3 className="font-semibold font-display text-white">Notifications</h3>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={markAllAsRead}
                  className="text-xs text-primary-400 hover:text-primary-300 font-semibold transition"
                >
                  Mark all read
                </button>
              )}
              <button
                onClick={() => setShowDropdown(false)}
                className="p-1.5 hover:bg-dark-400/70 rounded-lg transition-all duration-200 hover:rotate-90"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>
          </div>

          {/* Notifications List */}
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <div className="p-10 text-center">
                <div className="inline-flex w-14 h-14 rounded-2xl bg-dark-300/70 border border-white/[0.05] items-center justify-center mb-3 animate-float">
                  <Bell className="w-6 h-6 text-gray-600" />
                </div>
                <p className="text-gray-500">No notifications</p>
              </div>
            ) : (
              <div className="divide-y divide-white/[0.04]">
                {notifications.map((notification, i) => (
                  <div
                    key={notification._id}
                    onClick={() => handleNotificationClick(notification)}
                    className={`p-4 hover:bg-primary-500/[0.07] cursor-pointer transition-all duration-200 group ${
                      !notification.isRead ? 'bg-primary-600/[0.08]' : ''
                    } ${getPriorityColor(notification.priority)}`}
                    style={{ animation: `fadeInUp 0.35s ease-out ${Math.min(i * 0.05, 0.3)}s both` }}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0 mt-0.5 transition-transform duration-200 group-hover:scale-110">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold text-white text-sm">
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <span className="flex-shrink-0 w-2 h-2 bg-primary-500 rounded-full mt-1 animate-pulse"></span>
                          )}
                        </div>
                        <p className="text-sm text-gray-400 mt-1 line-clamp-2">
                          {notification.message}
                        </p>
                        <div className="flex items-center justify-between mt-2">
                          <span className="text-xs text-gray-500">
                            {formatTime(notification.createdAt)}
                          </span>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNotification(notification._id);
                            }}
                            className="p-1.5 hover:bg-red-500/15 rounded-lg text-gray-500 hover:text-red-400 transition-all duration-200 opacity-0 group-hover:opacity-100"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          {notifications.length > 0 && (
            <div className="p-3 border-t border-white/[0.06] text-center bg-dark-300/40">
              <button
                onClick={() => {
                  navigate('/notifications');
                  setShowDropdown(false);
                }}
                className="text-sm text-primary-400 hover:text-primary-300 font-semibold transition"
              >
                View all notifications
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationBell;
