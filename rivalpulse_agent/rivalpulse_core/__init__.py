"""Public API for the RivalPulse agent package."""

from .analyzer import CompetitiveAnalyzer
from .chat import AgentChatRequest, AgentChatResponse, RivalPulseChatService
from .factory import build_agent_service, build_chat_service, build_data_tools, build_memory
from .json_tools import JsonCompetitiveDataTools
from .llm import (
    OllamaResearchSynthesizer,
    ResearchSynthesizer,
    SynthesisError,
)
from .memory import ResearchMemory
from .planner import DeterministicResearchPlanner
from .schemas import NormalizedDataBundle, ResearchRequest, ResearchResult, ResearchState
from .service import RivalPulseAgentService
from .signal_detector import CompetitiveSignalDetector
from .tools import CompetitiveDataTools, DataNotFoundError, DataToolError

__all__ = [
    "AgentChatRequest",
    "AgentChatResponse",
    "CompetitiveAnalyzer",
    "CompetitiveDataTools",
    "CompetitiveSignalDetector",
    "DataNotFoundError",
    "DataToolError",
    "DeterministicResearchPlanner",
    "JsonCompetitiveDataTools",
    "NormalizedDataBundle",
    "OllamaResearchSynthesizer",
    "ResearchMemory",
    "ResearchRequest",
    "ResearchResult",
    "ResearchSynthesizer",
    "ResearchState",
    "RivalPulseAgentService",
    "RivalPulseChatService",
    "SynthesisError",
    "build_agent_service",
    "build_chat_service",
    "build_data_tools",
    "build_memory",
]
