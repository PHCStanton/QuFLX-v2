import contextvars
import logging
import uuid


RUN_ID = uuid.uuid4().hex[:12]
request_id_var: contextvars.ContextVar[str] = contextvars.ContextVar('request_id', default='-')


class ContextFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.run_id = RUN_ID
        record.request_id = request_id_var.get('-')
        return True

