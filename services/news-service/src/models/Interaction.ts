import { DataTypes, Model, Optional, WhereOptions } from 'sequelize';
import sequelize from '../config/db';
import News from './News'; // Importar modelo de News para asociaciones

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

  // Método estático para contar interacciones
  static async countInteractions(noticiaId: number, tipoInteraccion: string): Promise<number> {
    return this.count({
      where: {
        noticia_id: noticiaId,
        tipo_interaccion: tipoInteraccion
      }
    });
  }

  // Método para obtener conteos de interacciones por noticia
  static async getInteractionCounts(noticiaId: number): Promise<{
    likes: number;
    dislikes: number;
    shares: number;
  }> {
    const [likes, dislikes, shares] = await Promise.all([
      this.countInteractions(noticiaId, 'marcar_confiable'),
      this.countInteractions(noticiaId, 'marcar_dudosa'),
      this.countInteractions(noticiaId, 'compartir')
    ]);

    return { likes, dislikes, shares };
  }
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
      references: {
        model: 'usuarios',
        key: 'id'
      },
      onDelete: 'CASCADE'
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
    indexes: [
      // Índices para mejorar el rendimiento de las consultas
      {
        fields: ['noticia_id', 'tipo_interaccion']
      },
      {
        fields: ['usuario_id', 'noticia_id']
      }
    ]
  }
);

// Definir asociaciones
Interaction.belongsTo(News, {
  foreignKey: 'noticia_id',
  as: 'noticia'
});

export default Interaction;