import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';
import News from './News';

interface ClasificacionNoticiaAttributes {
  id: number;
  noticia_id: number;
  modelo_id: number | null;
  resultado: 'verdadera' | 'falsa' | 'dudosa';
  confianza: number | null;
  explicacion: string | null;
  fecha_clasificacion: Date;
}

interface ClasificacionNoticiaCreationAttributes extends Optional<ClasificacionNoticiaAttributes, 'id' | 'fecha_clasificacion' | 'confianza' | 'explicacion'> {}

class ClasificacionNoticia extends Model<ClasificacionNoticiaAttributes, ClasificacionNoticiaCreationAttributes> implements ClasificacionNoticiaAttributes {
  public id!: number;
  public noticia_id!: number;
  public modelo_id!: number | null;
  public resultado!: 'verdadera' | 'falsa' | 'dudosa';
  public confianza!: number | null;
  public explicacion!: string | null;
  public fecha_clasificacion!: Date;
}

ClasificacionNoticia.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    noticia_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
      references: {
        model: 'noticias',
        key: 'id'
      },
      onDelete: 'CASCADE'
    },
    modelo_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'modelos_ml',
        key: 'id'
      },
      onDelete: 'SET NULL'
    },
    resultado: {
      type: DataTypes.ENUM('verdadera', 'falsa', 'dudosa'),
      allowNull: false,
    },
    confianza: {
      type: DataTypes.DECIMAL(5, 2),
      allowNull: true,
    },
    explicacion: {
      type: DataTypes.TEXT,
      allowNull: true,
    },
    fecha_clasificacion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'ClasificacionNoticia',
    tableName: 'clasificacion_noticias',
    timestamps: false,
  }
);

// Definir la relación
News.hasMany(ClasificacionNoticia, { foreignKey: 'noticia_id', as: 'clasificaciones' });
ClasificacionNoticia.belongsTo(News, { foreignKey: 'noticia_id' });

export default ClasificacionNoticia;