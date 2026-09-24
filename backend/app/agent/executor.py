from typing import Any

from app.agent.schemas import ToolCall, ToolResult
from app.agent.tools import TOOL_FUNCTIONS


class ToolExecutor:
    """
    Executes tools requested by the AI agent.

    The LLM never executes these functions directly.
    """

    def __init__(self):
        self.tools = TOOL_FUNCTIONS

    def execute(self, tool_call: ToolCall) -> ToolResult:
        tool_name = tool_call.name

        print(f"[AGENT] Executing tool: {tool_name}")

        tool_function = self.tools.get(tool_name)

        if tool_function is None:
            print(f"[AGENT] Unknown tool requested: {tool_name}")

            return ToolResult(
                tool_name=tool_name,
                success=False,
                error=f"Unknown tool: {tool_name}",
            )

        try:
            result: dict[str, Any] = tool_function(
                **tool_call.arguments
            )

            if "error" in result:
                return ToolResult(
                    tool_name=tool_name,
                    success=False,
                    error=result["error"],
                )

            return ToolResult(
                tool_name=tool_name,
                success=True,
                data=result,
            )

        except TypeError as exc:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                error=f"Invalid tool arguments: {exc}",
            )

        except Exception as exc:
            return ToolResult(
                tool_name=tool_name,
                success=False,
                error=f"Tool execution failed: {exc}",
            )