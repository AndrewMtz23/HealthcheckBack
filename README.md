# HealthcheckBack

Backend de HealthCheck, una plataforma para analizar noticias de salud y
clasificar posibles casos de desinformación mediante BERT.

## Componentes

| Carpeta | Responsabilidad | Tecnología |
| --- | --- | --- |
| `api-gateway/` | Entrada a las APIs y enrutamiento | Node.js, Express, TypeScript |
| `services/auth-service/` | Usuarios, JWT y acceso con Google | Node.js, Express, Sequelize |
| `services/news-service/` | Noticias, búsquedas, interacciones, reportes e historial | Node.js, Express, Sequelize |
| `services/notification-service/` | Preferencias, correo electrónico y SMS | Node.js, Express, Nodemailer, Twilio |
| `services/ml-service/` | Clasificación BERT, entrenamiento, scraping y chatbot | Python, Flask, PyTorch |

`db.sql` contiene el esquema PostgreSQL. El frontend se mantiene por separado.

## Preparación local

Instala Git LFS antes de clonar para descargar los pesos del modelo:

```bash
git lfs install
git clone https://github.com/AndrewMtz23/HealthcheckBack.git
cd HealthcheckBack
git lfs pull
```

Los dos archivos BERT suman aproximadamente 879 MB y están gestionados por
`services/ml-service/.gitattributes`.

Cada servicio requiere su propia configuración `.env`; las credenciales no
se incluyen. Consulta los módulos de configuración de cada servicio para
definir conexión PostgreSQL, secretos JWT, URLs y credenciales externas.
El chatbot necesita claves de OpenAI y Google; correo/SMS usan SMTP y Twilio.

En cada carpeta Node.js, instala dependencias con `npm ci` y ejecuta
`npm run dev`. Para ML, desde `services/ml-service/`, crea un entorno virtual,
instala `requirements.txt`, configura `MODEL_PATH=models/bert_health_model`
y ejecuta `python app.py`.

Esta separación conserva el historial correspondiente al backend y sus
atribuciones originales. Los identificadores de los commits cambian al
extraer las carpetas. La publicación del repositorio no implica que los
servicios estén desplegados o que se haya validado su ejecución completa.
