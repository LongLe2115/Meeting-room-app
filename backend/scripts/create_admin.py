"""Tạo hoặc cập nhật tài khoản admin từ dòng lệnh."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

ROOT_DIR = Path(__file__).resolve().parent.parent.parent

try:
    from dotenv import load_dotenv

    load_dotenv(ROOT_DIR / ".env", override=True)
except ImportError:
    pass

from backend.app.db import db, init_db
from backend.app.security import hash_password


def main() -> int:
    parser = argparse.ArgumentParser(description="Create or update an admin user")
    parser.add_argument("email", help="Admin email")
    parser.add_argument("password", help="Password (min 6 characters)")
    parser.add_argument("name", nargs="?", default="Admin", help="Display name")
    args = parser.parse_args()

    if len(args.password) < 6:
        print("Error: password must be at least 6 characters", file=sys.stderr)
        return 1

    init_db()
    email = args.email.lower().strip()
    password_hash = hash_password(args.password)

    with db() as conn:
        row = conn.execute(
            "SELECT id, email, role FROM users WHERE email = ?",
            (email,),
        ).fetchone()
        if row:
            conn.execute(
                "UPDATE users SET name = ?, password_hash = ?, role = ? WHERE id = ?",
                (args.name, password_hash, "admin", row["id"]),
            )
            print(f"Updated admin: id={row['id']} email={email}")
        else:
            cur = conn.execute(
                "INSERT INTO users(email, name, password_hash, role) VALUES(?,?,?,?)",
                (email, args.name, password_hash, "admin"),
            )
            print(f"Created admin: id={cur.lastrowid} email={email}")

    print("Đăng nhập quản trị tại: http://127.0.0.1:8000/admin-login.html")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
