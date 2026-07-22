"""AWS Lambda entrypoint.

Mangum adapts the ASGI app to Lambda's event/context calling convention.
Defined at module scope so the Mongo connection opened during startup is
reused across invocations that share a warm execution environment —
reconnecting per request would add latency and exhaust M0's connection
limit under any concurrency.

The same function also serves scheduled maintenance. EventBridge sends a
plain JSON event with no HTTP envelope, which Mangum cannot interpret, so
those are routed to the job instead. Reusing this function avoids
packaging and deploying a second one that would need the identical
dependencies and database access.
"""

import asyncio
import logging

from mangum import Mangum

from app.jobs.purge import purge_expired_trash
from app.main import app

logger = logging.getLogger(__name__)

_asgi_handler = Mangum(app, lifespan="on")

# Set by the EventBridge rule; anything else is treated as an HTTP request.
MAINTENANCE_TASK_KEY = "nimbus_task"


def handler(event, context):
    task = event.get("nimbus_task") if isinstance(event, dict) else None

    if task == "purge_trash":
        logger.info("Running scheduled purge")
        return asyncio.run(purge_expired_trash())

    if task is not None:
        logger.warning("Unknown scheduled task: %s", task)
        return {"error": f"unknown task: {task}"}

    return _asgi_handler(event, context)
