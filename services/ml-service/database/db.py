from flask_sqlalchemy import SQLAlchemy
from flask_sqlalchemy.query import Query
from sqlalchemy.orm import DeclarativeBase
from typing import TYPE_CHECKING, ClassVar
from config import Config

class Base(DeclarativeBase):
    pass

db = SQLAlchemy(model_class=Base)

# Flask builds the concrete subclass dynamically. Expose its declarative
# constructor and query descriptor to static analyzers as well.
if TYPE_CHECKING:
    class Model(Base):
        __abstract__ = True
        query: ClassVar[Query]
else:
    Model = db.Model

def init_db(app):
    """Inicializa la base de datos con SQLAlchemy."""
    app.config["SQLALCHEMY_DATABASE_URI"] = Config.SQLALCHEMY_DATABASE_URI
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = Config.SQLALCHEMY_TRACK_MODIFICATIONS
    db.init_app(app)
