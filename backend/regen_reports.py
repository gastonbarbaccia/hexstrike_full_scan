"""One-shot script: regenerate reports for a completed scan using the new prompts."""
import asyncio, json, os, sys
import anthropic
from sqlalchemy import select, update
from database import AsyncSessionLocal, init_db
from models import ScanSession, Finding
from services.claude_orchestrator import (
    _technical_report_prompt, _executive_report_prompt,
    _generate_report, MODEL
)

SCAN_ID = int(sys.argv[1]) if len(sys.argv) > 1 else 1

async def main():
    await init_db()
    client = anthropic.AsyncAnthropic(api_key=os.environ["ANTHROPIC_API_KEY"])

    async with AsyncSessionLocal() as db:
        # Load scan
        scan = (await db.execute(select(ScanSession).where(ScanSession.id == SCAN_ID))).scalar_one()
        findings = (await db.execute(select(Finding).where(Finding.session_id == SCAN_ID))).scalars().all()

    target = scan.target_id  # we'll use the scan's stored info
    findings_data = [
        {"severity": f.severity, "title": f.title, "description": f.description,
         "tool": f.tool, "phase": f.phase, "evidence": f.evidence,
         "cve": f.cve, "cvss": f.cvss}
        for f in findings
    ]
    phases = scan.completed_phases or []

    # Need target URL - fetch it
    from models import Target
    async with AsyncSessionLocal() as db:
        target_obj = (await db.execute(select(Target).where(Target.id == scan.target_id))).scalar_one()
    target_str = target_obj.url or target_obj.ip or target_obj.name

    print(f"Regenerating reports for scan #{SCAN_ID}: {target_str}")
    print(f"  Findings: {len(findings_data)}, Phases: {phases}")

    print("  Generating technical report...")
    tech = await _generate_report(client, _technical_report_prompt(target_str, findings_data, phases))
    print(f"  Technical report: {len(tech)} chars")

    print("  Generating executive report...")
    exec_ = await _generate_report(client, _executive_report_prompt(target_str, findings_data, phases))
    print(f"  Executive report: {len(exec_)} chars")

    async with AsyncSessionLocal() as db:
        await db.execute(
            update(ScanSession).where(ScanSession.id == SCAN_ID)
            .values(report_technical=tech, report_executive=exec_)
        )
        await db.commit()

    print("Done. Reports saved to DB.")
    print("Technical preview:", tech[:200])

asyncio.run(main())
