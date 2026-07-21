"""AWS Lambda entrypoint.

Mangum adapts the ASGI app to Lambda's event/context calling convention.
Defined at module scope so the Mongo connection opened during startup is
reused across invocations that share a warm execution environment —
reconnecting per request would add latency and exhaust M0's connection
limit under any concurrency.
"""

from mangum import Mangum

from app.main import app

handler = Mangum(app, lifespan="on")
