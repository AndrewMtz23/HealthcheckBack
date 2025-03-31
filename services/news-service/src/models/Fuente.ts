// src/models/Fuente.ts
import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/db';

class Fuente extends Model {
  public id!: number;
  public nombre!: string;
  public url!: string | null;
  public confiabilidad!: number;
  public verificada!: boolean;
  public descripcion!: string | null;
  public noticias_verdaderas!: number;
  public noticias_falsas!: number;
  
  // Timestamps
  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Fuente.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    nombre: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    confiabilidad: {
      type: DataTypes.DECIMAL(5, 2),
      defaultValue: 0.5,
    },
    verificada: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    noticias_verdaderas: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    noticias_falsas: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
      field: 'created_at',
    },
    updated_at: {
      type: DataTypes.DATE,
      field: 'updated_at',
    },
  },
  {
    sequelize,
    modelName: 'Fuente',
    tableName: 'fuentes',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default Fuente;