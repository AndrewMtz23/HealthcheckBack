// src/models/Tema.ts
import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/db';

class Tema extends Model {
  public id!: number;
  public nombre!: string;
  public descripcion!: string | null;
  public palabras_clave!: string | null;
  public activo!: boolean;

  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Tema.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    palabras_clave: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
  },
  {
    sequelize,
    modelName: 'Tema',
    tableName: 'temas',
    timestamps: false,
  }
);

export default Tema;