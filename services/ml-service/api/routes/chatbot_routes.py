from flask import Blueprint, request, jsonify
import os
import requests
from typing import Dict
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain.agents import AgentExecutor, create_tool_calling_agent
from langchain_core.messages import HumanMessage
from langchain_core.runnables.history import RunnableWithMessageHistory
from langchain.tools import tool
from langchain_community.chat_message_histories import ChatMessageHistory
import logging

logger = logging.getLogger(__name__)

chatbot_bp = Blueprint("chatbot_bp", __name__)

# Claves de API
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
GOOGLE_CX = os.getenv("GOOGLE_CX")

# Herramienta: búsqueda en Google
@tool
def google_search_tool(query: str):
    """Realiza una búsqueda en Google y devuelve los 3 primeros resultados (título y enlace)."""
    url = "https://www.googleapis.com/customsearch/v1"
    params = {
        "q": query,
        "key": GOOGLE_API_KEY,
        "cx": GOOGLE_CX
    }
    response = requests.get(url, params=params)
    if response.status_code == 200:
        results = response.json().get("items", [])
        return [(r["title"], r["link"]) for r in results[:3]] if results else []
    else:
        return f"Error en la búsqueda: {response.status_code}"

# Prompt del sistema
prompt = ChatPromptTemplate.from_messages([
    ("system", "Eres un asistente útil especializado en verificar noticias. Puedes buscar información en Google para ayudar a validar hechos."
              "Si te preguntan sobre una noticia, utiliza la herramienta de búsqueda para encontrar información relacionada "
              "y determinar si parece ser verdadera o falsa basándote en fuentes confiables, adjunta la fuente mas representativa. "
              "Usa herramientas si es necesario."),
    ("placeholder", "{messages}"),
    ("placeholder", "{agent_scratchpad}"),
])

# Chat model
chat = ChatOpenAI(model="gpt-3.5-turbo-1106", temperature=0, api_key=OPENAI_API_KEY)

# Herramientas
tools = [google_search_tool]

# Crear agente y ejecutor
agent = create_tool_calling_agent(chat, tools, prompt)
agent_executor = AgentExecutor(agent=agent, tools=tools, max_iterations=5, verbose=True)

# Historial de conversación (en memoria)
chat_histories: Dict[str, ChatMessageHistory] = {}

def get_chat_history(session_id: str) -> ChatMessageHistory:
    if session_id not in chat_histories:
        chat_histories[session_id] = ChatMessageHistory()
    return chat_histories[session_id]

conversational_agent_executor = RunnableWithMessageHistory(
    agent_executor,
    get_chat_history,
    input_messages_key="messages",
    output_messages_key="output",
)

@chatbot_bp.route("/", methods=["POST"])
def chat_endpoint():
    """Endpoint para interactuar con el chatbot"""
    try:
        data = request.json
        
        if not data or "message" not in data:
            return jsonify({"error": "Se requiere un mensaje en el campo 'message'"}), 400
            
        message = data.get("message")
        session_id = data.get("session_id", "default_session")
        
        # Ejecutar el agente
        response = conversational_agent_executor.invoke(
            {"messages": [HumanMessage(content=message)]},
            {"configurable": {"session_id": session_id}}
        )
        
        return jsonify({
            "response": response['output'],
            "session_id": session_id
        }), 200
        
    except Exception as e:
        logger.error(f"Error en el chatbot: {str(e)}")
        return jsonify({"error": f"Error en el procesamiento: {str(e)}"}), 500
