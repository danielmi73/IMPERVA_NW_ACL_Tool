"""Add SMTP template columns to settings

Revision ID: a3f8c92e1d45
Revises: 1cf12b479c67
Create Date: 2026-05-24 22:00:00.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'a3f8c92e1d45'
down_revision = '1cf12b479c67'
branch_labels = None
depends_on = None

DEFAULT_SUBJECT = "[DDoS Alert] {{event_type}} — {{prefix}}"

DEFAULT_BODY = """\
Dear {{customer_name}},

This is an automated notification from the DDoS Management System.

Event:     {{event_type}}
Prefix:    {{prefix}}
ACL:       {{acl_name}} (ID: {{acl_id}})
Detected:  {{detected_at}}
Peak:      {{peak_mbps}} Mbps

{{custom_message}}

—
Imperva DDoS Management\
"""


def upgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.add_column(sa.Column("smtp_encryption", sa.String(), nullable=True, server_default="STARTTLS"))
        batch_op.add_column(sa.Column("smtp_default_subject", sa.String(), nullable=True, server_default=DEFAULT_SUBJECT))
        batch_op.add_column(sa.Column("smtp_default_body", sa.Text(), nullable=True, server_default=DEFAULT_BODY))


def downgrade() -> None:
    with op.batch_alter_table("settings") as batch_op:
        batch_op.drop_column("smtp_default_body")
        batch_op.drop_column("smtp_default_subject")
        batch_op.drop_column("smtp_encryption")
