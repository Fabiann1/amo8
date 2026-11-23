from fastapi import APIRouter, Depends

from .. import services
from ..auth import require_user
from ..schemas import AiMode, Assistant, LeadCreate, LeadPatch, TaskComplete, TaskCreate, Text

router = APIRouter(prefix="/api", tags=["CRM"], dependencies=[Depends(require_user)])


@router.get("/dashboard")
async def dashboard():
    return await services.dashboard()


@router.get("/leads")
async def leads(pipeline_id: int | None = None, query: str = ""):
    return await services.list_leads(pipeline_id, query)


@router.post("/leads")
async def create_lead(body: LeadCreate):
    return {"id": await services.create_lead(**body.model_dump())}


@router.get("/leads/{lead_id}")
async def lead(lead_id: int):
    return await services.lead_detail(lead_id)


@router.patch("/leads/{lead_id}")
async def patch_lead(lead_id: int, body: LeadPatch):
    await services.patch_lead(lead_id, body.model_dump(exclude_none=True))
    return {"ok": True}


@router.post("/leads/{lead_id}/note")
async def note(lead_id: int, body: Text):
    if not body.text.strip():
        raise ValueError("Пустое примечание")
    await services.add_note(lead_id, body.text.strip())
    return {"ok": True}


@router.post("/leads/{lead_id}/send")
async def send(lead_id: int, body: Text):
    await services.send_message(lead_id, body.text)
    return {"ok": True}


@router.post("/leads/{lead_id}/assistant")
async def assistant(lead_id: int, body: Assistant):
    await services.n8n_assistant(lead_id, body.action, body.text)
    return {"ok": True}


@router.post("/leads/{lead_id}/ai-mode")
async def ai_mode(lead_id: int, body: AiMode):
    await services.set_ai_mode(lead_id, body.mode)
    return {"ok": True}


@router.get("/chats")
async def chats():
    return await services.chats()


@router.get("/tasks")
async def tasks():
    return await services.tasks()


@router.post("/tasks")
async def create_task(body: TaskCreate):
    await services.create_task(body.lead_id, body.text, body.complete_till, body.responsible_user_id)
    return {"ok": True}


@router.post("/tasks/{task_id}/complete")
async def complete_task(task_id: int, body: TaskComplete):
    await services.complete_task(task_id, body.result)
    return {"ok": True}
