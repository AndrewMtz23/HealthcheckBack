import { DataTypes, Model, Optional } from 'sequelize';
import sequelize from '../config/db';

interface InteractionAttributes {
  id: number;
  usuario_id: number;
  noticia_id: number;
  tipo_interaccion: 'marcar_confiable' | 'marcar_dudosa' | 'compartir';
  fecha_interaccion: Date;
}

interface InteractionCreationAttributes extends Optional<InteractionAttributes, 'id' | 'fecha_interaccion'> {}

class Interaction extends Model<InteractionAttributes, InteractionCreationAttributes> implements InteractionAttributes {
  public id!: number;
  public usuario_id!: number;
  public noticia_id!: number;
  public tipo_interaccion!: 'marcar_confiable' | 'marcar_dudosa' | 'compartir';
  public fecha_interaccion!: Date;
}

Interaction.init(
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    usuario_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    noticia_id: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    tipo_interaccion: {
      type: DataTypes.ENUM('marcar_confiable', 'marcar_dudosa', 'compartir'),
      allowNull: false,
    },
    fecha_interaccion: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    sequelize,
    modelName: 'Interaction',
    tableName: 'interacciones_noticia',
    timestamps: false,
  }
);

export default Interaction;