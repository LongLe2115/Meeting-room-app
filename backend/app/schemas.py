from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, EmailStr, Field, field_validator, model_validator


Role = Literal["customer", "admin"]
RoleInput = Literal["customer", "admin", "employee", "agent"]


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class RegisterRequest(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    role: RoleInput = "customer"

    @field_validator("role")
    @classmethod
    def normalize_role(cls, v: str) -> str:
        vv = str(v or "").lower().strip()
        if vv in ("employee", "agent"):
            return "customer"
        if vv in ("customer", "admin"):
            return vv
        raise ValueError("Vai trò không hợp lệ")


class GoogleOAuthRequest(BaseModel):
    credential: str = Field(min_length=10)


class FacebookOAuthRequest(BaseModel):
    access_token: str = Field(min_length=10)


class OAuthConfigResponse(BaseModel):
    google_client_id: str = ""
    facebook_app_id: str = ""
    google_enabled: bool = False
    facebook_enabled: bool = False


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    remember_me: bool = False


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ForgotPasswordResponse(BaseModel):
    message: str
    reset_url: str | None = None
    email_found: bool = False


class ResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    password_confirm: str = Field(min_length=6, max_length=200)

    @model_validator(mode="after")
    def passwords_match(self) -> ResetPasswordRequest:
        if self.password != self.password_confirm:
            raise ValueError("Mật khẩu xác nhận không khớp")
        return self


class ResetPasswordResponse(BaseModel):
    message: str


class UserPublic(BaseModel):
    id: int
    email: EmailStr
    name: str
    role: Role


class UserSelfUpdate(BaseModel):
    """Cập nhật hồ sơ (ít nhất một trường)."""

    name: str | None = Field(default=None, min_length=1, max_length=200)
    password: str | None = Field(default=None, min_length=6, max_length=200)


class AuthMeUpdateResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserPublic


class AdminCreateUser(BaseModel):
    email: EmailStr
    name: str = Field(min_length=1, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    role: RoleInput = "customer"

    @field_validator("role")
    @classmethod
    def normalize_role(cls, v: str) -> str:
        vv = str(v or "").lower().strip()
        if vv in ("employee", "agent"):
            return "customer"
        if vv in ("customer", "admin"):
            return vv
        raise ValueError("Vai trò không hợp lệ")


class RoomCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    location: str = Field(min_length=1, max_length=200)
    capacity: int = Field(ge=1, le=1000)
    image_url: str = Field(default="", max_length=2000)
    amenities: list[str] = Field(default_factory=list)
    status: Literal["active", "inactive"] = "active"
    price: float = Field(ge=0, default=0)


class RoomUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    location: str | None = Field(default=None, min_length=1, max_length=200)
    capacity: int | None = Field(default=None, ge=1, le=1000)
    image_url: str | None = Field(default=None, max_length=2000)
    amenities: list[str] | None = None
    status: Literal["active", "inactive"] | None = None
    price: float | None = Field(default=None, ge=0)


class RoomPublic(BaseModel):
    id: int
    name: str
    location: str
    capacity: int
    image_url: str
    amenities: list[str]
    status: Literal["active", "inactive"]
    price: float = 0


class RoomCsvImportResult(BaseModel):
    created: int
    failed: int
    errors: list[str] = Field(default_factory=list)


PaymentMethod = Literal["cash", "transfer"]
PaymentChannel = Literal["momo", "bank"]


class BookingCreate(BaseModel):
    room_id: int
    start_at: datetime
    end_at: datetime
    title: str = Field(min_length=1, max_length=300)
    notes: str = ""
    participant_count: int | None = Field(
        default=None,
        ge=1,
        le=1000,
        description="Số người tham gia dự kiến; không được vượt sức chứa phòng.",
    )
    payment_method: PaymentMethod = Field(description="cash = tiền mặt, transfer = chuyển khoản")
    payment_channel: PaymentChannel | None = Field(
        default=None,
        description="Bắt buộc khi payment_method=transfer: momo hoặc bank",
    )

    @field_validator("payment_channel")
    @classmethod
    def normalize_payment_channel(cls, v: str | None) -> str | None:
        if v is None or str(v).strip() == "":
            return None
        vv = str(v).lower().strip()
        if vv in ("momo", "bank"):
            return vv
        raise ValueError("Kênh thanh toán phải là momo hoặc bank")

    @field_validator("payment_method")
    @classmethod
    def normalize_payment_method(cls, v: str) -> str:
        vv = str(v or "").lower().strip()
        if vv in ("cash", "transfer"):
            return vv
        raise ValueError("Phương thức thanh toán phải là cash hoặc transfer")

    @model_validator(mode="after")
    def validate_payment_combo(self) -> "BookingCreate":
        if self.payment_method == "transfer" and not self.payment_channel:
            raise ValueError("Vui lòng chọn MoMo hoặc Ngân hàng khi thanh toán chuyển khoản")
        if self.payment_method == "cash":
            self.payment_channel = None
        return self


class BookingPublic(BaseModel):
    id: int
    room_id: int
    organizer_id: int
    start_at: datetime
    end_at: datetime
    title: str
    notes: str
    status: Literal["active", "cancelled"]
    payment_method: PaymentMethod = "cash"
    payment_channel: PaymentChannel | None = None


class BookingBusy(BaseModel):
    """Lịch bận phòng (không lộ thông tin cuộc họp/người đặt)."""

    id: int
    room_id: int
    start_at: datetime
    end_at: datetime
    status: Literal["active", "cancelled"]


class BookingDetail(BookingPublic):
    room_name: str = ""
    organizer_name: str = ""
    organizer_email: str = ""


class ErrorResponse(BaseModel):
    detail: str
    extra: dict[str, Any] | None = None


class ContactRequestCreate(BaseModel):
    full_name: str = Field(min_length=1, max_length=200)
    email: EmailStr
    message: str = Field(min_length=1, max_length=10_000)


class ContactRequestStatusUpdate(BaseModel):
    status: Literal["new", "read"]


class ContactRequestPublic(BaseModel):
    id: int
    full_name: str
    email: EmailStr
    message: str
    status: Literal["new", "read"]
    created_at: datetime | str


TicketPriority = Literal["low", "medium", "high"]
TicketStatus = Literal["open", "in_progress", "resolved", "closed", "reopened"]


class TicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=300)
    description: str = Field(min_length=1, max_length=20_000)
    priority: TicketPriority = "medium"
    category: str = Field(default="", max_length=200)
    room_id: int | None = None


class TicketUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=300)
    description: str | None = Field(default=None, min_length=1, max_length=20_000)
    priority: TicketPriority | None = None
    status: TicketStatus | None = None
    category: str | None = Field(default=None, max_length=200)
    assignee_id: int | None = None
    room_id: int | None = None


class TicketPublic(BaseModel):
    id: int
    requester_id: int
    assignee_id: int | None
    subject: str
    description: str
    priority: TicketPriority
    status: TicketStatus
    category: str
    room_id: int | None
    created_at: datetime
    requester_name: str | None = None
    requester_email: str | None = None
    room_name: str | None = None
    comment_count: int | None = None


class TicketCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=20_000)


class TicketCommentPublic(BaseModel):
    id: int
    ticket_id: int
    author_id: int
    body: str
    created_at: datetime
    author_name: str = ""
    author_role: str = ""
