import logging

from fastapi import APIRouter, Depends, HTTPException

from app.agent.agent import ResearchAgent
from app.agent.chat import ChatAgent
from app.agent.executor import ToolExecutor
from app.agent.schemas import (
    ChatRequest,
    ChatResponse,
    ResearchRequest,
    ResearchResult,
)
from app.config import Settings, get_settings
from app.llm.provider import create_llm_provider


logger = logging.getLogger(__name__)

router = APIRouter(
    tags=["research"],
)


@router.get("/health")
async def health_check():
    return {
        "status": "ok",
        "service": "RivalPulse",
    }


@router.post(
    "/research",
    response_model=ResearchResult,
)
async def research(
    request: ResearchRequest,
    settings: Settings = Depends(get_settings),
):
    try:
        llm = create_llm_provider(settings)

        executor = ToolExecutor()

        agent = ResearchAgent(
            llm=llm,
            executor=executor,
        )

        result = await agent.run_research(
            company=request.company,
            competitors=request.competitors,
        )

        return result

    except Exception as exc:
        logger.exception(
            "Research request failed."
        )

        raise HTTPException(
            status_code=502,
            detail={
                "success": False,
                "message": "Research agent failed.",
                "error": str(exc),
            },
        ) from exc


@router.post(
    "/chat",
    response_model=ChatResponse,
)
async def chat(
    request: ChatRequest,
    settings: Settings = Depends(get_settings),
):
    try:
        logger.info(
            "CHAT_REQUEST message=%r",
            request.message,
        )

        llm = create_llm_provider(settings)

        executor = ToolExecutor()

        research_agent = ResearchAgent(
            llm=llm,
            executor=executor,
        )

        chat_agent = ChatAgent(
            llm=llm,
            research_agent=research_agent,
        )

        response = await chat_agent.chat(
            request
        )

        logger.info(
            "CHAT_COMPLETED intent=%s",
            response.intent,
        )

        return response

    except Exception as exc:
        logger.exception(
            "Chat request failed."
        )

        raise HTTPException(
            status_code=502,
            detail={
                "success": False,
                "message": "Chat agent failed.",
                "error": str(exc),
            },
        ) from exc