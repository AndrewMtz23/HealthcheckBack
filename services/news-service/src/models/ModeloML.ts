// src/models/ModeloML.ts
import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/db';

class ModeloML extends Model {
  public id!: number;
  public nombre!: string;
  public version!: string;
  public descripcion!: string | null;
  public precision!: number | null;
  public recall!: number | null;
  public f1_score!: number | null;
  public fecha_entrenamiento!: Date | null;
  public activo!: boolean;
  public modelo_base!: number | null;
  
  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
}

ModeloML.init(
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
    version: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    descripcion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    precision: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    recall: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    f1_score: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    fecha_entrenamiento: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    activo: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    modelo_base: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'modelos_ml',
        key: 'id',
      },
      onDelete: 'CASCADE',
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
    modelName: 'ModeloML',
    tableName: 'modelos_ml',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

export default ModeloML;