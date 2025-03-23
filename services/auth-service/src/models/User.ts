import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import bcrypt from 'bcryptjs';

// Interfaz para atributos del modelo User
interface UserAttributes {
  id: number;
  email: string;
  nombre: string;
  telefono?: string;
  contrasena?: string;
  rol: 'admin' | 'usuario';
  fecha_registro: Date;
  ultima_conexion?: Date;
  activo: boolean;
  google_id?: string;
}

// Interfaz para atributos opcionales al crear un usuario
interface UserCreationAttributes extends Optional<UserAttributes, 'id' | 'fecha_registro' | 'rol' | 'activo'> {}

// Clase del modelo User
class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: number;
  public email!: string;
  public nombre!: string;
  public telefono?: string;
  public contrasena?: string;
  public rol!: 'admin' | 'usuario';
  public fecha_registro!: Date;
  public ultima_conexion?: Date;
  public activo!: boolean;
  public google_id?: string;

  // Método para comparar contraseñas
  public async isValidPassword(password: string): Promise<boolean> {
    if (!this.contrasena) return false;
    return await bcrypt.compare(password, this.contrasena);
  }
}

// Inicializar el modelo
User.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
      validate: {
        isEmail: true,
      },
    },
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    telefono: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    contrasena: {
      type: DataTypes.STRING,
      allowNull: true, // Permitimos null para usuarios de Google
    },
    rol: {
      type: DataTypes.ENUM('admin', 'usuario'),
      defaultValue: 'usuario',
    },
    fecha_registro: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    ultima_conexion: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    google_id: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
  },
  {
    sequelize,
    modelName: 'User',
    tableName: 'usuarios', // Usamos el nombre de tabla que ya existe en la base de datos
    timestamps: false, // No usamos createdAt y updatedAt de Sequelize
    hooks: {
      // Hook para hashear la contraseña antes de crear/actualizar un usuario
      beforeSave: async (user: User) => {
        if (user.contrasena && user.changed('contrasena')) {
          const salt = await bcrypt.genSalt(10);
          user.contrasena = await bcrypt.hash(user.contrasena, salt);
        }
      },
    },
  }
);

export default User;