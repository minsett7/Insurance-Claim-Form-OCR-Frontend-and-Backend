"""Post-processing utilities for OCR field output."""

from __future__ import annotations

from typing import Any


def process_ocr_result(*args: Any, **kwargs: Any) -> dict[str, Any]:
    from .pipeline import process_ocr_result as _process_ocr_result

    return _process_ocr_result(*args, **kwargs)


def process_ocr_json_file(*args: Any, **kwargs: Any) -> dict[str, Any]:
    from .pipeline import process_ocr_json_file as _process_ocr_json_file

    return _process_ocr_json_file(*args, **kwargs)


__all__ = ["process_ocr_result", "process_ocr_json_file"]
