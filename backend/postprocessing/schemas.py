from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class FieldRule:
    """Configuration for one extracted field."""

    name: str
    label: str
    field_type: str = "text"
    required: bool = False
    min_confidence: float = 0.75
    aliases: tuple[str, ...] = ()
    allowed_values: tuple[str, ...] = ()
    pattern: str | None = None


@dataclass(frozen=True)
class OcrField:
    """Raw field value returned by OCR."""

    raw_text: str
    confidence: float | None = None
    source: str = "unknown"


@dataclass
class ProcessedField:
    """Normalized and validated field result."""

    raw_value: str
    value: str
    confidence: float | None
    source: str
    field_type: str
    is_valid: bool
    requires_review: bool
    errors: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def to_dict(self) -> dict[str, Any]:
        return {
            "raw_value": self.raw_value,
            "value": self.value,
            "confidence": self.confidence,
            "source": self.source,
            "field_type": self.field_type,
            "is_valid": self.is_valid,
            "requires_review": self.requires_review,
            "errors": self.errors,
            "warnings": self.warnings,
        }
