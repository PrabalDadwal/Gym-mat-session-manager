import asyncio
import json
from typing import AsyncGenerator, Set


class SSEBroadcaster:
    def __init__(self):
        self._subscribers: Set[asyncio.Queue] = set()
        self._lock = asyncio.Lock()

    async def subscribe(self) -> AsyncGenerator[dict, None]:
        queue = asyncio.Queue()
        async with self._lock:
            self._subscribers.add(queue)
        try:
            # Send initial keepalive/handshake
            yield {"event": "connected", "data": json.dumps({"status": "live"})}
            while True:
                msg = await queue.get()
                yield msg
        finally:
            async with self._lock:
                self._subscribers.discard(queue)

    async def broadcast(self, event: str, data: dict):
        payload = {
            "event": event,
            "data": json.dumps(data) if isinstance(data, dict) else str(data),
        }
        async with self._lock:
            for queue in self._subscribers:
                await queue.put(payload)

    @property
    def client_count(self) -> int:
        return len(self._subscribers)


broadcaster = SSEBroadcaster()
