import { DataTypes } from 'sequelize';
import { sequelize } from '../database/index.js';

const Task = sequelize.define('Task', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('todo', 'in_progress', 'done'),
    defaultValue: 'todo'
  },
  priority: {
    type: DataTypes.ENUM('low', 'medium', 'high', 'urgent'),
    defaultValue: 'medium'
  },
  dueDate: {
    type: DataTypes.DATE
  },
  assigneeId: {
    type: DataTypes.UUID
  },
  createdById: {
    type: DataTypes.UUID,
    allowNull: false
  },
  teamId: {
    type: DataTypes.UUID
  },
  parentId: {
    type: DataTypes.UUID
  },
  messageId: {
    type: DataTypes.UUID
  },
  meetingId: {
    type: DataTypes.UUID
  },
  labels: {
    type: DataTypes.JSON,
    defaultValue: []
  },
  completedAt: {
    type: DataTypes.DATE
  }
}, {
  tableName: 'Tasks',
  hooks: {
    beforeUpdate: (task) => {
      if (task.changed('status')) {
        task.completedAt = task.status === 'done' ? new Date() : null;
      }
    }
  }
});

Task.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  return values;
};

export default Task;
