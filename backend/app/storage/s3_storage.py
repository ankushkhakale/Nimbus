"""AWS S3 implementation of the ObjectStorage interface.

Lambda never proxies file bytes: the browser PUTs and GETs directly
against S3 using the presigned URLs generated here.
"""

import logging

import boto3
from botocore.config import Config
from botocore.exceptions import ClientError

from app.core.config import settings
from app.storage.base import ObjectStorage

logger = logging.getLogger(__name__)


def _build_client():
    """S3 client pinned to the regional endpoint with SigV4.

    boto3's default client signs against the global ``s3.amazonaws.com``,
    which answers with a 307 redirect for buckets outside us-east-1. A
    redirected presigned PUT loses its signature, so browser uploads fail
    with an opaque error. Pinning the regional endpoint avoids that.
    """
    endpoint = settings.S3_ENDPOINT_URL or f"https://s3.{settings.S3_REGION}.amazonaws.com"
    return boto3.client(
        "s3",
        region_name=settings.S3_REGION,
        endpoint_url=endpoint,
        config=Config(signature_version="s3v4", s3={"addressing_style": "virtual"}),
    )


class S3ObjectStorage(ObjectStorage):
    def __init__(self, client=None, bucket: str | None = None, expires_in: int | None = None):
        self._client = client or _build_client()
        self._bucket = bucket or settings.S3_BUCKET_NAME
        self._expires_in = expires_in or settings.PRESIGNED_URL_EXPIRE_SECONDS

    def upload_url(self, key: str, *, content_type: str | None = None) -> str:
        params: dict = {"Bucket": self._bucket, "Key": key}
        if content_type:
            # Signed into the URL, so the client cannot substitute a
            # different content type than the one we recorded.
            params["ContentType"] = content_type
        return self._client.generate_presigned_url(
            "put_object", Params=params, ExpiresIn=self._expires_in
        )

    def download_url(self, key: str, *, filename: str | None = None) -> str:
        params: dict = {"Bucket": self._bucket, "Key": key}
        if filename:
            safe = filename.replace('"', "")
            params["ResponseContentDisposition"] = f'attachment; filename="{safe}"'
        return self._client.generate_presigned_url(
            "get_object", Params=params, ExpiresIn=self._expires_in
        )

    def delete(self, key: str) -> None:
        # S3 DELETE is idempotent — absent keys return 204, not an error.
        self._client.delete_object(Bucket=self._bucket, Key=key)

    def exists(self, key: str) -> bool:
        return self.size(key) is not None

    def size(self, key: str) -> int | None:
        try:
            head = self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        return head["ContentLength"]

    def metadata(self, key: str) -> dict[str, str] | None:
        try:
            head = self._client.head_object(Bucket=self._bucket, Key=key)
        except ClientError as exc:
            if exc.response.get("Error", {}).get("Code") in {"404", "NoSuchKey", "NotFound"}:
                return None
            raise
        # boto3 already lower-cases and strips the x-amz-meta- prefix.
        return head.get("Metadata", {})

    def copy(self, src_key: str, dest_key: str) -> None:
        self._client.copy_object(
            Bucket=self._bucket,
            Key=dest_key,
            CopySource={"Bucket": self._bucket, "Key": src_key},
            # A copy into the users/ prefix re-fires ObjectCreated, so the
            # thumbnailer regenerates a thumbnail for the version too — a
            # feature (version-history previews), not waste.
            MetadataDirective="COPY",
        )

    def create_multipart_upload(self, key: str, *, content_type: str | None = None) -> str:
        params: dict = {"Bucket": self._bucket, "Key": key}
        if content_type:
            params["ContentType"] = content_type
        response = self._client.create_multipart_upload(**params)
        return response["UploadId"]

    def presign_part(self, key: str, upload_id: str, part_number: int) -> str:
        return self._client.generate_presigned_url(
            "upload_part",
            Params={
                "Bucket": self._bucket,
                "Key": key,
                "UploadId": upload_id,
                "PartNumber": part_number,
            },
            ExpiresIn=self._expires_in,
        )

    def complete_multipart_upload(
        self, key: str, upload_id: str, parts: list[tuple[int, str]]
    ) -> None:
        self._client.complete_multipart_upload(
            Bucket=self._bucket,
            Key=key,
            UploadId=upload_id,
            MultipartUpload={
                "Parts": [
                    {"PartNumber": number, "ETag": etag}
                    for number, etag in sorted(parts, key=lambda p: p[0])
                ]
            },
        )

    def abort_multipart_upload(self, key: str, upload_id: str) -> None:
        try:
            self._client.abort_multipart_upload(Bucket=self._bucket, Key=key, UploadId=upload_id)
        except ClientError as exc:
            # Already aborted/completed/expired — nothing left to clean up.
            if exc.response.get("Error", {}).get("Code") not in {
                "NoSuchUpload",
                "404",
                "NotFound",
            }:
                raise
