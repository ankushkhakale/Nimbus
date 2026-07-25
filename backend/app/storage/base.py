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

    @abstractmethod
    def metadata(self, key: str) -> dict[str, str] | None:
        """User-supplied object metadata (e.g. the thumbnailer's
        perceptual hash), or None if the object is absent."""

    # --- multipart upload (large files) ---------------------------------
    #
    # Same "browser talks to S3 directly" principle as upload_url/
    # download_url, just split into parts so a single flaky part can be
    # retried instead of restarting a multi-gigabyte PUT from zero.

    @abstractmethod
    def create_multipart_upload(self, key: str, *, content_type: str | None = None) -> str:
        """Begin a multipart upload, returning its upload id."""

    @abstractmethod
    def presign_part(self, key: str, upload_id: str, part_number: int) -> str:
        """Presigned URL the browser can PUT one part's bytes to."""

    @abstractmethod
    def complete_multipart_upload(
        self, key: str, upload_id: str, parts: list[tuple[int, str]]
    ) -> None:
        """Assemble the parts into the final object. `parts` is
        (part_number, etag) pairs, as returned by each part's PUT."""

    @abstractmethod
    def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        """Cancel an in-progress multipart upload and free its parts."""
