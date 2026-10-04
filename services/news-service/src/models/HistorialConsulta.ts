import { Model, DataTypes, Optional } from 'sequelize';
import sequelize from '../config/db';
import News from './News';

interface HistorialConsultaAttributes {
  id: number;
  usuario_id: number;
  noticia_id: number;
  fecha_consulta: Date;
}

interface HistorialConsultaCreationAttributes extends Optional<HistorialConsultaAttributes, 'id' | 'fecha_consulta'> {}

class HistorialConsulta extends Model<HistorialConsultaAttributes, HistorialConsultaCreationAttributes> implements HistorialConsultaAttributes {
  public id!: number;
  public usuario_id!: number;
  public noticia_id!: number;
  public fecha_consulta!: Date;

  // timestamps
  public readonly createdAt?: Date;
  public readonly updatedAt?: Date;
}

HistorialConsulta.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'usuarios',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    noticia_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'noticias',
        key: 'id',
      },
      onDelete: 'CASCADE',
    },
    fecha_consulta: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'HistorialConsulta',
    tableName: 'historial_consultas',
    timestamps: false,
    indexes: [
      {
        fields: ['usuario_id'],
      },
      {
        fields: ['noticia_id'],
      },
      {
        fields: ['fecha_consulta'],
      },
    ],
  }
);

// Establecer relaciones
HistorialConsulta.belongsTo(News, {
  foreignKey: 'noticia_id',
  as: 'noticia'
});

export default HistorialConsulta;