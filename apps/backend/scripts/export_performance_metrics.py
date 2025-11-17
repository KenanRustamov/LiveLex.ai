#!/usr/bin/env python3
"""Export performance metrics for reporting and analysis."""
import asyncio
import json
import sys
from datetime import datetime, timedelta
from pathlib import Path
from typing import Optional

# Add parent directory to path to import app modules
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.db.init import init_db
from app.db.models import PerformanceMetricDoc


async def export_metrics(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    output_file: str = "performance_report.json"
):
    """Export performance metrics aggregated by operation type."""
    await init_db()
    
    # Build query
    query = {}
    if start_date:
        query["timestamp"] = {"$gte": start_date}
    if end_date:
        if "timestamp" in query:
            query["timestamp"]["$lte"] = end_date
        else:
            query["timestamp"] = {"$lte": end_date}
    
    # Fetch all metrics
    metrics = await PerformanceMetricDoc.find(query).to_list()
    
    if not metrics:
        print("No metrics found for the specified date range.")
        return
    
    # Aggregate by operation type
    by_operation = {}
    for metric in metrics:
        op_type = metric.operation_type
        if op_type not in by_operation:
            by_operation[op_type] = {
                "count": 0,
                "total_ms": 0,
                "min_ms": float('inf'),
                "max_ms": 0,
                "operations": []
            }
        
        by_operation[op_type]["count"] += 1
        by_operation[op_type]["total_ms"] += metric.duration_ms
        by_operation[op_type]["min_ms"] = min(by_operation[op_type]["min_ms"], metric.duration_ms)
        by_operation[op_type]["max_ms"] = max(by_operation[op_type]["max_ms"], metric.duration_ms)
        by_operation[op_type]["operations"].append({
            "operation_name": metric.operation_name,
            "duration_ms": metric.duration_ms,
            "timestamp": metric.timestamp.isoformat(),
            "session_id": metric.session_id,
            "username": metric.username,
            "metadata": metric.metadata
        })
    
    # Calculate averages and clean up min/max
    for op_type in by_operation:
        stats = by_operation[op_type]
        stats["avg_ms"] = stats["total_ms"] / stats["count"]
        if stats["min_ms"] == float('inf'):
            stats["min_ms"] = 0
    
    # Export to JSON
    output_path = Path(output_file)
    with open(output_path, "w") as f:
        json.dump(by_operation, f, indent=2, default=str)
    
    print(f"Exported {len(metrics)} metrics to {output_path}")
    print("\nSummary by operation type:")
    print("-" * 80)
    for op_type, stats in sorted(by_operation.items()):
        print(f"{op_type}:")
        print(f"  Count: {stats['count']}")
        print(f"  Avg: {stats['avg_ms']:.2f}ms")
        print(f"  Min: {stats['min_ms']:.2f}ms")
        print(f"  Max: {stats['max_ms']:.2f}ms")
        print(f"  Total: {stats['total_ms']:.2f}ms")
        print()


async def main():
    """Main entry point."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Export performance metrics")
    parser.add_argument(
        "--start-date",
        type=str,
        help="Start date (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"
    )
    parser.add_argument(
        "--end-date",
        type=str,
        help="End date (ISO format: YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS)"
    )
    parser.add_argument(
        "--output",
        type=str,
        default="performance_report.json",
        help="Output file path (default: performance_report.json)"
    )
    
    args = parser.parse_args()
    
    # Parse dates
    start_date = None
    end_date = None
    
    if args.start_date:
        try:
            start_date = datetime.fromisoformat(args.start_date.replace('Z', '+00:00'))
        except ValueError:
            print(f"Invalid start date format: {args.start_date}")
            sys.exit(1)
    
    if args.end_date:
        try:
            end_date = datetime.fromisoformat(args.end_date.replace('Z', '+00:00'))
        except ValueError:
            print(f"Invalid end date format: {args.end_date}")
            sys.exit(1)
    
    await export_metrics(start_date=start_date, end_date=end_date, output_file=args.output)


if __name__ == "__main__":
    asyncio.run(main())

