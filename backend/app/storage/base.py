"""Provider-agnostic object storage interface.

The architecture doc specifies a storage layer that can sit in front of
AWS S3, MinIO, or GCS. Everything above this module talks only to
`ObjectStorage`, so swapping providers never reaches the service layer.
"""

from abc import ABC, abstractmethod


class ObjectStorage(ABC):
    """Abstract object storage backend."""

    @abstractmethod
    def upload_url(self, key: str, *, content_type: str | None = None) -> str:
        """Presigned URL the browser can PUT bytes directly to."""

    @abstractmethod
    def download_url(self, key: str, *, filename: str | None = None) -> str:
        """Presigned URL the browser can GET bytes directly from."""

    @abstractmethod
    def delete(self, key: str) -> None:
        """Delete a single object. Succeeds silently if already absent."""

    @abstractmethod
    def exists(self, key: str) -> bool:
        """True if the object is present."""

    @abstractmethod
    def size(self, key: str) -> int | None:
        """Object size in bytes, or None if absent.

        Used to confirm an upload actually landed (and how big it was)
        before trusting client-reported metadata.
        """
