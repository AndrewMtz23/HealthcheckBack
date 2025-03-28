import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

interface ReportAttributes {
  id: number;
  fuente_id: number;
  usuario_id: number;
  motivo: string;
  estado: 'pendiente' | 'revisado' | 'desestimado';
  fecha_reporte: Date;
  fecha_revision?: Date;
}

interface ReportCreationAttributes extends Optional<ReportAttributes, 'id' | 'estado' | 'fecha_reporte'> {}

class Report extends Model<ReportAttributes, ReportCreationAttributes> implements ReportAttributes {
  public id!: number;
  public fuente_id!: number;
  public usuario_id!: number;
  public motivo!: string;
  public estado!: 'pendiente' | 'revisado' | 'desestimado';
  public fecha_reporte!: Date;
  public fecha_revision?: Date;
}

Report.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    fuente_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    motivo: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    estado: {
      type: DataTypes.ENUM('pendiente', 'revisado', 'desestimado'),
      defaultValue: 'pendiente',
    },
    fecha_reporte: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    fecha_revision: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'Report',
    tableName: 'reportes_fuente',
    timestamps: false,
  }
);

export default Report;