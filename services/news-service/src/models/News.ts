// src/models/News.ts
import { Model, DataTypes } from 'sequelize';
import sequelize from '../config/db';
import Tema from './Tema';
import Fuente from './Fuente';
import ClasificacionNoticia from './ClasificacionNoticia';

class News extends Model {
  public id!: number;
  public titulo!: string;
  public contenido!: string;
  public url!: string | null;
  public fecha_publicacion!: Date | null;
  public fuente_id!: number | null;
  public tema_id!: number | null;
  public fecha_analisis!: Date | null;
  
  // Timestamps
  public readonly created_at!: Date;
  public readonly updated_at!: Date;
  
  // Relaciones
  public readonly clasificaciones?: ClasificacionNoticia[];
  public readonly tema?: Tema;
  public readonly fuente?: Fuente;
}

News.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    titulo: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    contenido: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    url: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    fecha_publicacion: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    fuente_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'fuentes',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    tema_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: 'temas',
        key: 'id',
      },
      onDelete: 'SET NULL',
    },
    fecha_analisis: {
      type: DataTypes.DATE,
      allowNull: true,
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
    modelName: 'News',
    tableName: 'noticias',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: 'updated_at',
  }
);

// Definir relaciones
News.hasMany(ClasificacionNoticia, {
  foreignKey: 'noticia_id',
  as: 'clasificaciones',
});

News.belongsTo(Tema, {
  foreignKey: 'tema_id',
  as: 'tema',
});

News.belongsTo(Fuente, {
  foreignKey: 'fuente_id',
  as: 'fuente',
});

export default News;