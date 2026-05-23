"""Thông tin thanh toán công khai (QR, số tài khoản) cho form đặt phòng."""
from __future__ import annotations

import os

from fastapi import APIRouter
from pydantic import BaseModel


router = APIRouter(prefix="/public", tags=["public"])


class PaymentChannelInfo(BaseModel):
    label: str
    account_name: str
    account_no: str
    bank_name: str = ""
    phone: str = ""
    qr_image_url: str = ""
    qr_payload: str = ""


class PaymentInfoResponse(BaseModel):
    momo: PaymentChannelInfo
    bank: PaymentChannelInfo


@router.get("/payment-info", response_model=PaymentInfoResponse)
def get_payment_info():
    momo_phone = (os.getenv("PAYMENT_MOMO_PHONE") or "0901234567").strip()
    momo_name = (os.getenv("PAYMENT_MOMO_NAME") or "Meeting Room Pro").strip()
    bank_name = (os.getenv("PAYMENT_BANK_NAME") or "Vietcombank").strip()
    bank_account = (os.getenv("PAYMENT_BANK_ACCOUNT") or "1234567890").strip()
    bank_holder = (os.getenv("PAYMENT_BANK_HOLDER") or "CONG TY MEETING ROOM PRO").strip()

    momo_qr_url = (os.getenv("PAYMENT_MOMO_QR_URL") or "").strip()
    bank_qr_url = (os.getenv("PAYMENT_BANK_QR_URL") or "").strip()

    momo_payload = f"2|99|{momo_phone}|{momo_name}||0|0"
    bank_payload = (
        f"NGAN HANG: {bank_name}\n"
        f"SO TK: {bank_account}\n"
        f"CHU TK: {bank_holder}\n"
        f"NOI DUNG: Dat phong hop MRP"
    )

    return PaymentInfoResponse(
        momo=PaymentChannelInfo(
            label="Ví MoMo",
            account_name=momo_name,
            account_no="",
            phone=momo_phone,
            qr_image_url=momo_qr_url,
            qr_payload=momo_payload,
        ),
        bank=PaymentChannelInfo(
            label="Ngân hàng",
            account_name=bank_holder,
            account_no=bank_account,
            bank_name=bank_name,
            phone="",
            qr_image_url=bank_qr_url,
            qr_payload=bank_payload,
        ),
    )
