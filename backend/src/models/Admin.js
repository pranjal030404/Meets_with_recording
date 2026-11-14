import { DataTypes } from 'sequelize';
import bcrypt from 'bcryptjs';
import { sequelize } from '../database/index.js';

// Administrators live in their own table, fully separate from regular Users.
const Admin = sequelize.define('Admin', {
  id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
  name: { type: DataTypes.STRING(100), allowNull: false },
  email: { type: DataTypes.STRING(255), allowNull: false, unique: true, validate: { isEmail: true } },
  password: { type: DataTypes.STRING(255), allowNull: false },
  role: { type: DataTypes.ENUM('admin', 'superadmin'), defaultValue: 'admin' },
  roleId: { type: DataTypes.UUID },
  avatar: { type: DataTypes.STRING(500) },
  lastLoginAt: { type: DataTypes.DATE }
}, {
  tableName: 'Admins',
  hooks: {
    beforeSave: async (admin) => {
      if (admin.changed('password')) {
        admin.password = await bcrypt.hash(admin.password, await bcrypt.genSalt(12));
      }
    }
  },
  defaultScope: { attributes: { exclude: ['password'] } }
});

Admin.prototype.comparePassword = function (candidate) {
  return bcrypt.compare(candidate, this.password);
};

Admin.prototype.toJSON = function () {
  const values = { ...this.get() };
  delete values.password;
  values._id = values.id;
  return values;
};

export default Admin;
