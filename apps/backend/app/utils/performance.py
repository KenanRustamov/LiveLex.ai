from __future__ import annotations
import time
from typing import Optional, Any
from contextlib import asynccontextmanager
from app.core.config import settings
from app.db.models import PerformanceMetricDoc


@asynccontextmanager
async def track_performance(
    operation_type: str,
    operation_name: str,
    session_id: Optional[str] = None,
    username: Optional[str] = None,
    metadata: Optional[dict[str, Any]] = None,
):
    """Context manager for tracking performance metrics.
    
    Returns a no-op context manager if performance tracking is disabled.
    When enabled, measures execution time and saves to PerformanceMetricDoc.
    """
    if not settings.enable_performance_tracking:
        # Return a no-op context manager
        yield
        return
    
    start_time = time.perf_counter()
    try:
        yield
    finally:
        duration_ms = (time.perf_counter() - start_time) * 1000
        
        # Save to database asynchronously (don't block)
        try:
            metric = PerformanceMetricDoc(
                session_id=session_id or "unknown",
                username=username,
                operation_type=operation_type,
                operation_name=operation_name,
                duration_ms=duration_ms,
                metadata=metadata or {}
            )
            await metric.insert()
        except Exception as e:
            # Don't fail the operation if metrics saving fails
            print(f"Failed to save performance metric: {e}")

