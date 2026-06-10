import { DataTypes } from 'sequelize';
import { v4 as uuidv4 } from 'uuid';
import { sequelize } from '../database/index.js';

const Team = sequelize.define('Team', {
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    validate: {
      len: [2, 100]
    }
  },
  description: {
    type: DataTypes.STRING(500)
  },
  ownerId: {
    type: DataTypes.UUID,
    allowNull: false
  },
  inviteCode: {
    type: DataTypes.STRING(50),
    unique: true,
    defaultValue: () => uuidv4().split('-')[0]
  },
  settings: {
    type: DataTypes.JSON,
    defaultValue: {
      allowMemberInvite: false,
      allowGuestJoin: true,
      defaultMeetingSettings: {
        waitingRoom: false,
        muteOnEntry: false,
        allowRecording: true
      }
    }
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'Teams',
  hooks: {
    beforeCreate: async (team) => {
      if (team.isNewRecord) {
        team.inviteCode = team.inviteCode || uuidv4().split('-')[0];
      }
    }
  }
});

Team.prototype.isMember = function(userId) {
  return this.members && this.members.some(m => {
    const memberId = m.userId || m.id;
    return memberId.toString() === userId.toString();
  });
};

Team.prototype.getMemberRole = function(userId) {
  const member = this.members && this.members.find(m => {
    const memberId = m.userId || m.id;
    return memberId.toString() === userId.toString();
  });
  return member ? member.role : null;
};

Team.prototype.isOwnerOrAdmin = function(userId) {
  const role = this.getMemberRole(userId);
  return role === 'owner' || role === 'admin';
};

Team.prototype.addMember = function(userId, role = 'member') {
  if (!this.isMember(userId)) {
    if (!this.members) this.members = [];
    this.members.push({ userId, role });
  }
  return this;
};

Team.prototype.removeMember = function(userId) {
  if (this.members) {
    this.members = this.members.filter(m => {
      const memberId = m.userId || m.id;
      return memberId.toString() !== userId.toString();
    });
  }
  return this;
};

Team.prototype.toJSON = function() {
  const values = { ...this.get() };
  values._id = values.id;
  if (values.members) {
    values.memberCount = values.members.length;
  }
  return values;
};

export default Team;
