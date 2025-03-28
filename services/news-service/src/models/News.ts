import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

interface NewsAttributes {
  id: number;
  titulo: string;
  contenido: string;
  url?: string;
  fecha_publicacion?: Date;
  fuente_id?: number;
  tema_id?: number;
  fecha_analisis?: Date;
  created_at: Date;
  updated_at?: Date;
}

interface NewsCreationAttributes extends Optional<NewsAttributes, 'id' | 'created_at'> {}

class News extends Model<NewsAttributes, NewsCreationAttributes> implements NewsAttributes {
  public id!: number;
  public titulo!: string;
  public contenido!: string;
  public url?: string;
  public fecha_publicacion?: Date;
  public fuente_id?: number;
  public tema_id?: number;
  public fecha_analisis?: Date;
  public created_at!: Date;
  public updated_at?: Date;
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
    },
    tema_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    fecha_analisis: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    created_at: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    sequelize,
    modelName: 'News',
    tableName: 'noticias',
    timestamps: false,
  }
);

export default News;