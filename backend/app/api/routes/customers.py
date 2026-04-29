from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel, EmailStr
from typing import Optional, List

from app.db.session import get_db
from app.models.customer import Customer
from app.models.prefix import Prefix
from app.models.settings import Settings
from app.api.deps import get_current_admin

router = APIRouter(prefix="/customers", tags=["customers"])


class CustomerCreateRequest(BaseModel):
    name: str
    email: Optional[str] = None
    custom_message: Optional[str] = None


class CustomerUpdateRequest(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    custom_message: Optional[str] = None


def _customer_to_dict(c: Customer, include_prefixes: bool = False) -> dict:
    result = {
        "id": c.id,
        "name": c.name,
        "email": c.email,
        "custom_message": c.custom_message,
        "created_at": c.created_at,
    }
    if include_prefixes:
        result["prefixes"] = [
            {
                "id": p.id,
                "cidr": p.cidr,
                "name": p.name,
                "is_under_attack": p.is_under_attack,
                "action_on_attack": p.action_on_attack,
                "acl_policy_id": p.acl_policy_id,
                "threshold_mbps": p.threshold_mbps,
                "threshold_kpps": p.threshold_kpps,
                "notify_customer": p.notify_customer,
            }
            for p in c.prefixes
        ]
    return result


@router.get("/")
def list_customers(
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    customers = db.query(Customer).all()
    return [_customer_to_dict(c) for c in customers]


@router.post("/")
def create_customer(
    req: CustomerCreateRequest,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    c = Customer(name=req.name, email=req.email, custom_message=req.custom_message)
    db.add(c)
    db.commit()
    db.refresh(c)
    return _customer_to_dict(c)


@router.get("/{customer_id}")
def get_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    return _customer_to_dict(c, include_prefixes=True)


@router.patch("/{customer_id}")
def update_customer(
    customer_id: int,
    req: CustomerUpdateRequest,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    if req.name is not None:
        c.name = req.name
    if req.email is not None:
        c.email = req.email
    if req.custom_message is not None:
        c.custom_message = req.custom_message
    db.commit()
    db.refresh(c)
    return _customer_to_dict(c, include_prefixes=True)


@router.delete("/{customer_id}")
def delete_customer(
    customer_id: int,
    db: Session = Depends(get_db),
    _: Settings = Depends(get_current_admin),
):
    c = db.query(Customer).filter(Customer.id == customer_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="Customer not found")
    # Unlink prefixes instead of deleting them
    for p in c.prefixes:
        p.customer_id = None
    db.delete(c)
    db.commit()
    return {"message": "Customer deleted"}
